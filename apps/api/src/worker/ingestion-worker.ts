import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const apiRoot = join(__dirname, "../../");

loadEnv({ path: join(apiRoot, ".env.local") });
loadEnv({ path: join(apiRoot, ".env") });
loadEnv();

import { env } from "../env";
import { ensureSpace } from "../routes/documents";
import { createDocumentExtractorService } from "../services/extraction";
import { createIngestionOrchestrator } from "../services/orchestration";
import { createDocumentProcessorService } from "../services/processing";
import { createPreviewGeneratorService } from "../services/preview/preview-generator";
import { sanitizeJson } from "../services/ingestion/utils";
import { getDefaultUserId, supabaseAdmin } from "../supabase";

const MAX_BATCH = Number(env.INGESTION_BATCH_SIZE) || 5;
const POLL_INTERVAL = Number(env.INGESTION_POLL_MS) || 5000;
const MAX_ATTEMPTS = Number(env.INGESTION_MAX_ATTEMPTS) || 5;
const MAX_IDLE_POLL_INTERVAL = 60_000; // Cap idle polling at 1 req/min to avoid hammering Supabase
const IDLE_BACKOFF_MULTIPLIER = 2;
const JITTER_FACTOR = 0.1;
const MIN_POLL_INTERVAL = 1_000;

// Circuit breaker configuration
const CIRCUIT_BREAKER = {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: 3,
  /** Time to wait before attempting to close the circuit (ms) */
  resetTimeout: 60_000, // 1 minute
  /** Maximum backoff time (ms) */
  maxBackoff: 300_000, // 5 minutes
  /** Base backoff time (ms) */
  baseBackoff: 5_000, // 5 seconds
};

// Patterns that indicate systemic errors (should pause queue)
const SYSTEMIC_ERROR_PATTERNS = [
  // API/Service errors
  "rate limit", "rate_limit", "quota exceeded", "too many requests",
  "429", "503", "502", "500",
  // Auth errors
  "unauthorized", "authentication", "invalid api key", "api key",
  "forbidden", "401", "403",
  // Service unavailable
  "service unavailable", "temporarily unavailable",
  "internal server error", "server error",
  // Network/Connection
  "timeout", "ECONNREFUSED", "ETIMEDOUT", "fetch failed",
  "connection refused", "network error",
  // AI service specific
  "gemini", "openai", "anthropic", "model not found",
  "resource exhausted", "billing",
];

/**
 * Check if an error is systemic (affects all jobs) vs document-specific
 */
function isSystemicError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return SYSTEMIC_ERROR_PATTERNS.some(pattern => message.includes(pattern.toLowerCase()));
}

// Circuit breaker state
let circuitState: "closed" | "open" | "half-open" = "closed";
let consecutiveFailures = 0;
let consecutiveJobFailures = 0; // Track job failures separately
let lastFailureTime = 0;
let lastSystemicError = "";
let currentBackoff = CIRCUIT_BREAKER.baseBackoff;
let currentPollInterval = POLL_INTERVAL;
let idlePolls = 0;
let isTickRunning = false;
let tickTimer: NodeJS.Timeout | null = null;
let lastScheduledDelay = POLL_INTERVAL;

// Create service instances
const extractorService = createDocumentExtractorService();
const processorService = createDocumentProcessorService();
// NOTE: Favicon fallback disabled because external favicon URLs cause CORS errors
// when loaded directly by the browser. Only use image extraction which provides
// OpenGraph/Twitter images that are typically CORS-friendly.
const previewService = createPreviewGeneratorService({
	enableImageExtraction: true,
	enableFaviconExtraction: false,
	fallbackChain: ["image"], // Only use image extraction
	timeout: 15000,
	strategyTimeout: 5000,
});

// Create ingestion orchestrator instance and register services
const orchestrator = createIngestionOrchestrator();
orchestrator.setExtractorService(extractorService);
orchestrator.setProcessorService(processorService);
orchestrator.setPreviewService(previewService);

