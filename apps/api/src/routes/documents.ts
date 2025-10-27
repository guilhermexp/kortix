import {
	DocumentsWithMemoriesQuerySchema,
	DocumentsWithMemoriesResponseSchema,
	ListMemoriesQuerySchema,
	ListMemoriesResponseSchema,
	MemoryAddSchema,
	MemoryResponseSchema,
	MigrateMCPRequestSchema,
	MigrateMCPResponseSchema,
} from "@repo/validation/api"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { processDocument } from "../services/ingestion"

const defaultContainerTag = "sm_project_default"
const RUN_SYNC_INGESTION = (process.env.INGESTION_MODE ?? "sync") === "sync"
const ALLOWED_DOCUMENT_TYPES = new Set([
	"text",
	"pdf",
	"tweet",
	"google_doc",
	"google_slide",
	"google_sheet",
	"image",
	"video",
	"notion_doc",
	"webpage",
	"onedrive",
	"repository",
])

type DocumentSpaceRelation = {
	space_id?: string | null
	spaces?: { container_tag?: string | null } | null
}

type ProcessingMetadata = {
	startTime?: number
	steps?: unknown
} & Record<string, unknown>

type MemoryRow = {
	id: string
	document_id: string
	space_id: string | null
	org_id: string
	user_id: string | null
	content: string | null
	metadata: Record<string, unknown> | null
	memory_embedding: number[] | null
	memory_embedding_model: string | null
	memory_embedding_new: number[] | null
	memory_embedding_new_model: string | null
	is_latest: boolean | null
	version: number | null
	is_inference: boolean | null
	is_forgotten: boolean | null
	forget_after: string | null
	forget_reason: string | null
	source_count: number | null
	created_at: string
	updated_at: string
}

function isDocumentSpaceRelation(
	value: unknown,
): value is DocumentSpaceRelation {
	if (value === null || typeof value !== "object") return false
	const relation = value as Record<string, unknown>
	const spaceId = relation.space_id
	const spaces = relation.spaces
	const spaceIdValid =
		spaceId === undefined || spaceId === null || typeof spaceId === "string"
	const spacesValid =
		spaces === undefined ||
		spaces === null ||
		(typeof spaces === "object" &&
			(!("container_tag" in spaces) ||
				(spaces as { container_tag?: unknown }).container_tag === null ||
				typeof (spaces as { container_tag?: unknown }).container_tag ===
					"string"))
	return spaceIdValid && spacesValid
}

function extractContainerTags(relations: unknown): string[] {
	if (!Array.isArray(relations)) return []
	return relations
		.filter(isDocumentSpaceRelation)
		.map((relation) => relation.spaces?.container_tag)
		.filter((tag): tag is string => typeof tag === "string" && tag.length > 0)
}

function extractSpaceIds(relations: unknown): string[] {
	if (!Array.isArray(relations)) return []
	return relations
		.filter(isDocumentSpaceRelation)
		.map((relation) => relation.space_id)
		.filter((id): id is string => typeof id === "string" && id.length > 0)
}

function normalizeProcessingMetadata(value: unknown):
	| (ProcessingMetadata & {
			startTime: number
			steps: unknown[]
	  })
	| null {
	if (value === null || value === undefined || typeof value !== "object") {
		return null
	}

	const record = value as ProcessingMetadata
	const startTime =
		typeof record.startTime === "number" && Number.isFinite(record.startTime)
			? record.startTime
			: Date.now()
	const stepsArray = Array.isArray(record.steps) ? record.steps : []

	return {
		startTime,
		steps: stepsArray,
		...record,
	}
}

const DocumentDetailSchema = z.object({
	id: z.string(),
	status: z.string().default("unknown"),
	content: z.string().nullable().optional(),
	summary: z.string().nullable().optional(),
	metadata: z.record(z.string(), z.unknown()).nullable().optional(),
	containerTags: z.array(z.string()).default([]),
	createdAt: z.string(),
	updatedAt: z.string(),
	memoryEntries: z
		.array(
			z.object({
				id: z.string(),
				content: z.string().nullable().optional(),
				metadata: z.record(z.string(), z.unknown()).nullable().optional(),
				createdAt: z.string(),
				updatedAt: z.string(),
			}),
		)
		.default([]),
})

