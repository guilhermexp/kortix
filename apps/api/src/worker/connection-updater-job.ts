/**
 * BullMQ Worker for Document Connection Updates
 *
 * This worker updates automatic connections between documents based on similarity.
 * It runs when documents are created or updated with embeddings.
 *
 * Usage: bun run src/worker/connection-updater-job.ts
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

import { type Job, Queue, Worker } from "bullmq"
import { updateAutomaticConnections } from "../services/document-similarity"
import { isRedisEnabled, redis } from "../services/queue/redis-client"
import { supabaseAdmin } from "../supabase"

const QUEUE_NAME = "document-connections"
const CONCURRENCY = Number(process.env.CONNECTION_QUEUE_CONCURRENCY) || 2

export type ConnectionUpdateJobData = {
	documentId: string
	orgId: string
	threshold?: number
	limit?: number
}

/**
 * Process a connection update job
 */
async function processConnectionUpdate(
	job: Job<ConnectionUpdateJobData>,
): Promise<void> {
	const { documentId, orgId, threshold = 0.7, limit = 10 } = job.data

	console.log("[connection-updater] Processing job", {
		jobId: job.id,
		documentId,
		orgId,
		attempt: job.attemptsMade + 1,
	})

	// Verify document exists and has embeddings
	const { data: document, error: docError } = await supabaseAdmin
		.from("documents")
		.select("id, org_id, summary")
		.eq("id", documentId)
		.eq("org_id", orgId)
		.maybeSingle()

	if (docError) {
		console.error("[connection-updater] Error fetching document:", docError)
		throw docError
	}

	if (!document) {
		console.warn("[connection-updater] Document not found, skipping", {
			jobId: job.id,
			documentId,
		})
		return
	}

	// Check if document has summary (which indicates it has been processed)
	if (!document.summary) {
		console.log(
			"[connection-updater] Document not yet processed, skipping connection update",
			{
				jobId: job.id,
				documentId,
			},
		)
		return
	}

	try {
		// Update automatic connections using the similarity service
		await updateAutomaticConnections(supabaseAdmin, documentId, orgId, {
			threshold,
			limit,
		})

		console.log("[connection-updater] Successfully updated connections", {
			jobId: job.id,
			documentId,
			threshold,
			limit,
		})
	} catch (error) {
		console.error("[connection-updater] Failed to update connections", {
			jobId: job.id,
			documentId,
			error: error instanceof Error ? error.message : String(error),
		})
		throw error
	}
}

// Create queue only if Redis is available
export const connectionQueue = isRedisEnabled()
	? new Queue<ConnectionUpdateJobData>(QUEUE_NAME, {
			connection: redis!,
			defaultJobOptions: {
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 5000, // Start with 5s, then 10s, then 20s
				},
				removeOnComplete: {
					age: 3600, // Keep completed jobs for 1 hour
					count: 500, // Keep at most 500 completed jobs
				},
				removeOnFail: {
					age: 86400, // Keep failed jobs for 24 hours
				},
			},
		})
	: null

/**
 * Add a connection update job to the queue
 * Returns the job ID if queued, null if Redis is not available
 */
export async function addConnectionUpdateJob(
	documentId: string,
	orgId: string,
	options: {
		threshold?: number
		limit?: number
	} = {},
): Promise<string | null> {
	if (!connectionQueue) {
		console.log(
			"[connection-updater] Redis not available, skipping queue",
			documentId,
		)
		return null
	}

	const job = await connectionQueue.add(
		"update",
		{
			documentId,
			orgId,
			threshold: options.threshold,
			limit: options.limit,
		},
		{
			// Use documentId as job ID for deduplication
			jobId: `conn-${documentId}`,
			// Delay the job slightly to ensure document processing is complete
			delay: 2000, // 2 second delay
		},
	)

	console.log("[connection-updater] Job added to queue", {
		jobId: job.id,
		documentId,
		orgId,
	})

	return job.id ?? null
}

/**
 * Get connection queue statistics
 */
export async function getConnectionQueueStats() {
	if (!connectionQueue) {
		return null
	}

	const [waiting, active, completed, failed, delayed] = await Promise.all([
		connectionQueue.getWaitingCount(),
		connectionQueue.getActiveCount(),
		connectionQueue.getCompletedCount(),
		connectionQueue.getFailedCount(),
		connectionQueue.getDelayedCount(),
	])

	return {
		waiting,
		active,
		completed,
		failed,
		delayed,
		total: waiting + active + delayed,
	}
}

async function main() {
	if (!isRedisEnabled()) {
		console.error(
			"[connection-updater] Redis not configured. Set UPSTASH_REDIS_URL.",
		)
		process.exit(1)
	}

	console.log("[connection-updater] Starting BullMQ worker")
	console.log("[connection-updater] Configuration:", {
		queue: QUEUE_NAME,
		concurrency: CONCURRENCY,
	})

	// Create worker
	const worker = new Worker<ConnectionUpdateJobData>(
		QUEUE_NAME,
		async (job) => {
			await processConnectionUpdate(job)
		},
		{
			connection: redis!,
			concurrency: CONCURRENCY,
			removeOnComplete: { count: 500 },
			removeOnFail: { count: 1000 },
		},
	)

	// Event handlers
	worker.on("completed", (job) => {
		console.log("[connection-updater] Job completed", { jobId: job.id })
	})

	worker.on("failed", (job, error) => {
		console.error("[connection-updater] Job failed", {
			jobId: job?.id,
			documentId: job?.data?.documentId,
			error: error.message,
			attempts: job?.attemptsMade,
		})
	})

	worker.on("error", (error) => {
		console.error("[connection-updater] Worker error:", error)
	})

	worker.on("stalled", (jobId) => {
		console.warn("[connection-updater] Job stalled:", jobId)
	})

	console.log("[connection-updater] Worker started, waiting for jobs...")

	// Graceful shutdown
	const shutdown = async () => {
		console.log("[connection-updater] Shutting down...")
		await worker.close()
		process.exit(0)
	}

	process.on("SIGTERM", shutdown)
	process.on("SIGINT", shutdown)
}

// Only run the worker if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	void main()
}
