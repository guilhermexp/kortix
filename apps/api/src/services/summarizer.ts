import { GoogleGenerativeAI } from "@google/generative-ai"
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
import { env } from "../env"
import {
	buildSummaryPrompt,
	buildTextAnalysisPrompt,
	buildUrlAnalysisPrompt as buildUrlAnalysisPromptI18n,
	buildYoutubePrompt,
	getFallbackMessage,
	getSectionHeader,
} from "../i18n"

const googleClient = env.GOOGLE_API_KEY
	? new GoogleGenerativeAI(env.GOOGLE_API_KEY)
	: null

export async function generateSummary(
	text: string,
	context?: { title?: string | null; url?: string | null },
): Promise<string | null> {
	const trimmed = text.trim()
	if (!trimmed) return null

	if (!googleClient) {
		return buildFallbackSummary(trimmed, context)
	}

	const snippet = trimmed.slice(0, TEXT_LIMITS.SUMMARY_MAX_CHARS)
	const modelId = AI_MODELS.GEMINI_FLASH
	try {
		const model = googleClient.getGenerativeModel({ model: modelId })
		const prompt = buildPrompt(snippet, context)
		const result = await model.generateContent({
			contents: [
				{
					role: "user",
					parts: [{ text: prompt }],
				},
			],
			generationConfig: {
				maxOutputTokens: AI_GENERATION_CONFIG.TOKENS.SUMMARY,
			},
		})

		let textPart = result.response.text().trim()
		if (!textPart) {
			return buildFallbackSummary(trimmed, context)
		}
		textPart = ensureUseCasesSection(textPart)
		return textPart
	} catch (error) {
		console.warn("generateSummary fallback", error)
		return buildFallbackSummary(trimmed, context)
	}
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
 * Gera análise profunda do conteúdo usando Gemini 2.5 Flash
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

	if (!googleClient) {
		console.warn("Google AI not configured, cannot generate deep analysis")
		return null
	}

	try {
		const model = googleClient.getGenerativeModel({
			model: AI_MODELS.GEMINI_FLASH,
		})

		// Se tiver URL, deixa o Gemini ler diretamente (mais limpo)
		if (context?.url) {
			const prompt = buildUrlAnalysisPrompt(context)

			const result = await model.generateContent({
				contents: [{ role: "user", parts: [{ text: prompt }] }],
				generationConfig: {
					maxOutputTokens: AI_GENERATION_CONFIG.TOKENS.ANALYSIS,
					temperature: AI_GENERATION_CONFIG.TEMPERATURE.DEFAULT,
				},
				tools: [{ urlContext: {} }],
			})

			const analysis = result.response.text().trim()

			if (
				!analysis ||
				analysis.length < QUALITY_THRESHOLDS.MIN_SUMMARY_LENGTH
			) {
				console.warn("URL-based analysis returned empty, trying text fallback")
				// Fallback: usar o texto extraído
				return generateTextBasedAnalysis(text, context, model)
			}

			return ensureUseCasesSection(analysis)
		}

		// Sem URL: usa o texto extraído
		return generateTextBasedAnalysis(text, context, model)
	} catch (error) {
		console.warn("generateDeepAnalysis error", error)
		return buildFallbackSummary(trimmed, context)
	}
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

	if (!googleClient) return null

	const snippet = trimmed.slice(0, TEXT_LIMITS.ANALYSIS_MAX_CHARS)
	const prompt = buildDeepAnalysisPrompt(snippet, context)

	const geminiModel =
		model ||
		googleClient.getGenerativeModel({
			model: AI_MODELS.GEMINI_FLASH,
		})

	const result = await geminiModel.generateContent({
		contents: [{ role: "user", parts: [{ text: prompt }] }],
		generationConfig: {
			maxOutputTokens: AI_GENERATION_CONFIG.TOKENS.ANALYSIS,
			temperature: AI_GENERATION_CONFIG.TEMPERATURE.DEFAULT,
		},
	})

	const analysis = result.response.text().trim()

	if (!analysis || analysis.length < QUALITY_THRESHOLDS.MIN_SUMMARY_LENGTH) {
		return buildFallbackSummary(trimmed, context)
	}

	return ensureUseCasesSection(analysis)
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
	if (!googleClient) {
		console.warn("Google AI not configured, cannot analyze YouTube video")
		return null
	}

	try {
		const modelId = AI_MODELS.GEMINI_FLASH
		const model = googleClient.getGenerativeModel({ model: modelId })

		const prompt = buildYoutubePrompt()

		const result = await model.generateContent({
			contents: [
				{
					role: "user",
					parts: [
						{
							fileData: {
								mimeType: "video/*",
								fileUri: url,
							},
						},
						{ text: prompt },
					],
				},
			],
			generationConfig: {
				maxOutputTokens: AI_GENERATION_CONFIG.TOKENS.YOUTUBE_SUMMARY,
				temperature: AI_GENERATION_CONFIG.TEMPERATURE.YOUTUBE,
			},
		})

		const summary = result.response.text().trim()

		if (!summary || summary.length < QUALITY_THRESHOLDS.MIN_SUMMARY_LENGTH) {
			console.warn("YouTube video analysis returned empty or very short result")
			return null
		}

		return ensureUseCasesSection(summary)
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.error("summarizeYoutubeVideo error:", message)

		// Se falhar com Gemini 2.0, não tentar fallback pois não funciona bem
		return null
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
