/**
 * Documents — listing (listDocuments, listDocumentsWithMemories, listDocumentsWithMemoriesByIds)
 */

import {
  DocumentsWithMemoriesQuerySchema,
  DocumentsWithMemoriesResponseSchema,
  ListMemoriesQuerySchema,
  ListMemoriesResponseSchema,
} from "@repo/validation/api";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  documentListCache,
  generateCacheKey,
} from "../../services/query-cache";
import {
  matchesNormalizedSearch,
  normalizeSearchText,
} from "../documents-search-utils";
import { getDocumentChildren } from "./bundles";
import type {
  DocumentsByIdsInput,
  DocumentsQueryInput,
  ListMemoriesInput,
  MemoryRow,
} from "./utils";
import {
  ALLOWED_DOCUMENT_TYPES,
  DocumentsByIdsSchema,
  extractContainerTags,
  extractSpaceIds,
  isPermissionDenied,
  normalizeProcessingMetadata,
  resolveSortColumn,
} from "./utils";

// ---------------------------------------------------------------------------
// Shared helper: transform a document row + its memories into the API shape
// Used by both listDocumentsWithMemories and listDocumentsWithMemoriesByIds
// ---------------------------------------------------------------------------

function transformDocumentRow(
  doc: any,
  containerTags: string[],
  spaceIds: string[],
  memoryRows: MemoryRow[],
  opts?: { includeParentId?: boolean },
) {
  // Transform database rows to API format (content → memory)
  const memoryEntries = memoryRows.slice(0, 5).map((row) => ({
    id: row.id,
    documentId: row.document_id,
    memory: row.content ?? "", // API field: transformed from database 'content'
    spaceId: row.space_id ?? spaceIds[0] ?? "",
    orgId: row.org_id,
    userId: row.user_id ?? null,
    version: row.version ?? 1,
    isLatest: row.is_latest ?? true,
    sourceCount: 1,
    isInference: false,
    isForgotten: false,
    forgetAfter: null,
    forgetReason: null,
    memoryEmbedding: null,
    memoryEmbeddingModel: null,
    memoryEmbeddingNew: null,
    memoryEmbeddingNewModel: null,
    metadata: row.metadata ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceAddedAt: row.created_at,
    sourceRelevanceScore: null,
    sourceMetadata: null,
    spaceContainerTag: containerTags[0] ?? null,
  }));

  // Normalize document type
  let normalizedType = doc.type ?? "text";
  if (normalizedType === "url") {
    normalizedType = "webpage";
  }
  if (!ALLOWED_DOCUMENT_TYPES.has(normalizedType)) {
    normalizedType = "text";
  }

  // Clean metadata
  const cleanMetadata =
    doc.metadata && typeof doc.metadata === "object"
      ? Object.fromEntries(
          Object.entries(doc.metadata as Record<string, unknown>).flatMap(
            ([key, value]) => {
              if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
              ) {
                return [[key, value]];
              }
              if (Array.isArray(value)) {
                const sanitizedArray = value
                  .map((item) =>
                    typeof item === "string" ||
                    typeof item === "number" ||
                    typeof item === "boolean"
                      ? item
                      : null,
                  )
                  .filter((item) => item !== null);
                if (sanitizedArray.length > 0) {
                  return [[key, sanitizedArray]];
                }
              }
              return [] as Array<[string, unknown]>;
            },
          ),
        )
      : null;

  const cleanProcessingMetadata = normalizeProcessingMetadata(
    doc.processing_metadata,
  );

  // Normalize status
  let normalizedStatus = (doc.status ?? "unknown") as string;
  if (normalizedStatus === "fetching") normalizedStatus = "extracting";
  if (normalizedStatus === "processing") normalizedStatus = "embedding";

  const result: Record<string, unknown> = {
    id: doc.id,
    orgId: doc.org_id,
    userId: doc.user_id,
    title: doc.title ?? null,
    content: doc.content ?? null,
    summary: doc.summary ?? null,
    url: doc.url ?? null,
    source: doc.source ?? null,
    type: normalizedType,
    status: normalizedStatus,
    metadata: cleanMetadata,
    processingMetadata: cleanProcessingMetadata,
    raw: doc.raw ?? null,
    tags: Array.isArray(doc.tags)
      ? (doc.tags as unknown[])
          .map((tag) => (typeof tag === "string" ? tag : null))
          .filter(
            (tag): tag is string => tag != null && tag.trim().length > 0,
          )
      : [],
    previewImage: doc.preview_image ?? null,
    error: doc.error ?? null,
    tokenCount: doc.token_count ?? null,
    wordCount: doc.word_count ?? null,
    chunkCount: doc.chunk_count ?? 0,
    averageChunkSize: doc.average_chunk_size ?? null,
    summaryEmbedding: doc.summary_embedding ?? null,
    summaryEmbeddingModel: doc.summary_embedding_model ?? null,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    memoryEntries,
    containerTags,
  };

  if (opts?.includeParentId) {
    result.parentId = (doc as any).parent_id ?? null;
  }

  return result;
}

