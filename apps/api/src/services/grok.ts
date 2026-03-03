import { env } from "../env"

export class GrokApiError extends Error {
	constructor(
		public readonly statusCode: number,
		public readonly body: string,
	) {
		super(`[Grok] HTTP ${statusCode}: ${body}`)
		this.name = "GrokApiError"
	}
}

type ChatMessage = {
	role: "system" | "user" | "assistant"
	content: string
}

/**
 * Grok chat client routed via OpenRouter.
 * Uses OpenRouter as the only gateway for Grok models.
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
	const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
	if (!apiKey) {
		console.warn("[Grok] OPENROUTER_API_KEY not configured")
		return null
	}

	const model =
		options?.model ||
		env.OPENROUTER_MODEL ||
		"x-ai/grok-4.1-fast"
	const temperature = options?.temperature ?? 0.2
	const maxTokens = options?.maxTokens ?? 1024
	const timeoutMs = options?.timeoutMs ?? 25_000

	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		}
		if (env.OPENROUTER_SITE_URL) {
			headers["HTTP-Referer"] = env.OPENROUTER_SITE_URL
		}
		if (env.OPENROUTER_SITE_NAME) {
			headers["X-Title"] = env.OPENROUTER_SITE_NAME
		}

		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers,
			body: JSON.stringify({
				model,
				messages,
				temperature,
				max_tokens: maxTokens,
				stream: false,
				reasoning: { effort: "none" },
			}),
			signal: options?.signal
				? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
				: AbortSignal.timeout(timeoutMs),
		})

		if (!res.ok) {
			const text = await res.text()
			console.warn("[Grok] HTTP", res.status, res.statusText, text)
			throw new GrokApiError(res.status, text)
		}

		const data = (await res.json()) as any
		const content: string | undefined = data?.choices?.[0]?.message?.content
		return typeof content === "string" ? content.trim() : null
	} catch (err) {
		const isTimeout =
			err instanceof DOMException && err.name === "TimeoutError"
		console.warn(
			`[Grok] request failed (${isTimeout ? `timeout after ${timeoutMs}ms` : "network error"})`,
			isTimeout ? "" : err,
		)
		return null
	}
}
