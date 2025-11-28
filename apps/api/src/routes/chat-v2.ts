import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { env } from "../env"
import { ENHANCED_SYSTEM_PROMPT, CANVAS_SYSTEM_PROMPT } from "../prompts/chat"
import {
	executeClaudeAgent,
	type ToolResultBlock,
	type ToolUseBlock,
} from "../services/claude-agent"
import { ErrorHandler } from "../services/error-handler"
import {
	ConversationStorageUnavailableError,
	EventStorageService,
} from "../services/event-storage"
import { createScopedSupabase, supabaseAdmin } from "../supabase"

// New schema (SDK session-based)
const chatRequestSchema = z.object({
	message: z.string().min(1).max(50000), // Single user message (max 50KB)
	sdkSessionId: z.string().optional(), // SDK session ID to resume (from SDK, not our DB)
	resume: z.boolean().optional(), // If true with sdkSessionId, resume old session (for returning after days)
	continueSession: z.boolean().optional(), // If true, continue most recent session (for sequential chat)
	conversationId: z.string().uuid().optional(), // Our DB ID for display/analytics (optional)
	mode: z.enum(["simple", "agentic", "deep"]).default("simple"),
	metadata: z.record(z.string(), z.any()).optional(),
	model: z.string().optional(),
	provider: z.enum(["glm", "minimax", "anthropic", "kimi"]).optional(), // AI provider selection
	scopedDocumentIds: z.array(z.string()).optional(),
})

// Legacy schema (backward compatibility)
const legacyChatRequestSchema = z.object({
	messages: z.array(
		z.object({
			id: z.string().optional(),
			role: z.enum(["user", "assistant", "system"]),
			content: z.any().optional(),
			parts: z
				.array(z.object({ type: z.string(), text: z.string().optional() }))
				.optional(),
		}),
	),
	conversationId: z.string().uuid().optional(),
	useStoredHistory: z.boolean().default(false),
	mode: z.enum(["simple", "agentic", "deep"]).default("simple"),
	metadata: z.record(z.string(), z.any()).optional(),
	model: z.string().optional(),
	provider: z.enum(["glm", "minimax", "anthropic", "kimi"]).optional(), // AI provider selection
	scopedDocumentIds: z.array(z.string()).optional(),
})

type CanvasContextPayload = {
	viewport?: {
		x: number
		y: number
		w: number
		h: number
	}
	shapesInViewport?: Array<{
		id: string
		type: string
		x: number
		y: number
		width: number
		height: number
		text?: string
		color?: string
		geoType?: string
	}>
	userSelections?: Array<{
		type: string
		shapeId?: string
		shape?: unknown
		bounds?: { x: number; y: number; w: number; h: number }
		point?: { x: number; y: number }
	}>
}

type MetadataPayload = {
	projectId?: string
	expandContext?: boolean
	forceRawDocs?: boolean
	preferredTone?: string
	mentionedDocIds?: string[]
	contextDocument?: {
		id: string
		title: string | null
		content: string | null
	}
	canvasContext?: CanvasContextPayload
}

function normalizeModel(
	requested: string | undefined,
	fallback: string,
): string {
	if (!requested) return fallback
	const trimmed = requested.trim()
	if (!trimmed) return fallback
	if (trimmed.startsWith("claude")) {
		return trimmed
	}
	return fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function flattenToolContent(content: unknown): string {
	if (typeof content === "string") {
		return content
	}
	if (Array.isArray(content)) {
		return content.map((item) => flattenToolContent(item)).join("")
	}
	if (isRecord(content)) {
		if (typeof content.text === "string") {
			return content.text
		}
		if ("content" in content) {
			return flattenToolContent((content as { content: unknown }).content)
		}
	}
	return ""
}

type ToolEventState =
	| "input-available"
	| "input-streaming"
	| "output-available"
	| "output-error"

type ContentBlockTracker =
	| { kind: "thinking" }
	| { kind: "tool_use"; toolUseId?: string; toolName: string }
	| {
			kind: "tool_result"
			toolUseId?: string
			toolName?: string
			isError: boolean
			buffer: string
	  }

const SEARCH_TOOL_NAME = "mcp__supermemory-tools__searchDatabase"

function unwrapStreamEvents(event: unknown): Array<Record<string, unknown>> {
	const queue: unknown[] = [event]
	const result: Array<Record<string, unknown>> = []

	while (queue.length > 0) {
		const current = queue.shift()
		if (!isRecord(current) || typeof current.type !== "string") {
			continue
		}
		if (
			current.type === "stream_event" &&
			"event" in current &&
			isRecord(current.event)
		) {
			queue.push(current.event)
			continue
		}
		result.push(current)
	}

	return result
}

function toSafeIndex(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value
	}
	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10)
		return Number.isFinite(parsed) ? parsed : null
	}
	return null
}

