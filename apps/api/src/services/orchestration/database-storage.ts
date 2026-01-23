/**
 * Database Storage Helper
 *
 * Provides database storage operations for the orchestration layer.
 * Includes transaction-like behavior with cleanup on error.
 */

import { supabaseAdmin } from "../../supabase"
import type { ProcessedDocument, PreviewResult } from "../interfaces"

// ============================================================================
// Types
// ============================================================================

export interface StoreDocumentParams {
	documentId: string
	organizationId: string
	userId: string
	url?: string | null
	title?: string | null
	content: string
	summary?: string
	tags?: string[]
	wordCount?: number
	metadata?: Record<string, unknown>
	raw?: Record<string, unknown> | null
	previewUrl?: string | null
}

export interface StoreChunksParams {
	documentId: string
	organizationId: string
	chunks: ProcessedDocument["chunks"]
}

// ============================================================================
// Database Storage Operations
// ============================================================================

/**
 * Store document record in database
 */
export async function storeDocument(
	params: StoreDocumentParams,
): Promise<void> {
	const {
		documentId,
		organizationId,
		userId,
		url,
		title,
		content,
		summary,
		tags,
		wordCount,
		metadata,
		raw,
		previewUrl,
	} = params

	const { error } = await supabaseAdmin
		.from("documents")
		.update({
			content,
			title: title ?? null,
			summary: summary ?? null,
			tags: tags ?? null,
			word_count: wordCount ?? null,
			preview_image: previewUrl ?? null,
			metadata: metadata ?? {},
			raw: raw ?? null,
			updated_at: new Date().toISOString(),
		})
		.eq("id", documentId)
		.eq("org_id", organizationId)

	if (error) throw error
}

/**
 * Store document chunks with embeddings
 */
export async function storeChunks(
	params: StoreChunksParams,
): Promise<number> {
	const { documentId, organizationId, chunks } = params

	if (!chunks || chunks.length === 0) {
		return 0
	}

	// Map chunks to database format
	const documentChunks = chunks
		.filter((chunk) => chunk.content)
		.map((chunk, index) => ({
			document_id: documentId,
			org_id: organizationId,
			content: chunk.content,
			embedding: chunk.embedding,
			chunk_index: chunk.position ?? index,
			token_count: Math.ceil(chunk.content.length / 4),
			embedding_model: "voyage-3-lite",
			metadata: chunk.metadata ?? {},
			created_at: new Date().toISOString(),
		}))

	if (documentChunks.length === 0) {
		return 0
	}

	const { error } = await supabaseAdmin
		.from("document_chunks")
		.insert(documentChunks)

	if (error) throw error

	return documentChunks.length
}

/**
 * Update document status
 */
export async function updateDocumentStatus(
	documentId: string,
	status: string,
	extra?: Record<string, unknown>,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("documents")
		.update({
			status,
			...(extra ?? {}),
			updated_at: new Date().toISOString(),
		})
		.eq("id", documentId)

	if (error) throw error
}

/**
 * Update job status
 */
export async function updateJobStatus(
	jobId: string,
	status: string,
	errorMessage?: string,
): Promise<void> {
	const updateData: Record<string, unknown> = {
		status,
		error_message: errorMessage ?? null,
	}

	if (status === "completed") {
		updateData.completed_at = new Date().toISOString()
	}

	const { error } = await supabaseAdmin
		.from("ingestion_jobs")
		.update(updateData)
		.eq("id", jobId)

	if (error) throw error
}

/**
 * Delete document chunks (for rollback)
 */
export async function deleteDocumentChunks(
	documentId: string,
): Promise<void> {
	const { error } = await supabaseAdmin
		.from("document_chunks")
		.delete()
		.eq("document_id", documentId)

	if (error) {
		// Log error but don't throw during cleanup
		console.error("Failed to delete document chunks during rollback:", error)
	}
}

/**
 * Store complete document with transaction-like behavior
 *
 * This function stores the document, chunks, and updates status atomically.
 * If any step fails, it attempts to rollback changes.
 */
export async function storeCompleteDocument(params: {
	documentId: string
	organizationId: string
	userId: string
	url?: string | null
	title?: string | null
	content: string
	processed: ProcessedDocument
	preview?: PreviewResult | null
	metadata?: Record<string, unknown>
	raw?: Record<string, unknown> | null
}): Promise<void> {
	const {
		documentId,
		organizationId,
		userId,
		url,
		title,
		content,
		processed,
		preview,
		metadata,
		raw,
	} = params

	let chunksStored = false

	try {
		// Step 1: Store chunks first
		const chunkCount = await storeChunks({
			documentId,
			organizationId,
			chunks: processed.chunks,
		})
		chunksStored = chunkCount > 0

		// Step 2: Update document with all processed data
		await storeDocument({
			documentId,
			organizationId,
			userId,
			url,
			title,
			content,
			summary: processed.summary,
			tags: processed.tags,
			wordCount: content.split(/\s+/).length,
			metadata: {
				...metadata,
				processingCompleted: true,
				chunkCount,
			},
			raw,
			previewUrl: preview?.url ?? null,
		})

		// Step 3: Update document status to done
		await updateDocumentStatus(documentId, "done", {
			chunk_count: chunkCount,
			error: null,
		})
	} catch (error) {
		// Rollback: Delete chunks if they were stored
		if (chunksStored) {
			await deleteDocumentChunks(documentId)
		}

		// Update document status to failed
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error"
		await updateDocumentStatus(documentId, "failed", {
			error: errorMessage,
		}).catch((statusError) => {
			console.error("Failed to update document status during rollback:", statusError)
		})

		// Re-throw the original error
		throw error
	}
}