type IngestionJobRow = {
  id: string;
  document_id: string;
  org_id: string;
  payload: unknown;
  attempts: number | null;
};

type DocumentMetadata = Record<string, unknown> | null;

/**
 * Extract YouTube video ID from URL
 */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);

    // youtube.com/watch?v=VIDEO_ID
    if (u.hostname.includes("youtube.com")) {
      const videoId = u.searchParams.get("v");
      if (videoId) return videoId;
    }

    // youtu.be/VIDEO_ID
    if (u.hostname.includes("youtu.be")) {
      const pathParts = u.pathname.split("/").filter(Boolean);
      if (pathParts.length > 0) return pathParts[0];
    }

    return null;
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const tags = value.filter((item): item is string => typeof item === "string");
  return tags.length > 0 ? tags : null;
}

function extractContainerTagsFromPayload(payload: unknown): string[] | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const maybeTags = (payload as { containerTags?: unknown }).containerTags;
  return toStringArray(maybeTags);
}

function extractContainerTagsFromMetadata(
  metadata: DocumentMetadata,
): string[] | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const maybeTags = (metadata as { containerTags?: unknown }).containerTags;
  return toStringArray(maybeTags);
}

/**
 * Check if the circuit breaker allows requests
 */
function canMakeRequest(): boolean {
  if (circuitState === "closed") {
    return true;
  }

  if (circuitState === "open") {
    const timeSinceFailure = Date.now() - lastFailureTime;
    if (timeSinceFailure >= currentBackoff) {
      // Try to close the circuit
      circuitState = "half-open";
      console.log(
        `[ingestion-worker] Circuit breaker half-open, attempting recovery after ${Math.round(currentBackoff / 1000)}s`,
      );
      return true;
    }
    return false;
  }

  // half-open state allows one request
  return true;
}

/**
 * Record a successful database operation
 */
function recordSuccess(): void {
  if (circuitState !== "closed") {
    console.log(
      "[ingestion-worker] Circuit breaker closed - database recovered",
    );
  }
  circuitState = "closed";
  consecutiveFailures = 0;
  currentBackoff = CIRCUIT_BREAKER.baseBackoff;
}

/**
 * Record a successful job completion - resets job failure counter
 */
function recordJobSuccess(): void {
  consecutiveJobFailures = 0;
  lastSystemicError = "";
}

/**
 * Record a job failure and check if it's systemic
 * Returns true if the queue should be paused
 */
async function recordJobFailure(error: unknown): Promise<boolean> {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Check if this is a systemic error
  if (isSystemicError(error)) {
    consecutiveJobFailures++;
    lastSystemicError = errorMessage;
    lastFailureTime = Date.now();

    console.warn(
      `[ingestion-worker] Systemic error detected (${consecutiveJobFailures}/${CIRCUIT_BREAKER.failureThreshold}): ${errorMessage}`,
    );

    // If we hit the threshold, pause all pending jobs
    if (consecutiveJobFailures >= CIRCUIT_BREAKER.failureThreshold) {
      console.error(
        `[ingestion-worker] 🛑 QUEUE PAUSED - ${consecutiveJobFailures} consecutive systemic errors. Last error: ${errorMessage}`,
      );
      await pauseAllPendingJobs(errorMessage);

      // Open circuit breaker
      circuitState = "open";
      currentBackoff = Math.min(
        currentBackoff * 2 + Math.random() * 1000,
        CIRCUIT_BREAKER.maxBackoff,
      );

      return true;
    }
  } else {
    // Non-systemic error (document-specific) - reset job failure counter
    consecutiveJobFailures = 0;
  }

  return false;
}

/**
 * Pause all pending jobs in the queue when a systemic error is detected
 * This prevents all jobs from failing one by one
 */
