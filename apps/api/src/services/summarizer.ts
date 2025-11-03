// Use central helpers to avoid model ID mismatches
import { getGoogleClient, getGoogleModel } from "./google-genai"
import {
	AI_GENERATION_CONFIG,
	AI_MODELS,
	CONTENT_PATTERNS,
	isGitHubUrl,
	isHtmlContent,
	isPdfContent,
	MARKDOWN_SECTIONS,
	QUALITY_THRESHOLDS,
	TEXT_LIMITS,
} from "../config/constants"
import {
	buildSummaryPrompt,
	buildTextAnalysisPrompt,
	buildUrlAnalysisPrompt as buildUrlAnalysisPromptI18n,
	buildYoutubePrompt,
	getFallbackMessage,
	getSectionHeader,
} from "../i18n"
import { summarizeWithOpenRouter } from "./summarizer-fallback"
import { openRouterChat } from "./openrouter"
import { convertUrlWithMarkItDown } from "./markitdown"

const googleClient = null // Disable Gemini for summaries/tags; use OpenRouter

export async function generateSummary(
  text: string,
  context?: { title?: string | null; url?: string | null },
): Promise<string | null> {
  const trimmed = text.trim()
  if (!trimmed) return null
  console.log("[Summarizer] Using OpenRouter (summary)", { hasUrl: Boolean(context?.url) })
  const viaOpenRouter = await summarizeWithOpenRouter(trimmed, context)
  return viaOpenRouter || buildFallbackSummary(trimmed, context)
}

function buildPrompt(
	snippet: string,
	context?: { title?: string | null; url?: string | null },
) {
	return buildSummaryPrompt(snippet, context)
}

function buildFallbackSummary(
	text: string,
	context?: { title?: string | null; url?: string | null },
) {
	const sentences = text
		.replace(/\s+/g, " ")
		.split(/[.!?]+/)
		.map((s) => s.trim())
		.filter(Boolean)

	const executive = sentences.slice(
		0,
		AI_GENERATION_CONFIG.FALLBACK.EXECUTIVE_SENTENCES,
	)
	const remaining = sentences.slice(
		AI_GENERATION_CONFIG.FALLBACK.EXECUTIVE_SENTENCES,
	)

	const points = remaining
		.slice(0, AI_GENERATION_CONFIG.FALLBACK.MAX_KEY_POINTS)
		.map((sentence) => `- ${sentence}`)

	const useCases: string[] = []
	if (remaining.length === 0) {
		useCases.push(getFallbackMessage("noUseCases"))
	} else {
		const actionCandidates = remaining
			.filter((sentence) => CONTENT_PATTERNS.ACTION_VERBS_PT.test(sentence))
			.slice(0, AI_GENERATION_CONFIG.FALLBACK.MAX_USE_CASES)
		if (actionCandidates.length > 0) {
			for (const candidate of actionCandidates) {
				useCases.push(`- ${candidate}`)
			}
		} else {
			useCases.push(getFallbackMessage("noUseCases"))
		}
	}

	const parts: string[] = [getSectionHeader("executive")]
	if (executive.length > 0) {
		for (const sentence of executive) {
			parts.push(`- ${sentence}`)
		}
	} else {
		parts.push(`- ${text.slice(0, TEXT_LIMITS.FALLBACK_SUMMARY_PREVIEW)}`)
	}

	parts.push(`\n${getSectionHeader("keyPoints")}`)
	if (points.length > 0) {
		parts.push(...points)
	} else {
		parts.push(getFallbackMessage("limitedInfo"))
	}

	parts.push(`\n${getSectionHeader("useCases")}`)
	parts.push(...useCases)

	if (context?.url) {
		parts.push(`\n${getSectionHeader("source")}`)
		parts.push(`- ${context.url}`)
	}

	return ensureUseCasesSection(parts.join("\n"))
}

/**
 * Gera análise profunda do conteúdo usando Gemini 1.5 Flash
 * Se tiver URL, usa urlContext para o Gemini ler diretamente
 * Caso contrário, analisa o texto extraído
 */
export async function generateDeepAnalysis(
	text: string,
	context?: {
		title?: string | null
		url?: string | null
		contentType?: string | null
	},
): Promise<string | null> {
	const trimmed = text.trim()
	if (!trimmed) return null

  console.log("[Summarizer] Using OpenRouter (deep analysis)", { hasUrl: Boolean(context?.url) })
  const viaOpenRouter = await summarizeWithOpenRouter(trimmed, context)
  return viaOpenRouter || buildFallbackSummary(trimmed, context)
}

/**
 * Análise usando o texto extraído (fallback ou quando não tem URL)
 */
async function generateTextBasedAnalysis(
	text: string,
	context?: {
		title?: string | null
		url?: string | null
		contentType?: string | null
	},
	model?: any,
): Promise<string | null> {
	const trimmed = text.trim()
	if (!trimmed) return null

  try {
    const viaOpenRouter = await summarizeWithOpenRouter(trimmed, context)
    if (viaOpenRouter && viaOpenRouter.trim()) {
      return ensureUseCasesSection(viaOpenRouter)
    }
  } catch {}
  return buildFallbackSummary(trimmed, context)
}

/**
 * Prompt simplificado para análise via URL (Gemini lê diretamente)
 */
