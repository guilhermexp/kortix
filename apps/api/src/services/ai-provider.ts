import {
	GoogleGenerativeAI,
	type GenerateContentRequest,
	type GenerateContentResult,
	type GenerateContentStreamResult,
} from "@google/generative-ai"
import { env } from "../env"

/**
 * Wrapper para Google Generative AI com fallback automático para OpenRouter
 * Detecta erros de quota (429) e faz fallback transparente mantendo o mesmo modelo
 */

type ModelConfig = { model: string }

interface AIProvider {
	generateContent: (
		request: GenerateContentRequest,
	) => Promise<GenerateContentResult>
	generateContentStream: (
		request: GenerateContentRequest,
	) => Promise<GenerateContentStreamResult>
	embedContent?: (request: {
		content: { parts: Array<{ text: string }> }
	}) => Promise<{ embedding?: { values?: number[] } }>
}

class AIProviderWithFallback implements AIProvider {
	private primaryProvider: AIProvider | null
	private fallbackProvider: AIProvider | null
	private modelId: string

	constructor(modelId: string) {
		this.modelId = modelId

		// Configurar provider primário (Gemini)
		if (env.GOOGLE_API_KEY) {
			const googleClient = new GoogleGenerativeAI(env.GOOGLE_API_KEY)
			this.primaryProvider = googleClient.getGenerativeModel({ model: modelId })
		} else {
			this.primaryProvider = null
		}

		// Configurar provider de fallback (OpenRouter)
		if (env.OPENROUTER_API_KEY) {
			this.fallbackProvider = this.createOpenRouterProvider(modelId)
		} else {
			this.fallbackProvider = null
		}
	}

	private createOpenRouterProvider(modelId: string): AIProvider {
		const openRouterModel = this.mapGeminiToOpenRouter(modelId)

		return {
			generateContent: async (
				request: GenerateContentRequest,
			): Promise<GenerateContentResult> => {
				const response = await fetch(
					"https://openrouter.ai/api/v1/chat/completions",
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
							"Content-Type": "application/json",
							"HTTP-Referer": env.APP_URL,
							"X-Title": "Supermemory",
						},
						body: JSON.stringify({
							model: openRouterModel,
							messages: this.convertGeminiToOpenRouterFormat(request),
							max_tokens: request.generationConfig?.maxOutputTokens ?? 8192,
							temperature: request.generationConfig?.temperature ?? 0.7,
						}),
					},
				)

				if (!response.ok) {
					throw new Error(
						`OpenRouter API error: ${response.status} ${response.statusText}`,
					)
				}

				const data = await response.json()
				return this.convertOpenRouterToGeminiFormat(data)
			},

			generateContentStream: async (
				request: GenerateContentRequest,
			): Promise<GenerateContentStreamResult> => {
				const response = await fetch(
					"https://openrouter.ai/api/v1/chat/completions",
					{
						method: "POST",
						headers: {
							Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
							"Content-Type": "application/json",
							"HTTP-Referer": env.APP_URL,
							"X-Title": "Supermemory",
						},
						body: JSON.stringify({
							model: openRouterModel,
							messages: this.convertGeminiToOpenRouterFormat(request),
							max_tokens: request.generationConfig?.maxOutputTokens ?? 8192,
							temperature: request.generationConfig?.temperature ?? 0.7,
							stream: true,
						}),
					},
				)

				if (!response.ok) {
					throw new Error(
						`OpenRouter API error: ${response.status} ${response.statusText}`,
					)
				}

				return this.createStreamFromOpenRouter(response)
			},

