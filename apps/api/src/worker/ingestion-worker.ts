import "dotenv/config"
import { supabaseAdmin } from "../supabase"
import { env } from "../env"
import { processDocument } from "../services/ingestion"
import { ensureSpace } from "../routes/documents"
import { getDefaultUserId } from "../supabase"

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

async function hydrateDocument(jobId: string, documentId: string, orgId: string, payload: any) {
  const { data: document, error: docError } = await supabaseAdmin
    .from("documents")
    .select("content, metadata, user_id")
    .eq("id", documentId)
    .maybeSingle()

  if (docError) throw docError
  if (!document) {
    throw new Error("Document not found for ingestion job")
  }

  const content = document.content ?? ""
  if (!content) {
    throw new Error("Document has no content for ingestion")
  }

  const containerTags: string[] = Array.isArray(payload?.containerTags)
    ? payload.containerTags
    : Array.isArray(document.metadata?.containerTags)
      ? document.metadata.containerTags
      : ["sm_project_default"]

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
    content,
    metadata: document.metadata ?? null,
    containerTags,
    jobId,
  })
}

async function handleJobFailure(job: IngestionJobRow, attempts: number, error: unknown) {
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
        processing_metadata: { error: message },
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
