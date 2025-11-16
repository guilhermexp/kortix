import { SearchRequestSchema, SearchResponseSchema } from "@repo/validation/api"
import type { SupabaseClient } from "@supabase/supabase-js"
import { env } from "../env"
import {
	cosineSimilarity,
	ensureVectorSize,
	generateDeterministicEmbedding,
} from "../services/embedding"
import { generateEmbedding } from "../services/embedding-provider"
import { rerankSearchResults } from "../services/rerank"

type DocumentRow = {
	id: string
	title: string | null
	type: string | null
	content: string | null
	summary: string | null
	metadata: Record<string, unknown> | null
	created_at: string
	updated_at: string | null
	status: string | null
}

type ChunkRow = {
	id: string
	document_id: string
	content: string
	metadata: Record<string, unknown> | null
	documents: DocumentRow | null
	distance?: number | string | null
	embedding?: number[] | null
}

function formatEmbeddingForSql(values: number[]): string {
	const sanitized = values.map((value) => {
		if (!Number.isFinite(value)) return "0"
		const rounded = Math.abs(value) < 1e-6 ? 0 : value
		return Number(rounded.toFixed(6)).toString()
	})
	return `[${sanitized.join(",")}]`
}

export async function searchDocuments(
	client: SupabaseClient,
	orgId: string,
	body: unknown,
) {
	const payload = SearchRequestSchema.parse(body)
	const start = Date.now()

	const queryEmbedding = await generateEmbedding(payload.q)
	const baseLimit = Math.max(50, (payload.limit ?? 10) * 8)

	let chunkRows: ChunkRow[] = []
	let vectorQueryUsed = false
	let searchPath:
		| "rpc_vector"
		| "fallback_local"
		| "raw_no_scores"
		| "broad_recent"
		| "none" = "none"

	// Try RPC vector search first (fast & relevant)
	try {
		const embeddingString = `[${queryEmbedding.join(",")}]`
		// Call the 3-parameter RPC variant present in DB: (limit_param, org_id_param, query_embedding)
		const { data: rpcData, error: rpcError } = await client.rpc(
			"search_chunks_vector",
			{
				limit_param: baseLimit,
				org_id_param: orgId,
				query_embedding: embeddingString,
			},
		)

		if (rpcError) throw rpcError
		if (Array.isArray(rpcData) && rpcData.length > 0) {
			// Get unique document IDs
			const documentIds = [
				...new Set(rpcData.map((row: any) => row.document_id)),
			]

			// Fetch documents separately
			const { data: docsData } = await client
				.from("documents")
				.select(
					"id, title, type, content, summary, metadata, created_at, updated_at, status",
				)
				.in("id", documentIds)

			const docsMap = new Map((docsData || []).map((doc: any) => [doc.id, doc]))

			chunkRows = (rpcData as any[]).map((row) => ({
				id: row.id,
				document_id: row.document_id,
				content: row.content,
				metadata: row.metadata,
				documents: docsMap.get(row.document_id) || null,
				distance:
					typeof row.similarity === "number" ? 1 - row.similarity : undefined,
			}))
			vectorQueryUsed = true
			searchPath = "rpc_vector"
		}
	} catch (rpcErr) {
		console.warn(
			"RPC vector search failed, falling back to local similarity",
			rpcErr,
		)

		try {
			let builder = client
				.from("document_chunks")
				.select(
					"id, document_id, content, metadata, documents(id, title, type, content, summary, metadata, created_at, updated_at, status), embedding",
				)
				.eq("org_id", orgId)
				.limit(baseLimit)

			if (payload.docId) builder = builder.eq("document_id", payload.docId)

			const { data, error } = await builder
			if (error) throw error
			if (Array.isArray(data)) {
				chunkRows = (data as ChunkRow[]).map((chunk) => {
					if (Array.isArray(chunk.embedding)) {
						const embedding = ensureVectorSize(chunk.embedding)
						const distance = 1 - cosineSimilarity(queryEmbedding, embedding)
						return { ...chunk, distance }
					}
					return chunk
				})
				vectorQueryUsed = true
				searchPath = "fallback_local"
			}
		} catch (fallbackError) {
			console.warn(
				"Local similarity fallback failed, loading raw chunks without scores",
				fallbackError,
			)

			let fallbackBuilder = client
				.from("document_chunks")
				.select(
					"id, document_id, content, metadata, embedding, documents(id, title, type, content, summary, metadata, created_at, updated_at, status)",
				)
				.eq("org_id", orgId)
				.limit(baseLimit)

			if (payload.docId)
				fallbackBuilder = fallbackBuilder.eq("document_id", payload.docId)

			const { data: fallbackData2 } = await fallbackBuilder
			if (Array.isArray(fallbackData2)) {
				chunkRows = fallbackData2 as ChunkRow[]
				searchPath = "raw_no_scores"
			}
		}
	}

	const containerTagsFilter = payload.containerTags ?? []
	const scopedDocumentIds = payload.scopedDocumentIds ?? []
	const chunkThreshold = payload.chunkThreshold ?? 0
	const documentThreshold = payload.documentThreshold ?? 0

	const onlyMatchingChunks = payload.onlyMatchingChunks ?? true

	const chunkResults = chunkRows
		.map((chunk) => {
			const doc = chunk.documents
			if (!doc) return null

			const docMetadata = doc.metadata ?? {}
			const chunkMetadata = chunk.metadata ?? {}
			const docContainerTags = Array.isArray(docMetadata.containerTags)
				? docMetadata.containerTags
				: Array.isArray(chunkMetadata.containerTags)
					? chunkMetadata.containerTags
					: []

			if (
				containerTagsFilter.length > 0 &&
				!containerTagsFilter.some((tag) => docContainerTags.includes(tag))
			) {
				return null
			}

			// Filter by scoped document IDs if specified (canvas mode)
			if (scopedDocumentIds.length > 0 && !scopedDocumentIds.includes(doc.id)) {
				return null
			}

			let score: number | null = null

			if (
				vectorQueryUsed &&
				chunk.distance !== undefined &&
				chunk.distance !== null
			) {
				const distance = Number(chunk.distance)
				if (Number.isFinite(distance)) {
					score = Math.max(0, Math.min(1, 1 - distance))
				}
			}

			if (score === null) {
				const embedding = Array.isArray(chunk.embedding)
					? ensureVectorSize(chunk.embedding)
					: generateDeterministicEmbedding(chunk.content)
				score = cosineSimilarity(queryEmbedding, embedding)
			}

			return {
				chunkId: chunk.id,
				documentId: chunk.document_id,
				content: chunk.content,
				metadata: chunk.metadata ?? null,
				doc,
				docContainerTags,
				score,
			}
		})
		.filter((item): item is NonNullable<typeof item> => item !== null)

	const grouped = new Map<
		string,
		{
			doc: (typeof chunkResults)[number]["doc"]
			docContainerTags: string[]
			chunks: Array<{ content: string; score: number }>
			bestScore: number
		}
	>()

	for (const chunk of chunkResults) {
		if (!grouped.has(chunk.documentId)) {
			grouped.set(chunk.documentId, {
				doc: chunk.doc,
				docContainerTags: chunk.docContainerTags,
				chunks: [],
				bestScore: -1,
			})
		}

		const entry = grouped.get(chunk.documentId)
		if (!entry) continue
		entry.chunks.push({ content: chunk.content, score: chunk.score })
		entry.bestScore = Math.max(entry.bestScore, chunk.score)
	}

	let sorted = Array.from(grouped.values()).filter(
		(entry) => entry.bestScore >= documentThreshold,
	)

	// Apply recency boost if enabled
	let recencyApplied = false
	if (env.ENABLE_RECENCY_BOOST && sorted.length > 0) {
		const now = Date.now()
		const alpha = 1 - env.RECENCY_WEIGHT // Weight for semantic score
		const halfLifeDays = env.RECENCY_HALF_LIFE_DAYS

		sorted = sorted
			.map((entry) => {
				const createdAt = new Date(entry.doc.created_at).getTime()
				const ageInDays = (now - createdAt) / (1000 * 60 * 60 * 24)
				const recencyScore = Math.exp(-ageInDays / halfLifeDays)
				const finalScore =
					alpha * entry.bestScore + env.RECENCY_WEIGHT * recencyScore

				return { ...entry, finalScore, recencyScore }
			})
			.sort((a, b) => b.finalScore - a.finalScore)
		recencyApplied = true
	} else {
		sorted = sorted.sort((a, b) => b.bestScore - a.bestScore)
	}

	sorted = sorted.slice(0, payload.limit ?? 10)

	let results = sorted.map((entry) => {
		const doc = entry.doc
		const sortedChunks = entry.chunks
			.filter((chunk) => chunk.score >= chunkThreshold)
			.sort((a, b) => b.score - a.score)
			.slice(0, onlyMatchingChunks ? 1 : Math.min(3, entry.chunks.length))

		return {
			documentId: doc.id,
			createdAt: doc.created_at,
			updatedAt: doc.updated_at,
			metadata: doc.metadata ?? null,
			title: doc.title ?? null,
			type: doc.type ?? null,
			score: entry.bestScore,
			summary: payload.includeSummary ? (doc.summary ?? null) : null,
			content: payload.includeFullDocs ? (doc.content ?? null) : null,
			chunks: sortedChunks.map((chunk) => ({
				content: chunk.content,
				isRelevant: true,
				score: chunk.score,
			})),
		}
	})

	// Apply Cohere re-ranking if enabled and API key is available
	let reranked = false
	if (env.ENABLE_RERANKING && env.COHERE_API_KEY && results.length > 1) {
		results = await rerankSearchResults(payload.q, results, {
			useTitle: true,
			useSummary: true,
			useChunks: true,
			useContent: false, // Don't use full content to keep context small
			maxLength: 512,
		})
		reranked = true
	}

	// Broad fallback: if no results, return recent documents (scoped) to support
	// generic queries like "what do I have in this project?"
	if (results.length === 0) {
		try {
			const containerTagsFilter = payload.containerTags ?? []
			let docsData: DocumentRow[] | null = null

			if (containerTagsFilter.length > 0) {
				// Resolve docs via spaces/container_tag mapping for reliability
				const { data: spaces } = await client
					.from("spaces")
					.select("id, container_tag")
					.eq("organization_id", orgId)
					.in("container_tag", containerTagsFilter)

				const spaceIds = Array.isArray(spaces)
					? spaces.map((s: any) => s.id)
					: []

				if (spaceIds.length > 0) {
					const { data } = await client
						.from("documents")
						.select(
							"id, title, type, content, summary, metadata, created_at, updated_at, status",
						)
						.eq("org_id", orgId)
						.in("space_id", spaceIds)
						.order("created_at", { ascending: false })
						.limit(Math.max(20, payload.limit ?? 10))
					if (Array.isArray(data)) docsData = data as any
				}
			}

			if (!docsData) {
				// Fallback to recent docs without mapping (global)
				const { data } = await client
					.from("documents")
					.select(
						"id, title, type, content, summary, metadata, created_at, updated_at, status",
					)
					.eq("org_id", orgId)
					.order("created_at", { ascending: false })
					.limit(Math.max(20, payload.limit ?? 10))
				if (Array.isArray(data)) docsData = data as any
			}

			if (Array.isArray(docsData)) {
				const limited = docsData.slice(0, payload.limit ?? 10)
				results = limited.map((doc) => ({
					documentId: doc.id,
					createdAt: doc.created_at,
					updatedAt: doc.updated_at,
					metadata: doc.metadata ?? null,
					title: doc.title ?? null,
					type: doc.type ?? null,
					score: 0.1,
					summary: payload.includeSummary ? (doc.summary ?? null) : null,
					content: payload.includeFullDocs ? (doc.content ?? null) : null,
					chunks: [],
				}))
				searchPath = "broad_recent"
			}
		} catch {}
	}
	const response = SearchResponseSchema.parse({
		results,
		timing: Date.now() - start,
		total: results.length,
	})

	// Lightweight search telemetry for debugging
	try {
		const topTitles = results.slice(0, 3).map((r) => r.title ?? r.documentId)
		console.info("Search debug", {
			path: searchPath,
			recencyApplied,
			reranked,
			requestedLimit: payload.limit ?? 10,
			returned: results.length,
			timingMs: response.timing,
			sample: topTitles,
		})
	} catch {}

	return response
}