function extractTextFromDelta(delta: unknown): string {
	if (!isRecord(delta)) {
		return ""
	}
	if (typeof delta.text === "string") {
		return delta.text
	}
	if (Array.isArray(delta.content)) {
		return flattenToolContent(delta.content)
	}
	if ("content" in delta) {
		return flattenToolContent((delta as { content: unknown }).content)
	}
	return ""
}

function parseSearchToolOutput(raw: string): {
	count?: number
	results?: Array<{
		documentId?: string
		title?: string
		content?: string
		url?: string
		score?: number
	}>
} | null {
	try {
		const parsed = JSON.parse(raw)
		if (!isRecord(parsed)) {
			return null
		}
		const count = typeof parsed.count === "number" ? parsed.count : undefined
		const rawResults = Array.isArray(parsed.results) ? parsed.results : []
		const results = rawResults
			.map(
				(
					item,
				): {
					documentId?: string
					title?: string
					content?: string
					url?: string
					score?: number
				} | null => {
					if (!isRecord(item)) return null
					const documentId =
						typeof item.documentId === "string" ? item.documentId : undefined
					const title = typeof item.title === "string" ? item.title : undefined
					const content =
						typeof item.content === "string" ? item.content : undefined
					const url = typeof item.url === "string" ? item.url : undefined
					const score = typeof item.score === "number" ? item.score : undefined
					return { documentId, title, content, url, score }
				},
			)
			.filter((entry): entry is NonNullable<typeof entry> => entry !== null)

		return { count, results }
	} catch {
		return null
	}
}

function extractTextDeltaFromEvent(event: unknown): string | null {
	if (!isRecord(event)) {
		return null
	}
	const { type } = event
	if (type === "stream_event" && "event" in event) {
		return extractTextDeltaFromEvent((event as { event: unknown }).event)
	}
	if (type === "content_block_delta" && isRecord(event.delta)) {
		const delta = event.delta
		if (delta.type === "text_delta" && typeof delta.text === "string") {
			return delta.text
		}
	}
	if (type === "message_delta" && isRecord(event.delta)) {
		const delta = event.delta
		if (delta.type === "text_delta" && typeof delta.text === "string") {
			return delta.text
		}
	}
	return null
}

let conversationStorageWarningLogged = false

function logConversationStorageWarningOnce() {
	if (!conversationStorageWarningLogged) {
		console.warn(
			"[Chat V2] Armazenamento de conversas indisponível. Execute a migration apps/api/migrations/0002_add_conversation_tables.sql para habilitar histórico.",
		)
		conversationStorageWarningLogged = true
	}
}