type SortKey = "createdAt" | "updatedAt" | undefined

function resolveSortColumn(sort: SortKey) {
	if (sort === "updatedAt") {
		return "updated_at"
	}
	return "created_at"
}

export const DocumentsByIdsSchema = z.object({
	ids: z.array(z.string()).min(1),
	by: z.enum(["id", "customId"]).optional().default("id"),
	containerTags: z.array(z.string()).optional(),
})

export type MemoryAddInput = z.infer<typeof MemoryAddSchema>
export type ListMemoriesInput = z.infer<typeof ListMemoriesQuerySchema>
export type DocumentsQueryInput = z.infer<
	typeof DocumentsWithMemoriesQuerySchema
>
export type DocumentsByIdsInput = z.infer<typeof DocumentsByIdsSchema>

export async function getDocument(
	client: SupabaseClient,
	organizationId: string,
	documentId: string,
) {
	const { data: document, error } = await client
		.from("documents")
		.select(
			"id, status, content, summary, metadata, created_at, updated_at, documents_to_spaces(space_id, spaces(container_tag))",
		)
		.eq("org_id", organizationId)
		.eq("id", documentId)
		.maybeSingle()

	if (error) throw error
	if (!document) return null

	const containerTags = extractContainerTags(document.documents_to_spaces)

	const { data: memories, error: memoriesError } = await client
		.from("memories")
		.select("id, content, metadata, created_at, updated_at")
		.eq("org_id", organizationId)
		.eq("document_id", documentId)
		.order("created_at", { ascending: true })

	if (memoriesError) throw memoriesError

	return DocumentDetailSchema.parse({
		id: document.id,
		status: document.status ?? "unknown",
		content: document.content ?? null,
		summary: document.summary ?? null,
		metadata: document.metadata ?? null,
		containerTags,
		createdAt: document.created_at,
		updatedAt: document.updated_at,
		// Transform memory entries: database 'content' → API 'memory'
		memoryEntries: (memories ?? []).map((row) => ({
			id: row.id,
			memory: row.content ?? "", // API field (backward compatibility)
			metadata: row.metadata ?? null,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		})),
	})
}

export async function ensureSpace(
	client: SupabaseClient,
	organizationId: string,
	containerTag: string,
) {
	const { data: existing, error: fetchError } = await client
		.from("spaces")
		.select("id, name")
		.eq("organization_id", organizationId)
		.eq("container_tag", containerTag)
		.maybeSingle()

	if (fetchError) throw fetchError
	if (existing) return existing.id

	const name =
		containerTag
			.replace(/^sm_project_/, "")
			.replace(/[_-]+/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase()) || "Untitled"

	const { data: created, error: insertError } = await client
		.from("spaces")
		.insert({
			organization_id: organizationId,
			container_tag: containerTag,
			name,
		})
		.select("id")
		.single()

	if (insertError) throw insertError
	return created.id
}

