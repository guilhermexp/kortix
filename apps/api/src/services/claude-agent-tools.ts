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

export function createSupermemoryTools(
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

	return createSdkMcpServer({
		name: "supermemory-tools",
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
		],
	})
}
