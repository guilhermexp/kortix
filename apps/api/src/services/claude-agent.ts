import { access } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { query } from "@anthropic-ai/claude-agent-sdk"
import Anthropic from "@anthropic-ai/sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
	getDefaultProvider,
	getProviderConfig,
	type ProviderId,
} from "../config/providers"
import { env } from "../env"
import { createKortixTools } from "./claude-agent-tools"

// Content block types for Claude messages
export type TextBlock = { type: "text"; text: string }
export type ToolUseBlock = {
	type: "tool_use"
	id: string
	name: string
	input: unknown
}
export type ToolResultBlock = {
	type: "tool_result"
	tool_use_id: string
	content: unknown
	is_error?: boolean
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock

export type AgentMessage = {
	role: "user" | "assistant"
	content: string | ContentBlock[] // Support both simple text and structured content blocks
}

export type AgentContextOptions = {
	containerTags?: string[]
	scopedDocumentIds?: string[]
}

export type ClaudeAgentOptions = {
	message: string // Single user message for this turn
	sdkSessionId?: string // SDK session ID to resume (from SDK, not our DB)
	resume?: boolean // If true with sdkSessionId, use --resume flag to resume old session
	continueSession?: boolean // If true, use 'continue' to resume most recent session automatically
	client: SupabaseClient
	orgId: string
	systemPrompt?: string
	model?: string
	provider?: ProviderId // AI provider to use (glm or minimax)
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
				.map((b) =>
					b.type === "text" ? b.text.substring(0, 30) : `[${b.type}]`,
				)
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
	})()
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