export async function addDocument({
	organizationId,
	userId,
	payload,
	client,
}: {
	organizationId: string
	userId: string
	payload: MemoryAddInput
	client: SupabaseClient
}) {
	const parsed = MemoryAddSchema.parse(payload)
	const rawContent = parsed.content?.trim()

	if (!rawContent) {
		throw new Error("Content is required to create a document")
	}

	const [containerTag] =
		parsed.containerTags && parsed.containerTags.length > 0
			? parsed.containerTags
			: [defaultContainerTag]
	const spaceId = await ensureSpace(client, organizationId, containerTag)

	const isUrl = /^https?:\/\//i.test(rawContent)
	const baseMetadata: Record<string, unknown> = {
		...(parsed.metadata ?? {}),
	}
	if (isUrl) {
		baseMetadata.originalUrl = rawContent
	}
	const metadata = Object.keys(baseMetadata).length > 0 ? baseMetadata : null

	const inferredType =
		(parsed.metadata?.type as string | undefined) ?? (isUrl ? "url" : "text")
	const inferredSource =
		(parsed.metadata?.source as string | undefined) ??
		(isUrl ? "web" : "manual")
	const inferredUrl = isUrl
		? rawContent
		: ((parsed.metadata?.url as string | undefined) ?? null)
	const initialTitle =
		parsed.metadata?.title ??
		(isUrl ? null : rawContent.slice(0, 80)) ??
		"Untitled"
	const initialContent = isUrl ? null : rawContent

	const { data: document, error: insertError } = await client
		.from("documents")
		.insert({
			org_id: organizationId,
			user_id: userId,
			title: initialTitle,
			content: initialContent,
			url: inferredUrl,
			source: inferredSource,
			status: "queued",
			type: inferredType,
			metadata,
			chunk_count: 0,
		})
		.select("id, status")
		.single()

	if (insertError) throw insertError

	const docId = document.id

	const mappings = client.from("documents_to_spaces").insert({
		document_id: docId,
		space_id: spaceId,
	})

	const jobInsertion = client
		.from("ingestion_jobs")
		.insert({
			document_id: docId,
			org_id: organizationId,
			status: "queued",
			payload: {
				containerTags: parsed.containerTags ?? [containerTag],
				content: rawContent,
				metadata,
				url: inferredUrl,
				type: inferredType,
				source: inferredSource,
			},
		})
		.select("id")
		.single()

	const { error: mappingError } = await mappings
	if (mappingError) throw mappingError

	const { data: jobRecord, error: jobError } = await jobInsertion
	if (jobError) throw jobError

	const jobId = jobRecord?.id

	if (RUN_SYNC_INGESTION && jobId) {
		const processingResult = await processDocument({
			documentId: docId,
			organizationId,
			userId,
			spaceId,
			containerTags: parsed.containerTags ?? [containerTag],
			jobId,
			document: {
				content: initialContent,
				metadata,
				title: initialTitle,
				url: inferredUrl,
				source: inferredSource,
				type: inferredType,
				raw: null,
				processingMetadata: null,
			},
			jobPayload: {
				containerTags: parsed.containerTags ?? [containerTag],
				content: rawContent,
				metadata,
				url: inferredUrl,
				type: inferredType,
				source: inferredSource,
			},
		})

		return MemoryResponseSchema.parse({
			id: docId,
			status: processingResult.status,
		})
	}

	return MemoryResponseSchema.parse({ id: docId, status: "queued" })
}

export async function listDocuments(
	client: SupabaseClient,
	organizationId: string,
	input: Partial<ListMemoriesInput> = {},
) {
	const query = ListMemoriesQuerySchema.partial({ filters: true }).parse(input)
	const page = query.page ?? 1
	const limit = query.limit ?? 10
	const offset = (page - 1) * limit
	const sortColumn = resolveSortColumn(query.sort)

	const { data, error, count } = await client
		.from("documents")
		.select(
			"id, custom_id, connection_id, title, summary, status, type, metadata, created_at, updated_at, documents_to_spaces(space_id, spaces(container_tag))",
			{ count: "exact" },
		)
		.eq("org_id", organizationId)
		.order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
		.range(offset, offset + limit - 1)

	if (error) throw error

	const filtered = (data ?? []).filter((doc) => {
		if (!query.containerTags || query.containerTags.length === 0) return true
		const tags = extractContainerTags(doc.documents_to_spaces)
		return query.containerTags?.some((tag) => tags.includes(tag))
	})

	const memories = filtered.map((doc) => ({
		id: doc.id,
		customId: doc.custom_id ?? null,
		connectionId: doc.connection_id ?? null,
		title: doc.title ?? null,
		summary: doc.summary ?? null,
		status: doc.status ?? "unknown",
		type: doc.type ?? "text",
		metadata: doc.metadata ?? null,
		containerTags: extractContainerTags(doc.documents_to_spaces),
		createdAt: doc.created_at,
		updatedAt: doc.updated_at,
	}))

	const totalItems =
		query.containerTags && query.containerTags.length > 0
			? memories.length
			: (count ?? memories.length)

	return ListMemoriesResponseSchema.parse({
		memories,
		pagination: {
			currentPage: page,
			limit,
			totalItems,
			totalPages: Math.max(1, Math.ceil(totalItems / limit)),
		},
	})
}

