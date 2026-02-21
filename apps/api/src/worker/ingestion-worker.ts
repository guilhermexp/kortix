import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { config as loadEnv } from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const apiRoot = join(__dirname, "../../")

loadEnv({ path: join(apiRoot, ".env.local") })
loadEnv({ path: join(apiRoot, ".env") })
loadEnv()

// Minimal logging - set LOG_LEVEL=debug for verbose output
const LOG_LEVEL = process.env.LOG_LEVEL || "warn"
const LEVELS: Record<string, number> = {
	silent: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4,
}
const level = LEVELS[LOG_LEVEL] ?? 2
const originalLog = console.log
const originalWarn = console.warn
const originalInfo = console.info
const originalDebug = console.debug
console.log = (...args: unknown[]) => {
	if (level >= 4) originalLog(...args)
}
console.debug = (...args: unknown[]) => {
	if (level >= 4) originalDebug(...args)
}
console.info = (...args: unknown[]) => {
	if (level >= 3) originalInfo(...args)
}
console.warn = (...args: unknown[]) => {
	if (level >= 2) originalWarn(...args)
}

import { env } from "../env"
import { sanitizeJson } from "../services/ingestion/utils"
import { MetadataExtractor } from "../services/processing/metadata-extractor"
import { documentCache, documentListCache } from "../services/query-cache"
import { supabaseAdmin } from "../supabase"
import { WorkerCircuitBreaker } from "./circuit-breaker"
import { initializeServices, processAndSaveDocument } from "./process-document"

const MAX_BATCH = Number(env.INGESTION_BATCH_SIZE) || 5
const POLL_INTERVAL = Number(env.INGESTION_POLL_MS) || 5000
const MAX_ATTEMPTS = Number(env.INGESTION_MAX_ATTEMPTS) || 5
const MAX_IDLE_POLL_INTERVAL = 30_000
const IDLE_BACKOFF_MULTIPLIER = 2
const JITTER_FACTOR = 0.1
const MIN_POLL_INTERVAL = 1_000

// Circuit breaker instance
const circuitBreaker = new WorkerCircuitBreaker({
	failureThreshold: 3,
	maxBackoff: 300_000,
	baseBackoff: 5_000,
})

// Polling state
let currentPollInterval = POLL_INTERVAL
let idlePolls = 0
let isTickRunning = false
let tickTimer: NodeJS.Timeout | null = null
let lastScheduledDelay = POLL_INTERVAL

// Metadata extractor for reindex-metadata jobs (not part of unified pipeline)
const metadataExtractor = new MetadataExtractor()

type IngestionJobRow = {
	id: string
	document_id: string
	org_id: string
	payload: unknown
	attempts: number | null
}

type DocumentMetadata = Record<string, unknown> | null

function withJitter(delayMs: number): number {
	const jitter = delayMs * JITTER_FACTOR
	return Math.max(MIN_POLL_INTERVAL, delayMs + (Math.random() * 2 - 1) * jitter)
}

function scheduleNextTick(delayMs: number, reason: string): void {
	const jitteredDelay = Math.round(withJitter(delayMs))

	if (tickTimer) clearTimeout(tickTimer)
	tickTimer = setTimeout(tick, jitteredDelay)

	const delayChangedMeaningfully =
		Math.abs(jitteredDelay - lastScheduledDelay) > 2000
	if (reason === "work" || (delayChangedMeaningfully && reason !== "idle-backoff")) {
		console.log(
			`[ingestion-worker] Next poll in ${Math.round(jitteredDelay / 1000)}s (${reason})`,
		)
	}
	lastScheduledDelay = jitteredDelay
}

async function healthCheck(): Promise<boolean> {
	try {
		const { error } = await supabaseAdmin
			.from("organizations")
			.select("id")
			.limit(1)
			.single()

		if (error && error.code !== "PGRST116") throw error
		return true
	} catch (error) {
		console.error("[ingestion-worker] Health check failed:", error)
		return false
	}
}

