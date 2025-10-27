import type { SupabaseClient } from "@supabase/supabase-js"
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { searchDocuments } from "../routes/search"

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

	return createSdkMcpServer({
		name: "supermemory-tools",
		version: "1.0.0",
		tools: [
			tool(
				"searchDatabase",
				"Search documents and memories ingested into Supermemory",
				z.object({
					query: z.string().min(1).describe("Search query text"),
					limit: z.number().min(1).max(50).default(10),
					includeSummary: z.boolean().default(true),
					includeFullDocs: z.boolean().default(false),
					containerTags: z.array(z.string()).optional(),
					scopedDocumentIds: z.array(z.string()).optional(),
				}),
				async ({
					query,
					limit,
					includeSummary,
					includeFullDocs,
					containerTags,
					scopedDocumentIds,
				}) => {
					try {
						const response = await searchDocuments(client, orgId, {
							q: query,
							limit,
							includeSummary,
							includeFullDocs,
							chunkThreshold: 0.1,
							documentThreshold: 0.1,
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

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										{
											count: response.total,
											results: response.results.map((item) => ({
												documentId: safeString(item.documentId),
												title: safeString(item.title),
												score: item.score ?? undefined,
												url: safeString(
													item.metadata && typeof item.metadata === "object"
														? (item.metadata as Record<string, unknown>).url
														: undefined,
												),
												summary: safeString(item.summary),
											})),
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
