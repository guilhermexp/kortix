import type { SupabaseClient } from "@supabase/supabase-js"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { join } from "node:path"
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

type ToolState = "output-available" | "output-error"

export type AgentPart =
	| { type: "text"; text: string }
	| {
			type: "tool-searchMemories"
			state: ToolState
			output?: {
				count?: number
				results?: Array<{
					documentId?: string
					title?: string
					url?: string
					score?: number
				}>
			}
			error?: string
	  }
	| {
			type: "tool-generic"
			toolName: string
			state: ToolState
			outputText?: string
			error?: string
	  }

function sanitizeContent(value: string) {
	return value.replace(/\s+/g, " ").trim()
}

function createPromptStream(messages: AgentMessage[]) {
	return (async function* promptGenerator() {
		for (let i = 0; i < messages.length; i++) {
			const message = messages[i]
			const text = sanitizeContent(message.content)
			if (!text) {
				console.warn(`[createPromptStream] Skipping empty message ${i}`)
				continue
			}
			const payload = {
				role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
				content: [{ type: "text" as const, text }],
			}
			const yieldValue = message.role === "assistant"
				? { type: "assistant" as const, message: payload }
				: { type: "user" as const, message: payload }

			console.log(`[createPromptStream] Yielding message ${i}:`, {
				type: yieldValue.type,
				role: payload.role,
				contentLength: text.length,
				contentPreview: text.substring(0, 50)
			})

			yield yieldValue
		}
		console.log("[createPromptStream] Finished yielding all messages")
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
}: ClaudeAgentOptions): Promise<{
	events: unknown[]
	text: string
	parts: AgentPart[]
}> {
	console.log("[executeClaudeAgent] Starting with", messages.length, "messages")

	try {
		// WORKAROUND: Claude Agent SDK CLI crashes when receiving assistant messages
		// in history because they may have had tool_use blocks that were lost when
		// converted to plain text. Only send user messages to maintain context.
		const userOnlyMessages = messages.filter(m => m.role === 'user')

		if (userOnlyMessages.length !== messages.length) {
			console.log("[executeClaudeAgent] Filtered to", userOnlyMessages.length, "user messages (assistant messages removed from history)")
		}

		const prompt = createPromptStream(userOnlyMessages)
		const toolsServer = createSupermemoryTools(client, orgId, context)
		const toolNames = Array.isArray(allowedTools) && allowedTools.length > 0 ? allowedTools : undefined

		// Explicitly set the path to CLI to avoid spawning issues
		// See: https://github.com/anthropics/claude-code/issues/4619
		// Use absolute path from monorepo root
		const pathToClaudeCodeExecutable = "/Users/guilhermevarela/Public/supermemory/node_modules/@anthropic-ai/claude-agent-sdk/cli.js"
		console.log("[executeClaudeAgent] Using CLI at:", pathToClaudeCodeExecutable)

		const queryOptions: Record<string, unknown> = {
			systemPrompt: systemPrompt ?? ENHANCED_SYSTEM_PROMPT,
			model: model ?? env.CHAT_MODEL,
			mcpServers: {
				"supermemory-tools": toolsServer,
			},
			permissionMode: "bypassPermissions",
			pathToClaudeCodeExecutable,
		}
		if (toolNames) {
			queryOptions.allowedTools = toolNames
		}
		if (typeof maxTurns === "number") {
			queryOptions.maxTurns = maxTurns
		}

		console.log("[executeClaudeAgent] Starting query with options:", {
			model: queryOptions.model,
			permissionMode: queryOptions.permissionMode,
			maxTurns: queryOptions.maxTurns,
			hasTools: !!queryOptions.mcpServers,
			cliPath: pathToClaudeCodeExecutable,
		})
		console.log("[executeClaudeAgent] Messages being sent:", messages.map(m => ({
			role: m.role,
			contentLength: m.content.length
		})))

		const agentIterator = query({
			prompt,
			options: queryOptions,
		})

		const events: unknown[] = []
		let eventCount = 0
		for await (const event of agentIterator) {
			eventCount++
			if (event && typeof event === 'object' && 'type' in event) {
				console.log(`[executeClaudeAgent] Event ${eventCount}:`, (event as any).type)
			}
			events.push(event)
		}
		console.log("[executeClaudeAgent] Completed with", events.length, "events")

		const { text, parts } = buildAssistantResponse(events)
		return { events, text, parts }
	} catch (error) {
		console.error("[executeClaudeAgent] Error:", error)
		throw error
	}
}

function buildAssistantResponse(events: unknown[]): {
	text: string
	parts: AgentPart[]
} {
	const textChunks: string[] = []
	const toolCalls = new Map<
		string,
		{
			name: string
		}
	>()
	const toolParts: AgentPart[] = []

	for (const event of events) {
		if (!event || typeof event !== "object") continue
		const base = event as Record<string, unknown>
		if (base.type === "assistant") {
			const message = base.message as Record<string, unknown> | undefined
			const content = message?.content
			if (Array.isArray(content)) {
				for (const block of content) {
					if (!block || typeof block !== "object") continue
					const value = block as Record<string, unknown>
					const blockType = value.type
					if (blockType === "text" && typeof value.text === "string") {
						textChunks.push(value.text)
					} else if (blockType === "tool_use") {
						const id = typeof value.id === "string" ? value.id : undefined
						const name =
							typeof value.name === "string" ? value.name : id ?? "tool"
						if (id) {
							toolCalls.set(id, { name })
						}
					}
				}
			}
		}

		if (base.type === "user") {
			const content = base.content
			if (Array.isArray(content)) {
				for (const block of content) {
					if (!block || typeof block !== "object") continue
					const value = block as Record<string, unknown>
					if (value.type === "tool_result") {
						const toolUseId =
							typeof value.tool_use_id === "string" ? value.tool_use_id : ""
						const info = toolCalls.get(toolUseId)
						const toolName = info?.name ?? toolUseId
						const raw = collectTextFromContent(value.content)
						const isError = Boolean(value.is_error)
						if (toolName === "mcp__supermemory-tools__searchDatabase") {
							toolParts.push(
								buildSearchMemoriesPart(raw, isError ? raw : undefined),
							)
						} else {
							toolParts.push({
								type: "tool-generic",
								toolName,
								state: isError ? "output-error" : "output-available",
								outputText: isError ? undefined : raw,
								error: isError ? raw || "Tool execution failed" : undefined,
							})
						}
					}
				}
			}
		}
	}

	const cleanedText = textChunks.join("").trim()
	const parts: AgentPart[] = []
	if (cleanedText.length > 0) {
		parts.push({ type: "text", text: cleanedText })
	}
	parts.push(...toolParts)

	return {
		text: cleanedText,
		parts,
	}
}

function buildSearchMemoriesPart(raw: string, error?: string): AgentPart {
	if (error) {
		return {
			type: "tool-searchMemories",
			state: "output-error",
			error,
		}
	}

	try {
		const payload = JSON.parse(raw) as {
			count?: unknown
			results?: Array<{
				documentId?: string
				title?: string
				url?: string
				score?: number
			}>
		}
		return {
			type: "tool-searchMemories",
			state: "output-available",
			output: {
				count:
					typeof payload.count === "number"
						? payload.count
						: Array.isArray(payload.results)
							? payload.results.length
							: undefined,
				results: Array.isArray(payload.results)
					? payload.results.map((result) => ({
							documentId:
								typeof result.documentId === "string"
									? result.documentId
									: undefined,
							title:
								typeof result.title === "string" ? result.title : undefined,
							content:
								typeof (result as Record<string, unknown>)?.content === "string"
									? ((result as Record<string, unknown>).content as string)
									: undefined,
							url: typeof result.url === "string" ? result.url : undefined,
							score:
								typeof result.score === "number" ? result.score : undefined,
						}))
					: [],
			},
		}
	} catch {
		return {
			type: "tool-searchMemories",
			state: "output-error",
			error: raw || "Erro ao analisar resultados da busca",
		}
	}
}