export async function listDocumentsWithMemories(
    client: SupabaseClient,
    organizationId: string,
    input: DocumentsQueryInput,
) {
    const query = DocumentsWithMemoriesQuerySchema.parse(input)
    const page = query.page ?? 1
    const limit = query.limit ?? 10
    const offset = (page - 1) * limit
    const sortColumn = resolveSortColumn(query.sort)

    // When filtering by containerTags (projects), constrain at SQL level
    // to avoid empty pages due to post-filtering after pagination.
    let data: any[] | null = null
    let count: number | null = null

    if (query.containerTags && query.containerTags.length > 0) {
        // Resolve spaces matching the requested container tags
        const { data: spaces } = await client
            .from("spaces")
            .select("id")
            .eq("organization_id", organizationId)
            .in("container_tag", query.containerTags)

        const spaceIds = Array.isArray(spaces) ? spaces.map((s: any) => s.id) : []

        if (spaceIds.length === 0) {
            // No spaces for these tags → empty result
            return DocumentsWithMemoriesResponseSchema.parse({
                documents: [],
                pagination: {
                    currentPage: page,
                    limit,
                    totalItems: 0,
                    totalPages: 1,
                },
            })
        }

        // Find document IDs that belong to these spaces
        const { data: mappings } = await client
            .from("documents_to_spaces")
            .select("document_id")
            .in("space_id", spaceIds)

        const docIds = Array.isArray(mappings)
            ? [...new Set(mappings.map((m: any) => m.document_id))]
            : []

        if (docIds.length === 0) {
            return DocumentsWithMemoriesResponseSchema.parse({
                documents: [],
                pagination: {
                    currentPage: page,
                    limit,
                    totalItems: 0,
                    totalPages: 1,
                },
            })
        }

        const { data: docs, error: docsErr, count: docsCount } = await client
            .from("documents")
            .select(
                "id, custom_id, content_hash, org_id, user_id, connection_id, title, content, summary, url, source, type, status, metadata, processing_metadata, raw, token_count, word_count, chunk_count, average_chunk_size, summary_embedding, summary_embedding_model, created_at, updated_at, documents_to_spaces(space_id, spaces(container_tag))",
                { count: "exact" },
            )
            .eq("org_id", organizationId)
            .in("id", docIds)
            .order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
            .range(offset, offset + limit - 1)

        if (docsErr) throw docsErr
        data = docs ?? []
        count = docsCount ?? data.length
    } else {
        const { data: docs, error, count: docsCount } = await client
            .from("documents")
            .select(
                "id, custom_id, content_hash, org_id, user_id, connection_id, title, content, summary, url, source, type, status, metadata, processing_metadata, raw, token_count, word_count, chunk_count, average_chunk_size, summary_embedding, summary_embedding_model, created_at, updated_at, documents_to_spaces(space_id, spaces(container_tag))",
                { count: "exact" },
            )
            .eq("org_id", organizationId)
            .order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
            .range(offset, offset + limit - 1)

        if (error) throw error
        data = docs ?? []
        count = docsCount ?? data.length
    }

    const docInfos = (data ?? []).map((doc) => {
        const containerTags = extractContainerTags(doc.documents_to_spaces)
        const spaceIds = extractSpaceIds(doc.documents_to_spaces)

        return { doc, containerTags, spaceIds }
    })

	const docIds = docInfos.map(({ doc }) => doc.id)
	const memoryByDoc = new Map<string, MemoryRow[]>()

	if (docIds.length > 0) {
		const { data: memoryRows, error: memoryError } = await client
			.from("memories")
			.select(
				"id, document_id, space_id, org_id, user_id, content, metadata, memory_embedding, memory_embedding_model, memory_embedding_new, memory_embedding_new_model, is_latest, version, is_inference, is_forgotten, forget_after, forget_reason, source_count, created_at, updated_at",
			)
			.eq("org_id", organizationId)
			.in("document_id", docIds)

		if (memoryError) throw memoryError

		for (const row of (memoryRows ?? []) as MemoryRow[]) {
			const entries = memoryByDoc.get(row.document_id) ?? []
			entries.push(row)
			memoryByDoc.set(row.document_id, entries)
		}
	}

	const documents = docInfos.map(({ doc, containerTags, spaceIds }) => {
		const memoryRows = memoryByDoc.get(doc.id) ?? []

		// Transform database rows to API format (content → memory)
		const memoryEntries = memoryRows.map((row) => ({
			id: row.id,
			documentId: row.document_id, // Added: was missing from response
			memory: row.content ?? "", // API field: transformed from database 'content'
			spaceId: row.space_id ?? spaceIds[0] ?? "",
			orgId: row.org_id,
			userId: row.user_id ?? null,
			version: row.version ?? 1,
			isLatest: row.is_latest ?? true,
			sourceCount: row.source_count ?? 1,
			isInference: row.is_inference ?? false,
			isForgotten: row.is_forgotten ?? false,
			forgetAfter: row.forget_after ?? null,
			forgetReason: row.forget_reason ?? null,
			memoryEmbedding: row.memory_embedding ?? null,
			memoryEmbeddingModel: row.memory_embedding_model ?? null,
			memoryEmbeddingNew: row.memory_embedding_new ?? null,
			memoryEmbeddingNewModel: row.memory_embedding_new_model ?? null,
			metadata: row.metadata ?? null,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			sourceAddedAt: row.created_at,
			sourceRelevanceScore: null,
			sourceMetadata: null,
			spaceContainerTag: containerTags[0] ?? null,
		}))

		// Normalize document type
		let normalizedType = doc.type ?? "text"
		if (normalizedType === "url") {
			normalizedType = "webpage"
		}
		if (!ALLOWED_DOCUMENT_TYPES.has(normalizedType)) {
			normalizedType = "text"
		}

		// Clean metadata to ensure it only contains string/number/boolean values
		const cleanMetadata =
			doc.metadata && typeof doc.metadata === "object"
				? Object.fromEntries(
						Object.entries(doc.metadata as Record<string, unknown>).filter(
							([, value]) =>
								typeof value === "string" ||
								typeof value === "number" ||
								typeof value === "boolean",
						),
					)
				: null

		// Ensure processingMetadata has required fields or set to null
		const cleanProcessingMetadata = normalizeProcessingMetadata(
			doc.processing_metadata,
		)

		return {
			id: doc.id,
			customId: doc.custom_id ?? null,
			contentHash: doc.content_hash ?? null,
			orgId: doc.org_id,
			userId: doc.user_id,
			connectionId: doc.connection_id ?? null,
			title: doc.title ?? null,
			content: doc.content ?? null,
			summary: doc.summary ?? null,
			url: doc.url ?? null,
			source: doc.source ?? null,
			type: normalizedType,
			status: doc.status ?? "unknown",
			metadata: cleanMetadata,
			processingMetadata: cleanProcessingMetadata,
			raw: doc.raw ?? null,
			tokenCount: doc.token_count ?? null,
			wordCount: doc.word_count ?? null,
			chunkCount: doc.chunk_count ?? 0,
			averageChunkSize: doc.average_chunk_size ?? null,
			summaryEmbedding: doc.summary_embedding ?? null,
			summaryEmbeddingModel: doc.summary_embedding_model ?? null,
			createdAt: doc.created_at,
			updatedAt: doc.updated_at,
			memoryEntries,
		}
	})

    const totalItems = count ?? documents.length

	const response = {
		documents,
		pagination: {
			currentPage: page,
			limit,
			totalItems,
			totalPages: Math.max(1, Math.ceil(totalItems / limit)),
		},
	}

	try {
		return DocumentsWithMemoriesResponseSchema.parse(response)
	} catch (zodError) {
		console.error(
			"Zod validation failed for DocumentsWithMemoriesResponse:",
			zodError,
		)
		console.error("Response data:", JSON.stringify(response, null, 2))
		throw zodError
	}
}

