/**
 * Database Storage Helper
 *
 * Provides database storage operations for the orchestration layer.
 * Includes transaction-like behavior with cleanup on error.
 */

import { supabaseAdmin } from "../../supabase"
import type { Logger } from "../base/base-service"
import type { PreviewResult, ProcessedDocument } from "../interfaces"

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
	logger?: Logger,
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

	try {
		logger?.debug("Storing document record", {
			documentId,
			organizationId,
			hasContent: !!content,
			hasSummary: !!summary,
			tagCount: tags?.length ?? 0,
		})

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

		if (error) {
			logger?.error("Failed to store document record", error as Error, {
				documentId,
				organizationId,
				errorCode: error.code,
				errorDetails: error.details,
			})
			throw new Error(
				`Failed to update document ${documentId}: ${error.message}`,
			)
		}

		logger?.debug("Document record stored successfully", {
			documentId,
			organizationId,
		})
	} catch (error) {
		logger?.error("Error in storeDocument", error as Error, {
			documentId,
			organizationId,
		})
		throw error
	}
}

/**
 * Store document chunks with embeddings
 */
export async function storeChunks(
	params: StoreChunksParams,
	logger?: Logger,
): Promise<number> {
	const { documentId, organizationId, chunks } = params

	if (!chunks || chunks.length === 0) {
		logger?.debug("No chunks to store", { documentId, organizationId })
		return 0
	}

	try {
		logger?.debug("Preparing chunks for storage", {
			documentId,
			organizationId,
			totalChunks: chunks.length,
		})

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
			logger?.debug("No valid chunks after filtering", {
				documentId,
				organizationId,
			})
			return 0
		}

		logger?.debug("Storing chunks in database", {
			documentId,
			organizationId,
			chunkCount: documentChunks.length,
		})

		const { error } = await supabaseAdmin
			.from("document_chunks")
			.insert(documentChunks)

		if (error) {
			logger?.error("Failed to store document chunks", error as Error, {
				documentId,
				organizationId,
				chunkCount: documentChunks.length,
				errorCode: error.code,
				errorDetails: error.details,
			})
			throw new Error(
				`Failed to insert chunks for document ${documentId}: ${error.message}`,
			)
		}

		logger?.debug("Chunks stored successfully", {
			documentId,
			organizationId,
			chunkCount: documentChunks.length,
		})

		return documentChunks.length
	} catch (error) {
		logger?.error("Error in storeChunks", error as Error, {
			documentId,
			organizationId,
			chunkCount: chunks.length,
		})
		throw error
	}
}

/**
 * Update document status
 */
export async function updateDocumentStatus(
	documentId: string,
	status: string,
	extra?: Record<string, unknown>,
	logger?: Logger,
): Promise<void> {
	try {
		logger?.debug("Updating document status", {
			documentId,
			status,
			hasExtra: !!extra,
		})

		const { error } = await supabaseAdmin
			.from("documents")
			.update({
				status,
				...(extra ?? {}),
				updated_at: new Date().toISOString(),
			})
			.eq("id", documentId)

		if (error) {
			logger?.error("Failed to update document status", error as Error, {
				documentId,
				status,
				errorCode: error.code,
				errorDetails: error.details,
			})
			throw new Error(
				`Failed to update status for document ${documentId}: ${error.message}`,
			)
		}

		logger?.debug("Document status updated successfully", {
			documentId,
			status,
		})
	} catch (error) {
		logger?.error("Error in updateDocumentStatus", error as Error, {
			documentId,
			status,
		})
		throw error
	}
}

/**
 * Update job status
 */
export async function updateJobStatus(
	jobId: string,
	status: string,
	errorMessage?: string,
	logger?: Logger,
): Promise<void> {
	try {
		logger?.debug("Updating job status", {
			jobId,
			status,
			hasError: !!errorMessage,
		})

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

		if (error) {
			logger?.error("Failed to update job status", error as Error, {
				jobId,
				status,
				errorCode: error.code,
				errorDetails: error.details,
			})
			throw new Error(`Failed to update job ${jobId} status: ${error.message}`)
		}

		logger?.debug("Job status updated successfully", {
			jobId,
			status,
		})
	} catch (error) {
		logger?.error("Error in updateJobStatus", error as Error, {
			jobId,
			status,
		})
		throw error
	}
}

