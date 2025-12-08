import { createHash } from "node:crypto"
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { searchDocuments } from "../routes/search"
import { getCacheService } from "./cache"

type ToolContext = {
	containerTags?: string[]
	scopedDocumentIds?: string[]
}

function safeString(value: unknown) {
	return typeof value === "string" ? value : undefined
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

	const cache = getCacheService()
	const CACHE_TTL = 3600 // 1 hour

	// Helper function to generate cache key
	function generateCacheKey(params: Record<string, unknown>): string {
		const normalized = JSON.stringify(params, Object.keys(params).sort())
		const hash = createHash("sha256").update(normalized).digest("hex")
		return `search:${orgId}:${hash}`
	}

	// Schema de mudanças de canvas que o Claude Code pode usar via MCP.
	// Note shape schema - for sticky notes
	const NoteShapeSchema = z.object({
		type: z.literal("note"),
		id: z.string().optional().describe("Unique ID for the shape (auto-generated if not provided)"),
		x: z.number().describe("X coordinate (top-left corner)"),
		y: z.number().describe("Y coordinate (top-left corner)"),
		props: z.object({
			text: z.string().default("").describe("Text content of the note"),
			color: z.enum(["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red", "white"]).default("yellow"),
			size: z.enum(["s", "m", "l", "xl"]).default("m"),
			font: z.enum(["draw", "sans", "serif", "mono"]).default("draw"),
			align: z.enum(["start", "middle", "end"]).default("middle"),
			verticalAlign: z.enum(["start", "middle", "end"]).default("middle"),
		}).partial(),
	})

	// Text shape schema
	const TextShapeSchema = z.object({
		type: z.literal("text"),
		id: z.string().optional(),
		x: z.number(),
		y: z.number(),
		props: z.object({
			text: z.string().default(""),
			color: z.enum(["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red", "white"]).default("black"),
			size: z.enum(["s", "m", "l", "xl"]).default("m"),
			font: z.enum(["draw", "sans", "serif", "mono"]).default("draw"),
			align: z.enum(["start", "middle", "end"]).default("start"),
		}).partial(),
	})

	// Geo shape schema - rectangles, ellipses, etc.
	const GeoShapeSchema = z.object({
		type: z.literal("geo"),
		id: z.string().optional(),
		x: z.number(),
		y: z.number(),
		props: z.object({
			w: z.number().default(100).describe("Width"),
			h: z.number().default(100).describe("Height"),
			geo: z.enum(["rectangle", "ellipse", "triangle", "diamond", "pentagon", "hexagon", "octagon", "star", "rhombus", "rhombus-2", "oval", "trapezoid", "arrow-right", "arrow-left", "arrow-up", "arrow-down", "x-box", "check-box", "cloud", "heart"]).default("rectangle"),
			color: z.enum(["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red", "white"]).default("black"),
			fill: z.enum(["none", "semi", "solid", "pattern"]).default("none"),
			dash: z.enum(["draw", "solid", "dashed", "dotted"]).default("draw"),
			size: z.enum(["s", "m", "l", "xl"]).default("m"),
			text: z.string().default("").describe("Label text inside shape"),
			align: z.enum(["start", "middle", "end"]).default("middle"),
			verticalAlign: z.enum(["start", "middle", "end"]).default("middle"),
			font: z.enum(["draw", "sans", "serif", "mono"]).default("draw"),
		}).partial(),
	})

	// Arrow shape schema
	const ArrowShapeSchema = z.object({
		type: z.literal("arrow"),
		id: z.string().optional(),
		x: z.number(),
		y: z.number(),
		props: z.object({
			color: z.enum(["black", "grey", "light-violet", "violet", "blue", "light-blue", "yellow", "orange", "green", "light-green", "light-red", "red", "white"]).default("black"),
			fill: z.enum(["none", "semi", "solid", "pattern"]).default("none"),
			dash: z.enum(["draw", "solid", "dashed", "dotted"]).default("draw"),
			size: z.enum(["s", "m", "l", "xl"]).default("m"),
			arrowheadStart: z.enum(["none", "arrow", "triangle", "square", "dot", "diamond", "inverted", "bar", "pipe"]).default("none"),
			arrowheadEnd: z.enum(["none", "arrow", "triangle", "square", "dot", "diamond", "inverted", "bar", "pipe"]).default("arrow"),
			text: z.string().default(""),
			font: z.enum(["draw", "sans", "serif", "mono"]).default("draw"),
			start: z.object({
				x: z.number(),
				y: z.number(),
			}).optional().describe("Start point relative to shape position"),
			end: z.object({
				x: z.number(),
				y: z.number(),
			}).optional().describe("End point relative to shape position"),
		}).partial(),
	})

	// Generic shape for flexibility
	const GenericShapeSchema = z.object({
		type: z.string(),
		id: z.string().optional(),
		x: z.number(),
		y: z.number(),
		props: z.record(z.any()).optional(),
	})

	// Union of all shape types
	const ShapeSchema = z.union([
		NoteShapeSchema,
		TextShapeSchema,
		GeoShapeSchema,
		ArrowShapeSchema,
		GenericShapeSchema,
	])

	const CanvasChangeSchema = z.discriminatedUnion("type", [
		z.object({
			type: z.literal("createShape"),
			shape: ShapeSchema.describe("TLDraw shape to create on the canvas"),
		}),
		z.object({
			type: z.literal("updateShape"),
			shape: z.object({
				id: z.string().describe("ID of the shape to update"),
				type: z.string().optional(),
				x: z.number().optional(),
				y: z.number().optional(),
				props: z.record(z.any()).optional(),
			}).describe("Partial shape with ID to update"),
		}),
		z.object({
			type: z.literal("deleteShape"),
			id: z.string().describe("ID of the shape to delete"),
		}),
		z.object({
			type: z.literal("selectShapes"),
			ids: z.array(z.string()).describe("List of shape IDs to select"),
		}),
		z.object({
			type: z.literal("zoomToFit"),
		}),
		z.object({
			type: z.literal("zoomToArea"),
			bounds: z.object({
				x: z.number(),
				y: z.number(),
				w: z.number(),
				h: z.number(),
			}),
		}),
		z.object({
			type: z.literal("focusOnShape"),
			id: z.string().describe("ID of shape to focus and center on"),
		}),
	])

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
						.default(20)
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
									text: JSON.stringify(cached, null, 2),
								},
							],
						}
					}

					console.log(`[searchDatabase] Cache miss for query "${query}"`)
					try {
						const response = await searchDocuments(client, orgId, {
							q: query,
							limit,
							includeSummary,
							includeFullDocs,
							chunkThreshold: 0.0, // Accept all chunks, let ranking decide
							documentThreshold: 0.0, // Accept all documents, let ranking decide
							onlyMatchingChunks: false,
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
							`[searchDatabase] Found ${response.total} results (${duration}ms)`,
						)

						const result = {
							count: response.total,
							results: response.results.map((item) => ({
								documentId: safeString(item.documentId),
								title: safeString(item.title),
								type: safeString(item.type),
								score: item.score ?? undefined,
								url: safeString(
									item.metadata && typeof item.metadata === "object"
										? (item.metadata as Record<string, unknown>).url
										: undefined,
								),
								createdAt: safeString(item.createdAt),
								updatedAt: safeString(item.updatedAt),
								summary: safeString(item.summary),
								content:
									includeFullDocs && typeof item.content === "string"
										? item.content
										: undefined,
								metadata:
									item.metadata && typeof item.metadata === "object"
										? (item.metadata as Record<string, unknown>)
										: undefined,
								chunks: Array.isArray(item.chunks)
									? item.chunks.map((chunk) => ({
											content: chunk.content,
											score: chunk.score,
										}))
									: undefined,
							})),
						}

						// Store in cache (fire and forget)
						await cache.set(cacheKey, result, { ttl: CACHE_TTL })

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
				"canvasApplyChanges",
				"Planeja e descreve operações de baixo nível para o canvas TLDraw (criar, atualizar, deletar, selecionar shapes, dar zoom). O runtime do canvas no frontend executa essas mudanças usando as APIs nativas do editor.",
				{
					changes: z
						.array(CanvasChangeSchema)
						.min(1)
						.describe(
							"Lista de operações nativas de canvas (createShape, updateShape, deleteShape, selectShapes, zoomToFit, zoomToArea, focusOnShape).",
						),
				},
				async ({ changes }) => {
					// Importante: este tool MCP NÃO mexe diretamente no canvas,
					// porque roda no backend. Ele apenas serializa as mudanças
					// solicitadas pelo agente para que o frontend possa aplicar
					// via `applyCanvasAgentChange(editor, change)`.
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										kind: "canvasChanges",
										changes,
									},
									null,
									2,
								),
							},
						],
					}
				},
			),
		],
	})
}