function _extractAssistantText(events: unknown[]): string {
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
		resume,
		continueSession,
		client,
		orgId,
		systemPrompt,
		model,
		provider,
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
		: sdkSessionId && resume
			? "resuming old session with --resume flag"
			: sdkSessionId
				? "resuming specific session"
				: "new session"

	// Get provider configuration
	const providerId = provider || getDefaultProvider()
	const providerConfig = getProviderConfig(providerId)

	console.log("[executeClaudeAgent] Starting", sessionMode)
	console.log(
		"[executeClaudeAgent] Provider:",
		providerConfig.name,
		`(${providerId})`,
	)

	// Validate baseURL against whitelist to prevent credential leakage
	const ALLOWED_BASE_URLS = [
		"https://api.anthropic.com",
		"https://api.z.ai/api/anthropic",
		"https://api.minimax.io/anthropic",
		"https://api.kimi.com/coding/",
	]

	if (!ALLOWED_BASE_URLS.includes(providerConfig.baseURL)) {
		throw new Error(`Invalid provider base URL: ${providerConfig.baseURL}`)
	}

	// Apply provider-specific configuration to environment
	// Note: This modifies global state. In production, consider using a per-request
	// Anthropic client instance instead of environment variables.
	process.env.ANTHROPIC_API_KEY = providerConfig.apiKey
	process.env.ANTHROPIC_BASE_URL = providerConfig.baseURL

	// Use provider's default model if no specific model provided
	const resolvedModel = model || providerConfig.models.balanced

	console.log("[executeClaudeAgent] Using base URL:", providerConfig.baseURL)
	console.log("[executeClaudeAgent] Using model:", resolvedModel)

	try {
		// Create prompt stream with just the current message
		const userMessage: AgentMessage = {
			role: "user",
			content: message,
		}
		const prompt = createPromptStream([userMessage])
		const toolsServer = createKortixTools(client, orgId, context)
		const toolNames =
			Array.isArray(allowedTools) && allowedTools.length > 0
				? allowedTools
				: undefined

		// Explicitly resolve the CLI path to avoid spawning issues in different runtimes
		const pathToClaudeCodeExecutable = await resolveClaudeCodeCliPath()
		console.log(
			"[executeClaudeAgent] Using CLI at:",
			pathToClaudeCodeExecutable,
		)

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
			console.warn(
				"[executeClaudeAgent] ✗ CLAUDE.md NOT found - will use inline fallback",
			)
		}

		// Configure MCP servers
		// Note: Sequential thinking server is now DISABLED by default as it requires
		// an external binary that may not be installed, causing "Stream closed" errors.
		// To enable: set SEQ_MCP_ENABLED=true and SEQ_MCP_COMMAND to the binary path
		const mcpServers: Record<string, unknown> = {
			"kortix-tools": toolsServer,
		}

		// Only add deepwiki if we want external research capabilities
		// Disabled by default to reduce potential connection issues
		if (env.DEEPWIKI_ENABLED === "true") {
			mcpServers.deepwiki = {
				type: "http",
				url: "https://mcp.deepwiki.com/mcp",
			}
			console.log("[executeClaudeAgent] Deepwiki MCP server enabled")
		}

		// Only add sequential-thinking if explicitly enabled and configured
		if (env.SEQ_MCP_ENABLED === "true" && env.SEQ_MCP_COMMAND) {
			let seqArgs: string[] = []
			try {
				seqArgs = env.SEQ_MCP_ARGS ? JSON.parse(env.SEQ_MCP_ARGS) : []
				if (!Array.isArray(seqArgs)) seqArgs = []
			} catch {
				console.warn("[executeClaudeAgent] Invalid SEQ_MCP_ARGS JSON; ignoring")
				seqArgs = []
			}

			mcpServers["sequential-thinking"] = {
				command: env.SEQ_MCP_COMMAND,
				args: seqArgs,
			}
			console.log("[executeClaudeAgent] Sequential thinking MCP server enabled")
		}

		console.log(
			"[executeClaudeAgent] Active MCP servers:",
			Object.keys(mcpServers).join(", "),
		)

		const queryOptions: Record<string, unknown> = {
			model: resolvedModel,
			mcpServers,
			disallowedTools: [
				"Bash",
				"bash",
				"Grep",
				"grep",
				"KillShell",
				"killshell",
				"Agent",
				"agent",
				"BashOutput",
				"bashoutput",
				"ExitPlanMode",
				"exitplanmode",
			],
			permissionMode: "bypassPermissions",
			includePartialMessages: Boolean(callbacks.onEvent),
			allowDangerouslySkipPermissions: true,
			pathToClaudeCodeExecutable,

			// Enable loading CLAUDE.md from .claude/ directory
			settingSources: ["project"],

			// Set working directory to API root so SDK finds .claude/CLAUDE.md
			cwd: workingDir,

			stderr: (data: string) => {
				const output = data.trim()
				if (output.length > 0) {
					console.error("[Claude CLI]", output)
				}
			},
		}

		// Handle system prompt based on whether it was explicitly provided
		// When systemPrompt is provided (e.g., canvas mode), always use it (even on resume)
		// Otherwise, let SDK load from .claude/CLAUDE.md on new sessions
		if (systemPrompt) {
			queryOptions.systemPrompt = systemPrompt
			// Don't use settingSources when we have a custom prompt
			delete queryOptions.settingSources
			console.log(
				"[executeClaudeAgent] Using custom system prompt (canvas or special mode) - length:",
				systemPrompt.length,
				"chars",
			)
		} else if (isNewSession) {
			console.log(
				"[executeClaudeAgent] New session - SDK will load system prompt from .claude/CLAUDE.md",
			)
		} else {
			console.log(
				"[executeClaudeAgent] Existing session - reusing stored system prompt from SDK",
			)
		}

		// Suppress verbose CLI output by not passing --verbose flag when in production
		// This prevents the system prompt from being logged
		if (process.env.NODE_ENV === "production") {
			delete (queryOptions as any).verbose
		}

		// Session management: continue (most recent) vs resume (specific session)
		if (continueSession) {
			// Continue most recent session automatically (for sequential chat)
			queryOptions.continue = true
			console.log(
				"[executeClaudeAgent] Using continue mode (most recent session)",
			)
		} else if (sdkSessionId && resume) {
			// Resume old session with --resume flag (for returning to conversations after days)
			queryOptions.resume = sdkSessionId
			console.log(
				"[executeClaudeAgent] Resuming old session with --resume flag:",
				sdkSessionId,
			)
		} else if (sdkSessionId) {
			// Resume specific session (backward compatibility - without explicit resume flag)
			queryOptions.resume = sdkSessionId
			console.log(
				"[executeClaudeAgent] Resuming specific session (legacy):",
				sdkSessionId,
			)
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
		const eventTypeCounts = new Map<string, number>()
		let capturedSessionId: string | null = sdkSessionId || null
		let sessionIdLogged = false // Track if we already logged the session ID

		for await (const event of agentIterator) {
			if (event && typeof event === "object" && "type" in event) {
				const eventType = (event as any).type as string
				eventTypeCounts.set(
					eventType,
					(eventTypeCounts.get(eventType) || 0) + 1,
				)

				// Capture SDK session ID from events (log only once)
				if (
					"session_id" in event &&
					typeof (event as any).session_id === "string"
				) {
					const newSessionId = (event as any).session_id
					if (!capturedSessionId || capturedSessionId !== newSessionId) {
						capturedSessionId = newSessionId
						if (!sessionIdLogged) {
							console.log(
								"[executeClaudeAgent] Captured SDK session ID:",
								capturedSessionId,
							)
							sessionIdLogged = true
						}
					}
				}

				// Log tool usage for visibility
				if (eventType === "assistant") {
					const message = (event as any).message
					if (message && Array.isArray(message.content)) {
						for (const block of message.content) {
							if (block && block.type === "tool_use") {
								console.log(
									`[executeClaudeAgent] 🔧 Tool called: ${block.name}`,
									block.input
										? `with input: ${JSON.stringify(block.input).substring(0, 100)}`
										: "",
								)
							}
						}
					}
				}

				// Log tool results
				if (eventType === "user") {
					const content = (event as any).content
					if (Array.isArray(content)) {
						for (const block of content) {
							if (block && block.type === "tool_result") {
								const resultPreview =
									typeof block.content === "string"
										? block.content.substring(0, 100)
										: JSON.stringify(block.content).substring(0, 100)
								console.log(
									`[executeClaudeAgent] ✅ Tool result: ${block.is_error ? "ERROR" : "SUCCESS"} - ${resultPreview}...`,
								)
							}
						}
					}
				}
			}
			events.push(event)
			if (onEvent) {
				await onEvent(event)
			}
		}

		// Log event summary instead of full list
		const eventSummary = Array.from(eventTypeCounts.entries())
			.map(([type, count]) => `${type}(${count})`)
			.join(", ")
		console.log(
			`[executeClaudeAgent] Completed with ${events.length} events: ${eventSummary}`,
		)

		const { text, parts } = buildAssistantResponse(events)

		// Log generated text preview for debugging
		if (text && text.length > 0) {
			const preview = text.length > 150 ? `${text.substring(0, 150)}...` : text
			console.log(
				`[executeClaudeAgent] Generated text (${text.length} chars): ${preview}`,
			)
		}

		return {
			events,
			text,
			parts,
			sdkSessionId: capturedSessionId,
		}
	} catch (error) {
		console.error("[executeClaudeAgent] Error:", error)
		// Fallback: use direct Anthropic Messages API when CLI process fails (common under Bun)
		try {
			if (providerId === "anthropic") {
				const client = new Anthropic({
					apiKey: providerConfig.apiKey,
					baseURL: providerConfig.baseURL,
				})
				const resp = await client.messages.create({
					model: resolvedModel,
					max_tokens: 512,
					messages: [{ role: "user", content: message }],
				})
				const txt = resp.content
					.map((c: any) => (c.type === "text" ? c.text : ""))
					.join("")
					.trim()
				return {
					events: [resp],
					text: txt,
					parts: txt ? [{ type: "text", text: txt }] : [],
					sdkSessionId: null,
				}
			}
		} catch (fallbackErr) {
			console.error("[executeClaudeAgent] Fallback failed:", fallbackErr)
		}
		throw error
	}
}

