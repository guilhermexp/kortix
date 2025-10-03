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
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { processDocument } from "../services/ingestion"

const defaultContainerTag = "sm_project_default"
const RUN_SYNC_INGESTION = (process.env.INGESTION_MODE ?? "sync") === "sync"

const DocumentDetailSchema = z.object({
  id: z.string(),
  status: z.string().default("unknown"),
  content: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  containerTags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  memoryEntries: z
    .array(
      z.object({
        id: z.string(),
        content: z.string().nullable().optional(),
        metadata: z.record(z.unknown()).nullable().optional(),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    )
    .default([]),
})

type SortKey = "createdAt" | "updatedAt" | undefined

function resolveSortColumn(sort: SortKey) {
  switch (sort) {
    case "updatedAt":
      return "updated_at"
    case "createdAt":
    default:
      return "created_at"
  }
}

export const DocumentsByIdsSchema = z.object({
  ids: z.array(z.string()).min(1),
  by: z.enum(["id", "customId"]).optional().default("id"),
  containerTags: z.array(z.string()).optional(),
})

export type MemoryAddInput = z.infer<typeof MemoryAddSchema>
export type ListMemoriesInput = z.infer<typeof ListMemoriesQuerySchema>
export type DocumentsQueryInput = z.infer<typeof DocumentsWithMemoriesQuerySchema>
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

  const containerTags = (document.documents_to_spaces ?? [])
    .map((link: any) => link.spaces?.container_tag)
    .filter(Boolean)

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
    memoryEntries: (memories ?? []).map((row) => ({
      id: row.id,
      content: row.content ?? null,
      metadata: row.metadata ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  })
}

export async function ensureSpace(client: SupabaseClient, organizationId: string, containerTag: string) {
  const { data: existing, error: fetchError } = await client
    .from("spaces")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("container_tag", containerTag)
    .maybeSingle()

  if (fetchError) throw fetchError
  if (existing) return existing.id

  const name = containerTag.replace(/^sm_project_/, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Untitled"

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

  const [containerTag] = parsed.containerTags && parsed.containerTags.length > 0 ? parsed.containerTags : [defaultContainerTag]
  const spaceId = await ensureSpace(client, organizationId, containerTag)

  const isUrl = /^https?:\/\//i.test(rawContent)
  const baseMetadata: Record<string, unknown> = {
    ...(parsed.metadata ?? {}),
  }
  if (isUrl) {
    baseMetadata.originalUrl = rawContent
  }
  const metadata = Object.keys(baseMetadata).length > 0 ? baseMetadata : null

  const inferredType = (parsed.metadata?.type as string | undefined) ?? (isUrl ? "url" : "text")
  const inferredSource = (parsed.metadata?.source as string | undefined) ?? (isUrl ? "web" : "manual")
  const inferredUrl = isUrl ? rawContent : ((parsed.metadata?.url as string | undefined) ?? null)
  const initialTitle = parsed.metadata?.title ?? (isUrl ? null : rawContent.slice(0, 80)) ?? "Untitled"
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

    return MemoryResponseSchema.parse({ id: docId, status: processingResult.status })
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
    const tags = (doc.documents_to_spaces ?? [])
      .map((link: any) => link.spaces?.container_tag)
      .filter(Boolean)
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
    containerTags: (doc.documents_to_spaces ?? [])
      .map((link: any) => link.spaces?.container_tag)
      .filter(Boolean),
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  }))

  const totalItems =
    query.containerTags && query.containerTags.length > 0
      ? memories.length
      : count ?? memories.length

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

  const builder = client
    .from("documents")
    .select(
      `id, custom_id, content_hash, org_id, user_id, connection_id, title, content, summary, url, source, type, status, metadata, processing_metadata, raw, token_count, word_count, chunk_count, average_chunk_size, summary_embedding, summary_embedding_model, created_at, updated_at, documents_to_spaces(space_id, spaces(container_tag))`,
      { count: "exact" },
    )
    .eq("org_id", organizationId)
    .order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await builder
  if (error) throw error

  const filtered = (data ?? []).filter((doc) => {
    if (!query.containerTags || query.containerTags.length === 0) return true
    const tags = (doc.documents_to_spaces ?? [])
      .map((link: any) => link.spaces?.container_tag)
      .filter(Boolean)
    return query.containerTags?.some((tag) => tags.includes(tag))
  })

  const docInfos = filtered.map((doc) => {
    const containerTags = (doc.documents_to_spaces ?? [])
      .map((link: any) => link.spaces?.container_tag)
      .filter(Boolean)
    const spaceIds = (doc.documents_to_spaces ?? [])
      .map((link: any) => link.space_id)
      .filter(Boolean)

    return { doc, containerTags, spaceIds }
  })

  const docIds = docInfos.map(({ doc }) => doc.id)
  const memoryByDoc = new Map<string, any[]>()

  if (docIds.length > 0) {
    const { data: memoryRows, error: memoryError } = await client
      .from("memories")
      .select(
        "id, document_id, space_id, org_id, user_id, memory, metadata, memory_embedding, memory_embedding_model, memory_embedding_new, memory_embedding_new_model, is_latest, version, is_inference, is_forgotten, forget_after, forget_reason, source_count, created_at, updated_at",
      )
      .eq("org_id", organizationId)
      .in("document_id", docIds)

    if (memoryError) throw memoryError

    for (const row of memoryRows ?? []) {
      const entries = memoryByDoc.get(row.document_id) ?? []
      entries.push(row)
      memoryByDoc.set(row.document_id, entries)
    }
  }

  const documents = docInfos.map(({ doc, containerTags, spaceIds }) => {
    const memoryRows = memoryByDoc.get(doc.id) ?? []

    const memoryEntries = memoryRows.map((row) => ({
      id: row.id,
      memory: row.memory ?? "",
      spaceId: row.space_id ?? spaceIds[0] ?? "",
      orgId: row.org_id,
      userId: row.user_id ?? null,
      version: row.version ?? 1,
      isLatest: row.is_latest ?? true,
      parentMemoryId: null,
      rootMemoryId: null,
      memoryRelations: {},
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

    // Clean metadata to ensure it only contains string/number/boolean values
    const cleanMetadata = doc.metadata ?
      Object.fromEntries(
        Object.entries(doc.metadata as Record<string, any>).filter(([_, v]) =>
          typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
        )
      ) : null

    // Ensure processingMetadata has required fields or set to null
    const cleanProcessingMetadata = doc.processing_metadata ? {
      startTime: (doc.processing_metadata as any).startTime ?? Date.now(),
      steps: (doc.processing_metadata as any).steps ?? [],
      ...doc.processing_metadata
    } : null

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

  const totalItems =
    query.containerTags && query.containerTags.length > 0
      ? documents.length
      : count ?? documents.length

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
    console.error("Zod validation failed for DocumentsWithMemoriesResponse:", zodError)
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
      `id, custom_id, content_hash, org_id, user_id, connection_id, title, content, summary, url, source, type, status, metadata, processing_metadata, raw, token_count, word_count, chunk_count, average_chunk_size, summary_embedding, summary_embedding_model, created_at, updated_at, documents_to_spaces(space_id, spaces(container_tag))`,
    )
    .eq("org_id", organizationId)
    .in(column, query.ids)

  if (error) throw error

  const filtered = (data ?? []).filter((doc) => {
    if (!query.containerTags || query.containerTags.length === 0) return true
    const tags = (doc.documents_to_spaces ?? [])
      .map((link: any) => link.spaces?.container_tag)
      .filter(Boolean)
    return query.containerTags?.some((tag) => tags.includes(tag))
  })

  const docInfos = filtered.map((doc) => {
    const containerTags = (doc.documents_to_spaces ?? [])
      .map((link: any) => link.spaces?.container_tag)
      .filter(Boolean)
    const spaceIds = (doc.documents_to_spaces ?? [])
      .map((link: any) => link.space_id)
      .filter(Boolean)

    return { doc, containerTags, spaceIds }
  })

  const docIds = docInfos.map(({ doc }) => doc.id)
  const memoryByDoc = new Map<string, any[]>()

  if (docIds.length > 0) {
    const { data: memoryRows, error: memoryError } = await client
      .from("memories")
      .select(
        "id, document_id, space_id, org_id, user_id, memory, metadata, memory_embedding, memory_embedding_model, memory_embedding_new, memory_embedding_new_model, is_latest, version, is_inference, is_forgotten, forget_after, forget_reason, source_count, created_at, updated_at",
      )
      .eq("org_id", organizationId)
      .in("document_id", docIds)

    if (memoryError) throw memoryError

    for (const row of memoryRows ?? []) {
      const entries = memoryByDoc.get(row.document_id) ?? []
      entries.push(row)
      memoryByDoc.set(row.document_id, entries)
    }
  }

  const documents = docInfos.map(({ doc, containerTags, spaceIds }) => {
    const memoryRows = memoryByDoc.get(doc.id) ?? []

    const memoryEntries = memoryRows.map((row) => ({
      id: row.id,
      memory: row.memory ?? "",
      spaceId: row.space_id ?? spaceIds[0] ?? "",
      orgId: row.org_id,
      userId: row.user_id ?? null,
      version: row.version ?? 1,
      isLatest: row.is_latest ?? true,
      parentMemoryId: null,
      rootMemoryId: null,
      memoryRelations: {},
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

    // Clean metadata to ensure it only contains string/number/boolean values
    const cleanMetadata = doc.metadata ?
      Object.fromEntries(
        Object.entries(doc.metadata as Record<string, any>).filter(([_, v]) =>
          typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
        )
      ) : null

    // Ensure processingMetadata has required fields or set to null
    const cleanProcessingMetadata = doc.processing_metadata ? {
      startTime: (doc.processing_metadata as any).startTime ?? Date.now(),
      steps: (doc.processing_metadata as any).steps ?? [],
      ...doc.processing_metadata
    } : null

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

export async function migrateMcpDocuments(organizationId: string, body: unknown) {
  const payload = MigrateMCPRequestSchema.parse(body ?? {})

  const response = {
    success: true,
    migratedCount: 0,
    message: `MCP migration placeholder for user ${payload.userId} in project ${payload.projectId}`,
    documentIds: [] as string[],
  }

  return MigrateMCPResponseSchema.parse(response)
}
