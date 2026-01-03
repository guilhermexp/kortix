import { type JobsOptions, Queue } from "bullmq"
import { isRedisEnabled, redis } from "./redis-client"

export type DocumentJobData = {
	documentId: string
	orgId: string
	userId?: string
	payload?: Record<string, unknown>
}

const QUEUE_NAME = "document-processing"

// Default job options with retry strategy
const DEFAULT_JOB_OPTIONS: JobsOptions = {
	attempts: 3,
	backoff: {
		type: "exponential",
		delay: 2000, // Start with 2s, then 4s, then 8s
	},
	removeOnComplete: {
		age: 3600, // Keep completed jobs for 1 hour
		count: 1000, // Keep at most 1000 completed jobs
	},
	removeOnFail: {
		age: 86400, // Keep failed jobs for 24 hours
	},
}

// Create queue only if Redis is available
export const documentQueue = isRedisEnabled()
	? new Queue<DocumentJobData>(QUEUE_NAME, {
			connection: redis!,
			defaultJobOptions: DEFAULT_JOB_OPTIONS,
		})
	: null

/**
 * Add a document processing job to the queue
 * Returns the job ID if queued, null if Redis is not available
 */
export async function addDocumentJob(
	documentId: string,
	orgId: string,
	userId?: string,
	payload?: Record<string, unknown>,
): Promise<string | null> {
	if (!documentQueue) {
		console.log(
			"[document-queue] Redis not available, skipping queue",
			documentId,
		)
		return null
	}

	const job = await documentQueue.add(
		"process",
		{
			documentId,
			orgId,
			userId,
			payload,
		},
		{
			// Use documentId as job ID for deduplication
			jobId: `doc-${documentId}`,
		},
	)

	console.log("[document-queue] Job added to queue", {
		jobId: job.id,
		documentId,
		orgId,
	})

	return job.id ?? null
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
	if (!documentQueue) {
		return null
	}

	const [waiting, active, completed, failed, delayed] = await Promise.all([
		documentQueue.getWaitingCount(),
		documentQueue.getActiveCount(),
		documentQueue.getCompletedCount(),
		documentQueue.getFailedCount(),
		documentQueue.getDelayedCount(),
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

/**
 * Pause the queue (for maintenance or error recovery)
 */
export async function pauseQueue(): Promise<void> {
	if (documentQueue) {
		await documentQueue.pause()
		console.log("[document-queue] Queue paused")
	}
}

/**
 * Resume the queue
 */
export async function resumeQueue(): Promise<void> {
	if (documentQueue) {
		await documentQueue.resume()
		console.log("[document-queue] Queue resumed")
	}
}

/**
 * Clean old jobs from the queue
 */
export async function cleanQueue(gracePeriod = 3600000): Promise<void> {
	if (documentQueue) {
		await documentQueue.clean(gracePeriod, 1000, "completed")
		await documentQueue.clean(gracePeriod * 24, 1000, "failed")
		console.log("[document-queue] Queue cleaned")
	}
}
