import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { config as loadEnv } from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const apiRoot = join(__dirname, "../../")

loadEnv({ path: join(apiRoot, ".env.local") })
loadEnv({ path: join(apiRoot, ".env") })
loadEnv()

import { env } from "../env"
import { ensureSpace } from "../routes/documents"
import { processDocument } from "../services/ingestion"
import { getDefaultUserId, supabaseAdmin } from "../supabase"

const MAX_BATCH = env.INGESTION_BATCH_SIZE
const POLL_INTERVAL = env.INGESTION_POLL_MS
const MAX_ATTEMPTS = env.INGESTION_MAX_ATTEMPTS

type IngestionJobRow = {
	id: string
	document_id: string
	org_id: string
	payload: unknown
	attempts: number | null
}

type DocumentMetadata = Record<string, unknown> | null

function toStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) {
		return null
	}

	const tags = value.filter((item): item is string => typeof item === "string")
	return tags.length > 0 ? tags : null
}

function extractContainerTagsFromPayload(payload: unknown): string[] | null {
	if (!payload || typeof payload !== "object") {
		return null
	}

	const maybeTags = (payload as { containerTags?: unknown }).containerTags
	return toStringArray(maybeTags)
}

function extractContainerTagsFromMetadata(
	metadata: DocumentMetadata,
): string[] | null {
	if (!metadata || typeof metadata !== "object") {
		return null
	}

	const maybeTags = (metadata as { containerTags?: unknown }).containerTags
	return toStringArray(maybeTags)
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
	const { data: document, error: docError } = await supabaseAdmin
		.from("documents")
		.select(
			"content, metadata, user_id, title, url, source, type, raw, processing_metadata",
		)
		.eq("id", documentId)
		.maybeSingle()

	if (docError) throw docError
	if (!document) {
		throw new Error("Document not found for ingestion job")
	}

	const payloadTags = extractContainerTagsFromPayload(payload)
	const metadataTags = extractContainerTagsFromMetadata(document.metadata)
	const containerTags = payloadTags ?? metadataTags ?? ["sm_project_default"]

	const [primaryTag] = containerTags
	const spaceId = await ensureSpace(supabaseAdmin, orgId, primaryTag)
	const userId = document.user_id ?? (await getDefaultUserId())

	if (!userId) {
		throw new Error("Missing user for ingestion job")
	}

	await processDocument({
		documentId,
		organizationId: orgId,
		userId,
		spaceId,
		containerTags,
		jobId,
		document: {
			content: document.content ?? null,
			metadata: document.metadata ?? null,
			title: document.title ?? null,
			url: document.url ?? null,
			source: document.source ?? null,
			type: document.type ?? null,
			raw: document.raw ?? null,
			processingMetadata: document.processing_metadata ?? null,
		},
		jobPayload: payload ?? null,
	})
}

async function handleJobFailure(
	job: IngestionJobRow,
	attempts: number,
	error: unknown,
) {
	const message = error instanceof Error ? error.message : String(error)
  // Sanitize helper to avoid JSON 22P02 due to invalid surrogates
  const sanitizeString = (value: string) =>
    value.replace(/([\uD800-\uDBFF])(?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])([\uDC00-\uDFFF])/g, "\uFFFD")
  const sanitizeJson = (value: unknown): unknown => {
    if (value == null) return value
    const t = typeof value
    if (t === "string") return sanitizeString(value as string)
    if (t === "number" || t === "boolean") return value
    if (Array.isArray(value)) return value.map((v) => sanitizeJson(v))
    if (t === "object") {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === undefined || typeof v === "function") continue
        out[k] = sanitizeJson(v)
      }
      return out
    }
    return null
  }

	if (attempts >= MAX_ATTEMPTS) {
		await supabaseAdmin
			.from("ingestion_jobs")
			.update({ status: "failed", error_message: message })
			.eq("id", job.id)

		await supabaseAdmin
			.from("documents")
			.update({
				status: "failed",
				processing_metadata: sanitizeJson({ error: message }) as Record<string, unknown>,
			})
			.eq("id", job.document_id)
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

	console.warn(
		"ingestion-worker job retry scheduled",
		JSON.stringify({ jobId: job.id, attempts, message }),
	)
}

async function processJob(job: IngestionJobRow) {
	const attempts = (job.attempts ?? 0) + 1

	await supabaseAdmin
		.from("ingestion_jobs")
		.update({ attempts })
		.eq("id", job.id)

	try {
		await hydrateDocument(job.id, job.document_id, job.org_id, job.payload)
	} catch (error) {
		await handleJobFailure(job, attempts, error)
	}
}

async function tick() {
	try {
		const jobs = await fetchQueuedJobs()
		if (jobs.length === 0) return

		for (const job of jobs) {
			await processJob(job)
		}
	} catch (error) {
		console.error("ingestion-worker tick error", error)
	}
}

async function main() {
	console.log("Ingestion worker started")
	await tick()
	setInterval(tick, POLL_INTERVAL)
}

void main()