async function fetchQueuedJobs(): Promise<IngestionJobRow[]> {
	const { data, error } = await supabaseAdmin
		.from("ingestion_jobs")
		.select("id, document_id, org_id, payload, attempts")
		.eq("status", "queued")
		.order("created_at", { ascending: true })
		.limit(MAX_BATCH)

	if (error) throw error
	return data ?? []
}

async function hydrateDocument(
	jobId: string,
	documentId: string,
	orgId: string,
	payload: unknown,
) {
	await processAndSaveDocument({
		documentId,
		jobId,
		orgId,
		payload,
		logPrefix: "[ingestion-worker]",
	})
}

async function handleReindexMetadata(
	jobId: string,
	documentId: string,
	orgId: string,
	payload: unknown,
) {
	console.log("[ingestion-worker] Starting metadata reindexing", {
		jobId,
		documentId,
		orgId,
	})

	const { data: document, error: docError } = await supabaseAdmin
		.from("documents")
		.select("content, metadata, title, url, source, type")
		.eq("id", documentId)
		.maybeSingle()

	if (docError) throw docError
	if (!document) throw new Error("Document not found for reindexing job")

	const extractedMetadata = await metadataExtractor.extractFromContent(
		document.content || "",
		(document.metadata as Record<string, unknown>) || {},
		{
			extractTags: true,
			extractMentions: true,
			extractProperties: true,
			extractComments: true,
			includeSource: true,
		},
	)

	const updatedMetadata = {
		...(document.metadata as Record<string, unknown>),
		extracted: {
			tags: extractedMetadata.tags,
			mentions: extractedMetadata.mentions,
			properties: extractedMetadata.properties,
			comments: extractedMetadata.comments,
			statistics: extractedMetadata.statistics,
			...(extractedMetadata.source ? { source: extractedMetadata.source } : {}),
		},
		reindexedAt: new Date().toISOString(),
		reindexReason:
			typeof payload === "object" && payload !== null
				? (payload as { reason?: string }).reason || "Metadata changed"
				: "Metadata changed",
	}

	await supabaseAdmin
		.from("documents")
		.update({ metadata: updatedMetadata, updated_at: new Date().toISOString() })
		.eq("id", documentId)

	await supabaseAdmin
		.from("ingestion_jobs")
		.update({ status: "completed", completed_at: new Date().toISOString() })
		.eq("id", jobId)

	documentListCache.clear()
	documentCache.delete(documentId)

	console.log("[ingestion-worker] Metadata reindexing completed", {
		jobId,
		documentId,
	})
}

async function handleJobFailure(
	job: IngestionJobRow,
	attempts: number,
	error: unknown,
) {
	const message = error instanceof Error ? error.message : String(error)

	if (attempts >= MAX_ATTEMPTS) {
		await supabaseAdmin
			.from("ingestion_jobs")
			.update({ status: "failed", error_message: message })
			.eq("id", job.id)

		await supabaseAdmin
			.from("documents")
			.update({
				status: "failed",
				processing_metadata: sanitizeJson({ error: message }) as Record<
					string,
					unknown
				>,
			})
			.eq("id", job.document_id)

		documentListCache.clear()
		documentCache.delete(job.document_id)

		console.error("ingestion-worker job permanently failed", job.id, message)
		return
	}

	await supabaseAdmin
		.from("ingestion_jobs")
		.update({ status: "queued", error_message: message })
		.eq("id", job.id)

	await supabaseAdmin
		.from("documents")
		.update({ status: "queued" })
		.eq("id", job.document_id)

	documentListCache.clear()
	documentCache.delete(job.document_id)

	console.warn(
		"ingestion-worker job retry scheduled",
		JSON.stringify({ jobId: job.id, attempts, message }),
	)
}

