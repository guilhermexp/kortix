import { isGitHubUrl, isHtmlContent, isPdfContent } from "../config/constants"
import {
	buildTextAnalysisPrompt,
	buildUrlAnalysisPrompt as buildUrlAnalysisPromptI18n,
	getFallbackMessage,
	getSectionHeader,
} from "../i18n"
import { openRouterChat } from "./openrouter"

function buildUrlAnalysisPrompt(url: string, title?: string | null) {
	const isGh = isGitHubUrl(url)
	return buildUrlAnalysisPromptI18n(url, { title, isGitHub: isGh })
}

export async function summarizeWithOpenRouter(
	text: string,
	context?: {
		title?: string | null
		url?: string | null
		contentType?: string | null
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
		console.log(
			"[OpenRouterFallback] Attempting text-based summary via OpenRouter",
			{
				hasUrl: Boolean(context?.url),
				model: "x-ai/grok-4-fast",
			},
		)
		const answer = await openRouterChat(
			[
				{
					role: "system",
					content:
						"Você é um assistente que gera resumos estruturados em Markdown. RESPONDA SEMPRE EM PORTUGUÊS DO BRASIL, mesmo que o conteúdo original esteja em inglês. SEMPRE inclua a seção Casos de Uso com pelo menos 3 itens REAIS - SEMPRE infira casos de uso baseado no contexto do conteúdo. NUNCA escreva '(sem casos de uso identificados)' ou 'N/A' - sempre gere casos de uso relevantes. NUNCA inclua o título do documento/página na resposta - o título já é exibido separadamente na interface. Comece DIRETAMENTE com ## Resumo Executivo.",
				},
				{ role: "user", content: textPrompt },
			],
			{ maxTokens: 800, timeoutMs: 12_000 },
		)
		if (answer?.trim()) {
			console.log(
				"[OpenRouterFallback] Text-based summary generated successfully",
			)
			return ensureUseCases(answer)
		}
		console.warn(
			"[OpenRouterFallback] Text-based summary failed or empty response; trying URL-based (if available)",
		)
	}

	// URL-based as fallback (only if URL exists)
	if (context?.url) {
		const urlPrompt = buildUrlAnalysisPrompt(
			context.url,
			context?.title || undefined,
		)
		console.log(
			"[OpenRouterFallback] Attempting URL-based summary via OpenRouter",
			{
				url: context.url,
				model: "x-ai/grok-4-fast",
			},
		)
		const answer = await openRouterChat(
			[
				{
					role: "system",
					content:
						"Você é um assistente que gera resumos estruturados em Markdown. RESPONDA SEMPRE EM PORTUGUÊS DO BRASIL, mesmo que o conteúdo original esteja em inglês. SEMPRE inclua a seção Casos de Uso com pelo menos 3 itens REAIS - SEMPRE infira casos de uso baseado no contexto do conteúdo. NUNCA escreva '(sem casos de uso identificados)' ou 'N/A' - sempre gere casos de uso relevantes. NUNCA inclua o título do documento/página na resposta - o título já é exibido separadamente na interface. Comece DIRETAMENTE com ## Resumo Executivo.",
				},
				{ role: "user", content: urlPrompt },
			],
			{ maxTokens: 800, timeoutMs: 12_000 },
		)
		if (answer?.trim()) {
			console.log(
				"[OpenRouterFallback] URL-based summary generated successfully",
			)
			return ensureUseCases(answer)
		}
		console.warn(
			"[OpenRouterFallback] URL-based summary also failed or empty response",
		)
	}

	return null
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
	if (hasSection) return result

	// Add section if missing
	const appendix = `\n\n${getSectionHeader("useCases")}\n${fallbackUseCases}\n`
	return result.trimEnd() + appendix
}
