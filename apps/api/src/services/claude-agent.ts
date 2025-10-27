import type { SupabaseClient } from "@supabase/supabase-js"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { ENHANCED_SYSTEM_PROMPT } from "../prompts/chat"
import { env } from "../env"
import { createSupermemoryTools } from "./claude-agent-tools"

export type AgentMessage = {
	role: "user" | "assistant"
	content: string
}

export type AgentContextOptions = {
	containerTags?: string[]
	scopedDocumentIds?: string[]
}

export type ClaudeAgentOptions = {
	messages: AgentMessage[]
	client: SupabaseClient
	orgId: string
	systemPrompt?: string
	model?: string
	context?: AgentContextOptions
	allowedTools?: string[]
	maxTurns?: number
}

function sanitizeContent(value: string) {
	return value.replace(/\s+/g, " ").trim()
}

function createPromptStream(messages: AgentMessage[]) {
	return (async function* promptGenerator() {
		for (const message of messages) {
			const text = sanitizeContent(message.content)
			if (!text) continue
			const payload = {
				role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
				content: [{ type: "text" as const, text }],
			}
			if (message.role === "assistant") {
				yield {
					type: "assistant" as const,
					message: payload,
				}
			} else {
				yield {
					type: "user" as const,
					message: payload,
				}
			}
		}
	})();
}

function collectTextFromContent(content: unknown): string[] {
	if (!content) return []
	if (typeof content === "string") {
		return [content]
	}
	if (Array.isArray(content)) {
		const segments: string[] = []
		for (const item of content) {
			if (!item || typeof item !== "object") continue
			if ("text" in item && typeof item.text === "string") {
				segments.push(item.text)
			}
			if ("content" in item) {
				segments.push(...collectTextFromContent((item as any).content))
			}
		}
		return segments
	}
	if (typeof content === "object") {
		if ("text" in content && typeof (content as any).text === "string") {
			return [(content as any).text]
		}
		if ("content" in content) {
			return collectTextFromContent((content as any).content)
		}
	}
	return []
}

function extractAssistantText(events: unknown[]): string {
	const parts: string[] = []

	for (const event of events) {
		if (!event || typeof event !== "object") continue
		const typed = event as Record<string, unknown>

		if (typeof typed.type === "string" && typed.type.includes("output_text")) {
			const delta = typed.delta ?? typed.output_text ?? typed.text
			if (typeof delta === "string") {
				parts.push(delta)
				continue
			}
			if (delta && typeof delta === "object") {
				parts.push(...collectTextFromContent(delta))
				continue
			}
		}

		const message =
			typed.message && typeof typed.message === "object"
				? (typed.message as Record<string, unknown>)
				: null

		if (message && message.role === "assistant") {
			if (message.content) {
				parts.push(...collectTextFromContent(message.content))
			}
			continue
		}

		if (typed.content && typed.role === "assistant") {
			parts.push(...collectTextFromContent(typed.content))
		}
	}

	return parts.join("")
}

export async function executeClaudeAgent({
	messages,
	client,
	orgId,
	systemPrompt,
	model,
	context,
	allowedTools,
	maxTurns,
}: ClaudeAgentOptions): Promise<{ events: unknown[]; text: string }> {
	const prompt = createPromptStream(messages)
	const toolsServer = createSupermemoryTools(client, orgId, context)
	const toolNames =
		allowedTools ?? ["mcp__supermemory-tools__searchDatabase"]
	const queryOptions: Record<string, unknown> = {
		systemPrompt: systemPrompt ?? ENHANCED_SYSTEM_PROMPT,
		model: model ?? env.CHAT_MODEL,
		mcpServers: {
			"supermemory-tools": toolsServer,
		},
		allowedTools: toolNames,
		permissionMode: "default",
	}
	if (typeof maxTurns === "number") {
		queryOptions.maxTurns = maxTurns
	}

	const agentIterator = query({
		prompt,
		options: queryOptions,
	})

	const events: unknown[] = []
	for await (const event of agentIterator) {
		events.push(event)
	}

	const text = extractAssistantText(events)
	return { events, text }
}
