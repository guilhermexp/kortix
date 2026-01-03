/**
 * Inline Document Processor
 *
 * Processes documents directly when they are created, without a separate polling worker.
 * This is simpler and more efficient for low/medium volume.
 */

import { getDefaultUserId, supabaseAdmin } from "../supabase"
import { createDocumentExtractorService } from "./extraction"
import { createIngestionOrchestrator } from "./orchestration"
import { createPreviewGeneratorService } from "./preview/preview-generator"
import { createDocumentProcessorService } from "./processing"
import { documentCache, documentListCache } from "./query-cache"

// Create service instances (lazy initialization)
let orchestrator: ReturnType<typeof createIngestionOrchestrator> | null = null
let previewService: ReturnType<typeof createPreviewGeneratorService> | null =
	null

function getOrchestrator() {
	if (!orchestrator) {
		const extractorService = createDocumentExtractorService()
		const processorService = createDocumentProcessorService()
		orchestrator = createIngestionOrchestrator()
		orchestrator.setExtractorService(extractorService)
		orchestrator.setProcessorService(processorService)
	}
	return orchestrator
}

function getPreviewService() {
	if (!previewService) {
		previewService = createPreviewGeneratorService({
			enableImageExtraction: true,
			enableFaviconExtraction: false,
			fallbackChain: ["image"],
			timeout: 15000,
			strategyTimeout: 5000,
		})
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
		await supabaseAdmin
			.from("documents")
			.update({ status: "processing", updated_at: new Date().toISOString() })
			.eq("id", documentId)

		await supabaseAdmin
			.from("ingestion_jobs")
			.update({ status: "processing" })
			.eq("id", jobId)

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

		// Generate preview first (fast, for UI)
		let previewUrl: string | null = null
		try {
			if (
				document.url?.includes("youtube.com") ||
				document.url?.includes("youtu.be")
			) {
				const videoId = extractYouTubeId(document.url)
				if (videoId) {
					previewUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
				}
			}

			if (!previewUrl && document.url) {
				const previewResult = await getPreviewService().generate({
					title: document.title || "Untitled",
					text: document.content || "",
					url: document.url,
					source: document.source || "unknown",
					contentType: document.type || "text",
					metadata: (document.metadata as Record<string, unknown>) || {},
				})
				previewUrl = previewResult?.url || null
			}

			if (previewUrl) {
				await supabaseAdmin
					.from("documents")
					.update({ preview_image: previewUrl })
					.eq("id", documentId)
			}
		} catch (e) {
			console.warn("[inline-processor] Preview failed", {
				documentId,
				error: e,
			})
		}

		// Process with orchestrator
		const result = await getOrchestrator().processDocument({
			content: document.content ?? "",
			url: document.url ?? null,
			type: document.type ?? null,
			userId: userId ?? "",
			organizationId: orgId,
			metadata: {
				...document.metadata,
				documentId,
				jobId,
				source: document.source,
				raw: document.raw,
			},
		})

		const extraction = result.metadata?.extraction
		const processed = result.metadata?.processed
		const preview = result.metadata?.preview
		const metaTags = extraction?.extractionMetadata?.metaTags ?? {}

		// Build final update
		const finalUpdate: Record<string, unknown> = {
			status: "done",
			error: null,
			updated_at: new Date().toISOString(),
		}

		if (extraction?.text) finalUpdate.content = extraction.text
		if (extraction?.title) finalUpdate.title = extraction.title
		if (processed?.summary) finalUpdate.summary = processed.summary
		if (preview?.url) finalUpdate.preview_image = preview.url
		if (extraction?.wordCount) finalUpdate.word_count = extraction.wordCount
		if (processed?.tags?.length) finalUpdate.tags = processed.tags

		finalUpdate.metadata = {
			...document.metadata,
			processingCompleted: true,
			extractedAt: new Date().toISOString(),
			...(extraction?.extractionMetadata ?? {}),
			ogImage: metaTags.ogImage,
			twitterImage: metaTags.twitterImage,
			...(processed?.tags ? { tags: processed.tags } : {}),
		}

		if (extraction?.images?.length || metaTags.ogImage) {
			const allImages = [
				...(extraction?.images ?? []),
				...(metaTags.ogImage ? [metaTags.ogImage] : []),
				...(metaTags.twitterImage ? [metaTags.twitterImage] : []),
			].filter((v, i, a) => a.indexOf(v) === i)

			finalUpdate.raw = {
				...(extraction?.raw ?? {}),
				extraction: { images: allImages, source: extraction?.source },
			}
		}

		// Save chunks
		if (processed?.chunks?.length) {
			const documentChunks = processed.chunks
				.filter((chunk) => chunk.content || (chunk as any).text)
				.map((chunk, index) => ({
					document_id: documentId,
					org_id: orgId,
					content: chunk.content || (chunk as any).text || "",
					embedding: chunk.embedding,
					chunk_index: chunk.position ?? index,
					token_count:
						(chunk as any).tokenCount ??
						Math.ceil((chunk.content || "").length / 4),
					embedding_model: "voyage-3-lite",
					metadata: chunk.metadata ?? {},
					created_at: new Date().toISOString(),
				}))

			const { error: chunksError } = await supabaseAdmin
				.from("document_chunks")
				.insert(documentChunks)

			if (chunksError) {
				console.error("[inline-processor] Chunks failed", {
					documentId,
					error: chunksError.message,
				})
				finalUpdate.status = "failed"
				finalUpdate.error = `Failed to save chunks: ${chunksError.message}`
			} else {
				finalUpdate.chunk_count = documentChunks.length
			}
		}

		// Final update
		await supabaseAdmin
			.from("documents")
			.update(finalUpdate)
			.eq("id", documentId)
		await supabaseAdmin
			.from("ingestion_jobs")
			.update({ status: "completed", completed_at: new Date().toISOString() })
			.eq("id", jobId)

		// Clear cache
		documentListCache.clear()
		documentCache.delete(documentId)

		console.log("[inline-processor] Done", {
			documentId,
			status: finalUpdate.status,
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