async function pauseAllPendingJobs(errorMessage: string): Promise<void> {
  try {
    // Update all queued ingestion_jobs to paused
    const { data: pausedJobs, error: jobError } = await supabaseAdmin
      .from("ingestion_jobs")
      .update({
        status: "paused",
        error_message: `Queue paused due to systemic error: ${errorMessage}`,
      })
      .eq("status", "queued")
      .select("id, document_id");

    if (jobError) {
      console.error("[ingestion-worker] Failed to pause jobs:", jobError);
      return;
    }

    const jobCount = pausedJobs?.length ?? 0;

    if (jobCount > 0) {
      // Update corresponding documents to paused status
      const documentIds = pausedJobs?.map(j => j.document_id) ?? [];

      await supabaseAdmin
        .from("documents")
        .update({
          status: "paused",
          processing_metadata: sanitizeJson({
            pausedAt: new Date().toISOString(),
            pauseReason: errorMessage,
          }) as Record<string, unknown>,
        })
        .in("id", documentIds);

      console.log(`[ingestion-worker] Paused ${jobCount} pending jobs to prevent cascade failure`);
    }
  } catch (error) {
    console.error("[ingestion-worker] Error pausing jobs:", error);
  }
}

/**
 * Record a failed database operation
 */
function recordFailure(error: unknown): void {
  consecutiveFailures++;
  lastFailureTime = Date.now();

  const errorMessage = error instanceof Error ? error.message : String(error);
  const isConnectionError =
    errorMessage.includes("timeout") ||
    errorMessage.includes("connection") ||
    errorMessage.includes("ECONNREFUSED") ||
    errorMessage.includes("fetch failed") ||
    errorMessage.includes("522") ||
    errorMessage.includes("Connection terminated");

  if (isConnectionError) {
    if (consecutiveFailures >= CIRCUIT_BREAKER.failureThreshold) {
      circuitState = "open";
      // Exponential backoff with jitter
      currentBackoff = Math.min(
        currentBackoff * 2 + Math.random() * 1000,
        CIRCUIT_BREAKER.maxBackoff,
      );
      console.error(
        `[ingestion-worker] Circuit breaker OPEN after ${consecutiveFailures} failures. ` +
          `Next retry in ${Math.round(currentBackoff / 1000)}s. Error: ${errorMessage}`,
      );
    } else {
      console.warn(
        `[ingestion-worker] Database connection failure ${consecutiveFailures}/${CIRCUIT_BREAKER.failureThreshold}. ` +
          `Error: ${errorMessage}`,
      );
    }
  }
}

/**
 * Add jitter to polling to avoid synchronized hammering after outages
 */
function withJitter(delayMs: number): number {
  const jitter = delayMs * JITTER_FACTOR;
  const jittered =
    delayMs +
    // Random value between -jitter and +jitter
    (Math.random() * 2 - 1) * jitter;
  return Math.max(MIN_POLL_INTERVAL, jittered);
}

/**
 * Schedule the next tick with a dynamic delay
 */
function scheduleNextTick(delayMs: number, reason: string): void {
  const jitteredDelay = Math.round(withJitter(delayMs));

  if (tickTimer) {
    clearTimeout(tickTimer);
  }

  tickTimer = setTimeout(tick, jitteredDelay);

  const delayChangedMeaningfully =
    Math.abs(jitteredDelay - lastScheduledDelay) > 1000;
  const shouldLogDelayChange =
    reason !== "work" || delayChangedMeaningfully;

  if (shouldLogDelayChange) {
    console.log(
      `[ingestion-worker] Next poll in ${Math.round(jitteredDelay / 1000)}s (${reason})`,
    );
  }

  lastScheduledDelay = jitteredDelay;
}

/**
 * Health check - verify database connectivity
 */
async function healthCheck(): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .limit(1)
      .single();

    // PGRST116 means no rows found, which is fine - connection works
    if (error && error.code !== "PGRST116") {
      throw error;
    }
    return true;
  } catch (error) {
    console.error("[ingestion-worker] Health check failed:", error);
    return false;
  }
}

async function fetchQueuedJobs(): Promise<IngestionJobRow[]> {
  const { data, error } = await supabaseAdmin
    .from("ingestion_jobs")
    .select("id, document_id, org_id, payload, attempts")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH);

  if (error) throw error;
  return data ?? [];
}

