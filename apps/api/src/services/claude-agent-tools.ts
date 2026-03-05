import { createHash } from "node:crypto"
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { CanvasCreateViewInputSchema } from "@repo/validation/api"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { env } from "../env"
import { getCacheService } from "./cache"
import {
	applyCanvasCreateView,
	autoArrangeCanvasForAgent,
	CANVAS_READ_ME_TEXT,
	clearCanvasForAgent,
	createFlowchartCanvasForAgent,
	createMindmapCanvasForAgent,
	getCanvasPreviewForAgent,
	listCanvasCheckpointsForAgent,
	readCanvasSceneForAgent,
	resolveCanvasToolTarget,
	summarizeCanvasSceneForAgent,
} from "./canvas-agent-service"
import {
	createSandbox,
	destroySandbox,
	downloadFile,
	executeCommand,
	gitClone,
	listFiles,
	uploadFile,
} from "./daytona-sandbox"
import { NotebookLMClient } from "./notebooklm"
import {
	executeStructuredSearch,
	type SearchToolResult,
} from "./search-tool"

type ToolContext = {
	containerTags?: string[]
	scopedDocumentIds?: string[]
	canvasId?: string
	userId?: string
}

function safeString(value: unknown) {
	return typeof value === "string" ? value : undefined
}

function truncateText(value: string | undefined, maxChars: number): string | undefined {
	if (!value) return undefined
	if (value.length <= maxChars) return value
	return `${value.slice(0, maxChars)}...`
}

function formatSearchToolOutputCompact(
	payload: SearchToolResult,
	options?: {
		maxResults?: number
		maxChunksPerResult?: number
		maxSummaryChars?: number
		maxChunkChars?: number
		maxContentChars?: number
	},
) {
	const maxResults = options?.maxResults ?? 12
	const maxChunksPerResult = options?.maxChunksPerResult ?? 2
	const maxSummaryChars = options?.maxSummaryChars ?? 500
	const maxChunkChars = options?.maxChunkChars ?? 320
	const maxContentChars = options?.maxContentChars ?? 900

	const sliced = payload.results.slice(0, maxResults)
	const projectCount = new Map<string, number>()

	const results = sliced.map((item) => {
		const metadata =
			item.metadata && typeof item.metadata === "object" ? item.metadata : {}
		const containerTags = Array.isArray((metadata as Record<string, unknown>).containerTags)
			? ((metadata as Record<string, unknown>).containerTags as unknown[])
					.map((tag) => (typeof tag === "string" ? tag : null))
					.filter((tag): tag is string => Boolean(tag))
			: []

		for (const tag of containerTags) {
			projectCount.set(tag, (projectCount.get(tag) ?? 0) + 1)
		}

		return {
			documentId: item.documentId,
			title: item.title,
			score: item.score,
			url: item.url,
			projectTags: containerTags,
			summary: truncateText(item.summary, maxSummaryChars),
			contentSnippet: truncateText(item.content, maxContentChars),
			chunks: (item.chunks ?? []).slice(0, maxChunksPerResult).map((chunk) => ({
				score: chunk.score,
				content: truncateText(chunk.content, maxChunkChars),
			})),
		}
	})

	const projects = Array.from(projectCount.entries())
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count)

	return {
		query: payload.query,
		total: payload.total,
		returned: payload.returned,
		timing: payload.timing,
		projects,
		results,
	}
}