export async function listDocumentsWithMemoriesByIds(
	client: SupabaseClient,
	organizationId: string,
	input: DocumentsByIdsInput,
) {
	const query = DocumentsByIdsSchema.parse(input)
	const column = query.by === "customId" ? "custom_id" : "id"

    const { data, error } = await client
        .from("documents")
        .select(
            "id, custom_id, content_hash, org_id, user_id, connection_id, title, content, summary, url, source, type, status, metadata, processing_metadata, raw, og_image, token_count, word_count, chunk_count, average_chunk_size, summary_embedding, summary_embedding_model, created_at, updated_at, documents_to_spaces(space_id, spaces(container_tag))",
        )
		.eq("org_id", organizationId)
		.in(column, query.ids)

	if (error) throw error

	const filtered = (data ?? []).filter((doc) => {
		if (!query.containerTags || query.containerTags.length === 0) return true
		const tags = extractContainerTags(doc.documents_to_spaces)
		return query.containerTags?.some((tag) => tags.includes(tag))
	})

	const docInfos = filtered.map((doc) => {
		const containerTags = extractContainerTags(doc.documents_to_spaces)
		const spaceIds = extractSpaceIds(doc.documents_to_spaces)

		return { doc, containerTags, spaceIds }
	})

	const docIds = docInfos.map(({ doc }) => doc.id)
	const memoryByDoc = new Map<string, MemoryRow[]>()

	if (docIds.length > 0) {
		const { data: memoryRows, error: memoryError } = await client
			.from("memories")
			.select(
				"id, document_id, space_id, org_id, user_id, content, metadata, memory_embedding, memory_embedding_model, memory_embedding_new, memory_embedding_new_model, is_latest, version, is_inference, is_forgotten, forget_after, forget_reason, source_count, created_at, updated_at",
			)
			.eq("org_id", organizationId)
			.in("document_id", docIds)

		if (memoryError) throw memoryError

		for (const row of (memoryRows ?? []) as MemoryRow[]) {
			const entries = memoryByDoc.get(row.document_id) ?? []
			entries.push(row)
			memoryByDoc.set(row.document_id, entries)
		}
	}

	const documents = docInfos.map(({ doc, containerTags, spaceIds }) => {
		const memoryRows = memoryByDoc.get(doc.id) ?? []

		// Transform database rows to API format (content → memory)
		const memoryEntries = memoryRows.map((row) => ({
			id: row.id,
			documentId: row.document_id, // Added: was missing from response
			memory: row.content ?? "", // API field: transformed from database 'content'
			spaceId: row.space_id ?? spaceIds[0] ?? "",
			orgId: row.org_id,
			userId: row.user_id ?? null,
			version: row.version ?? 1,
			isLatest: row.is_latest ?? true,
			sourceCount: row.source_count ?? 1,
			isInference: row.is_inference ?? false,
			isForgotten: row.is_forgotten ?? false,
			forgetAfter: row.forget_after ?? null,
			forgetReason: row.forget_reason ?? null,
			memoryEmbedding: row.memory_embedding ?? null,
			memoryEmbeddingModel: row.memory_embedding_model ?? null,
			memoryEmbeddingNew: row.memory_embedding_new ?? null,
			memoryEmbeddingNewModel: row.memory_embedding_new_model ?? null,
			metadata: row.metadata ?? null,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
			sourceAddedAt: row.created_at,
			sourceRelevanceScore: null,
			sourceMetadata: null,
			spaceContainerTag: containerTags[0] ?? null,
		}))

		// Normalize document type
		let normalizedType = doc.type ?? "text"
		if (normalizedType === "url") {
			normalizedType = "webpage"
		}
		if (!ALLOWED_DOCUMENT_TYPES.has(normalizedType)) {
			normalizedType = "text"
		}

		// Clean metadata to ensure it only contains string/number/boolean values
		const cleanMetadata =
			doc.metadata && typeof doc.metadata === "object"
				? Object.fromEntries(
						Object.entries(doc.metadata as Record<string, unknown>).filter(
							([, value]) =>
								typeof value === "string" ||
								typeof value === "number" ||
								typeof value === "boolean",
						),
					)
				: null

		// Ensure processingMetadata has required fields or set to null
		const cleanProcessingMetadata = normalizeProcessingMetadata(
			doc.processing_metadata,
		)

        return {
            id: doc.id,
            customId: doc.custom_id ?? null,
            contentHash: doc.content_hash ?? null,
            orgId: doc.org_id,
            userId: doc.user_id,
            connectionId: doc.connection_id ?? null,
            title: doc.title ?? null,
            content: doc.content ?? null,
            summary: doc.summary ?? null,
            url: doc.url ?? null,
            source: doc.source ?? null,
            type: normalizedType,
            status: doc.status ?? "unknown",
            metadata: cleanMetadata,
            processingMetadata: cleanProcessingMetadata,
            raw: doc.raw ?? null,
            ogImage: doc.og_image ?? null,
            tokenCount: doc.token_count ?? null,
            wordCount: doc.word_count ?? null,
            chunkCount: doc.chunk_count ?? 0,
            averageChunkSize: doc.average_chunk_size ?? null,
            summaryEmbedding: doc.summary_embedding ?? null,
			summaryEmbeddingModel: doc.summary_embedding_model ?? null,
			createdAt: doc.created_at,
			updatedAt: doc.updated_at,
			memoryEntries,
		}
	})

	return DocumentsWithMemoriesResponseSchema.parse({
		documents,
		pagination: {
			currentPage: 1,
			limit: documents.length,
			totalItems: documents.length,
			totalPages: 1,
		},
	})
}