// Helper to update document status in real-time
async function updateDocumentStatus(documentId: string, status: string) {
  try {
    await supabaseAdmin
      .from("documents")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", documentId);
    console.log(`[ingestion-worker] Status updated to: ${status}`, { documentId });
  } catch (error) {
    console.warn("[ingestion-worker] Failed to update status", { documentId, status, error });
  }
}

async function hydrateDocument(
  jobId: string,
  documentId: string,
  orgId: string,
  payload: unknown,
) {
  // Update status: fetching document data
  await updateDocumentStatus(documentId, "fetching");

  const { data: document, error: docError } = await supabaseAdmin
    .from("documents")
    .select(
      "content, metadata, user_id, title, url, source, type, raw, processing_metadata",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (docError) throw docError;
  if (!document) {
    throw new Error("Document not found for ingestion job");
  }

  const payloadTags = extractContainerTagsFromPayload(payload);
  const metadataTags = extractContainerTagsFromMetadata(document.metadata);
  const containerTags = payloadTags ?? metadataTags ?? ["sm_project_default"];

  const [primaryTag] = containerTags;
  const spaceId = await ensureSpace(supabaseAdmin, orgId, primaryTag);
  const userId = document.user_id ?? (await getDefaultUserId());

  if (!userId) {
    console.warn(
      `[ingestion-worker] No user found for job ${jobId}, processing without user_id`,
    );
  }

  // PRIORITY: Generate preview FIRST before any processing
  // This allows the UI to show a preview immediately while processing continues
  await updateDocumentStatus(documentId, "generating_preview");

  try {
    let previewUrl: string | null = null;

    // Special handling for YouTube videos - extract thumbnail directly
    if (document.url && (document.source === "youtube" || document.url.includes("youtube.com") || document.url.includes("youtu.be"))) {
      const videoId = extractYouTubeId(document.url);
      if (videoId) {
        // Use maxresdefault for best quality, fallback to hqdefault
        previewUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        console.log("[ingestion-worker] YouTube thumbnail extracted", {
          documentId,
          videoId,
          previewUrl,
        });
      }
    }

    // If not YouTube or extraction failed, use preview service
    if (!previewUrl) {
      const previewResult = await previewService.generate({
        title: document.title || "Untitled",
        text: document.content || "",
        url: document.url || null,
        source: document.source || "unknown",
        contentType: document.type || "text",
        metadata: document.metadata as Record<string, unknown> || {},
      });
      previewUrl = previewResult?.url || null;
    }

    if (previewUrl) {
      // Save preview immediately so UI can display it
      await supabaseAdmin
        .from("documents")
        .update({ preview_image: previewUrl })
        .eq("id", documentId);

      console.log("[ingestion-worker] Preview generated and saved first", {
        documentId,
        previewUrl: previewUrl.substring(0, 100),
      });
    }
  } catch (previewError) {
    // Don't fail the whole job if preview generation fails
    console.warn("[ingestion-worker] Preview generation failed, continuing with processing", {
      documentId,
      error: previewError instanceof Error ? previewError.message : String(previewError),
    });
  }

  // Update status: extracting content
  await updateDocumentStatus(documentId, "extracting");

  // Use the new orchestrator instead of deprecated processDocument
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
      jobId,
      jobPayload: payload,
      source: document.source,
      raw: document.raw,
      processingMetadata: document.processing_metadata,
    },
  });

  console.log(
    "[ingestion-worker] Document processed successfully with orchestrator",
    {
      jobId,
      documentId,
      result: result.documentId,
      status: result.status,
      hasExtraction: !!result.metadata?.extraction,
      hasProcessed: !!result.metadata?.processed,
    },
  );

  // Update status: processing/saving data
  await updateDocumentStatus(documentId, "processing");

  // Extract the processed data from the orchestrator result
  const extraction = result.metadata?.extraction;
  const processed = result.metadata?.processed;
  const preview = result.metadata?.preview;

  // Prepare document update with extracted content
  const documentUpdate: Record<string, unknown> = {
    status: "done",
    updated_at: new Date().toISOString(),
  };

  // Save extracted content (ExtractionResult uses 'text' not 'content')
  if (extraction?.text) {
    documentUpdate.content = extraction.text;
    console.log("[ingestion-worker] Saving extracted content", {
      documentId,
      contentLength: extraction.text.length,
    });
  }

  // Save extracted title
  if (extraction?.title) {
    documentUpdate.title = extraction.title;
    console.log("[ingestion-worker] Saving title", {
      documentId,
      title: extraction.title,
    });
  } else {
    console.log("[ingestion-worker] No title in extraction result", {
      documentId,
      extractionKeys: extraction ? Object.keys(extraction) : [],
    });
  }

  // Save summary from processing
  if (processed?.summary) {
    documentUpdate.summary = processed.summary;
    console.log("[ingestion-worker] Saving summary", {
      documentId,
      summaryLength: processed.summary.length,
    });
  }

  // Save preview image URL
  if (preview?.url) {
    documentUpdate.preview_image = preview.url;
  }

  // Update metadata with processing results
  // Flatten metaTags into top-level metadata so frontend can find ogImage, twitterImage, etc.
  const metaTags = extraction?.extractionMetadata?.metaTags ?? {};
  const updatedMetadata = {
    ...document.metadata,
    processingCompleted: true,
    extractedAt: new Date().toISOString(),
    ...(extraction?.extractionMetadata ?? {}),
    // Flatten metaTags to top level for frontend compatibility
    ogImage: metaTags.ogImage ?? (extraction?.extractionMetadata as any)?.ogImage,
    twitterImage: metaTags.twitterImage ?? (extraction?.extractionMetadata as any)?.twitterImage,
    description: metaTags.description ?? (extraction?.extractionMetadata as any)?.description,
    favicon: metaTags.favicon ?? (extraction?.extractionMetadata as any)?.favicon,
    ...(processed?.tags ? { tags: processed.tags } : {}),
  };
  documentUpdate.metadata = updatedMetadata;

  // Save raw extraction data including images
  if (extraction?.raw || extraction?.images || metaTags.ogImage) {
    const allImages = [
      ...(extraction.images ?? []),
      ...(metaTags.ogImage ? [metaTags.ogImage] : []),
      ...(metaTags.twitterImage ? [metaTags.twitterImage] : []),
    ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

    documentUpdate.raw = {
      ...(extraction.raw ?? {}),
      extraction: {
        images: allImages,
        source: extraction.source,
        contentType: extraction.contentType,
        extractorUsed: extraction.extractorUsed,
      },
    };
    console.log("[ingestion-worker] Saving raw extraction data", {
      documentId,
      imageCount: allImages.length,
      ogImage: metaTags.ogImage ?? null,
      twitterImage: metaTags.twitterImage ?? null,
    });
  }

  // Save word count if available
  if (extraction?.wordCount) {
    documentUpdate.word_count = extraction.wordCount;
  }

  // Save tags to the tags column
  if (processed?.tags && processed.tags.length > 0) {
    documentUpdate.tags = processed.tags;
  }

  // Update document with extracted data
  const { error: docUpdateError } = await supabaseAdmin
    .from("documents")
    .update(documentUpdate)
    .eq("id", documentId);

  if (docUpdateError) {
    console.error("[ingestion-worker] Failed to update document with extracted data", {
      documentId,
      error: docUpdateError.message,
    });
  }

  // Save chunks/embeddings if available
  if (processed?.chunks && processed.chunks.length > 0) {
    // Update status: indexing (saving embeddings)
    await updateDocumentStatus(documentId, "indexing");

    console.log("[ingestion-worker] Saving chunks", {
      documentId,
      chunkCount: processed.chunks.length,
      firstChunkKeys: Object.keys(processed.chunks[0] ?? {}),
    });

    // Filter out chunks without content and map to db schema
    // Note: chunks can have either 'content' or 'text' property depending on the processor
    const validChunks = processed.chunks.filter(chunk => chunk.content || (chunk as any).text);
    const documentChunks = validChunks.map((chunk, index) => {
      const chunkContent = chunk.content || (chunk as any).text || "";
      return {
        document_id: documentId,
        org_id: orgId,
        content: chunkContent,
        embedding: chunk.embedding,
        chunk_index: chunk.position ?? (chunk as any).index ?? index,
        token_count: (chunk as any).tokenCount ?? Math.ceil(chunkContent.length / 4),
        embedding_model: "voyage-3-lite",
        metadata: chunk.metadata ?? {},
        created_at: new Date().toISOString(),
      };
    });

    const { error: chunksError } = await supabaseAdmin
      .from("document_chunks")
      .insert(documentChunks);

    if (chunksError) {
      console.error("[ingestion-worker] Failed to save chunks", {
        documentId,
        error: chunksError.message,
      });
      // Mark as failed if chunks couldn't be saved
      await supabaseAdmin
        .from("documents")
        .update({ status: "failed", error: `Failed to save chunks: ${chunksError.message}` })
        .eq("id", documentId);
    } else {
      console.log("[ingestion-worker] Chunks saved successfully", {
        documentId,
        chunkCount: documentChunks.length,
      });

      // Update document with chunk count and mark as done
      await supabaseAdmin
        .from("documents")
        .update({ chunk_count: documentChunks.length, status: "done", error: null })
        .eq("id", documentId);
    }
  } else {
    // No chunks but extraction succeeded - mark as done anyway
    await updateDocumentStatus(documentId, "done");
  }

  // Mark job as completed
  await supabaseAdmin
    .from("ingestion_jobs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString()
    })
    .eq("id", jobId);

  console.log("[ingestion-worker] Job and document marked as completed", {
    jobId,
    documentId,
    hasContent: !!extraction?.content,
    hasSummary: !!processed?.summary,
    chunkCount: processed?.chunks?.length ?? 0,
  });
}