/**
 * Delete document chunks (for rollback)
 *
 * This function is used during error recovery and rollback scenarios.
 * It attempts to delete all chunks for a document but does not throw
 * errors to avoid masking the original error.
 */
export async function deleteDocumentChunks(
	documentId: string,
	logger?: Logger,
): Promise<void> {
	try {
		logger?.debug("Deleting document chunks for rollback", {
			documentId,
		})

		const { error, count } = await supabaseAdmin
			.from("document_chunks")
			.delete({ count: "exact" })
			.eq("document_id", documentId)

		if (error) {
			logger?.error(
				"Failed to delete document chunks during rollback",
				error as Error,
				{
					documentId,
					errorCode: error.code,
					errorDetails: error.details,
				},
			)
			// Don't throw - we're already in an error state
			return
		}

		logger?.debug("Document chunks deleted successfully", {
			documentId,
			deletedCount: count ?? 0,
		})
	} catch (error) {
		// Log error but don't throw during cleanup to avoid masking original error
		logger?.error("Error in deleteDocumentChunks", error as Error, {
			documentId,
		})
	}
}

/**
 * Store complete document with transaction-like behavior
 *
 * This function stores the document, chunks, and updates status atomically.
 * If any step fails, it attempts to rollback changes.
 *
 * Error handling strategy:
 * 1. If chunk insertion fails - nothing to rollback, just fail
 * 2. If document update fails - rollback chunks that were inserted
 * 3. If status update fails - rollback chunks and mark document as failed
 *
 * All operations are logged with context for debugging and monitoring.
 */
export async function storeCompleteDocument(
	params: {
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
	},
	logger?: Logger,
): Promise<void> {
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
	let chunkCount = 0

	logger?.info("Starting complete document storage", {
		documentId,
		organizationId,
		hasChunks: !!processed.chunks?.length,
		hasSummary: !!processed.summary,
		hasPreview: !!preview,
	})

	try {
		// Step 1: Store chunks first
		logger?.debug("Step 1: Storing document chunks", { documentId })
		chunkCount = await storeChunks(
			{
				documentId,
				organizationId,
				chunks: processed.chunks,
			},
			logger,
		)
		chunksStored = chunkCount > 0

		logger?.debug("Chunks stored successfully", {
			documentId,
			chunkCount,
		})

		// Step 2: Update document with all processed data
		logger?.debug("Step 2: Updating document record", { documentId })
		await storeDocument(
			{
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
			},
			logger,
		)

		logger?.debug("Document record updated successfully", { documentId })

		// Step 3: Update document status to done
		logger?.debug("Step 3: Updating document status to done", { documentId })
		await updateDocumentStatus(
			documentId,
			"done",
			{
				chunk_count: chunkCount,
				error: null,
			},
			logger,
		)

		logger?.info("Complete document storage successful", {
			documentId,
			chunkCount,
		})
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error"

		logger?.error("Complete document storage failed", error as Error, {
			documentId,
			organizationId,
			chunksStored,
			chunkCount,
			step: chunksStored ? "document_or_status_update" : "chunk_storage",
		})

		// Rollback: Delete chunks if they were stored
		if (chunksStored) {
			logger?.warn("Rolling back: Deleting stored chunks", {
				documentId,
				chunkCount,
			})
			await deleteDocumentChunks(documentId, logger)
		}

		// Update document status to failed
		logger?.debug("Updating document status to failed", {
			documentId,
			errorMessage,
		})

		try {
			await updateDocumentStatus(
				documentId,
				"failed",
				{
					error: errorMessage,
					chunk_count: 0, // Reset since we rolled back
				},
				logger,
			)
		} catch (statusError) {
			// Log but don't throw - we want to preserve the original error
			logger?.error(
				"Failed to update document status during rollback",
				statusError as Error,
				{
					documentId,
					originalError: errorMessage,
				},
			)
		}

		// Re-throw the original error
		throw error
	}
}