function buildUrlAnalysisPrompt(context: {
	title?: string | null
	url?: string | null
	contentType?: string | null
}) {
	if (!context.url) {
		throw new Error("URL is required for URL analysis prompt")
	}

	const isGitHub = isGitHubUrl(context.url)

	return buildUrlAnalysisPromptI18n(context.url, {
		title: context.title,
		isGitHub,
	})
}

function buildDeepAnalysisPrompt(
	snippet: string,
	context?: {
		title?: string | null
		url?: string | null
		contentType?: string | null
	},
) {
	const isGitHub = isGitHubUrl(context?.url)
	const isPDF = isPdfContent(context?.contentType)
	const isWebPage = isHtmlContent(context?.contentType, context?.url)

	return buildTextAnalysisPrompt(snippet, {
		title: context?.title,
		url: context?.url,
		isGitHub,
		isPDF,
		isWebPage,
	})
}

export async function summarizeYoutubeVideo(
	url: string,
): Promise<string | null> {
	try {
		// 1) Extract transcript/content with MarkItDown
		const md = await convertUrlWithMarkItDown(url)
		const text = (md.markdown || "").trim()
		if (!text) return null
		// 2) Summarize with OpenRouter (Grok)
		const viaOpenRouter = await summarizeWithOpenRouter(text, {
			title: md.metadata.title || null,
			url,
			contentType: "video/youtube",
		})
		return viaOpenRouter ? ensureUseCasesSection(viaOpenRouter) : null
	} catch (error) {
		console.error("summarizeYoutubeVideo (text+OpenRouter) failed:", error)
		return null
	}
}

/**
 * Generate short category tags for a document using Gemini when available.
 * Fallback: simple keyword extraction from title + text.
 */
export async function generateCategoryTags(
  text: string,
  context?: { title?: string | null; url?: string | null },
  opts?: { maxTags?: number; locale?: "pt-BR" | "en-US" }
): Promise<string[]> {
  const MAX_TAGS = Math.max(3, Math.min(opts?.maxTags ?? 6, 12))
  const trimmed = (context?.title ? `${context.title}\n` : "") + (text || "")
  const snippet = trimmed.slice(0, TEXT_LIMITS.ANALYSIS_MAX_CHARS)

  const fallback = (): string[] => {
    try {
      const source = (context?.title ? `${context.title}. ` : "") + snippet
      const words = source
        .toLowerCase()
        .replace(/[^a-zà-ú0-9\s_-]/gi, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && w.length <= 28)
      const stop = new Set([
        "sobre","with","para","from","this","that","como","onde","quando","porque","the","and","for","com","uma","não","dos","das","nos","nas","entre","sobre","mais","less","http","https","www","github","readme","document","summary","resumo","executivo","executive","overview","introduction","intro","video","image","webpage","pagina","página","file",
      ])
      const freq = new Map<string, number>()
      for (const w of words) {
        if (stop.has(w)) continue
        freq.set(w, (freq.get(w) || 0) + 1)
      }
      const sorted = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([w]) => w)
      const uniq: string[] = []
      for (const w of sorted) {
        if (uniq.includes(w)) continue
        // Favor multiword tags by merging common pairs appearing in title
        uniq.push(w)
        if (uniq.length >= MAX_TAGS) break
      }
      return uniq.map((t) => t.trim()).filter(Boolean)
    } catch {
      return []
    }
  }

  try {
    const langHint = opts?.locale === "en-US" ? "English" : "Portuguese (pt-BR)"
    const prompt = [
      `Generate between 3 and ${MAX_TAGS} short, descriptive tags for the content below.`,
      "- Output only the tags, comma-separated.",
      "- No #, no sentences, all lowercase.",
      "- Use topical/category terms, not IDs.",
      context?.title ? `Title: ${context.title}` : null,
      "\nContent:",
      snippet,
      "\nRespond ONLY with the tags.",
      `Language: ${langHint}`,
    ]
      .filter(Boolean)
      .join("\n")

    const raw = (await openRouterChat([
      { role: "system", content: "You generate concise topical tags." },
      { role: "user", content: prompt },
    ]))?.trim() || ""
    if (!raw) return fallback()

    // Accept comma, newline, or bullet separated
    const parts = raw
      .replace(/^[-*•]\s*/gm, "")
      .split(/[,\n]+/)
      .map((s) => s.toLowerCase().trim())
      .map((s) => s.replace(/^#+/, "").trim())
      .map((s) => s.replace(/\s{2,}/g, " "))
      .filter(Boolean)

    // Deduplicate and clamp
    const uniq: string[] = []
    for (const p of parts) {
      if (!p) continue
      if (uniq.includes(p)) continue
      uniq.push(p)
      if (uniq.length >= MAX_TAGS) break
    }

    return uniq.length > 0 ? uniq : fallback()
  } catch (err) {
    console.warn("generateCategoryTags via OpenRouter failed; using heuristic fallback", err)
    return fallback()
  }
}

/**
 * Garantir que a seção "Casos de Uso" apareça no Markdown de saída.
 * Se o modelo não incluir, adicionamos um bloco padrão vazio.
 */
function ensureUseCasesSection(markdown: string): string {
	const hasUseCases = CONTENT_PATTERNS.USE_CASES_SECTION.test(markdown)
	if (hasUseCases) return markdown
	const appendix = `\n\n${getSectionHeader("useCases")}\n${getFallbackMessage("noUseCases")}\n`
	return markdown.trimEnd() + appendix
}
