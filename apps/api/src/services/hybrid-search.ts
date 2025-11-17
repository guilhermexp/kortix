import type { SupabaseClient } from "@supabase/supabase-js"
import { env } from "../env"
import { generateEmbedding } from "./embedding-provider"
import { rerankSearchResults } from "./rerank"

/**
 * Escape special characters for PostgreSQL ILIKE pattern matching
 * Prevents SQL injection via pattern matching attacks
 */
function escapeIlike(str: string): string {
	return str.replace(/[%_\\]/g, "\\$&")
}

export interface HybridSearchOptions {
	query: string
	orgId: string
	limit?: number
	mode?: "vector" | "keyword" | "hybrid"
	weightVector?: number // 0-1, how much to weight vector search vs keyword
	includeSummary?: boolean
	includeFullDocs?: boolean
	documentId?: string
	containerTags?: string[]
	categoriesFilter?: string[]
	rerankResults?: boolean
}

interface SearchResult {
	documentId: string
	title: string | null
	type: string | null
	content: string | null
	summary: string | null
	metadata: Record<string, any> | null
	score: number
	chunks: Array<{
		content: string
		score: number
	}>
	createdAt: string
	updatedAt: string | null
}

/**
 * Perform keyword-based full-text search using PostgreSQL's text search capabilities
 */
async function keywordSearch(
	client: SupabaseClient,
	orgId: string,
	query: string,
	limit = 20,
): Promise<SearchResult[]> {
	// Convert query to tsquery format
	// This handles phrases and logical operators
	const tsQuery = query
		.split(/\s+/)
		.filter((term) => term.length > 0)
		.map((term) => `${term}:*`) // Add prefix matching
		.join(" & ") // AND operator between terms

	// First, search in document content and metadata
	const { data: docResults, error: docError } = await client
		.rpc("search_documents_fulltext", {
			search_query: tsQuery,
			org_id_param: orgId,
			limit_param: limit,
		})
		.select("*")

	if (docError) {
		console.warn("Keyword document search failed", docError)
		// Fallback to simple ILIKE search
		const { data: fallback } = await client
			.from("documents")
			.select(
				`
				id,
				title,
				type,
				content,
				summary,
				metadata,
				created_at,
				updated_at,
				document_chunks!inner(
					id,
					content,
					metadata
				)
			`,
			)
			.eq("org_id", orgId)
			.or(
				`title.ilike.%${escapeIlike(query)}%,content.ilike.%${escapeIlike(query)}%,summary.ilike.%${escapeIlike(query)}%`,
			)
			.limit(limit)

		return formatDocumentResults(fallback || [])
	}

	// Also search in chunks for more granular results
	const { data: chunkResults, error: chunkError } = await client
		.rpc("search_chunks_fulltext", {
			search_query: tsQuery,
			org_id_param: orgId,
			limit_param: limit * 3, // Get more chunks to aggregate
		})
		.select(`
			id,
			document_id,
			content,
			metadata,
			documents(
				id,
				title,
				type,
				content,
				summary,
				metadata,
				created_at,
				updated_at
			)
		`)

	if (chunkError) {
		console.warn("Keyword chunk search failed", chunkError)
	}

	// Combine and deduplicate results
	const combinedResults = mergeKeywordResults(
		docResults || [],
		chunkResults || [],
	)

	return combinedResults.slice(0, limit)
}

/**
 * Perform vector similarity search
 */
async function vectorSearch(
	client: SupabaseClient,
	orgId: string,
	query: string,
	embedding: number[],
	limit = 20,
): Promise<SearchResult[]> {
	const embeddingString = `[${embedding.join(",")}]`

	const { data, error } = await client
		.rpc("search_documents_vector", {
			query_embedding: embeddingString,
			org_id_param: orgId,
			limit_param: limit,
			similarity_threshold: 0.1,
		})
		.select(`
			document_id,
			content,
			metadata,
			similarity,
			documents(
				id,
				title,
				type,
				content,
				summary,
				metadata,
				created_at,
				updated_at
			)
		`)

	if (error) {
		console.error("Vector search failed", error)
		return []
	}

	return formatVectorResults(data || [])
}

/**
 * Hybrid search combining vector and keyword search with intelligent fusion
 */