async function persistToolEvents({
	eventStorage,
	conversationId,
	events,
}: {
	eventStorage: EventStorageService
	conversationId: string
	events: unknown[]
}) {
	const toolUseMap = new Map<
		string,
		{ eventId: string; name: string; input: unknown }
	>()
	const storedToolResults = new Set<string>()

	for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
		const event = events[eventIndex]
		if (!isRecord(event) || typeof event.type !== "string") {
			continue
		}

		if (event.type === "assistant") {
			const message = isRecord(event.message) ? event.message : null
			const contentBlocks = Array.isArray(message?.content)
				? (message?.content as unknown[])
				: []

			for (const block of contentBlocks) {
				if (!isRecord(block) || block.type !== "tool_use") {
					continue
				}

				const toolBlock = block as ToolUseBlock

				try {
					const stored = await eventStorage.storeEvent({
						conversationId,
						type: "tool_use",
						role: "assistant",
						content: toolBlock,
						metadata: { toolName: toolBlock.name },
					})

					const entry = {
						eventId: stored.id,
						name: toolBlock.name,
						input: toolBlock.input,
					}

					toolUseMap.set(stored.id, entry)
					if (toolBlock.id) {
						toolUseMap.set(toolBlock.id, entry)
					}
				} catch (error) {
					if (error instanceof ConversationStorageUnavailableError) {
						logConversationStorageWarningOnce()
						return
					}
					console.error("[Chat V2] Failed to store tool_use event:", error)
				}
			}
		}

		if (event.type === "user") {
			const contentBlocks = Array.isArray(event.content)
				? (event.content as unknown[])
				: []

			for (
				let blockIndex = 0;
				blockIndex < contentBlocks.length;
				blockIndex++
			) {
				const block = contentBlocks[blockIndex]
				if (!isRecord(block) || block.type !== "tool_result") {
					continue
				}

				const resultBlock = block as ToolResultBlock
				const toolUseId = resultBlock.tool_use_id
				const dedupeKey = toolUseId ?? `event-${eventIndex}-block-${blockIndex}`

				if (storedToolResults.has(dedupeKey)) {
					continue
				}
				storedToolResults.add(dedupeKey)

				try {
					const stored = await eventStorage.storeEvent({
						conversationId,
						type: "tool_result",
						role: "assistant",
						content: resultBlock,
						metadata: toolUseId ? { toolUseId } : undefined,
					})

					const meta = toolUseMap.get(toolUseId) ?? toolUseMap.get(stored.id)
					const toolName = meta?.name ?? "tool"
					const errorMessage = resultBlock.is_error
						? flattenToolContent(resultBlock.content)
						: undefined

					await eventStorage.storeToolResult({
						eventId: stored.id,
						toolName,
						toolUseId: toolUseId ?? stored.id,
						input: meta?.input ?? null,
						output: resultBlock.content,
						isError: Boolean(resultBlock.is_error),
						errorMessage:
							errorMessage && errorMessage.length > 0
								? errorMessage
								: undefined,
					})
				} catch (error) {
					if (error instanceof ConversationStorageUnavailableError) {
						logConversationStorageWarningOnce()
						return
					}
					console.error("[Chat V2] Failed to store tool_result event:", error)
				}
			}
		}
	}
}

/**
 * Helper to extract text from legacy message content
 */
function extractTextFromLegacyContent(content: unknown): string {
	if (typeof content === "string") {
		return content
	}
	if (Array.isArray(content)) {
		for (const item of content) {
			if (
				item &&
				typeof item === "object" &&
				"text" in item &&
				typeof item.text === "string"
			) {
				return item.text
			}
		}
	}
	return ""
}

/**
 * Convert legacy request format to new format
 */
function convertLegacyRequest(
	legacy: z.infer<typeof legacyChatRequestSchema>,
): z.infer<typeof chatRequestSchema> {
	// Extract last user message from messages array
	const lastUserMessage = [...legacy.messages]
		.reverse()
		.find((msg) => msg.role === "user")

	if (!lastUserMessage) {
		throw new Error("No user message found in messages array")
	}

	const messageText = extractTextFromLegacyContent(lastUserMessage.content)

	if (!messageText) {
		throw new Error("Empty message content")
	}

	console.log("[Chat V2] Converting legacy request format to new format")
	console.log("[Chat V2] Extracted message:", messageText.substring(0, 50))

	return {
		message: messageText,
		sdkSessionId: undefined, // Legacy requests don't have SDK session ID
		conversationId: legacy.conversationId,
		mode: legacy.mode,
		metadata: legacy.metadata,
		model: legacy.model,
		provider: legacy.provider,
		scopedDocumentIds: legacy.scopedDocumentIds,
	}
}

