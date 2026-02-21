/**
 * Inline Document Processor
 *
 * Processes documents directly when they are created, without a separate polling worker.
 * Delegates to the shared processAndSaveDocument() function.
 */

import { supabaseAdmin } from "../supabase"
import { processAndSaveDocument } from "../worker/process-document"
import { documentCache, documentListCache } from "./query-cache"

interface ProcessDocumentOptions {
	documentId: string
	jobId: string
	orgId: string
	payload?: Record<string, unknown>
}

/**
 * Process a document inline (called directly from API, not from worker).
 * Runs asynchronously - does not block the API response.
 */
export async function processDocumentInline(
	options: ProcessDocumentOptions,
): Promise<void> {
	const { documentId, jobId, orgId, payload } = options

	try {
		await processAndSaveDocument({
			documentId,
			jobId,
			orgId,
			payload,
			logPrefix: "[inline-processor]",
		})
	} catch (error) {
		console.error("[inline-processor] Failed", { documentId, error })

		// Mark as failed
		const errorMsg = error instanceof Error ? error.message : String(error)
		await supabaseAdmin
			.from("documents")
			.update({ status: "failed", error: errorMsg })
			.eq("id", documentId)
		await supabaseAdmin
			.from("ingestion_jobs")
			.update({ status: "failed", error_message: errorMsg })
			.eq("id", jobId)

		documentListCache.clear()
		documentCache.delete(documentId)
	}
}
