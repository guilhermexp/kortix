import { SearchRequestSchema, SearchResponseSchema } from "@repo/validation/api"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  cosineSimilarity,
  ensureVectorSize,
  generateDeterministicEmbedding,
} from "../services/embedding"
import { generateEmbedding } from "../services/embedding-provider"

function formatEmbeddingForSql(values: number[]): string {
  const sanitized = values.map((value) => {
    if (!Number.isFinite(value)) return "0"
    const rounded = Math.abs(value) < 1e-6 ? 0 : value
    return Number(rounded.toFixed(6)).toString()
  })
  return `[${sanitized.join(",")}]`
}

export async function searchDocuments(client: SupabaseClient, orgId: string, body: unknown) {
  const payload = SearchRequestSchema.parse(body)
  const start = Date.now()

  const queryEmbedding = await generateEmbedding(payload.q)
  const baseLimit = Math.max(50, (payload.limit ?? 10) * 8)

  let chunkRows: Array<
    {
      id: string
      document_id: string
      content: string
      metadata: Record<string, unknown> | null
      documents: any
      distance?: number | string | null
      embedding?: number[] | null
    }
  > = []
  let vectorQueryUsed = false

  const embeddingSqlLiteral = `'${formatEmbeddingForSql(queryEmbedding)}'::vector`
  const selectColumns = [
    "id",
    "document_id",
    "content",
    "metadata",
    "documents(id, title, type, content, summary, metadata, created_at, updated_at, status)",
    `distance:embedding <=> ${embeddingSqlLiteral}`,
  ].join(", ")

  try {
    let builder = client
      .from("document_chunks")
      .select(selectColumns)
      .eq("org_id", orgId)
      .order("distance", { ascending: true })
      .limit(baseLimit)

    if (payload.docId) {
      builder = builder.eq("document_id", payload.docId)
    }

    const { data, error } = await builder

    if (error) throw error
    if (Array.isArray(data)) {
      chunkRows = data
      vectorQueryUsed = true
    }
  } catch (error) {
    console.warn("Vectorised chunk search failed, falling back to local similarity", error)

    let fallbackBuilder = client
      .from("document_chunks")
      .select(
        "id, document_id, content, metadata, embedding, documents(id, title, type, content, summary, metadata, created_at, updated_at, status)",
      )
      .eq("org_id", orgId)
      .limit(baseLimit)

    if (payload.docId) {
      fallbackBuilder = fallbackBuilder.eq("document_id", payload.docId)
    }

    const { data: fallbackData, error: fallbackError } = await fallbackBuilder

    if (fallbackError) throw fallbackError
    if (Array.isArray(fallbackData)) {
      chunkRows = fallbackData
    }
  }

  const containerTagsFilter = payload.containerTags ?? []
  const chunkThreshold = payload.chunkThreshold ?? 0
  const documentThreshold = payload.documentThreshold ?? 0

  const onlyMatchingChunks = payload.onlyMatchingChunks ?? true

  const chunkResults = chunkRows
    .map((chunk) => {
      const doc = chunk.documents
      if (!doc) return null

      const docMetadata = doc.metadata ?? {}
      const chunkMetadata = chunk.metadata ?? {}
      const docContainerTags =
        Array.isArray(docMetadata.containerTags)
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

      let score: number | null = null

      if (vectorQueryUsed && chunk.distance !== undefined && chunk.distance !== null) {
        const distance = Number(chunk.distance)
        if (Number.isFinite(distance)) {
          score = Math.max(0, Math.min(1, 1 - distance))
        }
      }

      if (score === null) {
        const embedding = Array.isArray(chunk.embedding)
          ? ensureVectorSize(chunk.embedding as number[])
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

    const entry = grouped.get(chunk.documentId)!
    entry.chunks.push({ content: chunk.content, score: chunk.score })
    entry.bestScore = Math.max(entry.bestScore, chunk.score)
  }

  const sorted = Array.from(grouped.values())
    .filter((entry) => entry.bestScore >= documentThreshold)
    .sort((a, b) => b.bestScore - a.bestScore)
    .slice(0, payload.limit ?? 10)

  const results = sorted.map((entry) => {
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
      type: (doc as any).type ?? null,
      score: entry.bestScore,
      summary: payload.includeSummary ? doc.summary ?? null : null,
      content: payload.includeFullDocs ? doc.content ?? null : null,
      chunks: sortedChunks.map((chunk) => ({
        content: chunk.content,
        isRelevant: true,
        score: chunk.score,
      })),
    }
  })

  return SearchResponseSchema.parse({
    results,
    timing: Date.now() - start,
    total: results.length,
  })
}
