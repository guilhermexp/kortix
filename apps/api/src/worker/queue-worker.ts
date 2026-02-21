/**
 * BullMQ Worker for Document Processing
 *
 * Processes document jobs from the Redis queue.
 * Delegates actual processing to the shared processAndSaveDocument().
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
import { sanitizeJson } from "../services/ingestion/utils"
import type { DocumentJobData } from "../services/queue/document-queue"
import { isRedisEnabled, redis } from "../services/queue/redis-client"
import { supabaseAdmin } from "../supabase"
import { initializeServices, processAndSaveDocument } from "./process-document"

const QUEUE_NAME = "document-processing"
const CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY) || 3

/**
 * Process a document job from the BullMQ queue
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
		return
	}

	// Check if DB worker is already processing this document
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
			{ jobId: job.id, documentId, status: existingDoc.status },
		)
		return
	}

	// Delegate to unified processing function
	await processAndSaveDocument({
		documentId,
		jobId: job.id ?? documentId,
		orgId,
		payload,
		logPrefix: "[queue-worker]",
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

	// Initialize shared pipeline services
	await initializeServices()
	console.log("[queue-worker] Pipeline services initialized")

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
					processing_metadata: sanitizeJson({
						error: error.message,
					}) as Record<string, unknown>,
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