export async function hybridSearch(
	client: SupabaseClient,
	options: HybridSearchOptions,
): Promise<SearchResult[]> {
	const {
		query,
		orgId,
		limit = 10,
		mode = "hybrid",
		weightVector = 0.7,
		rerankResults = true,
	} = options

	let results: SearchResult[] = []

	if (mode === "keyword") {
		// Keyword-only search
		results = await keywordSearch(client, orgId, query, limit * 2)
	} else if (mode === "vector") {
		// Vector-only search
		const embedding = await generateEmbedding(query)
		results = await vectorSearch(client, orgId, query, embedding, limit * 2)
	} else {
		// Hybrid search - run both in parallel
		const embedding = await generateEmbedding(query)

		const [keywordResults, vectorResults] = await Promise.all([
			keywordSearch(client, orgId, query, limit * 2),
			vectorSearch(client, orgId, query, embedding, limit * 2),
		])

		// Reciprocal Rank Fusion (RRF) for combining results
		results = reciprocalRankFusion(keywordResults, vectorResults, weightVector)
	}

	// Apply container tags filter if specified
	if (options.containerTags?.length) {
		results = results.filter((result) => {
			const tags = result.metadata?.containerTags || []
			return options.containerTags!.some((tag) => tags.includes(tag))
		})
	}

	// Apply AI category tags filter if specified
	if (options.categoriesFilter?.length) {
		const wanted = options.categoriesFilter
			.map((s) => s.toLowerCase().trim())
			.filter(Boolean)
		if (wanted.length) {
			results = results.filter((result) => {
				const md = (result.metadata || {}) as Record<string, any>
				let tags: string[] = []
				if (Array.isArray(md.aiTags)) {
					tags = md.aiTags
				} else if (typeof md.aiTagsString === "string") {
					tags = md.aiTagsString
						.split(/[,\n]+/)
						.map((t: string) => t.toLowerCase().trim())
						.filter(Boolean)
				}
				if (!tags.length) return false
				const lower = tags.map((t) => t.toLowerCase().trim())
				return wanted.some((w) => lower.includes(w))
			})
		}
	}

	// Apply document ID filter if specified
	if (options.documentId) {
		results = results.filter((r) => r.documentId === options.documentId)
	}

	// Re-rank results using Cohere if available
	if (
		rerankResults &&
		env.ENABLE_RERANKING &&
		env.COHERE_API_KEY &&
		results.length > 1
	) {
		results = await rerankSearchResults(query, results, {
			useTitle: true,
			useSummary: true,
			useChunks: true,
			maxLength: 512,
		})
	}

	// Apply final limit
	results = results.slice(0, limit)

	// Clean up results based on options
	if (!options.includeSummary) {
		results = results.map((r) => ({ ...r, summary: null }))
	}
	if (!options.includeFullDocs) {
		results = results.map((r) => ({ ...r, content: null }))
	}

	return results
}

/**
 * Reciprocal Rank Fusion algorithm for combining search results
 */
function reciprocalRankFusion(
	list1: SearchResult[],
	list2: SearchResult[],
	weight1 = 0.5,
	k = 60,
): SearchResult[] {
	const scores = new Map<string, number>()
	const documents = new Map<string, SearchResult>()

	// Process first list (keyword or vector)
	list1.forEach((doc, rank) => {
		const id = doc.documentId
		const rrfScore = weight1 * (1 / (k + rank + 1))
		scores.set(id, (scores.get(id) || 0) + rrfScore)
		documents.set(id, doc)
	})

	// Process second list
	const weight2 = 1 - weight1
	list2.forEach((doc, rank) => {
		const id = doc.documentId
		const rrfScore = weight2 * (1 / (k + rank + 1))
		scores.set(id, (scores.get(id) || 0) + rrfScore)

		// Keep document with higher individual score
		if (!documents.has(id) || doc.score > documents.get(id)!.score) {
			documents.set(id, doc)
		}
	})

	// Sort by RRF score
	const sortedIds = Array.from(scores.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([id]) => id)

	return sortedIds
		.map((id) => {
			const doc = documents.get(id)!
			return {
				...doc,
				score: scores.get(id)!, // Use RRF score
			}
		})
		.filter((doc) => doc !== undefined)
}

/**
 * Format document results from different search types
 */
function formatDocumentResults(docs: any[]): SearchResult[] {
	return docs.map((doc) => ({
		documentId: doc.id,
		title: doc.title,
		type: doc.type,
		content: doc.content,
		summary: doc.summary,
		metadata: doc.metadata || {},
		score: doc.rank_score || doc.similarity || 0.5,
		chunks:
			doc.document_chunks?.map((chunk: any) => ({
				content: chunk.content,
				score: chunk.similarity || 0.5,
			})) || [],
		createdAt: doc.created_at,
		updatedAt: doc.updated_at,
	}))
}

function formatVectorResults(results: any[]): SearchResult[] {
	return results.map((result) => ({
		documentId: result.document_id || result.documents?.id,
		title: result.documents?.title,
		type: result.documents?.type,
		content: result.documents?.content,
		summary: result.documents?.summary,
		metadata: result.documents?.metadata || {},
		score: result.similarity || 0.5,
		chunks: [
			{
				content: result.content,
				score: result.similarity || 0.5,
			},
		],
		createdAt: result.documents?.created_at,
		updatedAt: result.documents?.updated_at,
	}))
}

function mergeKeywordResults(
	docResults: any[],
	chunkResults: any[],
): SearchResult[] {
	const merged = new Map<string, SearchResult>()

	// Add document results
	for (const doc of docResults) {
		merged.set(doc.id, formatDocumentResults([doc])[0])
	}

	// Enhance with chunk results
	for (const chunk of chunkResults) {
		const docId = chunk.document_id
		if (merged.has(docId)) {
			const existing = merged.get(docId)!
			existing.chunks.push({
				content: chunk.content,
				score: chunk.rank_score || 0.5,
			})
		} else if (chunk.documents) {
			merged.set(docId, {
				documentId: docId,
				title: chunk.documents.title,
				type: chunk.documents.type,
				content: chunk.documents.content,
				summary: chunk.documents.summary,
				metadata: chunk.documents.metadata || {},
				score: chunk.rank_score || 0.5,
				chunks: [
					{
						content: chunk.content,
						score: chunk.rank_score || 0.5,
					},
				],
				createdAt: chunk.documents.created_at,
				updatedAt: chunk.documents.updated_at,
			})
		}
	}

	return Array.from(merged.values()).sort((a, b) => b.score - a.score)
}
