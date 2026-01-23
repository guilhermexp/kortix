/**
 * Inline Document Processor
 *
 * Processes documents directly when they are created, without a separate polling worker.
 * This is simpler and more efficient for low/medium volume.
 */

import { getDefaultUserId, supabaseAdmin } from "../supabase"
import { createDocumentExtractorService } from "./extraction"
import { createPreviewGeneratorService } from "./preview/preview-generator"
import { createDocumentProcessorService } from "./processing"
import {
	storeCompleteDocument,
	updateDocumentStatus,
	updateJobStatus,
} from "./orchestration/database-storage"
import { upsertAutoSummaryMemory } from "./ingestion/db"
import { documentCache, documentListCache } from "./query-cache"

// Create service instances (lazy initialization)
let extractorService: ReturnType<typeof createDocumentExtractorService> | null =
	null
let processorService: ReturnType<typeof createDocumentProcessorService> | null =
	null
let previewService: ReturnType<typeof createPreviewGeneratorService> | null =
	null

async function getExtractorService() {
	if (!extractorService) {
		extractorService = createDocumentExtractorService()
		await extractorService.initialize()
	}
	return extractorService
}

async function getProcessorService() {
	if (!processorService) {
		processorService = createDocumentProcessorService()
		await processorService.initialize()
	}
	return processorService
}

async function getPreviewService() {
	if (!previewService) {
		previewService = createPreviewGeneratorService({
			enableImageExtraction: true,
			enableFaviconExtraction: false,
			fallbackChain: ["image"],
			timeout: 15000,
			strategyTimeout: 5000,
		})
		await previewService.initialize()
	}
	return previewService
}

function extractYouTubeId(url: string): string | null {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
		/youtube\.com\/shorts\/([^&\n?#]+)/,
	]
	for (const pattern of patterns) {
		const match = url.match(pattern)
		if (match?.[1]) return match[1]
	}
	return null
}

interface ProcessDocumentOptions {
	documentId: string
	jobId: string
	orgId: string
	payload?: Record<string, unknown>
}

/**
 * Process a document inline (called directly from API, not from worker)
 * Runs asynchronously - does not block the API response
 */
export async function processDocumentInline(
	options: ProcessDocumentOptions,
): Promise<void> {
	const { documentId, jobId, orgId, payload } = options

	console.log("[inline-processor] Starting", { documentId, jobId })

	try {
		// Mark as processing
		await updateDocumentStatus(documentId, "processing")
		await updateJobStatus(jobId, "processing")

		// Fetch document
		const { data: document, error: docError } = await supabaseAdmin
			.from("documents")
			.select(
				"content, metadata, user_id, title, url, source, type, raw, processing_metadata",
			)
			.eq("id", documentId)
			.maybeSingle()

		if (docError) throw docError
		if (!document) throw new Error("Document not found")

		const userId = document.user_id ?? (await getDefaultUserId())

		// Step 1: Extract content
		const extractor = await getExtractorService()
		const extraction = await extractor.extract({
			originalContent: document.content ?? null,
			url: document.url ?? null,
			type: document.type ?? null,
			metadata: document.metadata as Record<string, unknown>,
		})

		// Step 2: Process content (chunking, embeddings, summary, tags)
		const processor = await getProcessorService()
		const processed = await processor.process(extraction)

		// Step 3: Generate preview
		let preview: { url: string } | null = null
		try {
			if (
				document.url?.includes("youtube.com") ||
				document.url?.includes("youtu.be")
			) {
				const videoId = extractYouTubeId(document.url)
				if (videoId) {
					preview = {
						url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
					}
				}
			}

			if (!preview && document.url) {
				const previewSvc = await getPreviewService()
				const previewResult = await previewSvc.generate({
					title: extraction.title || "Untitled",
					text: extraction.text || "",
					url: document.url,
					source: extraction.source || "unknown",
					contentType: extraction.contentType || "text",
					metadata: (extraction.extractionMetadata as Record<string, unknown>) ||
						{},
				})
				if (previewResult?.url) {
					preview = { url: previewResult.url }
				}
			}
		} catch (e) {
			console.warn("[inline-processor] Preview failed", {
				documentId,
				error: e,
			})
		}

		// Step 4: Store everything using orchestrator storage helper
		// This handles chunks, document updates, and status in a transaction-like manner
		const metaTags = extraction.extractionMetadata?.metaTags ?? {}
		const allImages = [
			...(extraction.images ?? []),
			...(metaTags.ogImage ? [metaTags.ogImage] : []),
			...(metaTags.twitterImage ? [metaTags.twitterImage] : []),
		].filter((v, i, a) => a.indexOf(v) === i)

		await storeCompleteDocument({
			documentId,
			organizationId: orgId,
			userId: userId ?? "",
			url: document.url ?? null,
			title: extraction.title,
			content: extraction.text,
			processed,
			preview,
			metadata: {
				...document.metadata,
				processingCompleted: true,
				extractedAt: new Date().toISOString(),
				...(extraction.extractionMetadata ?? {}),
				ogImage: metaTags.ogImage,
				twitterImage: metaTags.twitterImage,
				...(processed.tags ? { tags: processed.tags } : {}),
			},
			raw: {
				...(extraction.raw ?? {}),
				extraction: { images: allImages, source: extraction.source },
			},
		})

		// Create auto-summary memory if summary exists
		if (processed.summary) {
			try {
				await upsertAutoSummaryMemory({
					documentId,
					organizationId: orgId,
					userId: userId ?? "",
					spaceId:
						((document.metadata as Record<string, unknown>)
							?.spaceId as string) ?? null,
					summary: processed.summary,
					metadata: {
						tags: processed.tags,
						wordCount: extraction.wordCount,
						chunkCount: processed.chunks?.length ?? 0,
					},
				})
			} catch (error) {
				// Non-critical error, log and continue
				console.warn("[inline-processor] Auto-summary memory failed", {
					documentId,
					error: (error as Error).message,
				})
			}
		}

		// Update job status
		await updateJobStatus(jobId, "completed")

		// Clear cache
		documentListCache.clear()
		documentCache.delete(documentId)

		console.log("[inline-processor] Done", { documentId })
	} catch (error) {
		console.error("[inline-processor] Failed", { documentId, error })

		// Mark as failed (storeCompleteDocument handles document status on failure)
		const errorMsg = error instanceof Error ? error.message : String(error)
		await updateJobStatus(jobId, "failed", errorMsg)

		documentListCache.clear()
		documentCache.delete(documentId)
	}
}