export function createKortixTools(
	client: SupabaseClient,
	orgId: string,
	context: ToolContext = {},
) {
	const baseContainerTags = Array.isArray(context.containerTags)
		? context.containerTags
		: undefined
	const baseScopedIds = Array.isArray(context.scopedDocumentIds)
		? context.scopedDocumentIds
		: undefined
	const contextCanvasId = safeString(context.canvasId)
	const contextUserId = safeString(context.userId)
	// Mutable: holds the auto-created canvasId for this session when no context canvas exists
	let autoCreatedCanvasId: string | null = null
	const canvasToolsEnabled = env.CANVAS_AGENT_TOOLS_ENABLED === "true"
	const sandboxEnabled =
		env.DAYTONA_SANDBOX_ENABLED === "true" &&
		!!env.DAYTONA_API_KEY &&
		!!env.DAYTONA_SERVER_URL
	const sandboxEnv = sandboxEnabled
		? {
				DAYTONA_API_KEY: env.DAYTONA_API_KEY!,
				DAYTONA_SERVER_URL: env.DAYTONA_SERVER_URL!,
				DAYTONA_TARGET: env.DAYTONA_TARGET,
			}
		: null

	// NotebookLM: lazily initialized when first tool is called
	let nlmClient: NotebookLMClient | null | undefined
	async function getNlmClient(): Promise<NotebookLMClient | null> {
		if (nlmClient !== undefined) return nlmClient
		try {
			nlmClient = await NotebookLMClient.fromConnection(client, orgId)
		} catch {
			nlmClient = null
		}
		return nlmClient
	}

	const cache = getCacheService()
	const CACHE_TTL = 3600 // 1 hour

	// Helper function to generate cache key
	function generateCacheKey(params: Record<string, unknown>): string {
		const normalized = JSON.stringify(params, Object.keys(params).sort())
		const hash = createHash("sha256").update(normalized).digest("hex")
		return `search:${orgId}:${hash}`
	}

	/**
	 * Resolve canvas ID for write tools: use context, or auto-create a new canvas.
	 * Returns the canvasId to use, or null if userId is missing.
	 */
	async function ensureCanvasForWrite(
		requestedCanvasId: string | undefined,
	): Promise<string | null> {
		// 1. Try explicit or context canvas
		const resolved = resolveCanvasToolTarget({
			requestedCanvasId,
			contextCanvasId: autoCreatedCanvasId ?? contextCanvasId,
		})
		if (resolved) return resolved

		// 2. Auto-create a new canvas
		if (!contextUserId) return null
		try {
			const { data, error } = await client
				.from("canvases")
				.insert({
					user_id: contextUserId,
					name: "Canvas",
				})
				.select("id")
				.single()
			if (error || !data) {
				console.error("[canvas-tools] Failed to auto-create canvas:", error)
				return null
			}
			autoCreatedCanvasId = data.id
			console.log("[canvas-tools] Auto-created canvas:", autoCreatedCanvasId)
			return autoCreatedCanvasId
		} catch (err) {
			console.error("[canvas-tools] Auto-create canvas error:", err)
			return null
		}
	}

	return createSdkMcpServer({
		name: "kortix-tools",
		version: "1.0.0",
		tools: [
			tool(
				"searchDatabase",
				"Search documents and memories in the user's knowledge base. Returns document titles, summaries, URLs, and relevant excerpts. Use this tool whenever the user asks about their saved content, documents, or memories.",
				{
					query: z
						.string()
						.min(1)
						.describe(
							"Search query text - can be keywords, questions, or topics",
						),
					limit: z
						.number()
						.min(1)
						.max(50)
						.default(10)
						.describe("Maximum number of results to return"),
					includeSummary: z
						.boolean()
						.default(true)
						.describe("Include document summaries in results"),
					includeFullDocs: z
						.boolean()
						.default(false)
						.describe(
							"Include full document content (use only when specifically needed, as it increases response size)",
						),
					containerTags: z
						.array(z.string())
						.optional()
						.describe("Filter by project/container tags"),
					scopedDocumentIds: z
						.array(z.string())
						.optional()
						.describe("Limit search to specific document IDs"),
				},
				async ({
					query,
					limit,
					includeSummary,
					includeFullDocs,
					containerTags,
					scopedDocumentIds,
				}) => {
					const startTime = Date.now()

					// Generate cache key from search parameters
					const cacheKey = generateCacheKey({
						query,
						limit,
						includeSummary,
						includeFullDocs,
						containerTags: containerTags || baseContainerTags,
						scopedDocumentIds: scopedDocumentIds || baseScopedIds,
					})

					// Try to get from cache
					const cached = await cache.get<unknown>(cacheKey)
					if (cached) {
						const duration = Date.now() - startTime
						console.log(
							`[searchDatabase] Cache hit for query "${query}" (${duration}ms)`,
						)
							return {
								content: [
									{
										type: "text",
										text: JSON.stringify(
											formatSearchToolOutputCompact(
												cached as SearchToolResult,
											),
											null,
											2,
										),
									},
								],
							}
					}

					console.log(`[searchDatabase] Cache miss for query "${query}"`)
					try {
						const result = await executeStructuredSearch(client, orgId, {
							query,
							limit,
							includeSummary,
							includeFullDocs,
							chunkThreshold: 0.1,
							documentThreshold: 0.15,
							onlyMatchingChunks: true,
							containerTags:
								containerTags && containerTags.length > 0
									? containerTags
									: baseContainerTags,
							scopedDocumentIds:
								scopedDocumentIds && scopedDocumentIds.length > 0
									? scopedDocumentIds
									: baseScopedIds,
						})
						const duration = Date.now() - startTime
						console.log(
							`[searchDatabase] Found ${result.total} results (${duration}ms)`,
						)

						// Store in cache (fire and forget)
						await cache.set(cacheKey, result, { ttl: CACHE_TTL })

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										formatSearchToolOutputCompact(result),
										null,
										2,
									),
								},
							],
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : "Unknown error"
						console.error("[searchDatabase] Tool error:", error)
						return {
							content: [
								{
									type: "text",
									text: `searchDatabase failed: ${message}`,
								},
							],
							isError: true as const,
						}
					}
				},
			),
			tool(
				"readAttachment",
				"Read the text content of a file attachment linked to a document. Use this when the user asks about an attached file or you need to inspect its contents. Returns the extracted text for text-based files (md, txt, csv, json, pdf, etc.) or a note for binary files (images, docx).",
				{
					attachmentId: z
						.string()
						.uuid()
						.describe("The UUID of the attachment to read"),
				},
				async ({ attachmentId }) => {
					try {
						const { data, error } = await client
							.from("document_attachments")
							.select("id, filename, mime_type, size_bytes, content_text")
							.eq("id", attachmentId)
							.eq("org_id", orgId)
							.maybeSingle()

						if (error) throw error
						if (!data) {
							return {
								content: [
									{
										type: "text",
										text: `Attachment not found: ${attachmentId}`,
									},
								],
								isError: true as const,
							}
						}

						const result: Record<string, unknown> = {
							id: data.id,
							filename: data.filename,
							mimeType: data.mime_type,
							sizeBytes: data.size_bytes,
						}

						if (data.content_text) {
							result.content = data.content_text
						} else {
							result.content = null
							result.note =
								"This is a binary file (image, docx, etc.) — text content is not available. The user can view/download it from the UI."
						}

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(result, null, 2),
								},
							],
						}
					} catch (err) {
						const message = err instanceof Error ? err.message : "Unknown error"
						console.error("[readAttachment] Tool error:", err)
						return {
							content: [
								{
									type: "text",
									text: `readAttachment failed: ${message}`,
								},
							],
							isError: true as const,
						}
					}
				},
			),
			...(canvasToolsEnabled
				? [
						tool(
							"canvas_get_preview",
							"Get a visual preview (screenshot-like image) of the current canvas so you can inspect layout visually. Returns an image content block when a saved preview is available.",
							{
								canvasId: z
									.string()
									.uuid()
									.optional()
									.describe(
										"Canvas ID. Optional in Canvas page context where active canvas is already known.",
									),
							},
							async ({ canvasId }) => {
								if (!contextUserId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_get_preview failed: missing authenticated user context",
											},
										],
										isError: true as const,
									}
								}

								const resolvedCanvasId =
									resolveCanvasToolTarget({
										requestedCanvasId: safeString(canvasId),
										contextCanvasId: autoCreatedCanvasId ?? contextCanvasId,
									}) ?? (await ensureCanvasForWrite(safeString(canvasId)))
								if (!resolvedCanvasId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_get_preview failed: could not resolve or create a canvas.",
											},
										],
										isError: true as const,
									}
								}

								try {
									const result = await getCanvasPreviewForAgent({
										client,
										userId: contextUserId,
										canvasId: resolvedCanvasId,
									})

									if (
										!result.hasPreview ||
										!result.dataBase64 ||
										!result.mimeType
									) {
										return {
											content: [
												{
													type: "text",
													text: JSON.stringify(
														{
															...result,
															message:
																"No saved canvas preview available yet. Ask the user to wait a few seconds after edits, or use canvas_read_scene/canvas_summarize_scene.",
														},
														null,
														2,
													),
												},
											],
										}
									}

									return {
										content: [
											{
												type: "text",
												text: JSON.stringify(
													{
														canvasId: result.canvasId,
														name: result.name,
														canvasVersion: result.canvasVersion,
														updatedAt: result.updatedAt,
														mimeType: result.mimeType,
														note: "Visual preview attached below. Use it to inspect layout/spatial arrangement.",
													},
													null,
													2,
												),
											},
											{
												type: "image",
												data: result.dataBase64,
												mimeType: result.mimeType,
											} as const,
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[canvas_get_preview] Tool error:", error)
									return {
										content: [
											{
												type: "text",
												text: `canvas_get_preview failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"canvas_read_me",
							"Read the canvas manipulation cheat sheet with element format, pseudo-elements (cameraUpdate, restoreCheckpoint, delete), and best practices.",
							{},
							async () => {
								return {
									content: [
										{
											type: "text",
											text: CANVAS_READ_ME_TEXT,
										},
									],
								}
							},
						),
						tool(
							"canvas_create_view",
							"Create or update Excalidraw canvas content from a JSON array string. Supports regular elements and pseudo-elements cameraUpdate, restoreCheckpoint, and delete.",
							{
								canvasId: CanvasCreateViewInputSchema.shape.canvasId.describe(
									"Canvas ID. Optional in Canvas page context where active canvas is already known.",
								),
								input: CanvasCreateViewInputSchema.shape.input.describe(
									"JSON array string containing Excalidraw elements and pseudo-elements.",
								),
								checkpointId:
									CanvasCreateViewInputSchema.shape.checkpointId.describe(
										"Optional checkpoint id to restore before applying operations.",
									),
								mode: CanvasCreateViewInputSchema.shape.mode.describe(
									"append (default) or replace",
								),
								baseVersion:
									CanvasCreateViewInputSchema.shape.baseVersion.describe(
										"Optional optimistic concurrency base version.",
									),
							},
							async ({ canvasId, input, checkpointId, mode, baseVersion }) => {
								if (!contextUserId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_create_view failed: missing authenticated user context",
											},
										],
										isError: true as const,
									}
								}

								const resolvedCanvasId =
									resolveCanvasToolTarget({
										requestedCanvasId: safeString(canvasId),
										contextCanvasId: autoCreatedCanvasId ?? contextCanvasId,
									}) ?? (await ensureCanvasForWrite(safeString(canvasId)))
								if (!resolvedCanvasId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_create_view failed: could not resolve or create a canvas.",
											},
										],
										isError: true as const,
									}
								}

								try {
									const result = await applyCanvasCreateView({
										client,
										userId: contextUserId,
										canvasId: resolvedCanvasId,
										input,
										checkpointId,
										mode,
										baseVersion,
										source: "agent",
									})
									return {
										content: [
											{
												type: "text",
												text: JSON.stringify(result, null, 2),
											},
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[canvas_create_view] Tool error:", error)
									return {
										content: [
											{
												type: "text",
												text: `canvas_create_view failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"canvas_read_scene",
							"Read and inspect the current Excalidraw canvas. Returns structured scene stats, element list, text snippets, and bounds. Use before editing, summarizing, or organizing a canvas.",
							{
								canvasId: z
									.string()
									.uuid()
									.optional()
									.describe(
										"Canvas ID. Optional in Canvas page context where active canvas is already known.",
									),
								elementLimit: z
									.number()
									.int()
									.min(1)
									.max(1000)
									.default(200)
									.describe(
										"Maximum number of elements to include in the returned element list.",
									),
								includeRaw: z
									.boolean()
									.default(false)
									.describe(
										"Include raw Excalidraw scene JSON (elements/appState/files). Use only when needed.",
									),
							},
							async ({ canvasId, elementLimit, includeRaw }) => {
								if (!contextUserId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_read_scene failed: missing authenticated user context",
											},
										],
										isError: true as const,
									}
								}

								const resolvedCanvasId =
									resolveCanvasToolTarget({
										requestedCanvasId: safeString(canvasId),
										contextCanvasId: autoCreatedCanvasId ?? contextCanvasId,
									}) ?? (await ensureCanvasForWrite(safeString(canvasId)))
								if (!resolvedCanvasId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_read_scene failed: could not resolve or create a canvas.",
											},
										],
										isError: true as const,
									}
								}

								try {
									const result = await readCanvasSceneForAgent({
										client,
										userId: contextUserId,
										canvasId: resolvedCanvasId,
										elementLimit,
										includeRaw,
									})
									return {
										content: [
											{ type: "text", text: JSON.stringify(result, null, 2) },
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[canvas_read_scene] Tool error:", error)
									return {
										content: [
											{
												type: "text",
												text: `canvas_read_scene failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"canvas_list_checkpoints",
							"List recent canvas checkpoints for the active canvas. Useful before restore/undo-like operations.",
							{
								canvasId: z
									.string()
									.uuid()
									.optional()
									.describe(
										"Canvas ID. Optional in Canvas page context where active canvas is already known.",
									),
								limit: z
									.number()
									.int()
									.min(1)
									.max(100)
									.default(20)
									.describe("How many recent checkpoints to return."),
							},
							async ({ canvasId, limit }) => {
								if (!contextUserId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_list_checkpoints failed: missing authenticated user context",
											},
										],
										isError: true as const,
									}
								}

								const resolvedCanvasId =
									resolveCanvasToolTarget({
										requestedCanvasId: safeString(canvasId),
										contextCanvasId: autoCreatedCanvasId ?? contextCanvasId,
									}) ?? (await ensureCanvasForWrite(safeString(canvasId)))
								if (!resolvedCanvasId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_list_checkpoints failed: could not resolve or create a canvas.",
											},
										],
										isError: true as const,
									}
								}

								try {
									const result = await listCanvasCheckpointsForAgent({
										client,
										userId: contextUserId,
										canvasId: resolvedCanvasId,
										limit,
									})
									return {
										content: [
											{ type: "text", text: JSON.stringify(result, null, 2) },
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[canvas_list_checkpoints] Tool error:", error)
									return {
										content: [
											{
												type: "text",
												text: `canvas_list_checkpoints failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"canvas_restore_checkpoint",
							"Restore the canvas to a previous checkpoint by checkpointId. Creates a new checkpoint for the restored state.",
							{
								canvasId: z
									.string()
									.uuid()
									.optional()
									.describe(
										"Canvas ID. Optional in Canvas page context where active canvas is already known.",
									),
								checkpointId: z
									.string()
									.uuid()
									.describe(
										"Checkpoint ID obtained from canvas_list_checkpoints.",
									),
								baseVersion: z
									.number()
									.int()
									.min(1)
									.optional()
									.describe("Optional optimistic concurrency version."),
							},
							async ({ canvasId, checkpointId, baseVersion }) => {
								if (!contextUserId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_restore_checkpoint failed: missing authenticated user context",
											},
										],
										isError: true as const,
									}
								}

								const resolvedCanvasId =
									resolveCanvasToolTarget({
										requestedCanvasId: safeString(canvasId),
										contextCanvasId: autoCreatedCanvasId ?? contextCanvasId,
									}) ?? (await ensureCanvasForWrite(safeString(canvasId)))
								if (!resolvedCanvasId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_restore_checkpoint failed: could not resolve or create a canvas.",
											},
										],
										isError: true as const,
									}
								}

								try {
									const result = await applyCanvasCreateView({
										client,
										userId: contextUserId,
										canvasId: resolvedCanvasId,
										input: JSON.stringify([
											{ type: "restoreCheckpoint", id: checkpointId },
										]),
										checkpointId,
										mode: "append",
										baseVersion,
										source: "agent:restore",
									})
									return {
										content: [
											{ type: "text", text: JSON.stringify(result, null, 2) },
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error(
										"[canvas_restore_checkpoint] Tool error:",
										error,
									)
									return {
										content: [
											{
												type: "text",
												text: `canvas_restore_checkpoint failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"canvas_auto_arrange",
							"Auto-organize canvas elements into a readable grid layout (keeps container-bound children together, e.g. labels). Best for cleaning up messy diagrams before reviewing.",
							{
								canvasId: z
									.string()
									.uuid()
									.optional()
									.describe(
										"Canvas ID. Optional in Canvas page context where active canvas is already known.",
									),
								columns: z.number().int().min(1).max(12).default(3),
								gapX: z.number().int().min(16).max(1000).default(120),
								gapY: z.number().int().min(16).max(1000).default(100),
								padding: z.number().int().min(0).max(1000).default(80),
								baseVersion: z
									.number()
									.int()
									.min(1)
									.optional()
									.describe("Optional optimistic concurrency version."),
							},
							async ({
								canvasId,
								columns,
								gapX,
								gapY,
								padding,
								baseVersion,
							}) => {
								if (!contextUserId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_auto_arrange failed: missing authenticated user context",
											},
										],
										isError: true as const,
									}
								}

								const resolvedCanvasId =
									resolveCanvasToolTarget({
										requestedCanvasId: safeString(canvasId),
										contextCanvasId: autoCreatedCanvasId ?? contextCanvasId,
									}) ?? (await ensureCanvasForWrite(safeString(canvasId)))
								if (!resolvedCanvasId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_auto_arrange failed: could not resolve or create a canvas.",
											},
										],
										isError: true as const,
									}
								}

								try {
									const result = await autoArrangeCanvasForAgent({
										client,
										userId: contextUserId,
										canvasId: resolvedCanvasId,
										columns,
										gapX,
										gapY,
										padding,
										baseVersion,
									})
									return {
										content: [
											{ type: "text", text: JSON.stringify(result, null, 2) },
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[canvas_auto_arrange] Tool error:", error)
									return {
										content: [
											{
												type: "text",
												text: `canvas_auto_arrange failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"canvas_clear",
							"Clear/delete ALL elements from the canvas. Use when user asks to clear, reset, or delete everything from the canvas.",
							{
								canvasId: z
									.string()
									.uuid()
									.optional()
									.describe(
										"Canvas ID. Optional in Canvas page context where active canvas is already known.",
									),
							},
							async ({ canvasId }) => {
								if (!contextUserId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_clear failed: missing authenticated user context",
											},
										],
										isError: true as const,
									}
								}

								const resolvedCanvasId =
									resolveCanvasToolTarget({
										requestedCanvasId: safeString(canvasId),
										contextCanvasId: autoCreatedCanvasId ?? contextCanvasId,
									}) ?? (await ensureCanvasForWrite(safeString(canvasId)))
								if (!resolvedCanvasId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_clear failed: could not resolve or create a canvas.",
											},
										],
										isError: true as const,
									}
								}

								try {
									const result = await clearCanvasForAgent({
										client,
										userId: contextUserId,
										canvasId: resolvedCanvasId,
									})
									return {
										content: [
											{ type: "text", text: JSON.stringify(result, null, 2) },
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[canvas_clear] Tool error:", error)
									return {
										content: [
											{
												type: "text",
												text: `canvas_clear failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"canvas_summarize_scene",
							"Summarize what exists on the current canvas (diagram type, counts, labels/text snippets, bounds). Use this when the user asks what is on the canvas or asks for a summary.",
							{
								canvasId: z
									.string()
									.uuid()
									.optional()
									.describe(
										"Canvas ID. Optional in Canvas page context where active canvas is already known.",
									),
							},
							async ({ canvasId }) => {
								if (!contextUserId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_summarize_scene failed: missing authenticated user context",
											},
										],
										isError: true as const,
									}
								}

								const resolvedCanvasId =
									resolveCanvasToolTarget({
										requestedCanvasId: safeString(canvasId),
										contextCanvasId: autoCreatedCanvasId ?? contextCanvasId,
									}) ?? (await ensureCanvasForWrite(safeString(canvasId)))
								if (!resolvedCanvasId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_summarize_scene failed: could not resolve or create a canvas.",
											},
										],
										isError: true as const,
									}
								}

								try {
									const result = await summarizeCanvasSceneForAgent({
										client,
										userId: contextUserId,
										canvasId: resolvedCanvasId,
									})
									return {
										content: [
											{ type: "text", text: JSON.stringify(result, null, 2) },
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[canvas_summarize_scene] Tool error:", error)
									return {
										content: [
											{
												type: "text",
												text: `canvas_summarize_scene failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"canvas_create_flowchart",
							"Create a flowchart from a list of steps. Generates boxes and connecting arrows on the current canvas.",
							{
								canvasId: z
									.string()
									.uuid()
									.optional()
									.describe(
										"Canvas ID. Optional in Canvas page context where active canvas is already known.",
									),
								title: z
									.string()
									.optional()
									.describe("Optional flowchart title shown above the steps."),
								steps: z
									.array(z.string().min(1))
									.min(1)
									.max(20)
									.describe("Ordered list of flow steps."),
								direction: z
									.enum(["vertical", "horizontal"])
									.default("vertical")
									.describe("Primary layout direction."),
								mode: z
									.enum(["append", "replace"])
									.default("append")
									.describe("Append to current canvas or replace its content."),
								baseVersion: z
									.number()
									.int()
									.min(1)
									.optional()
									.describe("Optional optimistic concurrency version."),
							},
							async ({
								canvasId,
								title,
								steps,
								direction,
								mode,
								baseVersion,
							}) => {
								if (!contextUserId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_create_flowchart failed: missing authenticated user context",
											},
										],
										isError: true as const,
									}
								}

								const resolvedCanvasId =
									resolveCanvasToolTarget({
										requestedCanvasId: safeString(canvasId),
										contextCanvasId: autoCreatedCanvasId ?? contextCanvasId,
									}) ?? (await ensureCanvasForWrite(safeString(canvasId)))
								if (!resolvedCanvasId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_create_flowchart failed: could not resolve or create a canvas.",
											},
										],
										isError: true as const,
									}
								}

								try {
									const result = await createFlowchartCanvasForAgent({
										client,
										userId: contextUserId,
										canvasId: resolvedCanvasId,
										title: safeString(title),
										steps,
										direction,
										mode,
										baseVersion,
									})
									return {
										content: [
											{ type: "text", text: JSON.stringify(result, null, 2) },
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[canvas_create_flowchart] Tool error:", error)
									return {
										content: [
											{
												type: "text",
												text: `canvas_create_flowchart failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"canvas_create_mindmap",
							"Create a mindmap from a central topic and branches (optionally with child items). Generates nodes and connecting arrows on the current canvas.",
							{
								canvasId: z
									.string()
									.uuid()
									.optional()
									.describe(
										"Canvas ID. Optional in Canvas page context where active canvas is already known.",
									),
								center: z
									.string()
									.min(1)
									.describe("Central topic of the mindmap."),
								branches: z
									.array(
										z.union([
											z.string().min(1),
											z.object({
												label: z.string().min(1),
												children: z.array(z.string().min(1)).max(8).optional(),
											}),
										]),
									)
									.min(1)
									.max(16)
									.describe(
										"Branch labels or objects with label + children for second-level nodes.",
									),
								mode: z
									.enum(["append", "replace"])
									.default("append")
									.describe("Append to current canvas or replace its content."),
								baseVersion: z
									.number()
									.int()
									.min(1)
									.optional()
									.describe("Optional optimistic concurrency version."),
							},
							async ({ canvasId, center, branches, mode, baseVersion }) => {
								if (!contextUserId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_create_mindmap failed: missing authenticated user context",
											},
										],
										isError: true as const,
									}
								}

								const resolvedCanvasId =
									resolveCanvasToolTarget({
										requestedCanvasId: safeString(canvasId),
										contextCanvasId: autoCreatedCanvasId ?? contextCanvasId,
									}) ?? (await ensureCanvasForWrite(safeString(canvasId)))
								if (!resolvedCanvasId) {
									return {
										content: [
											{
												type: "text",
												text: "canvas_create_mindmap failed: could not resolve or create a canvas.",
											},
										],
										isError: true as const,
									}
								}

								try {
									const result = await createMindmapCanvasForAgent({
										client,
										userId: contextUserId,
										canvasId: resolvedCanvasId,
										center,
										branches: branches as Array<
											string | { label: string; children?: string[] }
										>,
										mode,
										baseVersion,
									})
									return {
										content: [
											{ type: "text", text: JSON.stringify(result, null, 2) },
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[canvas_create_mindmap] Tool error:", error)
									return {
										content: [
											{
												type: "text",
												text: `canvas_create_mindmap failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
					]
				: []),
			...(sandboxEnabled && sandboxEnv
				? [
						tool(
							"sandbox_create",
							"Create an isolated sandbox environment for running code, cloning repos, or testing. Returns a sandboxId to use with other sandbox tools. ALWAYS destroy the sandbox when done.",
							{
								image: z
									.string()
									.optional()
									.describe(
										"Docker image for the sandbox. Default: daytonaio/sandbox:0.5.0-slim",
									),
								cpu: z
									.number()
									.int()
									.min(1)
									.max(4)
									.optional()
									.describe("CPU cores (default 1, max 4)"),
								memory: z
									.number()
									.int()
									.min(1)
									.max(4)
									.optional()
									.describe("Memory in GB (default 1, max 4)"),
								autoStopMinutes: z
									.number()
									.int()
									.min(1)
									.max(60)
									.default(15)
									.describe("Auto-stop after N minutes idle (default 15)"),
							},
							async ({ image, cpu, memory, autoStopMinutes }) => {
								try {
									console.log("[sandbox_create] Creating sandbox...")
									const sandbox = await createSandbox(sandboxEnv, {
										image,
										cpu,
										memory,
										autoStopMinutes,
									})
									console.log(
										`[sandbox_create] Sandbox ${sandbox.id} ready (state: ${sandbox.state})`,
									)
									return {
										content: [
											{
												type: "text",
												text: JSON.stringify(
													{
														sandboxId: sandbox.id,
														state: sandbox.state,
														note: "Sandbox is ready. Use /home/daytona as working directory. ALWAYS call sandbox_destroy when done.",
													},
													null,
													2,
												),
											},
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[sandbox_create] Error:", error)
									return {
										content: [
											{
												type: "text",
												text: `sandbox_create failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"sandbox_execute",
							"Execute a shell command inside a sandbox. Returns stdout/stderr and exit code. Use for running code, installing packages, running tests, etc.",
							{
								sandboxId: z
									.string()
									.min(1)
									.describe("Sandbox ID from sandbox_create"),
								command: z
									.string()
									.min(1)
									.describe(
										"Shell command to execute (e.g. 'npm install && npm test')",
									),
								workingDir: z
									.string()
									.optional()
									.describe("Working directory (default: /home/daytona)"),
								timeout: z
									.number()
									.int()
									.min(1)
									.max(300)
									.optional()
									.describe("Timeout in seconds (max 300)"),
							},
							async ({ sandboxId, command, workingDir, timeout }) => {
								try {
									console.log(
										`[sandbox_execute] Running in ${sandboxId}: ${command.slice(0, 100)}`,
									)
									const result = await executeCommand(
										sandboxEnv,
										sandboxId,
										command,
										{ workingDir, timeout },
									)
									console.log(`[sandbox_execute] Exit code: ${result.exitCode}`)
									return {
										content: [
											{
												type: "text",
												text: JSON.stringify(
													{
														exitCode: result.exitCode,
														output: result.result,
													},
													null,
													2,
												),
											},
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[sandbox_execute] Error:", error)
									return {
										content: [
											{
												type: "text",
												text: `sandbox_execute failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"sandbox_destroy",
							"Destroy a sandbox and free its resources. ALWAYS call this after you're done using a sandbox.",
							{
								sandboxId: z.string().min(1).describe("Sandbox ID to destroy"),
							},
							async ({ sandboxId }) => {
								try {
									console.log(
										`[sandbox_destroy] Destroying sandbox ${sandboxId}`,
									)
									await destroySandbox(sandboxEnv, sandboxId)
									console.log(
										`[sandbox_destroy] Sandbox ${sandboxId} destroyed`,
									)
									return {
										content: [
											{
												type: "text",
												text: JSON.stringify({
													success: true,
													sandboxId,
													message: "Sandbox destroyed successfully",
												}),
											},
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[sandbox_destroy] Error:", error)
									return {
										content: [
											{
												type: "text",
												text: `sandbox_destroy failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"sandbox_upload_file",
							"Upload/create a file inside the sandbox. Use to write code, configs, or test data into the sandbox.",
							{
								sandboxId: z.string().min(1).describe("Sandbox ID"),
								filePath: z
									.string()
									.min(1)
									.describe(
										"Absolute path in sandbox (e.g. /home/daytona/app.js)",
									),
								content: z.string().describe("File content to write"),
							},
							async ({ sandboxId, filePath, content }) => {
								try {
									console.log(
										`[sandbox_upload_file] Writing ${filePath} in ${sandboxId}`,
									)
									await uploadFile(sandboxEnv, sandboxId, filePath, content)
									return {
										content: [
											{
												type: "text",
												text: JSON.stringify({
													success: true,
													filePath,
													message: "File written successfully",
												}),
											},
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[sandbox_upload_file] Error:", error)
									return {
										content: [
											{
												type: "text",
												text: `sandbox_upload_file failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"sandbox_download_file",
							"Download/read a file from the sandbox. Use to retrieve outputs, logs, or generated files.",
							{
								sandboxId: z.string().min(1).describe("Sandbox ID"),
								filePath: z
									.string()
									.min(1)
									.describe("Absolute path in sandbox to download"),
							},
							async ({ sandboxId, filePath }) => {
								try {
									console.log(
										`[sandbox_download_file] Reading ${filePath} from ${sandboxId}`,
									)
									const content = await downloadFile(
										sandboxEnv,
										sandboxId,
										filePath,
									)
									return {
										content: [
											{
												type: "text",
												text: JSON.stringify({ filePath, content }, null, 2),
											},
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[sandbox_download_file] Error:", error)
									return {
										content: [
											{
												type: "text",
												text: `sandbox_download_file failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"sandbox_list_files",
							"List files and directories at a given path inside the sandbox.",
							{
								sandboxId: z.string().min(1).describe("Sandbox ID"),
								path: z
									.string()
									.default("/home/daytona")
									.describe("Directory path to list (default: /home/daytona)"),
							},
							async ({ sandboxId, path }) => {
								try {
									const files = await listFiles(sandboxEnv, sandboxId, path)
									return {
										content: [
											{
												type: "text",
												text: JSON.stringify({ path, files }, null, 2),
											},
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[sandbox_list_files] Error:", error)
									return {
										content: [
											{
												type: "text",
												text: `sandbox_list_files failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
						tool(
							"sandbox_git_clone",
							"Clone a Git repository into the sandbox. Useful for analyzing, testing, or running external code.",
							{
								sandboxId: z.string().min(1).describe("Sandbox ID"),
								url: z.string().url().describe("Git repository URL (https)"),
								path: z
									.string()
									.optional()
									.describe(
										"Clone destination path (default: /home/daytona/repo)",
									),
								branch: z
									.string()
									.optional()
									.describe("Branch to clone (default: default branch)"),
							},
							async ({ sandboxId, url, path, branch }) => {
								try {
									console.log(
										`[sandbox_git_clone] Cloning ${url} into ${sandboxId}`,
									)
									await gitClone(sandboxEnv, sandboxId, url, { path, branch })
									const clonePath = path ?? "/home/daytona/repo"
									return {
										content: [
											{
												type: "text",
												text: JSON.stringify(
													{
														success: true,
														url,
														clonedTo: clonePath,
														message: `Repository cloned to ${clonePath}`,
													},
													null,
													2,
												),
											},
										],
									}
								} catch (error) {
									const message =
										error instanceof Error ? error.message : "Unknown error"
									console.error("[sandbox_git_clone] Error:", error)
									return {
										content: [
											{
												type: "text",
												text: `sandbox_git_clone failed: ${message}`,
											},
										],
										isError: true as const,
									}
								}
							},
						),
					]
				: []),

			// ─── NotebookLM tools (available when user has NotebookLM connected) ───
			tool(
				"notebooklm_chat",
				"Ask a question to Google NotebookLM about the sources in a linked notebook. Returns an AI-generated answer with citations. Use this when the user wants insights from their NotebookLM notebooks, or when you need a second perspective on their saved content. Requires NotebookLM to be connected.",
				{
					notebookId: z
						.string()
						.describe(
							"The NotebookLM notebook ID to query. If unknown, use notebooklm_list_notebooks first.",
						),
					question: z
						.string()
						.min(1)
						.describe("The question to ask about the notebook's sources"),
					sourceIds: z
						.array(z.string())
						.optional()
						.describe(
							"Specific source IDs to limit the query to. Omit to query all sources.",
						),
				},
				async ({ notebookId, question, sourceIds }) => {
					try {
						const nlm = await getNlmClient()
						if (!nlm) {
							return {
								content: [
									{
										type: "text",
										text: "NotebookLM is not connected. The user needs to connect it in Settings → Integrations.",
									},
								],
								isError: true as const,
							}
						}
						const result = await nlm.chat.ask(notebookId, question, {
							sourceIds,
						})
						return {
							content: [
								{ type: "text", text: JSON.stringify(result, null, 2) },
							],
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : "Unknown error"
						return {
							content: [
								{ type: "text", text: `notebooklm_chat failed: ${message}` },
							],
							isError: true as const,
						}
					}
				},
			),

			tool(
				"notebooklm_list_notebooks",
				"List all notebooks in the user's NotebookLM account. Use this to discover available notebooks before performing other NotebookLM operations. Requires NotebookLM to be connected.",
				{},
				async () => {
					try {
						const nlm = await getNlmClient()
						if (!nlm) {
							return {
								content: [
									{
										type: "text",
										text: "NotebookLM is not connected. The user needs to connect it in Settings → Integrations.",
									},
								],
								isError: true as const,
							}
						}
						const notebooks = await nlm.notebooks.list()
						return {
							content: [
								{ type: "text", text: JSON.stringify(notebooks, null, 2) },
							],
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : "Unknown error"
						return {
							content: [
								{
									type: "text",
									text: `notebooklm_list_notebooks failed: ${message}`,
								},
							],
							isError: true as const,
						}
					}
				},
			),

			tool(
				"notebooklm_generate_artifact",
				"Generate an artifact in NotebookLM: audio overview (podcast), video, report, infographic, slide deck, or mind map. The artifact is generated from the notebook's sources. Returns a task ID for polling. Requires NotebookLM to be connected.",
				{
					notebookId: z.string().describe("The NotebookLM notebook ID"),
					type: z
						.enum([
							"audio",
							"video",
							"report",
							"infographic",
							"slide_deck",
							"mind_map",
						])
						.describe(
							"Type of artifact to generate. 'audio' creates a podcast-style discussion, 'report' creates a briefing doc or study guide, 'video' creates an explainer video.",
						),
					sourceIds: z
						.array(z.string())
						.optional()
						.describe("Specific source IDs to use. Omit to use all sources."),
					instructions: z
						.string()
						.optional()
						.describe(
							"Custom instructions for the artifact generation (e.g. 'Focus on the business strategy aspects').",
						),
				},
				async ({ notebookId, type, sourceIds, instructions }) => {
					try {
						const nlm = await getNlmClient()
						if (!nlm) {
							return {
								content: [
									{
										type: "text",
										text: "NotebookLM is not connected. The user needs to connect it in Settings → Integrations.",
									},
								],
								isError: true as const,
							}
						}

						let status
						switch (type) {
							case "audio":
								status = await nlm.artifacts.generateAudio(notebookId, {
									sourceIds,
									instructions,
								})
								break
							case "video":
								status = await nlm.artifacts.generateVideo(notebookId, {
									sourceIds,
									instructions,
								})
								break
							case "report":
								status = await nlm.artifacts.generateReport(notebookId, {
									sourceIds,
									prompt: instructions,
								})
								break
							case "infographic":
								status = await nlm.artifacts.generateInfographic(notebookId, {
									sourceIds,
									instructions,
								})
								break
							case "slide_deck":
								status = await nlm.artifacts.generateSlideDeck(notebookId, {
									sourceIds,
									instructions,
								})
								break
							case "mind_map":
								status = await nlm.artifacts.generateMindMap(
									notebookId,
									sourceIds,
								)
								break
						}

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										{
											...status,
											message: `${type} generation started. It may take a few minutes.`,
										},
										null,
										2,
									),
								},
							],
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : "Unknown error"
						return {
							content: [
								{
									type: "text",
									text: `notebooklm_generate_artifact failed: ${message}`,
								},
							],
							isError: true as const,
						}
					}
				},
			),

			tool(
				"notebooklm_add_source",
				"Add a URL or text as a source to a NotebookLM notebook. Use this to push content from Kortix to NotebookLM. Requires NotebookLM to be connected.",
				{
					notebookId: z.string().describe("The NotebookLM notebook ID"),
					type: z
						.enum(["url", "text"])
						.describe(
							"Type of source: 'url' for a web page/YouTube, 'text' for pasted text",
						),
					url: z
						.string()
						.optional()
						.describe("URL to add (required when type='url')"),
					title: z
						.string()
						.optional()
						.describe("Title for text source (required when type='text')"),
					content: z
						.string()
						.optional()
						.describe("Content for text source (required when type='text')"),
				},
				async ({ notebookId, type, url, title, content }) => {
					try {
						const nlm = await getNlmClient()
						if (!nlm) {
							return {
								content: [
									{
										type: "text",
										text: "NotebookLM is not connected. The user needs to connect it in Settings → Integrations.",
									},
								],
								isError: true as const,
							}
						}

						let source
						if (type === "url" && url) {
							source = await nlm.sources.addUrl(notebookId, url)
						} else if (type === "text" && title && content) {
							source = await nlm.sources.addText(notebookId, title, content)
						} else {
							return {
								content: [
									{
										type: "text",
										text: "Invalid parameters: provide 'url' for URL type, or 'title' + 'content' for text type.",
									},
								],
								isError: true as const,
							}
						}

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										{
											...source,
											message:
												"Source added successfully. It may take a moment to process.",
										},
										null,
										2,
									),
								},
							],
						}
					} catch (error) {
						const message =
							error instanceof Error ? error.message : "Unknown error"
						return {
							content: [
								{
									type: "text",
									text: `notebooklm_add_source failed: ${message}`,
								},
							],
							isError: true as const,
						}
					}
				},
			),
		],
	})
}
