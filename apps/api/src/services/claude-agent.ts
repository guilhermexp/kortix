import type { SupabaseClient } from "@supabase/supabase-js"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { access } from "node:fs/promises"
import { ENHANCED_SYSTEM_PROMPT } from "../prompts/chat"
import { env } from "../env"
import { createSupermemoryTools } from "./claude-agent-tools"
import { EventStorageService, type ClaudeMessage } from "./event-storage"

// Content block types for Claude messages
export type TextBlock = { type: "text"; text: string }
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown }
export type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: unknown; is_error?: boolean }

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

export type AgentMessage = {
	role: "user" | "assistant"
	content: string | ContentBlock[]  // Support both simple text and structured content blocks
}

export type AgentContextOptions = {
	containerTags?: string[]
	scopedDocumentIds?: string[]
}

export type ClaudeAgentOptions = {
	message: string // Single user message for this turn
	sdkSessionId?: string // SDK session ID to resume (from SDK, not our DB)
	continueSession?: boolean // If true, use 'continue' to resume most recent session automatically
	client: SupabaseClient
	orgId: string
	systemPrompt?: string
	model?: string
	context?: AgentContextOptions
	allowedTools?: string[]
	maxTurns?: number
}

export type ClaudeAgentCallbacks = {
	onEvent?: (event: unknown) => void | Promise<void>
}

type ToolState = "output-available" | "output-error"

let cachedCliPath: string | null = null

async function resolveClaudeCodeCliPath(): Promise<string> {
	if (cachedCliPath) {
		return cachedCliPath
	}

	const moduleDir = fileURLToPath(new URL(".", import.meta.url))
	const candidateBases = [
		process.cwd(),
		resolve(process.cwd(), ".."),
		moduleDir,
		resolve(moduleDir, ".."),
		resolve(moduleDir, "..", ".."),
		resolve(moduleDir, "..", "..", ".."),
		resolve(moduleDir, "..", "..", "..", ".."),
	]
	const candidatePaths = Array.from(
		new Set(
			candidateBases.map((base) =>
				resolve(base, "node_modules/@anthropic-ai/claude-agent-sdk/cli.js"),
			),
		),
	)

	const tried: string[] = []
	for (const candidate of candidatePaths) {
		tried.push(candidate)
		try {
			await access(candidate)
			cachedCliPath = candidate
			return candidate
		} catch {
			// Continuar verificação em outros caminhos
		}
	}

	throw new Error(
		`[executeClaudeAgent] Claude Code CLI não encontrado. Caminhos verificados: ${tried.join(
			", ",
		)}`,
	)
}

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

/**
 * Normalize content to array of content blocks
 * Handles both legacy string format and new structured format
 */
function normalizeContent(content: string | ContentBlock[]): ContentBlock[] {
	if (typeof content === "string") {
		const sanitized = sanitizeContent(content)
		return sanitized ? [{ type: "text", text: sanitized }] : []
	}
	return content
}