/**
 * Helper to check if value is a Record
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

/**
 * Unwrap stream_event wrappers to get actual events
 * This handles the SDK's streaming format where events are wrapped
 */
function unwrapStreamEvents(events: unknown[]): unknown[] {
	const result: unknown[] = []
	const queue: unknown[] = [...events]

	while (queue.length > 0) {
		const current = queue.shift()
		if (!isRecord(current)) continue

		const eventType = current.type
		if (
			eventType === "stream_event" &&
			"event" in current &&
			isRecord(current.event)
		) {
			// Unwrap the inner event
			queue.push(current.event)
			continue
		}

		result.push(current)
	}

	return result
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

	// First, unwrap stream_events to get actual content
	const unwrappedEvents = unwrapStreamEvents(events)

	// Debug: count event types (after unwrapping)
	const eventTypeCounts = new Map<string, number>()
	for (const event of unwrappedEvents) {
		if (event && typeof event === "object" && "type" in event) {
			const type = (event as any).type
			eventTypeCounts.set(type, (eventTypeCounts.get(type) || 0) + 1)
		}
	}
	console.log(
		"[buildAssistantResponse] Event types (after unwrap):",
		Object.fromEntries(eventTypeCounts),
	)

	// Track content blocks for tool results (from streaming format)
	const toolResultBuffers = new Map<
		number,
		{
			toolUseId: string
			toolName?: string
			buffer: string
			isError: boolean
		}
	>()

	// DEBUG: Log first 5 events to understand structure
	console.log("[buildAssistantResponse] First 5 unwrapped events:")
	for (let i = 0; i < Math.min(5, unwrappedEvents.length); i++) {
		const e = unwrappedEvents[i]
		if (e && typeof e === "object") {
			const ev = e as Record<string, unknown>
			console.log(
				`  Event ${i}: type=${ev.type}`,
				JSON.stringify(e).substring(0, 300),
			)
		}
	}

	// DEBUG: Look for content_block events
	const contentBlockStarts = unwrappedEvents.filter(
		(e) =>
			e && typeof e === "object" && (e as any).type === "content_block_start",
	)
	console.log(
		"[buildAssistantResponse] Found content_block_start events:",
		contentBlockStarts.length,
	)
	for (const cbs of contentBlockStarts) {
		const cb = (cbs as any).content_block
		console.log(
			"  content_block:",
			cb ? JSON.stringify(cb).substring(0, 200) : "undefined",
		)
	}

	// Process unwrapped events
	for (const event of unwrappedEvents) {
		if (!event || typeof event !== "object") continue
		const base = event as Record<string, unknown>

		// Handle content_block_start - track tool_use and tool_result blocks
		if (base.type === "content_block_start") {
			const index = typeof base.index === "number" ? base.index : undefined
			const contentBlock = base.content_block as
				| Record<string, unknown>
				| undefined

			if (contentBlock && index !== undefined) {
				const blockType = contentBlock.type

				// Track tool_use to get tool names
				if (blockType === "tool_use" || blockType === "mcp_tool_use") {
					const id =
						typeof contentBlock.id === "string" ? contentBlock.id : undefined
					const name =
						typeof contentBlock.name === "string"
							? contentBlock.name
							: (id ?? "tool")
					if (id) {
						toolCalls.set(id, { name })
					}
				}

				// Track tool_result blocks
				if (blockType === "tool_result" || blockType === "mcp_tool_result") {
					const toolUseId =
						typeof contentBlock.tool_use_id === "string"
							? contentBlock.tool_use_id
							: ""
					const isError = Boolean(contentBlock.is_error)
					const toolName = toolCalls.get(toolUseId)?.name
					const initialContent =
						"content" in contentBlock
							? collectTextFromContent(contentBlock.content).join("")
							: ""

					toolResultBuffers.set(index, {
						toolUseId,
						toolName,
						buffer: initialContent,
						isError,
					})

					console.log(
						"[buildAssistantResponse] Started tracking tool_result:",
						{
							index,
							toolUseId,
							toolName,
							isError,
							initialContentLength: initialContent.length,
						},
					)
				}
			}
		}

		// Handle content_block_delta - accumulate tool result content
		if (base.type === "content_block_delta") {
			const index = typeof base.index === "number" ? base.index : undefined
			const delta = base.delta as Record<string, unknown> | undefined

			if (index !== undefined && toolResultBuffers.has(index) && delta) {
				const tracker = toolResultBuffers.get(index)!
				const deltaText =
					typeof delta.text === "string"
						? delta.text
						: collectTextFromContent(delta).join("")
				if (deltaText.length > 0) {
					tracker.buffer += deltaText
				}
			}
		}

		// Handle content_block_stop - finalize tool result
		if (base.type === "content_block_stop") {
			const index = typeof base.index === "number" ? base.index : undefined

			if (index !== undefined && toolResultBuffers.has(index)) {
				const tracker = toolResultBuffers.get(index)!
				const toolName = tracker.toolName ?? tracker.toolUseId ?? "tool"
				const raw = tracker.buffer
				const isError = tracker.isError

				console.log("[buildAssistantResponse] Completed tool_result:", {
					index,
					toolName,
					isError,
					rawLength: raw.length,
					rawPreview: raw.substring(0, 200),
				})

				if (toolName === "mcp__kortix-tools__searchDatabase") {
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
					console.log(
						"[buildAssistantResponse] Added tool-generic part for:",
						toolName,
					)
				}

				toolResultBuffers.delete(index)
			}
		}

		// Handle assistant events (for text content and tool_use tracking)
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
					} else if (blockType === "tool_use" || blockType === "mcp_tool_use") {
						const id = typeof value.id === "string" ? value.id : undefined
						const name =
							typeof value.name === "string" ? value.name : (id ?? "tool")
						if (id) {
							toolCalls.set(id, { name })
							console.log("[buildAssistantResponse] Registered tool_use:", {
								id,
								name,
							})
						}
					}
				}
			}
		}

		// Handle user events (tool_result in message.content array)
		if (base.type === "user") {
			// The content is nested inside message.content, NOT directly in content
			const message = base.message as Record<string, unknown> | undefined
			const content = message?.content ?? base.content
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

						console.log(
							"[buildAssistantResponse] Tool result from user event:",
							{
								toolUseId,
								toolName,
								resolvedFromMap: !!info,
								toolCallsMapSize: toolCalls.size,
								toolCallsKeys: Array.from(toolCalls.keys()),
								isError,
								rawLength: raw.length,
								rawPreview: raw.substring(0, 100),
							},
						)

						if (toolName === "mcp__kortix-tools__searchDatabase") {
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
							console.log(
								"[buildAssistantResponse] Added tool-generic part for:",
								toolName,
							)
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