async function processJob(job: IngestionJobRow): Promise<boolean> {
	const attempts = (job.attempts ?? 0) + 1

	const jobType =
		typeof job.payload === "object" &&
		job.payload !== null &&
		"type" in job.payload
			? (job.payload as { type?: string }).type
			: undefined

	console.log("[ingestion-worker] Starting job processing", {
		jobId: job.id,
		documentId: job.document_id,
		attempts,
		jobType: jobType || "standard",
	})

	await supabaseAdmin
		.from("ingestion_jobs")
		.update({ attempts, status: "processing" })
		.eq("id", job.id)

	try {
		if (jobType === "reindex-metadata") {
			await handleReindexMetadata(job.id, job.document_id, job.org_id, job.payload)
		} else {
			await hydrateDocument(job.id, job.document_id, job.org_id, job.payload)
		}

		circuitBreaker.recordJobSuccess()
		return true
	} catch (error) {
		console.error("[ingestion-worker] Job failed", {
			jobId: job.id,
			documentId: job.document_id,
			error: error instanceof Error ? error.message : String(error),
		})

		const shouldPause = await circuitBreaker.recordJobFailure(error)
		if (shouldPause) return false

		await handleJobFailure(job, attempts, error)
		return true
	}
}

async function tick() {
	if (isTickRunning) return
	isTickRunning = true
	let nextDelay = currentPollInterval
	let nextReason = "work"

	try {
		if (!circuitBreaker.canMakeRequest()) {
			nextDelay = Math.max(circuitBreaker.getRemainingBackoff(), currentPollInterval)
			nextReason = "circuit-open"
			return
		}

		const jobs = await fetchQueuedJobs()
		circuitBreaker.recordDbSuccess()

		if (jobs.length === 0) {
			idlePolls += 1
			currentPollInterval = Math.min(
				POLL_INTERVAL * IDLE_BACKOFF_MULTIPLIER ** idlePolls,
				MAX_IDLE_POLL_INTERVAL,
			)
			nextDelay = currentPollInterval
			nextReason = "idle-backoff"
			return
		}

		idlePolls = 0
		currentPollInterval = POLL_INTERVAL

		console.log(`[ingestion-worker] Processing ${jobs.length} queued jobs`)

		let processedCount = 0
		let queuePaused = false

		for (const job of jobs) {
			const shouldContinue = await processJob(job)
			processedCount++
			if (!shouldContinue) {
				queuePaused = true
				break
			}
		}

		if (queuePaused) {
			nextDelay = circuitBreaker.getBackoff()
			nextReason = "queue-paused"
		} else {
			nextDelay = currentPollInterval
		}
	} catch (error) {
		circuitBreaker.recordDbFailure(error)
		console.error("[ingestion-worker] Tick error", {
			error: error instanceof Error ? error.message : String(error),
			circuitState: circuitBreaker.getState(),
		})
		nextDelay = circuitBreaker.getBackoff()
		nextReason = "error-backoff"
	} finally {
		isTickRunning = false
		scheduleNextTick(nextDelay, nextReason)
	}
}

async function main() {
	console.log("[ingestion-worker] Ingestion worker started")
	console.log("[ingestion-worker] Configuration:", {
		maxBatch: MAX_BATCH,
		pollInterval: POLL_INTERVAL,
		maxAttempts: MAX_ATTEMPTS,
		maxIdlePollInterval: MAX_IDLE_POLL_INTERVAL,
	})

	try {
		console.log("[ingestion-worker] Running initial health check...")
		const isHealthy = await healthCheck()
		if (!isHealthy) {
			console.error("[ingestion-worker] Health check failed, starting with circuit breaker open")
		} else {
			console.log("[ingestion-worker] Health check passed")
		}

		await initializeServices()
		console.log("[ingestion-worker] Pipeline services initialized")

		await metadataExtractor.initialize()
		console.log("[ingestion-worker] Metadata extractor initialized")

		console.log("[ingestion-worker] Starting adaptive polling loop")
		await tick()
	} catch (error) {
		console.error("[ingestion-worker] Fatal error during startup", {
			error: error instanceof Error ? error.message : String(error),
		})
		process.exit(1)
	}
}

void main()