function createPromptStream(messages: AgentMessage[]) {
	return (async function* promptGenerator() {
		for (let i = 0; i < messages.length; i++) {
			const message = messages[i]

			// ⚠️ Claude Agent SDK limitation: prompt stream accepts ONLY user messages
			// Assistant messages must be handled through SDK's session management or system prompt
			if (message.role !== "user") {
				continue
			}

			// Normalize content to array of blocks (handles both string and array formats)
			const contentBlocks = normalizeContent(message.content)

			if (contentBlocks.length === 0) {
				console.warn(`[createPromptStream] Skipping empty message ${i}`)
				continue
			}

			const payload = {
				role: "user" as const,
				content: contentBlocks,
			}

			const contentPreview = contentBlocks
				.map((b) => (b.type === "text" ? b.text.substring(0, 30) : `[${b.type}]`))
				.join(" ")

			console.log(`[createPromptStream] Yielding message ${i}:`, {
				type: "user",
				role: payload.role,
				blockCount: contentBlocks.length,
				blockTypes: contentBlocks.map((b) => b.type),
				contentPreview,
			})

			yield { type: "user" as const, message: payload }
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

export async function executeClaudeAgent(
	{
		message,
		sdkSessionId,
		continueSession,
		client,
		orgId,
		systemPrompt,
		model,
		context,
		allowedTools,
		maxTurns,
	}: ClaudeAgentOptions,
	callbacks: ClaudeAgentCallbacks = {},
): Promise<{
	events: unknown[]
	text: string
	parts: AgentPart[]
	sdkSessionId: string | null // SDK session ID for future requests
}> {
	const sessionMode = continueSession
		? "continuing session"
		: sdkSessionId
			? "resuming specific session"
			: "new session"
	console.log("[executeClaudeAgent] Starting", sessionMode)

	// Ensure SDK CLI inherits custom API configuration
	if (env.ANTHROPIC_BASE_URL) {
		process.env.ANTHROPIC_BASE_URL = env.ANTHROPIC_BASE_URL
		console.log("[executeClaudeAgent] Using custom base URL:", env.ANTHROPIC_BASE_URL)
	}

	try {
		// Create prompt stream with just the current message
		const userMessage: AgentMessage = {
			role: "user",
			content: message,
		}
		const prompt = createPromptStream([userMessage])
		const toolsServer = createSupermemoryTools(client, orgId, context)
		const toolNames = Array.isArray(allowedTools) && allowedTools.length > 0 ? allowedTools : undefined

		// Explicitly resolve the CLI path to avoid spawning issues in different runtimes
		const pathToClaudeCodeExecutable = await resolveClaudeCodeCliPath()
		console.log("[executeClaudeAgent] Using CLI at:", pathToClaudeCodeExecutable)

		// Determine if this is a new session (no continue, no resume)
		const isNewSession = !continueSession && !sdkSessionId

		// Debug: Check if CLAUDE.md exists
		const workingDir = resolve(process.cwd())
		const claudeMdPath = resolve(workingDir, ".claude", "CLAUDE.md")
		console.log("[executeClaudeAgent] Working directory:", workingDir)
		console.log("[executeClaudeAgent] Looking for CLAUDE.md at:", claudeMdPath)
		try {
			await access(claudeMdPath)
			console.log("[executeClaudeAgent] ✓ CLAUDE.md found")
		} catch {
			console.warn("[executeClaudeAgent] ✗ CLAUDE.md NOT found - will use inline fallback")
		}

		const queryOptions: Record<string, unknown> = {
			model: model ?? env.CHAT_MODEL,
			mcpServers: {
				"supermemory-tools": toolsServer,
			},
			permissionMode: "bypassPermissions",
			includePartialMessages: Boolean(callbacks.onEvent),
			allowDangerouslySkipPermissions: true,
			pathToClaudeCodeExecutable,

			// Enable loading CLAUDE.md from .claude/ directory
			settingSources: ["project"],

			// Set working directory to API root so SDK finds .claude/CLAUDE.md
			cwd: resolve(process.cwd()),

			stderr: (data: string) => {
				const output = data.trim()
				if (output.length > 0) {
					console.error("[Claude CLI]", output)
				}
			},
		}

		// DO NOT send inline systemPrompt when settingSources is enabled
		// The SDK will read from .claude/CLAUDE.md automatically
		// If we pass systemPrompt here, it will override the file!
		if (isNewSession) {
			console.log("[executeClaudeAgent] New session - SDK will load system prompt from .claude/CLAUDE.md")
		} else {
			console.log("[executeClaudeAgent] Existing session - reusing stored system prompt from SDK")
		}

		// Session management: continue (most recent) vs resume (specific session)
		if (continueSession) {
			// Continue most recent session automatically (for sequential chat)
			queryOptions.continue = true
			console.log("[executeClaudeAgent] Using continue mode (most recent session)")
		} else if (sdkSessionId) {
			// Resume specific session (for returning to old conversation)
			queryOptions.resume = sdkSessionId
			console.log("[executeClaudeAgent] Resuming specific session:", sdkSessionId)
		}
		// else: new session (no continue, no resume)
		if (toolNames) {
			queryOptions.allowedTools = toolNames
		}
		if (typeof maxTurns === "number") {
			queryOptions.maxTurns = maxTurns
		}

		console.log("[executeClaudeAgent] Query options:", {
			model: queryOptions.model,
			sessionMode: queryOptions.continue
				? "continue (most recent)"
				: queryOptions.resume
					? `resume (${queryOptions.resume})`
					: "new session",
			maxTurns: queryOptions.maxTurns,
			hasTools: !!queryOptions.mcpServers,
			message: message.substring(0, 50),
		})

		const agentIterator = query({
			prompt,
			options: queryOptions,
		})

		const onEvent = callbacks.onEvent
		const events: unknown[] = []
		let eventCount = 0
		let capturedSessionId: string | null = sdkSessionId || null

		for await (const event of agentIterator) {
			eventCount++
			if (event && typeof event === 'object' && 'type' in event) {
				console.log(`[executeClaudeAgent] Event ${eventCount}:`, (event as any).type)

				// Capture SDK session ID from events
				if ('session_id' in event && typeof (event as any).session_id === 'string') {
					capturedSessionId = (event as any).session_id
					if (!sdkSessionId) {
						console.log("[executeClaudeAgent] Captured new SDK session ID:", capturedSessionId)
					}
				}
			}
			events.push(event)
			if (onEvent) {
				await onEvent(event)
			}
		}
		console.log("[executeClaudeAgent] Completed with", events.length, "events")

		const { text, parts } = buildAssistantResponse(events)
		return {
			events,
			text,
			parts,
			sdkSessionId: capturedSessionId
		}
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
						const segments = collectTextFromContent(value.content)
						const raw = segments.join("")
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
