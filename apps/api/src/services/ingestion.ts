import { supabaseAdmin } from "../supabase"
import { env } from "../env"
import { chunkText } from "./chunk"
import { generateDeterministicEmbedding } from "./embedding"
import { generateEmbedding, generateEmbeddingsBatch } from "./embedding-provider"

export type ProcessDocumentInput = {
  documentId: string
  organizationId: string
  userId: string
  spaceId: string
  content: string
  metadata: Record<string, unknown> | null
  containerTags: string[]
  jobId?: string
}

async function updateDocumentStatus(documentId: string, status: string, extra?: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("documents")
    .update({ status, ...(extra ?? {}) })
    .eq("id", documentId)

  if (error) throw error
}

async function updateJobStatus(jobId: string, status: string, errorMessage?: string) {
  const { error } = await supabaseAdmin
    .from("ingestion_jobs")
    .update({ status, error_message: errorMessage ?? null })
    .eq("id", jobId)

  if (error) throw error
}

export async function processDocument(input: ProcessDocumentInput) {
  const { documentId, organizationId, userId, spaceId, content, metadata, containerTags, jobId } = input

  try {
    if (jobId) {
      await updateJobStatus(jobId, "processing")
    }

    await updateDocumentStatus(documentId, "extracting")

    const chunks = chunkText(content)
    await updateDocumentStatus(documentId, "chunking")

    const chunkEmbeddings = chunks.length > 0
      ? await generateEmbeddingsBatch(chunks.map((chunk) => chunk.content))
      : []

    const chunkRows = chunks.map((chunk, index) => ({
      document_id: documentId,
      org_id: organizationId,
      content: chunk.content,
      type: "text",
      position: chunk.position,
      metadata: metadata
        ? {
            ...metadata,
            position: chunk.position,
          }
        : { position: chunk.position },
      embedding: chunkEmbeddings[index] ?? generateDeterministicEmbedding(chunk.content),
      embedding_model: env.EMBEDDING_MODEL,
    }))

    if (chunkRows.length > 0) {
      const { error: chunkError } = await supabaseAdmin.from("document_chunks").insert(chunkRows)
      if (chunkError) throw chunkError
    }

    await updateDocumentStatus(documentId, "embedding")

    const documentEmbedding = await generateEmbedding(content)

    const summaryText =
      (metadata && typeof metadata.summary === "string" && metadata.summary.length > 0
        ? metadata.summary
        : chunks[0]?.content.slice(0, 220)) ?? null

    const { error: documentUpdateError } = await supabaseAdmin
      .from("documents")
      .update({
        status: "done",
        summary: summaryText,
        summary_embedding: documentEmbedding,
        summary_embedding_model: env.EMBEDDING_MODEL,
        chunk_count: chunkRows.length,
        average_chunk_size: chunkRows.length > 0 ? Math.round(content.length / chunkRows.length) : content.length,
      })
      .eq("id", documentId)

    if (documentUpdateError) throw documentUpdateError

    const { error: memoryError } = await supabaseAdmin.from("memories").insert({
      document_id: documentId,
      space_id: spaceId,
      org_id: organizationId,
      user_id: userId,
      content,
      metadata: metadata ?? null,
      memory_embedding: documentEmbedding,
      memory_embedding_model: env.EMBEDDING_MODEL,
    })

    if (memoryError) throw memoryError

    if (jobId) {
      await updateJobStatus(jobId, "done")
    }

    return {
      status: "done" as const,
      chunkCount: chunkRows.length,
    }
  } catch (error) {
    console.error("Failed to process document", error)
    if (jobId) {
      await updateJobStatus(jobId, "failed", error instanceof Error ? error.message : String(error))
    }
    await updateDocumentStatus(documentId, "failed", {
      processing_metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    })
    throw error
  }
}
