import { isGitHubUrl, isHtmlContent, isPdfContent } from "../config/constants"
import {
	buildTextAnalysisPrompt,
	buildUrlAnalysisPrompt as buildUrlAnalysisPromptI18n,
	getFallbackMessage,
	getSectionHeader,
} from "../i18n"
import { grokChat } from "./grok"

const SUMMARY_SYSTEM_PROMPT =
	"Você é um assistente que gera resumos estruturados em Markdown. RESPONDA SEMPRE EM PORTUGUÊS DO BRASIL, mesmo que o conteúdo original esteja em inglês. SEMPRE inclua a seção Casos de Uso com pelo menos 3 itens REAIS - SEMPRE infira casos de uso baseado no contexto do conteúdo. NUNCA escreva '(sem casos de uso identificados)' ou 'N/A' - sempre gere casos de uso relevantes. NUNCA inclua o título do documento/página na resposta - o título já é exibido separadamente na interface. Sempre que mencionar projeto, ferramenta, empresa, pessoa, tecnologia, plataforma ou produto, inclua link em Markdown no mesmo bullet. Para cada item citado, adicione 2-3 frases curtas explicando o que é, seu diferencial e uso prático. Se não houver URL exata no conteúdo, inclua um link de busca confiável (ex.: GitHub Search ou site oficial). Evite duplicação: não repita bullets ou frases equivalentes. Comece DIRETAMENTE com ## Resumo Executivo."

function buildUrlAnalysisPrompt(url: string, title?: string | null) {
	const isGh = isGitHubUrl(url)
	return buildUrlAnalysisPromptI18n(url, { title, isGitHub: isGh })
}

export async function summarizeWithGrok(
	text: string,
	context?: {
		title?: string | null
		url?: string | null
		contentType?: string | null
	},
	options?: {
		timeoutMs?: number
	},
): Promise<string | null> {
	const trimmed = (text || "").trim()

	// Prefer TEXT-BASED summary first when we already have content (e.g., YouTube transcript)
	if (trimmed.length > 0) {
		const textPrompt = buildTextAnalysisPrompt(trimmed.slice(0, 20_000), {
			title: context?.title,
			url: context?.url || undefined,
			isGitHub: context?.url ? isGitHubUrl(context.url) : false,
			isPDF: isPdfContent(context?.contentType),
			isWebPage: isHtmlContent(context?.contentType, context?.url),
		})
		console.log("[Grok] Attempting text-based summary via Grok", {
			hasUrl: Boolean(context?.url),
			model: "grok-4-latest",
		})
		const answer = await grokChat(
			[
				{
					role: "system",
					content: SUMMARY_SYSTEM_PROMPT,
				},
				{ role: "user", content: textPrompt },
			],
			{ maxTokens: 800, timeoutMs: options?.timeoutMs ?? 12_000 },
		)
		if (answer?.trim()) {
			console.log("[Grok] Text-based summary generated successfully")
			return ensureUseCases(answer)
		}
		console.warn(
			"[Grok] Text-based summary failed or empty response; trying URL-based (if available)",
		)
	}

	// URL-based as fallback (only if URL exists)
	if (context?.url) {
		const urlPrompt = buildUrlAnalysisPrompt(
			context.url,
			context?.title || undefined,
		)
		console.log("[Grok] Attempting URL-based summary via Grok", {
			url: context.url,
			model: "grok-4-latest",
		})
		const answer = await grokChat(
			[
				{
					role: "system",
					content: SUMMARY_SYSTEM_PROMPT,
				},
				{ role: "user", content: urlPrompt },
			],
			{ maxTokens: 800, timeoutMs: options?.timeoutMs ?? 12_000 },
		)
		if (answer?.trim()) {
			console.log("[Grok] URL-based summary generated successfully")
			return ensureUseCases(answer)
		}
		console.warn("[Grok] URL-based summary also failed or empty response")
	}

	return null
}

export function sanitizeSummaryMarkdown(markdown: string): string {
	const sections = markdown.split(/(?=^##\s+)/m)
	if (sections.length <= 1) return markdown

	const dedupedSections = sections.map((section) => {
		const lines = section.split("\n")
		const seen = new Set<string>()
		const result: string[] = []

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]
			if (i === 0 && /^##\s+/.test(line)) {
				result.push(line)
				continue
			}
			const trimmed = line.trim()
			if (!trimmed) {
				const prev = result[result.length - 1]
				if (prev && prev.trim() !== "") result.push(line)
				continue
			}

			const normalized = trimmed
				.replace(/^[-*•]\s+/, "")
				.replace(/^\d+\.\s+/, "")
				.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
				.replace(/\*\*/g, "")
				.replace(/`/g, "")
				.toLowerCase()
				.replace(/\s+/g, " ")

			if (seen.has(normalized)) continue
			seen.add(normalized)
			result.push(line)
		}

		return result.join("\n").trimEnd()
	})

	return dedupedSections.join("\n\n").trim()
}

function ensureUseCases(markdown: string): string {
	let result = markdown

	// Replace empty/placeholder use cases with actual fallback content
	const emptyPatterns = [
		/##\s*Casos\s*de\s*Uso\s*\n+\s*[-•]\s*\(sem casos de uso identificados\)/gi,
		/##\s*Casos\s*de\s*Uso\s*\n+\s*\(sem casos de uso identificados\)/gi,
		/##\s*Casos\s*de\s*Uso\s*\n+\s*[-•]\s*Não foram identificados/gi,
		/##\s*Casos\s*de\s*Uso\s*\n+\s*Não foram identificados/gi,
		/##\s*Casos\s*de\s*Uso\s*\n+\s*[-•]\s*N\/A/gi,
	]

	const fallbackUseCases = getFallbackMessage("noUseCases")
	for (const pattern of emptyPatterns) {
		result = result.replace(pattern, `## Casos de Uso\n${fallbackUseCases}`)
	}

	// Check if section exists after replacements
	const hasSection = /(?:^|\n)##\s*Casos\s*de\s*Uso(?:\s|\n)/i.test(result)
	if (!hasSection) {
		// Add section if missing
		const appendix = `\n\n${getSectionHeader("useCases")}\n${fallbackUseCases}\n`
		result = result.trimEnd() + appendix
	}

	return sanitizeSummaryMarkdown(result)
}
