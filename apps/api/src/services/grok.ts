import { env } from "../env"

type ChatMessage = {
	role: "system" | "user" | "assistant"
	content: string
}

/**
 * Direct Grok (X-AI) API client.
 * Calls https://api.x.ai/v1/chat/completions without OpenRouter intermediary.
 */
export async function grokChat(
	messages: ChatMessage[],
	options?: {
		model?: string
		temperature?: number
		maxTokens?: number
		timeoutMs?: number
		signal?: AbortSignal
	},
): Promise<string | null> {
	const apiKey = env.XAI_API_KEY || process.env.XAI_API_KEY
	if (!apiKey) {
		console.warn("[Grok] XAI_API_KEY not configured")
		return null
	}

	const model = options?.model || env.XAI_MODEL || "grok-4-latest"
	const temperature = options?.temperature ?? 0.2
	const maxTokens = options?.maxTokens ?? 1024
	const timeoutMs = options?.timeoutMs ?? 12_000

	try {
		const res = await fetch("https://api.x.ai/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				messages,
				temperature,
				max_tokens: maxTokens,
				stream: false,
			}),
			signal: options?.signal
				? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
				: AbortSignal.timeout(timeoutMs),
		})

		if (!res.ok) {
			const text = await res.text()
			console.warn("[Grok] HTTP", res.status, res.statusText, text)
			return null
		}

		const data = (await res.json()) as any
		const content: string | undefined = data?.choices?.[0]?.message?.content
		return typeof content === "string" ? content.trim() : null
	} catch (err) {
		console.warn("[Grok] request failed", err)
		return null
	}
}
