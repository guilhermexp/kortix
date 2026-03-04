import type { SupabaseClient } from "@supabase/supabase-js"
import { searchDocuments } from "../routes/search"

export type SearchToolParams = {
	query: string
	limit?: number
	includeSummary?: boolean
	includeFullDocs?: boolean
	containerTags?: string[]
	scopedDocumentIds?: string[]
	chunkThreshold?: number
	documentThreshold?: number
	onlyMatchingChunks?: boolean
}

export type SearchToolResultItem = {
	documentId?: string
	title?: string
	type?: string
	score?: number
	url?: string
	createdAt?: string
	updatedAt?: string
	summary?: string
	content?: string
	metadata?: Record<string, unknown>
	chunks?: Array<{ content?: string; score?: number }>
}

export type SearchToolResult = {
	query: string
	total: number
	returned: number
	timing: number
	results: SearchToolResultItem[]
}

function safeString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined
}

export async function executeStructuredSearch(
	client: SupabaseClient,
	orgId: string,
	params: SearchToolParams,
): Promise<SearchToolResult> {
	const response = await searchDocuments(client, orgId, {
		q: params.query,
		limit: params.limit ?? 10,
		includeSummary: params.includeSummary ?? true,
		includeFullDocs: params.includeFullDocs ?? false,
		chunkThreshold: params.chunkThreshold ?? 0,
		documentThreshold: params.documentThreshold ?? 0,
		onlyMatchingChunks: params.onlyMatchingChunks ?? false,
		containerTags: params.containerTags,
		scopedDocumentIds: params.scopedDocumentIds,
	})

	const results: SearchToolResultItem[] = response.results.map((item) => ({
		documentId: safeString(item.documentId),
		title: safeString(item.title),
		type: safeString(item.type),
		score: typeof item.score === "number" ? item.score : undefined,
		url:
			safeString((item as Record<string, unknown>).url) ??
			safeString(
				item.metadata && typeof item.metadata === "object"
					? ((item.metadata as Record<string, unknown>).url ??
							(item.metadata as Record<string, unknown>).originalUrl)
					: undefined,
			),
		createdAt: safeString(item.createdAt),
		updatedAt: safeString(item.updatedAt),
		summary: safeString(item.summary),
		content:
			(params.includeFullDocs ?? false) && typeof item.content === "string"
				? item.content
				: undefined,
		metadata:
			item.metadata && typeof item.metadata === "object"
				? (item.metadata as Record<string, unknown>)
				: undefined,
		chunks: Array.isArray(item.chunks)
			? item.chunks.map((chunk) => ({
					content: safeString(chunk.content),
					score: typeof chunk.score === "number" ? chunk.score : undefined,
				}))
			: undefined,
	}))

	return {
		query: params.query,
		total: response.total,
		returned: results.length,
		timing: response.timing,
		results,
	}
}

export function formatStructuredSearchForHumans(
	payload: SearchToolResult,
	options?: { maxResults?: number; maxChunksPerResult?: number },
): string {
	const maxResults = options?.maxResults ?? 5
	const maxChunksPerResult = options?.maxChunksPerResult ?? 2
	const top = payload.results.slice(0, maxResults)

	if (top.length === 0) return "No results found."

	return top
		.map((result, index) => {
			const lines: string[] = []
			const title = result.title ?? `Result ${index + 1}`
			lines.push(`${index + 1}. ${title}`)
			if (typeof result.score === "number") {
				lines.push(`   Relevance: ${(result.score * 100).toFixed(1)}%`)
			}
			if (result.url) {
				lines.push(`   URL: ${result.url}`)
			}
			if (result.summary) {
				lines.push(`   Summary: ${result.summary}`)
			}
			if (Array.isArray(result.chunks)) {
				for (const chunk of result.chunks.slice(0, maxChunksPerResult)) {
					if (chunk.content) lines.push(`   • ${chunk.content}`)
				}
			}
			return lines.join("\n")
		})
		.join("\n\n")
}