export async function handleChatV2({
	orgId,
	userId,
	client,
	body,
}: {
	orgId: string
	userId?: string
	client: SupabaseClient
	body: unknown
}) {
	let payload: z.infer<typeof chatRequestSchema>

	try {
		// Try new schema first
		payload = chatRequestSchema.parse(body ?? {})
		console.log("========================================")
		console.log("📥 [Backend] Received chat request")
		console.log("[Chat V2] Using new SDK session-based format")
		console.log("[Chat V2] Payload:", {
			conversationId: payload.conversationId,
			sdkSessionId: payload.sdkSessionId,
			resume: payload.resume,
			continueSession: payload.continueSession,
			hasMessage: !!payload.message,
			messageLength: payload.message?.length,
		})
		console.log("========================================")
	} catch (newSchemaError) {
		// Try legacy schema for backward compatibility
		try {
			const legacyPayload = legacyChatRequestSchema.parse(body ?? {})
			payload = convertLegacyRequest(legacyPayload)
			console.log("[Chat V2] Using legacy format (backward compatibility)")
		} catch (legacySchemaError) {
			console.error("Chat V2 validation failed for both new and legacy schemas")
			console.error("New schema error:", newSchemaError)
			console.error("Legacy schema error:", legacySchemaError)

			if (newSchemaError instanceof z.ZodError) {
				return ErrorHandler.validation("Invalid chat payload", {
					errors: newSchemaError.errors,
				}).toResponse()
			}
			return new Response("Invalid chat payload", { status: 400 })
		}
	}

	// Use admin client for conversation operations (RLS already validated at API level)
	// Authentication/authorization already done through session, safe to use admin
	const eventStorage = new EventStorageService(supabaseAdmin)
	let conversationId = payload.conversationId

	// Create new conversation if conversationId not provided
	if (!conversationId) {
		try {
			const conversation = await eventStorage.createConversation(
				orgId,
				userId,
				undefined, // title will be auto-generated or set later
				{ mode: payload.mode },
				payload.sdkSessionId, // Pass SDK session ID if resuming
			)
			conversationId = conversation.id
			console.log(`[Chat V2] Created new conversation: ${conversationId}`)
		} catch (error) {
			if (error instanceof ConversationStorageUnavailableError) {
				logConversationStorageWarningOnce()
			} else {
				console.error("[Chat V2] Failed to create conversation:", error)
			}
			// Continue without conversation tracking
		}
	}

	const metadata = (payload.metadata ?? {}) as MetadataPayload
	const projectId =
		typeof metadata.projectId === "string" &&
		metadata.projectId.trim().length > 0
			? metadata.projectId.trim()
			: undefined
	const expandContext = Boolean(metadata.expandContext)
	const preferredTone =
		typeof metadata.preferredTone === "string"
			? metadata.preferredTone.trim()
			: undefined
	const mentionedDocIds = Array.isArray(metadata.mentionedDocIds)
		? metadata.mentionedDocIds.filter(
				(id): id is string => typeof id === "string" && id.trim().length > 0,
			)
		: []
	const contextDocument = metadata.contextDocument
	const canvasContext = metadata.canvasContext as CanvasContextPayload | undefined

	const scopedDocumentIds = Array.isArray(payload.scopedDocumentIds)
		? payload.scopedDocumentIds.filter(
				(id) => typeof id === "string" && id.length > 0,
			)
		: undefined
	const effectiveScopedIds =
		scopedDocumentIds && scopedDocumentIds.length > 0
			? scopedDocumentIds
			: mentionedDocIds.length > 0
				? mentionedDocIds
				: undefined

	// Build system prompt (without mode instructions)
	const instructions: string[] = []
	if (projectId) {
		instructions.push(
			`Active project tag: ${projectId}. Limit searches to this project unless the user explicitly requests otherwise.`,
		)
	}
	if (expandContext) {
		instructions.push(
			"Expand the context by summarizing key references and suggesting follow-up actions when relevant.",
		)
	}
	if (preferredTone) {
		instructions.push(`Adopt a ${preferredTone} tone in the reply.`)
	}
	if (contextDocument && contextDocument.content) {
		instructions.push(
			"The user is currently viewing a specific document. You have DIRECT ACCESS to the full content of this document. DO NOT use the searchDatabase tool for questions about this document - answer directly from the content provided.",
		)
		instructions.push(`Document ID: ${contextDocument.id}`)
		if (contextDocument.title) {
			instructions.push(`Document Title: ${contextDocument.title}`)
		}
	} else if (mentionedDocIds.length > 0) {
		instructions.push(
			`The user explicitly mentioned the following document IDs: ${mentionedDocIds.join(
				", ",
			)}. Prioritize retrieving and citing these documents when formulating the response.`,
		)
	}

	// Add canvas context instructions when user is viewing the canvas
	if (canvasContext) {
		instructions.push(
			"\n## CANVAS VIEW ACTIVE\nThe user is currently viewing the Infinity Canvas (visual organization view). You have access to the canvas manipulation tool (canvasApplyChanges) to create and modify visual elements.",
		)

		if (canvasContext.viewport) {
			const vp = canvasContext.viewport
			instructions.push(
				`Current viewport bounds: x=${vp.x}, y=${vp.y}, width=${vp.w}, height=${vp.h}. Place new shapes within these bounds so the user can see them immediately.`,
			)
		}

		if (canvasContext.shapesInViewport && canvasContext.shapesInViewport.length > 0) {
			const shapesSummary = canvasContext.shapesInViewport
				.slice(0, 10) // Limit to first 10 shapes to avoid token overflow
				.map((s) => {
					// Better descriptions for different shape types
					if (s.type === "draw") {
						return `freehand-drawing at (${s.x},${s.y}) size ${s.width}x${s.height}`
					}

					// Build description with available properties
					const parts: string[] = []

					// Shape type with geo type if available
					if (s.type === "geo" && s.geoType) {
						parts.push(s.geoType) // e.g., "rectangle", "ellipse"
					} else {
						parts.push(s.type)
					}

					// Color if available
					if (s.color) {
						parts.push(`color:${s.color}`)
					}

					// Text content if available
					if (s.text) {
						const truncatedText = s.text.length > 30
							? `"${s.text.substring(0, 30)}..."`
							: `"${s.text}"`
						parts.push(`text:${truncatedText}`)
					}

					return `${parts.join(", ")} at (${s.x},${s.y}) ${s.width}x${s.height}`
				})
				.join("; ")
			instructions.push(
				`Shapes currently visible (${canvasContext.shapesInViewport.length} total): ${shapesSummary}`,
			)
			instructions.push(
				"IMPORTANT: You can ONLY see the shapes listed above. Do NOT describe or mention any shapes that are not in this list. Never invent colors, text, or shapes that don't exist in the list above.",
			)
		} else {
			instructions.push(
				"The canvas is currently empty (no shapes exist). This is a great opportunity to create new shapes to help the user visualize information.",
			)
			instructions.push(
				"IMPORTANT: The canvas is empty. Do NOT describe any shapes or content that don't exist. Only describe what you will CREATE when you use the canvasApplyChanges tool.",
			)
		}

		if (canvasContext.userSelections && canvasContext.userSelections.length > 0) {
			const selectionsSummary = canvasContext.userSelections
				.map((sel) => {
					if (sel.type === "selectedShape" && sel.shapeId) {
						return `selected shape: ${sel.shapeId}`
					}
					if (sel.type === "selectedArea" && sel.bounds) {
						const b = sel.bounds
						return `selected area: (${b.x},${b.y}) ${b.w}x${b.h}`
					}
					if (sel.type === "selectedPoint" && sel.point) {
						return `marked point: (${sel.point.x},${sel.point.y})`
					}
					return "unknown selection"
				})
				.join("; ")
			instructions.push(`User selections: ${selectionsSummary}`)
		}

		instructions.push(
			"When the user asks about visual organization, diagrams, or charts, proactively use the canvasApplyChanges tool to create visual representations on the canvas.",
		)

		console.log("[Chat V2] Canvas context active, added canvas instructions to prompt")
	}

	// Use canvas-specific prompt when canvas context is present
	const basePrompt = canvasContext ? CANVAS_SYSTEM_PROMPT : ENHANCED_SYSTEM_PROMPT
	const systemPrompt =
		instructions.length > 0
			? `${basePrompt}\n\n${instructions.join("\n")}`
			: basePrompt

	if (canvasContext) {
		console.log("[Chat V2] Using CANVAS_SYSTEM_PROMPT (canvas view active)")
	}

	// If a provider is specified, let executeClaudeAgent decide the model from provider config
	// Otherwise use the model from payload or fallback to env.CHAT_MODEL
	const resolvedModel = payload.provider
		? undefined // Let executeClaudeAgent use provider's default model
		: normalizeModel(payload.model, env.CHAT_MODEL)

	const toolContext = {
		containerTags:
			projectId && projectId !== "__ALL__" ? [projectId] : undefined,
		scopedDocumentIds: effectiveScopedIds,
	}

	let messageForAgent = payload.message

	// If user is viewing a specific document, inject its full content
	if (contextDocument && contextDocument.content) {
		const lines: string[] = []
		if (contextDocument.title) {
			lines.push(`Título: ${contextDocument.title}`)
		}
		lines.push(`Conteúdo completo:\n${contextDocument.content}`)

		const contextBlock = lines.join("\n")
		messageForAgent = `${payload.message}\n\n[Documento sendo visualizado - Responda diretamente deste conteúdo, sem fazer buscas]\n${contextBlock}`

		console.log(
			`[Chat V2] Using context document ${contextDocument.id} - ${contextDocument.content.length} chars`,
		)
	} else if (mentionedDocIds.length > 0) {
		// Fallback to mentioned documents query if not viewing a specific document
		try {
			const { data: mentionedDocs } = await client
				.from("documents")
				.select("id, title, summary, content")
				.in("id", mentionedDocIds)
				.limit(mentionedDocIds.length)

			if (Array.isArray(mentionedDocs) && mentionedDocs.length > 0) {
				const mentionSummaries = mentionedDocs
					.map((doc) => {
						if (!doc || typeof doc !== "object") return null
						const record = doc as {
							id?: string
							title?: string | null
							summary?: string | null
							content?: string | null
						}
						const lines: string[] = []
						if (record.id) lines.push(`ID: ${record.id}`)
						if (record.title) lines.push(`Título: ${record.title}`)
						if (record.summary) lines.push(`Resumo: ${record.summary}`)
						if (record.content) {
							const snippet = record.content.slice(0, 1200)
							lines.push(`Trecho: ${snippet}`)
						}
						if (lines.length === 0) return null
						return lines.join("\n")
					})
					.filter((value): value is string => Boolean(value))

				if (mentionSummaries.length > 0) {
					const contextBlock = mentionSummaries
						.map((item, index) => `Documento ${index + 1}:\n${item}`)
						.join("\n\n---\n\n")
					messageForAgent = `${payload.message}\n\n[Documentos mencionados]\n${contextBlock}`
				}
			}
		} catch (error) {
			console.error(
				"[Chat V2] Failed to append mentioned documents context:",
				error,
			)
		}
	}

	// Fixed maxTurns - Claude Agent SDK decides when to use tools based on system prompt
	const maxTurns = 10

	try {
		// Store user message if conversationId exists
		if (conversationId) {
			try {
				await eventStorage.storeEvent({
					conversationId,
					type: "user",
					role: "user",
					content: { text: payload.message },
				})
			} catch (error) {
				if (error instanceof ConversationStorageUnavailableError) {
					logConversationStorageWarningOnce()
				} else {
					console.error("[Chat V2] Failed to store user message:", error)
				}
				// Continue without storing
			}
		}

		const encoder = new TextEncoder()

		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				const enqueue = (payload: Record<string, unknown>) => {
					try {
						controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`))
					} catch (error) {
						console.error("[Chat V2] Failed to enqueue stream chunk:", error)
					}
				}

				const contentTrackers = new Map<number, ContentBlockTracker>()
				const toolNameById = new Map<string, string>()
				let thinkingDepth = 0

				const emitThinking = (active: boolean) => {
					enqueue({ type: "thinking", active })
				}

				const processProgressEvent = (rawEvent: unknown) => {
					for (const event of unwrapStreamEvents(rawEvent)) {
						const eventType =
							event && typeof event.type === "string" ? event.type : null
						if (!eventType) continue

						if (eventType === "content_block_start") {
							const index = toSafeIndex(event.index)
							if (index === null) continue

							const block =
								"content_block" in event && isRecord(event.content_block)
									? (event.content_block as Record<string, unknown>)
									: null
							const blockType =
								block && typeof block.type === "string" ? block.type : null
							if (!blockType) continue

							if (blockType === "thinking") {
								contentTrackers.set(index, { kind: "thinking" })
								if (thinkingDepth === 0) {
									emitThinking(true)
								}
								thinkingDepth += 1
								continue
							}

							// Normalize block type names across providers
							const isToolUse =
								blockType === "mcp_tool_use" || blockType === "tool_use"
							if (isToolUse && block) {
								const toolUseId =
									typeof block.id === "string" ? block.id : undefined
								const toolName =
									typeof block.name === "string" ? block.name : "tool"
								contentTrackers.set(index, {
									kind: "tool_use",
									toolUseId,
									toolName,
								})
								if (toolUseId) {
									toolNameById.set(toolUseId, toolName)
								}
								enqueue({
									type: "tool_event",
									toolUseId,
									toolName,
									state: "input-streaming",
								})
								continue
							}

							const isToolResult =
								blockType === "mcp_tool_result" || blockType === "tool_result"
							if (isToolResult && block) {
								const toolUseId =
									typeof block.tool_use_id === "string"
										? block.tool_use_id
										: undefined
								const isError = Boolean(block.is_error)
								const toolName =
									(toolUseId ? toolNameById.get(toolUseId) : undefined) ??
									undefined
								const initialBuffer =
									"content" in block
										? flattenToolContent(
												(block as { content: unknown }).content,
											)
										: ""
								contentTrackers.set(index, {
									kind: "tool_result",
									toolUseId,
									toolName,
									isError,
									buffer: initialBuffer,
								})
								// Debug: log canvas tool result start
								if (toolName?.includes("canvasApplyChanges")) {
									console.log("[Chat V2] Canvas tool_result block started:", {
										toolName,
										toolUseId,
										initialBufferLength: initialBuffer.length,
										initialBufferPreview: initialBuffer.substring(0, 100),
									})
								}
							}

							continue
						}

						if (eventType === "content_block_delta") {
							const index = toSafeIndex(event.index)
							if (index === null) continue
							const tracker = contentTrackers.get(index)
							if (!tracker || tracker.kind !== "tool_result") continue
							const deltaText =
								"delta" in event ? extractTextFromDelta(event.delta) : ""
							if (deltaText.length > 0) {
								tracker.buffer += deltaText
								// Debug: log canvas tool delta
								if (tracker.toolName?.includes("canvasApplyChanges")) {
									console.log("[Chat V2] Canvas tool delta received:", {
										deltaLength: deltaText.length,
										totalBufferLength: tracker.buffer.length,
									})
								}
							}
							continue
						}

						if (eventType === "content_block_stop") {
							const index = toSafeIndex(event.index)
							if (index === null) continue
							const tracker = contentTrackers.get(index)
							if (!tracker) continue
							contentTrackers.delete(index)

							if (tracker.kind === "thinking") {
								if (thinkingDepth > 0) {
									thinkingDepth -= 1
								}
								if (thinkingDepth === 0) {
									emitThinking(false)
								}
								continue
							}

							if (tracker.kind === "tool_result") {
								const toolUseId = tracker.toolUseId
								const resolvedToolName =
									tracker.toolName ??
									(toolUseId ? toolNameById.get(toolUseId) : undefined) ??
									"tool"
								if (toolUseId) {
									toolNameById.delete(toolUseId)
								}

								const rawText = tracker.buffer
								const state: ToolEventState = tracker.isError
									? "output-error"
									: "output-available"

								const payload: Record<string, unknown> = {
									type: "tool_event",
									toolUseId,
									toolName: resolvedToolName,
									state,
								}

								if (tracker.isError) {
									payload.error = rawText.trim()
								} else {
									if (resolvedToolName === SEARCH_TOOL_NAME) {
										const parsed = parseSearchToolOutput(rawText)
										if (parsed) {
											payload.output = parsed
										}
										if (!parsed || rawText.trim().length > 0) {
											payload.outputText = rawText
										}
									} else if (rawText.trim().length > 0) {
										payload.outputText = rawText
									}
								}

								// Debug: log canvas tool_event being sent
								if (resolvedToolName.includes("canvasApplyChanges")) {
									console.log("[Chat V2] Canvas tool_event payload:", {
										toolName: resolvedToolName,
										state,
										hasOutputText: !!payload.outputText,
										outputTextLength: (payload.outputText as string)?.length || 0,
										outputTextPreview: (payload.outputText as string)?.substring(0, 200),
									})
								}
								enqueue(payload)
							}
						}
					}
				}

				if (conversationId) {
					enqueue({ type: "conversation", conversationId })
				}

				try {
					const {
						events,
						text,
						parts,
						sdkSessionId: returnedSessionId,
					} = await executeClaudeAgent(
						{
							message: messageForAgent,
							sdkSessionId: payload.sdkSessionId,
							resume: payload.resume, // Pass resume flag for old sessions
							continueSession: payload.continueSession,
							client,
							orgId,
							systemPrompt,
							model: resolvedModel,
							provider: payload.provider, // Pass provider selection
							context: toolContext,
							maxTurns,
						},
						{
							onEvent: async (event) => {
								try {
									processProgressEvent(event)
								} catch (error) {
									console.error(
										"[Chat V2] Failed to process progress event:",
										error,
									)
								}
								const delta = extractTextDeltaFromEvent(event)
								if (delta && delta.length > 0) {
									enqueue({ type: "assistant_delta", text: delta })
								}
							},
						},
					)

					if (conversationId) {
						try {
							await persistToolEvents({
								eventStorage: eventStorage,
								conversationId,
								events,
							})
						} catch (error) {
							if (error instanceof ConversationStorageUnavailableError) {
								logConversationStorageWarningOnce()
							} else {
								console.error(
									"[Chat V2] Failed to store tool interactions:",
									error,
								)
							}
						}
					}

					if (conversationId && text) {
						try {
							await eventStorage.storeEvent({
								conversationId,
								type: "assistant",
								role: "assistant",
								content: { text, parts },
							})
						} catch (error) {
							if (error instanceof ConversationStorageUnavailableError) {
								logConversationStorageWarningOnce()
							} else {
								console.error(
									"[Chat V2] Failed to store assistant response:",
									error,
								)
							}
						}
					}

					// Update SDK session ID if returned and conversation exists
					if (conversationId && returnedSessionId) {
						try {
							await eventStorage.updateSdkSessionId(
								conversationId,
								returnedSessionId,
							)
							console.log(
								`[Chat V2] Updated conversation ${conversationId} with SDK session ID`,
							)
						} catch (error) {
							console.error("[Chat V2] Failed to update SDK session ID:", error)
						}
					}

					console.log("========================================")
					console.log("📤 [Backend] Sending final response to frontend")
					console.log("[Chat V2] Returned SDK session ID:", returnedSessionId)
					console.log("[Chat V2] Conversation ID:", conversationId)

					// Debug: log parts being sent
					if (Array.isArray(parts) && parts.length > 0) {
						console.log("[Chat V2] Parts being sent:", parts.length)
						for (const part of parts) {
							if (part && typeof part === "object" && "type" in part) {
								const p = part as Record<string, unknown>
								if (p.type === "tool-generic") {
									console.log("[Chat V2] Tool-generic part:", {
										toolName: p.toolName,
										state: p.state,
										hasOutputText: typeof p.outputText === "string",
										outputTextLength: typeof p.outputText === "string" ? (p.outputText as string).length : 0,
									})
								}
							}
						}
					}
					console.log("========================================")

					enqueue({
						type: "final",
						message: { role: "assistant", content: text, parts },
						conversationId,
						sdkSessionId: returnedSessionId,
						events,
					})
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Internal chat failure"
					console.error("[Chat V2] Streaming error:", error)
					enqueue({
						type: "error",
						message,
					})
				} finally {
					controller.close()
				}
			},
		})

		return new Response(stream, {
			headers: {
				"Content-Type": "application/x-ndjson",
				"Cache-Control": "no-cache",
			},
		})
	} catch (error) {
		return ErrorHandler.handleError(error)
	}
}