export async function updateDocument(
	client: SupabaseClient,
	{
		organizationId,
		documentId,
		content,
		title,
	}: {
		organizationId: string
		documentId: string
		content?: string
		title?: string
	},
) {
	const updates: Record<string, unknown> = {}

	if (content !== undefined) {
		updates.content = content
	}

	if (title !== undefined) {
		updates.title = title
	}

	if (Object.keys(updates).length === 0) {
		throw new Error(
			"At least one field (content or title) must be provided for update",
		)
	}

	const { data, error } = await client
		.from("documents")
		.update(updates)
		.eq("id", documentId)
		.eq("org_id", organizationId)
		.select("id, status, content, title, updated_at")
		.single()

	if (error) throw error

	return data
}

export async function deleteDocument(
	client: SupabaseClient,
	{
		organizationId,
		documentId,
	}: {
		organizationId: string
		documentId: string
	},
) {
	const { error } = await client
		.from("documents")
		.delete()
		.eq("id", documentId)
		.eq("org_id", organizationId)

	if (error) throw error
}

export async function migrateMcpDocuments(
	_organizationId: string,
	body: unknown,
) {
	const payload = MigrateMCPRequestSchema.parse(body ?? {})

	const response = {
		success: true,
		migratedCount: 0,
		message: `MCP migration placeholder for user ${payload.userId} in project ${payload.projectId}`,
		documentIds: [] as string[],
	}

	return MigrateMCPResponseSchema.parse(response)
}