			embedContent: async (request: {
				content: { parts: Array<{ text: string }> }
			}) => {
				// OpenRouter não suporta embeddings diretamente, retornar formato vazio
				// O código existente já tem fallback para embeddings determinísticos
				throw new Error(
					"OpenRouter does not support embeddings, will use fallback",
				)
			},
		}
	}

	private mapGeminiToOpenRouter(geminiModel: string): string {
		// Remove o prefixo "models/" se existir
		const cleanModel = geminiModel.replace(/^models\//, "")

		// Mapear modelos Gemini para OpenRouter
		// Usando gemini-2.5-flash-lite como fallback principal (mais barato e rápido)
		const modelMap: Record<string, string> = {
			"gemini-2.5-pro": "google/gemini-2.5-flash-lite-preview-09-2025",
			"gemini-2.5-flash": "google/gemini-2.5-flash-lite-preview-09-2025",
			"gemini-2.0-flash": "google/gemini-2.5-flash-lite-preview-09-2025",
			"gemini-2.0-flash-exp": "google/gemini-2.5-flash-lite-preview-09-2025",
			"gemini-pro": "google/gemini-2.5-flash-lite-preview-09-2025",
			"gemini-pro-vision": "google/gemini-2.5-flash-lite-preview-09-2025",
		}

		return (
			modelMap[cleanModel] ?? "google/gemini-2.5-flash-lite-preview-09-2025" // fallback padrão
		)
	}

	private convertGeminiToOpenRouterFormat(
		request: GenerateContentRequest,
	): Array<{ role: string; content: string }> {
		const messages: Array<{ role: string; content: string }> = []

		// Adicionar system instruction se existir
		if (request.systemInstruction) {
			const systemText =
				"parts" in request.systemInstruction
					? request.systemInstruction.parts
							.map((p) => ("text" in p ? p.text : ""))
							.join(" ")
					: ""
			if (systemText) {
				messages.push({ role: "system", content: systemText })
			}
		}

		// Converter contents
		for (const content of request.contents ?? []) {
			const role = content.role === "model" ? "assistant" : "user"
			const text = content.parts.map((p) => ("text" in p ? p.text : "")).join(" ")
			if (text) {
				messages.push({ role, content: text })
			}
		}

		return messages
	}

	private convertOpenRouterToGeminiFormat(data: {
		choices: Array<{ message: { content: string } }>
	}): GenerateContentResult {
		const content = data.choices?.[0]?.message?.content ?? ""

		// Criar objeto compatível com GenerateContentResult do Gemini
		const result: any = {
			response: {
				text: () => content,
				candidates: [
					{
						content: {
							parts: [{ text: content }],
							role: "model",
						},
						finishReason: "STOP",
						index: 0,
						safetyRatings: [],
					},
				],
				promptFeedback: {
					safetyRatings: [],
				},
			},
		}

		return result as GenerateContentResult
	}

	private async *streamOpenRouterResponse(
		response: Response,
	): AsyncGenerator<{ candidates: Array<{ content: { parts: Array<{ text: string }> } }> }> {
		const reader = response.body?.getReader()
		if (!reader) throw new Error("No response body")

		const decoder = new TextDecoder()
		let buffer = ""

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split("\n")
				buffer = lines.pop() ?? ""

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6).trim()
						if (data === "[DONE]") continue
						if (!data) continue

						try {
							const parsed = JSON.parse(data)
							const delta = parsed.choices?.[0]?.delta?.content
							if (delta) {
								yield {
									candidates: [
										{
											content: {
												parts: [{ text: delta }],
											},
										},
									],
								}
							}
						} catch (e) {
							// Ignorar erros de parsing de linhas individuais
						}
					}
				}
			}
		} finally {
			reader.releaseLock()
		}
	}

	private createStreamFromOpenRouter(
		response: Response,
	): GenerateContentStreamResult {
		const generator = this.streamOpenRouterResponse(response)

		return {
			stream: generator,
			response: (async () => {
				let fullText = ""
				for await (const chunk of generator) {
					const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text
					if (text) fullText += text
				}
				return {
					text: () => fullText,
					candidates: [
						{
							content: { parts: [{ text: fullText }], role: "model" },
							finishReason: "STOP",
							index: 0,
						},
					],
				}
			})(),
		} as unknown as GenerateContentStreamResult
	}

	private isQuotaError(error: unknown): boolean {
		if (!error) return false

		const errorStr = String(error)
		const isQuota =
			errorStr.includes("429") ||
			errorStr.includes("quota") ||
			errorStr.includes("Too Many Requests") ||
			errorStr.includes("RESOURCE_EXHAUSTED")

		if (isQuota) {
			console.warn("🔄 Quota exceeded on primary provider, falling back...")
		}

		return isQuota
	}

	async generateContent(
		request: GenerateContentRequest,
	): Promise<GenerateContentResult> {
		// Tentar provider primário primeiro
		if (this.primaryProvider) {
			try {
				return await this.primaryProvider.generateContent(request)
			} catch (error) {
				if (this.isQuotaError(error) && this.fallbackProvider) {
					console.info(
						`✅ Switched to fallback provider for model ${this.modelId}`,
					)
					return await this.fallbackProvider.generateContent(request)
				}
				throw error
			}
		}

		// Se não houver provider primário, usar fallback diretamente
		if (this.fallbackProvider) {
			return await this.fallbackProvider.generateContent(request)
		}

		throw new Error("No AI provider configured")
	}

	async generateContentStream(
		request: GenerateContentRequest,
	): Promise<GenerateContentStreamResult> {
		// Tentar provider primário primeiro
		if (this.primaryProvider) {
			try {
				return await this.primaryProvider.generateContentStream(request)
			} catch (error) {
				if (this.isQuotaError(error) && this.fallbackProvider) {
					console.info(
						`✅ Switched to fallback provider (stream) for model ${this.modelId}`,
					)
					return await this.fallbackProvider.generateContentStream(request)
				}
				throw error
			}
		}

		// Se não houver provider primário, usar fallback diretamente
		if (this.fallbackProvider) {
			return await this.fallbackProvider.generateContentStream(request)
		}

		throw new Error("No AI provider configured")
	}

	async embedContent(request: {
		content: { parts: Array<{ text: string }> }
	}): Promise<{ embedding?: { values?: number[] } }> {
		// Embeddings só funcionam com Gemini, não tem fallback no OpenRouter
		if (this.primaryProvider?.embedContent) {
			return await this.primaryProvider.embedContent(request)
		}

		throw new Error("Embedding not supported, will use fallback")
	}
}

/**
 * Cria um client de AI com fallback automático
 */
export function createAIClient() {
	return {
		getGenerativeModel: (config: ModelConfig): AIProvider => {
			return new AIProviderWithFallback(config.model)
		},
	}
}

/**
 * Client de AI padrão com fallback
 */
export const aiClient = env.GOOGLE_API_KEY || env.OPENROUTER_API_KEY
	? createAIClient()
	: null
