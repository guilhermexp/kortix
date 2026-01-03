/**
 * BullMQ Worker for Document Processing
 *
 * This worker processes document jobs from the Redis queue.
 * It runs alongside (or replaces) the polling-based ingestion worker.
 *
 * Usage: bun run src/worker/queue-worker.ts
 */

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { config as loadEnv } from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const apiRoot = join(__dirname, "../../")

loadEnv({ path: join(apiRoot, ".env.local") })
loadEnv({ path: join(apiRoot, ".env") })
loadEnv()

import { type Job, Worker } from "bullmq"
import { ensureSpace } from "../routes/documents"
import { createDocumentExtractorService } from "../services/extraction"
import { sanitizeJson } from "../services/ingestion/utils"
import { createIngestionOrchestrator } from "../services/orchestration"
import { createPreviewGeneratorService } from "../services/preview/preview-generator"
import { createDocumentProcessorService } from "../services/processing"
import { documentCache, documentListCache } from "../services/query-cache"
import type { DocumentJobData } from "../services/queue/document-queue"
import { isRedisEnabled, redis } from "../services/queue/redis-client"
import { getDefaultUserId, supabaseAdmin } from "../supabase"

const QUEUE_NAME = "document-processing"
const CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY) || 3

// Create service instances
const extractorService = createDocumentExtractorService()
const processorService = createDocumentProcessorService()
const previewService = createPreviewGeneratorService({
	enableImageExtraction: true,
	enableFaviconExtraction: false,
	fallbackChain: ["image"],
	timeout: 15000,
	strategyTimeout: 5000,
})

// Create ingestion orchestrator instance and register services
const orchestrator = createIngestionOrchestrator()
orchestrator.setExtractorService(extractorService)
orchestrator.setProcessorService(processorService)
orchestrator.setPreviewService(previewService)

/**
 * Extract YouTube video ID from URL
 */
function extractYouTubeId(url: string): string | null {
	try {
		const u = new URL(url)
		if (u.hostname.includes("youtube.com")) {
			return u.searchParams.get("v")
		}
		if (u.hostname.includes("youtu.be")) {
			const pathParts = u.pathname.split("/").filter(Boolean)
			return pathParts[0] ?? null
		}
		return null
	} catch {
		return null
	}
}

function toStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null
	const tags = value.filter((item): item is string => typeof item === "string")
	return tags.length > 0 ? tags : null
}

function extractContainerTags(payload: unknown, metadata: unknown): string[] {
	const fromPayload =
		payload && typeof payload === "object"
			? toStringArray((payload as { containerTags?: unknown }).containerTags)
			: null
	const fromMetadata =
		metadata && typeof metadata === "object"
			? toStringArray((metadata as { containerTags?: unknown }).containerTags)
			: null
	return fromPayload ?? fromMetadata ?? ["sm_project_default"]
}

async function updateDocumentStatus(documentId: string, status: string) {
	try {
		await supabaseAdmin
			.from("documents")
			.update({ status, updated_at: new Date().toISOString() })
			.eq("id", documentId)

		// Invalidate caches to ensure fresh data is returned
		documentListCache.clear()
		documentCache.delete(documentId)

		console.log(`[queue-worker] Status: ${status}`, { documentId })
	} catch (error) {
		console.warn("[queue-worker] Failed to update status", {
			documentId,
			error,
		})
	}
}

/**
 * Process a document job
 */