// ---------------------------------------------------------------------------
// listDocuments (lightweight list without memories)
// ---------------------------------------------------------------------------

export async function listDocuments(
  client: SupabaseClient,
  organizationId: string,
  input: Partial<ListMemoriesInput> = {},
) {
  const query = ListMemoriesQuerySchema.partial({ filters: true }).parse(input);
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const offset = (page - 1) * limit;
  const sortColumn = resolveSortColumn(query.sort);

  const { data, error, count } = await client
    .from("documents")
    .select(
      "id, title, summary, status, type, metadata, preview_image, url, raw, created_at, updated_at, space_id, spaces(container_tag)",
      { count: "exact" },
    )
    .eq("org_id", organizationId)
    .is("parent_id", null)
    .order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const filtered = (data ?? []).filter((doc) => {
    if (!query.containerTags || query.containerTags.length === 0) return true;
    const tags = extractContainerTags(doc);
    return query.containerTags?.some((tag) => tags.includes(tag));
  });

  const memories = filtered.map((doc) => ({
    id: doc.id,
    title: doc.title ?? null,
    summary: doc.summary ?? null,
    status: ((): string => {
      const s = (doc.status ?? "unknown") as string;
      if (s === "fetching") return "extracting";
      if (s === "processing") return "embedding";
      return s;
    })(),
    type: doc.type ?? "text",
    metadata: doc.metadata ?? null,
    previewImage: (doc as any).preview_image ?? null,
    url: (doc as any).url ?? null,
    raw: (doc as any).raw ?? null,
    containerTags: extractContainerTags(doc),
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  }));

  const totalItems =
    query.containerTags && query.containerTags.length > 0
      ? memories.length
      : (count ?? memories.length);

  return ListMemoriesResponseSchema.parse({
    memories,
    pagination: {
      currentPage: page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  });
}

// ---------------------------------------------------------------------------
// listDocumentsWithMemories
// ---------------------------------------------------------------------------

export async function listDocumentsWithMemories(
  client: SupabaseClient,
  organizationId: string,
  input: DocumentsQueryInput,
) {
  const query = DocumentsWithMemoriesQuerySchema.parse(input);
  const searchRaw = query.search?.trim() || "";
  const hasSearch = searchRaw.length > 0;
  const normalizedSearch = hasSearch ? normalizeSearchText(searchRaw) : "";
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const offset = (page - 1) * limit;
  const sortColumn = resolveSortColumn(query.sort);

  // Check cache first (only for non-content requests to keep cache size manageable)
  if (!(query as any).includeContent && !query.search) {
    const cacheKey = generateCacheKey("doclist", {
      orgId: organizationId,
      page,
      limit,
      sort: query.sort,
      order: query.order,
      containerTags: query.containerTags,
    });

    const cached = documentListCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Use lightweight fields to improve performance
  const includeHeavyFields = (query as any).includeContent ?? false;
  const selectFields = includeHeavyFields
    ? "id, org_id, user_id, title, content, summary, url, source, type, status, metadata, processing_metadata, raw, tags, preview_image, error, token_count, word_count, chunk_count, average_chunk_size, created_at, updated_at, space_id, spaces(container_tag)"
    : "id, org_id, user_id, title, summary, url, source, type, status, metadata, tags, preview_image, error, token_count, word_count, chunk_count, average_chunk_size, created_at, updated_at, space_id, spaces(container_tag)";
  const fallbackSearchSelectFields = includeHeavyFields
    ? selectFields
    : "id, org_id, user_id, title, content, summary, url, source, type, status, metadata, tags, preview_image, error, token_count, word_count, chunk_count, average_chunk_size, created_at, updated_at, space_id, spaces(container_tag)";

  const applyTextSearch = <T>(builder: T): T => {
    if (!hasSearch) return builder;
    const searchTerm = `%${searchRaw}%`;
    return (builder as any).or(
      `title.ilike.${searchTerm},summary.ilike.${searchTerm},content.ilike.${searchTerm}`,
    );
  };

  const runNormalizedSearchFallback = async (scope?: {
    spaceIds?: string[];
  }): Promise<{ count: number; data: any[] }> => {
    if (!hasSearch || !normalizedSearch) return { count: 0, data: [] };

    const fallbackWindow = Math.max(400, limit * 40);
    let builder = client
      .from("documents")
      .select(fallbackSearchSelectFields, { count: "planned" })
      .eq("org_id", organizationId)
      .is("parent_id", null)
      .order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
      .limit(fallbackWindow);

    if (scope?.spaceIds && scope.spaceIds.length > 0) {
      builder = builder.in("space_id", scope.spaceIds);
    }

    const { data: fallbackDocs, error: fallbackErr } = await builder;
    if (fallbackErr && !isPermissionDenied(fallbackErr)) throw fallbackErr;

    const filtered = (fallbackDocs ?? []).filter((doc: any) =>
      matchesNormalizedSearch(
        {
          title: doc.title,
          summary: doc.summary,
          content: typeof doc.content === "string" ? doc.content : null,
        },
        normalizedSearch,
      ),
    );

    return {
      count: filtered.length,
      data: filtered.slice(offset, offset + limit),
    };
  };

  // When filtering by containerTags (projects), constrain at SQL level
  let data: any[] | null = null;
  let count: number | null = null;

  if (query.containerTags && query.containerTags.length > 0) {
    // Resolve spaces matching the requested container tags
    const { data: spaces, error: spacesErr } = await client
      .from("spaces")
      .select("id")
      .eq("org_id", organizationId)
      .in("container_tag", query.containerTags);

    if (spacesErr && !isPermissionDenied(spacesErr)) throw spacesErr;

    const spaceIds = Array.isArray(spaces) ? spaces.map((s: any) => s.id) : [];

    if (spaceIds.length === 0) {
      return DocumentsWithMemoriesResponseSchema.parse({
        documents: [],
        pagination: {
          currentPage: page,
          limit,
          totalItems: 0,
          totalPages: 1,
        },
      });
    }

    // Find document IDs that belong to these spaces
    const { data: spaceDocs, error: spaceDocsErr } = await client
      .from("documents")
      .select("id")
      .eq("org_id", organizationId)
      .is("parent_id", null)
      .in("space_id", spaceIds);

    if (spaceDocsErr && !isPermissionDenied(spaceDocsErr)) throw spaceDocsErr;

    const docIds = Array.isArray(spaceDocs)
      ? spaceDocs.map((d: any) => d.id)
      : [];

    if (docIds.length === 0) {
      return DocumentsWithMemoriesResponseSchema.parse({
        documents: [],
        pagination: {
          currentPage: page,
          limit,
          totalItems: 0,
          totalPages: 1,
        },
      });
    }

    let queryBuilder = client
      .from("documents")
      .select(selectFields, { count: "planned" })
      .eq("org_id", organizationId)
      .is("parent_id", null)
      .in("id", docIds);

    queryBuilder = applyTextSearch(queryBuilder);

    const {
      data: docs,
      error: docsErr,
      count: docsCount,
    } = await queryBuilder
      .order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
      .range(offset, offset + limit - 1);

    if (docsErr && !isPermissionDenied(docsErr)) throw docsErr;
    data = docs ?? [];
    count = docsCount ?? data.length;

    if ((data?.length ?? 0) === 0 && hasSearch) {
      const fallback = await runNormalizedSearchFallback({ spaceIds });
      data = fallback.data;
      count = fallback.count;
    }
  } else {
    let queryBuilder = client
      .from("documents")
      .select(selectFields, { count: "planned" })
      .eq("org_id", organizationId)
      .is("parent_id", null);

    queryBuilder = applyTextSearch(queryBuilder);

    const {
      data: docs,
      error,
      count: docsCount,
    } = await queryBuilder
      .order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
      .range(offset, offset + limit - 1);

    if (error && !isPermissionDenied(error)) throw error;
    data = docs ?? [];
    count = docsCount ?? data.length;

    if ((data?.length ?? 0) === 0 && hasSearch) {
      const fallback = await runNormalizedSearchFallback();
      data = fallback.data;
      count = fallback.count;
    }
  }

  const docInfos = (data ?? []).map((doc) => {
    const containerTags = extractContainerTags(doc);
    const spaceIds = extractSpaceIds(doc);
    return { doc, containerTags, spaceIds };
  });

  const docIds = docInfos.map(({ doc }) => doc.id);
  const memoryByDoc = new Map<string, MemoryRow[]>();

  if (docIds.length > 0) {
    const { data: memoryRows, error: memoryError } = await client
      .from("memories")
      .select(
        "id, document_id, space_id, org_id, user_id, content, metadata, is_latest, version, created_at, updated_at",
      )
      .eq("org_id", organizationId)
      .in("document_id", docIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(docIds.length * 5, 250));

    if (memoryError && !isPermissionDenied(memoryError)) throw memoryError;

    for (const row of (memoryRows ?? []) as MemoryRow[]) {
      const entries = memoryByDoc.get(row.document_id) ?? [];
      entries.push(row);
      memoryByDoc.set(row.document_id, entries);
    }
  }

  const documents = docInfos.map(({ doc, containerTags, spaceIds }) => {
    const memoryRows = memoryByDoc.get(doc.id) ?? [];
    return transformDocumentRow(doc, containerTags, spaceIds, memoryRows);
  });

  const totalItems = count ?? documents.length;

  const response = {
    documents,
    pagination: {
      currentPage: page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  };

  try {
    const validatedResponse =
      DocumentsWithMemoriesResponseSchema.parse(response);

    // Cache the result if not including heavy content fields
    if (!(query as any).includeContent) {
      const cacheKey = generateCacheKey("doclist", {
        orgId: organizationId,
        page,
        limit,
        sort: query.sort,
        order: query.order,
        containerTags: query.containerTags,
      });
      documentListCache.set(cacheKey, validatedResponse);
    }

    return validatedResponse;
  } catch (zodError) {
    console.error(
      "Zod validation failed for DocumentsWithMemoriesResponse:",
      zodError,
    );
    console.error("Response data:", JSON.stringify(response, null, 2));
    throw zodError;
  }
}

// ---------------------------------------------------------------------------
// listDocumentsWithMemoriesByIds
// ---------------------------------------------------------------------------

export async function listDocumentsWithMemoriesByIds(
  client: SupabaseClient,
  organizationId: string,
  input: DocumentsByIdsInput,
) {
  const query = DocumentsByIdsSchema.parse(input);
  const column = "id"; // customId removed - column does not exist

  const { data, error } = await client
    .from("documents")
    .select(
      "id, org_id, user_id, title, content, summary, url, source, type, status, metadata, processing_metadata, raw, tags, preview_image, error, token_count, word_count, chunk_count, average_chunk_size, created_at, updated_at, space_id, parent_id, spaces(container_tag)",
    )
    .eq("org_id", organizationId)
    .in(column, query.ids);

  if (error && !isPermissionDenied(error)) throw error;

  const filtered = (data ?? []).filter((doc) => {
    if (!query.containerTags || query.containerTags.length === 0) return true;
    const tags = extractContainerTags(doc);
    return query.containerTags?.some((tag) => tags.includes(tag));
  });

  const docInfos = filtered.map((doc) => {
    const containerTags = extractContainerTags(doc);
    const spaceIds = extractSpaceIds(doc);
    return { doc, containerTags, spaceIds };
  });

  const docIds = docInfos.map(({ doc }) => doc.id);
  const memoryByDoc = new Map<string, MemoryRow[]>();

  if (docIds.length > 0) {
    const { data: memoryRows, error: memoryError } = await client
      .from("memories")
      .select(
        "id, document_id, space_id, org_id, user_id, content, metadata, is_latest, version, is_inference, source_count, created_at, updated_at",
      )
      .eq("org_id", organizationId)
      .in("document_id", docIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(docIds.length * 5, 250));

    if (memoryError && !isPermissionDenied(memoryError)) throw memoryError;

    for (const row of (memoryRows ?? []) as MemoryRow[]) {
      const entries = memoryByDoc.get(row.document_id) ?? [];
      entries.push(row);
      memoryByDoc.set(row.document_id, entries);
    }
  }

  const documents = docInfos.map(({ doc, containerTags, spaceIds }) => {
    const memoryRows = memoryByDoc.get(doc.id) ?? [];
    return transformDocumentRow(doc, containerTags, spaceIds, memoryRows, {
      includeParentId: true,
    });
  });

  // Enrich bundle documents with children
  for (const doc of documents) {
    if (doc.type === "bundle") {
      try {
        const children = await getDocumentChildren(client, organizationId, doc.id as string);
        (doc as any).childCount = children.length;
        (doc as any).children = children;
      } catch (err) {
        console.error(`[by-ids] Failed to fetch children for bundle ${doc.id}`, err);
      }
    }
  }

  return DocumentsWithMemoriesResponseSchema.parse({
    documents,
    pagination: {
      currentPage: 1,
      limit: documents.length,
      totalItems: documents.length,
      totalPages: 1,
    },
  });
}