async function handleJobFailure(
  job: IngestionJobRow,
  attempts: number,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);

  if (attempts >= MAX_ATTEMPTS) {
    await supabaseAdmin
      .from("ingestion_jobs")
      .update({ status: "failed", error_message: message })
      .eq("id", job.id);

    await supabaseAdmin
      .from("documents")
      .update({
        status: "failed",
        processing_metadata: sanitizeJson({ error: message }) as Record<
          string,
          unknown
        >,
      })
      .eq("id", job.document_id);
    console.error("ingestion-worker job permanently failed", job.id, message);
    return;
  }

  await supabaseAdmin
    .from("ingestion_jobs")
    .update({ status: "queued", error_message: message })
    .eq("id", job.id);

  await supabaseAdmin
    .from("documents")
    .update({ status: "queued" })
    .eq("id", job.document_id);

  console.warn(
    "ingestion-worker job retry scheduled",
    JSON.stringify({ jobId: job.id, attempts, message }),
  );
}

/**
 * Process a single job
 * @returns true if processing should continue, false if queue was paused
 */
async function processJob(job: IngestionJobRow): Promise<boolean> {
  const attempts = (job.attempts ?? 0) + 1;

  console.log("[ingestion-worker] Starting job processing", {
    jobId: job.id,
    documentId: job.document_id,
    attempts,
  });

  await supabaseAdmin
    .from("ingestion_jobs")
    .update({ attempts })
    .eq("id", job.id);

  try {
    await hydrateDocument(job.id, job.document_id, job.org_id, job.payload);

    console.log(
      "[ingestion-worker] Job completed successfully with orchestrator",
      {
        jobId: job.id,
        documentId: job.document_id,
      },
    );

    // Record success - resets systemic error counter
    recordJobSuccess();
    return true;
  } catch (error) {
    console.error("[ingestion-worker] Job failed with error", {
      jobId: job.id,
      documentId: job.document_id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Check if this is a systemic error that should pause the queue
    const shouldPauseQueue = await recordJobFailure(error);

    if (shouldPauseQueue) {
      // Don't call handleJobFailure - the job is already paused with others
      return false;
    }

    // Handle the failure normally (retry or mark as failed)
    await handleJobFailure(job, attempts, error);
    return true;
  }
}

async function tick() {
  if (isTickRunning) {
    console.warn("[ingestion-worker] Tick skipped - previous tick still running");
    return;
  }

  isTickRunning = true;
  let nextDelay = currentPollInterval;
  let nextReason = "work";

  try {
    // Check circuit breaker before making any requests
    if (!canMakeRequest()) {
      const timeSinceFailure = Date.now() - lastFailureTime;
      const remainingBackoff = Math.max(currentBackoff - timeSinceFailure, 0);
      nextDelay = Math.max(remainingBackoff, currentPollInterval);
      nextReason = "circuit-open";
      return;
    }

    const jobs = await fetchQueuedJobs();

    // Record success - database is responsive
    recordSuccess();

    if (jobs.length === 0) {
      idlePolls += 1;
      currentPollInterval = Math.min(
        POLL_INTERVAL * Math.pow(IDLE_BACKOFF_MULTIPLIER, idlePolls),
        MAX_IDLE_POLL_INTERVAL,
      );
      nextDelay = currentPollInterval;
      nextReason = "idle-backoff";
      return;
    }

    // Reset polling aggressiveness as soon as we have work
    idlePolls = 0;
    currentPollInterval = POLL_INTERVAL;

    console.log(`[ingestion-worker] Processing ${jobs.length} queued jobs`);

    let processedCount = 0;
    let queuePaused = false;

    for (const job of jobs) {
      const shouldContinue = await processJob(job);
      processedCount++;

      if (!shouldContinue) {
        // Queue was paused due to systemic error - stop processing
        queuePaused = true;
        console.log(`[ingestion-worker] Stopping after ${processedCount} jobs - queue paused`);
        break;
      }
    }

    if (queuePaused) {
      nextDelay = currentBackoff;
      nextReason = "queue-paused";
    } else {
      console.log(`[ingestion-worker] Finished processing ${processedCount} jobs`);
      nextDelay = currentPollInterval;
      nextReason = "work";
    }
  } catch (error) {
    // Record failure for circuit breaker
    recordFailure(error);

    console.error("[ingestion-worker] Tick error", {
      error: error instanceof Error ? error.message : JSON.stringify(error),
      stack: error instanceof Error ? error.stack : undefined,
      circuitState,
      consecutiveFailures,
    });
    nextDelay = currentBackoff;
    nextReason = "error-backoff";
  } finally {
    isTickRunning = false;
    scheduleNextTick(nextDelay, nextReason);
  }
}

async function main() {
  console.log("[ingestion-worker] Ingestion worker started");
  console.log("[ingestion-worker] Configuration:", {
    maxBatch: MAX_BATCH,
    pollInterval: POLL_INTERVAL,
    maxAttempts: MAX_ATTEMPTS,
    circuitBreaker: CIRCUIT_BREAKER,
    maxIdlePollInterval: MAX_IDLE_POLL_INTERVAL,
  });

  try {
    // Health check before starting
    console.log("[ingestion-worker] Running initial health check...");
    const isHealthy = await healthCheck();
    if (!isHealthy) {
      console.error(
        "[ingestion-worker] Initial health check failed, starting with circuit breaker open",
      );
      circuitState = "open";
      lastFailureTime = Date.now();
    } else {
      console.log("[ingestion-worker] Health check passed");
    }

    // Initialize the orchestrator
    await orchestrator.initialize();
    console.log(
      "[ingestion-worker] Ingestion orchestrator initialized successfully",
    );

    console.log("[ingestion-worker] Starting adaptive polling loop");
    await tick();
  } catch (error) {
    console.error("[ingestion-worker] Fatal error during startup", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

void main();