async function processDocument(job: Job<DocumentJobData>): Promise<void> {
	const { documentId, orgId, payload } = job.data

	console.log("[queue-worker] Processing job", {
		jobId: job.id,
		documentId,
		orgId,
		attempt: job.attemptsMade + 1,
	})

	// Check if document is already processed (prevent duplicate processing)
	const { data: existingDoc } = await supabaseAdmin
		.from("documents")
		.select("status")
		.eq("id", documentId)
		.maybeSingle()

	if (existingDoc?.status === "done" || existingDoc?.status === "failed") {
		console.log("[queue-worker] Document already processed, skipping", {
			jobId: job.id,
			documentId,
			status: existingDoc.status,
		})
		return // Skip - already processed by DB worker
	}

	// Also check if DB worker is already processing this document
	const processingStatuses = [
		"fetching",
		"generating_preview",
		"extracting",
		"processing",
		"indexing",
	]
	if (existingDoc?.status && processingStatuses.includes(existingDoc.status)) {
		console.log(
			"[queue-worker] Document being processed by DB worker, skipping",
			{
				jobId: job.id,
				documentId,
				status: existingDoc.status,
			},
		)
		return // Skip - DB worker is handling it
	}

	console.log("[queue-worker] Starting document processing", {
		jobId: job.id,
		documentId,
		attempt: job.attemptsMade + 1,
	})

	// Update status: fetching
	await updateDocumentStatus(documentId, "fetching")

	const { data: document, error: docError } = await supabaseAdmin
		.from("documents")
		.select(
			"content, metadata, user_id, title, url, source, type, raw, processing_metadata",
		)
		.eq("id", documentId)
		.maybeSingle()

	if (docError) throw docError
	if (!document) {
		throw new Error(`Document not found: ${documentId}`)
	}

	const containerTags = extractContainerTags(payload, document.metadata)
	const [primaryTag] = containerTags
	const spaceId = await ensureSpace(supabaseAdmin, orgId, primaryTag)
	const userId = document.user_id ?? (await getDefaultUserId())

	// PRIORITY: Generate preview FIRST
	await updateDocumentStatus(documentId, "generating_preview")

	try {
		let previewUrl: string | null = null

		// YouTube thumbnail extraction
		if (
			document.url &&
			(document.source === "youtube" ||
				document.url.includes("youtube.com") ||
				document.url.includes("youtu.be"))
		) {
			const videoId = extractYouTubeId(document.url)
			if (videoId) {
				previewUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
			}
		}

		// Fallback to preview service
		if (!previewUrl) {
			const previewResult = await previewService.generate({
				title: document.title || "Untitled",
				text: document.content || "",
				url: document.url || null,
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
			console.log("[queue-worker] Preview saved", { documentId })
		}
	} catch (previewError) {
		console.warn("[queue-worker] Preview failed", {
			documentId,
			error:
				previewError instanceof Error
					? previewError.message
					: String(previewError),
		})
	}

	// Update status: extracting
	await updateDocumentStatus(documentId, "extracting")

	// Process document with orchestrator
	const result = await orchestrator.processDocument({
		content: document.content ?? "",
		url: document.url ?? null,
		type: document.type ?? null,
		userId: userId ?? "",
		organizationId: orgId,
		metadata: {
			...document.metadata,
			documentId,
			spaceId,
			containerTags,
			jobId: job.id,
			jobPayload: payload,
			source: document.source,
			raw: document.raw,
			processingMetadata: document.processing_metadata,
		},
	})

	console.log("[queue-worker] Orchestrator complete", {
		jobId: job.id,
		documentId,
		status: result.status,
	})

	// Update status: processing
	await updateDocumentStatus(documentId, "processing")

	const extraction = result.metadata?.extraction
	const processed = result.metadata?.processed
	const preview = result.metadata?.preview

	// Prepare document update
	const documentUpdate: Record<string, unknown> = {
		status: "done",
		updated_at: new Date().toISOString(),
	}

	if (extraction?.text) {
		documentUpdate.content = extraction.text
	}
	if (extraction?.title) {
		documentUpdate.title = extraction.title
	}
	if (processed?.summary) {
		documentUpdate.summary = processed.summary
	}
	if (preview?.url) {
		documentUpdate.preview_image = preview.url
	}

	// Update metadata
	const metaTags = extraction?.extractionMetadata?.metaTags ?? {}
	documentUpdate.metadata = {
		...document.metadata,
		processingCompleted: true,
		extractedAt: new Date().toISOString(),
		...(extraction?.extractionMetadata ?? {}),
		ogImage:
			metaTags.ogImage ?? (extraction?.extractionMetadata as any)?.ogImage,
		twitterImage:
			metaTags.twitterImage ??
			(extraction?.extractionMetadata as any)?.twitterImage,
		description:
			metaTags.description ??
			(extraction?.extractionMetadata as any)?.description,
		favicon:
			metaTags.favicon ?? (extraction?.extractionMetadata as any)?.favicon,
		...(processed?.tags ? { tags: processed.tags } : {}),
	}

	// Save raw extraction data
	if (extraction?.raw || extraction?.images || metaTags.ogImage) {
		const allImages = [
			...(extraction.images ?? []),
			...(metaTags.ogImage ? [metaTags.ogImage] : []),
			...(metaTags.twitterImage ? [metaTags.twitterImage] : []),
		].filter((v, i, a) => a.indexOf(v) === i)

		documentUpdate.raw = {
			...(extraction.raw ?? {}),
			extraction: {
				images: allImages,
				source: extraction.source,
				contentType: extraction.contentType,
				extractorUsed: extraction.extractorUsed,
			},
		}
	}

	if (extraction?.wordCount) {
		documentUpdate.word_count = extraction.wordCount
	}
	if (processed?.tags && processed.tags.length > 0) {
		documentUpdate.tags = processed.tags
	}

	// Update document
	const { error: docUpdateError } = await supabaseAdmin
		.from("documents")
		.update(documentUpdate)
		.eq("id", documentId)

	if (docUpdateError) {
		console.error("[queue-worker] Failed to update document", {
			documentId,
			error: docUpdateError.message,
		})
	}

	// Save chunks/embeddings
	if (processed?.chunks && processed.chunks.length > 0) {
		await updateDocumentStatus(documentId, "indexing")

		const validChunks = processed.chunks.filter(
			(chunk) => chunk.content || (chunk as any).text,
		)
		const documentChunks = validChunks.map((chunk, index) => {
			const chunkContent = chunk.content || (chunk as any).text || ""
			return {
				document_id: documentId,
				org_id: orgId,
				content: chunkContent,
				embedding: chunk.embedding,
				chunk_index: chunk.position ?? (chunk as any).index ?? index,
				token_count:
					(chunk as any).tokenCount ?? Math.ceil(chunkContent.length / 4),
				embedding_model: "voyage-3-lite",
				metadata: chunk.metadata ?? {},
				created_at: new Date().toISOString(),
			}
		})

		const { error: chunksError } = await supabaseAdmin
			.from("document_chunks")
			.insert(documentChunks)

		if (chunksError) {
			console.error("[queue-worker] Failed to save chunks", {
				documentId,
				error: chunksError.message,
			})
			await supabaseAdmin
				.from("documents")
				.update({
					status: "failed",
					error: `Failed to save chunks: ${chunksError.message}`,
				})
				.eq("id", documentId)
		} else {
			await supabaseAdmin
				.from("documents")
				.update({
					chunk_count: documentChunks.length,
					status: "done",
					error: null,
				})
				.eq("id", documentId)
		}
	} else {
		await updateDocumentStatus(documentId, "done")
	}

	// Mark ingestion_job as completed (if exists)
	await supabaseAdmin
		.from("ingestion_jobs")
		.update({
			status: "completed",
			completed_at: new Date().toISOString(),
		})
		.eq("document_id", documentId)

	console.log("[queue-worker] Job completed", {
		jobId: job.id,
		documentId,
		chunkCount: processed?.chunks?.length ?? 0,
	})
}

async function main() {
	if (!isRedisEnabled()) {
		console.error("[queue-worker] Redis not configured. Set UPSTASH_REDIS_URL.")
		process.exit(1)
	}

	console.log("[queue-worker] Starting BullMQ worker")
	console.log("[queue-worker] Configuration:", {
		queue: QUEUE_NAME,
		concurrency: CONCURRENCY,
	})

	// Initialize orchestrator
	await orchestrator.initialize()
	console.log("[queue-worker] Orchestrator initialized")

	// Create worker
	const worker = new Worker<DocumentJobData>(
		QUEUE_NAME,
		async (job) => {
			await processDocument(job)
		},
		{
			connection: redis!,
			concurrency: CONCURRENCY,
			removeOnComplete: { count: 1000 },
			removeOnFail: { count: 5000 },
		},
	)

	// Event handlers
	worker.on("completed", (job) => {
		console.log("[queue-worker] Job completed", { jobId: job.id })
	})

	worker.on("failed", (job, error) => {
		console.error("[queue-worker] Job failed", {
			jobId: job?.id,
			documentId: job?.data?.documentId,
			error: error.message,
			attempts: job?.attemptsMade,
		})

		// Update document status to failed
		if (job?.data?.documentId) {
			supabaseAdmin
				.from("documents")
				.update({
					status: "failed",
					processing_metadata: sanitizeJson({ error: error.message }) as Record<
						string,
						unknown
					>,
				})
				.eq("id", job.data.documentId)
				.then(() => {
					console.log("[queue-worker] Document marked as failed", {
						documentId: job.data.documentId,
					})
				})
		}
	})

	worker.on("error", (error) => {
		console.error("[queue-worker] Worker error:", error)
	})

	worker.on("stalled", (jobId) => {
		console.warn("[queue-worker] Job stalled:", jobId)
	})

	console.log("[queue-worker] Worker started, waiting for jobs...")

	// Graceful shutdown
	const shutdown = async () => {
		console.log("[queue-worker] Shutting down...")
		await worker.close()
		process.exit(0)
	}

	process.on("SIGTERM", shutdown)
	process.on("SIGINT", shutdown)
}

void main()
