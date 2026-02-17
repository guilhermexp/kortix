import { env } from "../env"

type ChatMessage = {
	role: "system" | "user" | "assistant"
	content: string
}

export async function openRouterChat(
	messages: ChatMessage[],
	options?: {
		model?: string
		temperature?: number
		maxTokens?: number
		timeoutMs?: number
		signal?: AbortSignal
		refererUrl?: string
		siteTitle?: string
		reasoningEffort?: "none" | "low" | "medium" | "high"
	},
): Promise<string | null> {
	const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
	if (!apiKey) {
		console.warn("[OpenRouter] OPENROUTER_API_KEY not configured")
		return null
	}

	const model = options?.model || env.OPENROUTER_MODEL || "x-ai/grok-4.1-fast"
	const temperature = options?.temperature ?? env.OPENROUTER_TEMPERATURE ?? 0.2
	const maxTokens = options?.maxTokens ?? env.OPENROUTER_MAX_TOKENS ?? 1024
	const timeoutMs = options?.timeoutMs ?? 12_000

	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		}
		const ref = options?.refererUrl || env.OPENROUTER_SITE_URL
		const title = options?.siteTitle || env.OPENROUTER_SITE_NAME
		if (ref) headers["HTTP-Referer"] = ref
		if (title) headers["X-Title"] = title

		const reasoningEffort = options?.reasoningEffort ?? "none"

		const body: Record<string, unknown> = {
			model,
			messages,
			temperature,
			max_tokens: maxTokens,
			reasoning: { effort: reasoningEffort },
		}

		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal: options?.signal
				? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
				: AbortSignal.timeout(timeoutMs),
		})

		if (!res.ok) {
			const text = await res.text()
			console.warn("[OpenRouter] HTTP", res.status, res.statusText, text)
			return null
		}

		const data = (await res.json()) as any
		const content: string | undefined = data?.choices?.[0]?.message?.content
		return typeof content === "string" ? content.trim() : null
	} catch (err) {
		console.warn("[OpenRouter] request failed", err)
		return null
	}
}
