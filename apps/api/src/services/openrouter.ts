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
		refererUrl?: string
		siteTitle?: string
	},
): Promise<string | null> {
	const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
	if (!apiKey) {
		console.warn("[OpenRouter] OPENROUTER_API_KEY not configured")
		return null
	}

	const model = options?.model || env.OPENROUTER_MODEL || "x-ai/grok-4-fast"
	const temperature = options?.temperature ?? env.OPENROUTER_TEMPERATURE ?? 0.2
	const maxTokens = options?.maxTokens ?? env.OPENROUTER_MAX_TOKENS ?? 1024

	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		}
		const ref = options?.refererUrl || env.OPENROUTER_SITE_URL
		const title = options?.siteTitle || env.OPENROUTER_SITE_NAME
		if (ref) headers["HTTP-Referer"] = ref
		if (title) headers["X-Title"] = title

		const body = {
			model,
			messages,
			temperature,
			max_tokens: maxTokens,
		}

		const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers,
			body: JSON.stringify(body),
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
