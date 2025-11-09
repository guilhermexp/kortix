/**
 * Document Ingestion Service (Legacy - Backward Compatibility Layer)
 *
 * ⚠️ DEPRECATED: This file is maintained for backward compatibility only.
 * All logic has been delegated to IngestionOrchestratorService.
 *
 * ✅ New Architecture (Recommended):
 * For new code, use IngestionOrchestratorService from services/orchestration/
 *
 * Example:
 * ```typescript
 * import { createIngestionOrchestrator } from './services/orchestration';
 * import { createDocumentExtractorService } from './services/extraction';
 * import { createDocumentProcessorService } from './services/processing';
 * import { createPreviewGeneratorService } from './services/preview';
 *
 * // Create and initialize services
 * const extractor = createDocumentExtractorService();
 * const processor = createDocumentProcessorService();
 * const previewer = createPreviewGeneratorService();
 * const orchestrator = createIngestionOrchestrator();
 *
 * await Promise.all([
 *   extractor.initialize(),
 *   processor.initialize(),
 *   previewer.initialize(),
 *   orchestrator.initialize()
 * ]);
 *
 * // Register services with orchestrator
 * orchestrator.setExtractorService(extractor);
 * orchestrator.setProcessorService(processor);
 * orchestrator.setPreviewService(previewer);
 *
 * // Process document
 * const result = await orchestrator.processDocument({
 *   url: 'https://example.com',
 *   type: 'url',
 *   userId: 'user-123',
 *   organizationId: 'org-456'
 * });
 * ```
 *
 * Migration Path:
 * - Phase 7 (Current): All logic delegated to IngestionOrchestratorService
 * - Phase 8 (Future): Migrate all callers to use IngestionOrchestratorService directly
 * - Phase 9 (Future): Remove this file entirely
 *
 * See: docs/migration-guide.md for migration instructions
 */

import { createIngestionOrchestrator } from "./orchestration";
import { createDocumentExtractorService } from "./extraction";
import { createDocumentProcessorService } from "./processing";
import { createPreviewGeneratorService } from "./preview";
import { supabaseAdmin } from "../supabase";
import type {
  ExtractionResult,
  ProcessedDocument,
  PreviewResult,
} from "./interfaces";

// ============================================================================
// Legacy Type Definitions (for backward compatibility)
// ============================================================================

export type JsonRecord = Record<string, unknown>;

export type ProcessDocumentInput = {
  documentId: string;
  organizationId: string;
  userId: string | null | undefined;
  spaceId: string;
  containerTags: string[];
  jobId?: string;
  document: {
    content: string | null;
    metadata: JsonRecord | null;
    title: string | null;
    url: string | null;
    source: string | null;
    type: string | null;
    raw: JsonRecord | null;
    processingMetadata: JsonRecord | null;
  };
  jobPayload: JsonRecord | null;
};

function sanitizeString(value: string): string {
  return value.replace(
    /([\uD800-\uDBFF])(?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])([\uDC00-\uDFFF])/g,
    "\uFFFD",
  );
}

function sanitizeJson(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return sanitizeString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeJson(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === undefined || typeof val === "function") continue;
      out[key] = sanitizeJson(val);
    }
    return out;
  }
  return null;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeRecords(
  ...records: Array<JsonRecord | null | undefined>
): JsonRecord {
  const out: JsonRecord = {};
  for (const record of records) {
    if (!isJsonRecord(record)) continue;
    for (const [key, val] of Object.entries(record)) {
      if (val === undefined) continue;
      out[key] = val;
    }
  }
  return out;
}

// ============================================================================
// Service Instances (singleton)
// ============================================================================

let orchestratorServiceInstance: Awaited<
  ReturnType<typeof createIngestionOrchestrator>
> | null = null;
let extractorServiceInstance: Awaited<
  ReturnType<typeof createDocumentExtractorService>
> | null = null;
let processorServiceInstance: Awaited<
  ReturnType<typeof createDocumentProcessorService>
> | null = null;
let previewServiceInstance: Awaited<
  ReturnType<typeof createPreviewGeneratorService>
> | null = null;

async function getOrchestrator() {
  if (!orchestratorServiceInstance) {
    // Initialize all services
    extractorServiceInstance = createDocumentExtractorService({
      pdf: {
        enabled: true,
        ocrEnabled: true,
        ocrProvider: "replicate",
      },
      youtube: {
        enabled: true,
        preferredLanguages: ["en", "en-US", "pt", "pt-BR"],
      },
      firecrawl: {
        enabled: true,
        apiKey: process.env.FIRECRAWL_API_KEY,
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 60000,
      },
    });

    processorServiceInstance = createDocumentProcessorService({
      chunking: {
        enabled: true,
        chunkSize: 800,
        chunkOverlap: 100,
      },
      embedding: {
        enabled: true,
        provider: "voyage",
        batchSize: 10,
        useCache: true,
      },
      summarization: {
        enabled: true,
        provider: "openrouter",
      },
      tagging: {
        enabled: true,
        maxTags: 10,
      },
    });

    previewServiceInstance = createPreviewGeneratorService({
      enableImageExtraction: true,
      enableSvgGeneration: true,
      enableFaviconExtraction: true,
    });

    orchestratorServiceInstance = createIngestionOrchestrator({
      timeout: 60000,
      circuitBreaker: {
        enabled: true,
      },
    });

    // Initialize all services
    await Promise.all([
      extractorServiceInstance.initialize(),
      processorServiceInstance.initialize(),
      previewServiceInstance.initialize(),
      orchestratorServiceInstance.initialize(),
    ]);

    // Register services with orchestrator
    orchestratorServiceInstance.setExtractorService(extractorServiceInstance);
    orchestratorServiceInstance.setProcessorService(processorServiceInstance);
    orchestratorServiceInstance.setPreviewService(previewServiceInstance);

    console.log("[ingestion.ts] IngestionOrchestratorService initialized");
  }

  return orchestratorServiceInstance;
}

// ============================================================================
// Database Utilities (for backward compatibility)
// ============================================================================

async function updateDocumentStatus(
  documentId: string,
  status: string,
  extra?: JsonRecord,
) {
  const { error } = await supabaseAdmin
    .from("documents")
    .update({ status, ...(extra ?? {}) })
    .eq("id", documentId);

  if (error) throw error;
}

async function updateJobStatus(
  jobId: string,
  status: string,
  errorMessage?: string,
) {
  const { error } = await supabaseAdmin
    .from("ingestion_jobs")
    .update({ status, error_message: errorMessage ?? null })
    .eq("id", jobId);

  if (error) throw error;
}

async function upsertAutoSummaryMemory({
  documentId,
  organizationId,
  userId,
  spaceId,
  summary,
  metadata,
}: {
  documentId: string;
  organizationId: string;
  userId: string | null | undefined;
  spaceId?: string | null;
  summary: string;
  metadata?: JsonRecord | null;
}) {
  let summaryMetadata: JsonRecord | null = null;

  if (metadata) {
    const sanitized = sanitizeJson(metadata);
    if (isJsonRecord(sanitized) && Object.keys(sanitized).length > 0) {
      summaryMetadata = sanitized as JsonRecord;
    }
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("memories")
    .select("id, version")
    .eq("document_id", documentId)
    .eq("org_id", organizationId)
    .eq("is_inference", true)
    .order("created_at", { ascending: true })
    .limit(1);

  if (fetchError) {
    throw fetchError;
  }

  const baseUpdate = {
    content: summary,
    metadata: summaryMetadata,
    updated_at: new Date().toISOString(),
    is_latest: true,
    source_count: 1,
    space_id: spaceId ?? null,
    user_id: userId ?? null,
  };

  if (existing && existing.length > 0) {
    const current = existing[0];
    const nextVersion =
      typeof current.version === "number" && Number.isFinite(current.version)
        ? current.version + 1
        : 1;

    const { error: updateError } = await supabaseAdmin
      .from("memories")
      .update({ ...baseUpdate, version: nextVersion })
      .eq("id", current.id);

    if (updateError) {
      throw updateError;
    }

    return;
  }

  const { error: insertError } = await supabaseAdmin.from("memories").insert({
    document_id: documentId,
    org_id: organizationId,
    user_id: userId ?? null,
    space_id: spaceId ?? null,
    content: summary,
    metadata: summaryMetadata,
    is_inference: true,
    is_latest: true,
    source_count: 1,
  });

  if (insertError) {
    throw insertError;
  }
}

function sanitizeProcessingMetadata(
  metadata?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!metadata) return null;

  const { extractionResult, ...rest } = metadata;
  const sanitized: Record<string, unknown> = { ...rest };
  const processingDate = sanitized.processingDate;

  if (processingDate instanceof Date) {
    sanitized.processingDate = processingDate.toISOString();
  }

  return sanitized;
}

// ============================================================================
// Main Export (delegates to new service)
// ============================================================================

/**
 * Process document (Legacy)
 *
 * ⚠️ DEPRECATED: This function delegates to IngestionOrchestratorService.
 * For new code, use IngestionOrchestratorService directly.
 *
 * @param input - Legacy processing input
 * @returns Processing result
 *
 * @deprecated Use IngestionOrchestratorService from services/orchestration/ instead
 *
 * @example
 * ```typescript
 * // Legacy (still works)
 * import { processDocument } from './services/ingestion';
 * await processDocument({
 *   documentId: 'doc-123',
 *   organizationId: 'org-456',
 *   userId: 'user-789',
 *   spaceId: 'space-012',
 *   containerTags: ['tag1'],
 *   document: { content: 'text', ... }
 * });
 *
 * // New (recommended)
 * import { createIngestionOrchestrator } from './services/orchestration';
 * const orchestrator = createIngestionOrchestrator();
 * await orchestrator.initialize();
 * await orchestrator.processDocument({
 *   url: 'https://example.com',
 *   type: 'url',
 *   userId: 'user-789',
 *   organizationId: 'org-456'
 * });
 * ```
 */
export async function processDocument(input: ProcessDocumentInput) {
  console.warn(
    "[DEPRECATED] processDocument() is deprecated. " +
      "Use IngestionOrchestratorService from services/orchestration/ instead. " +
      "See docs/migration-guide.md for migration instructions.",
  );

  try {
    // Update initial status
    await updateDocumentStatus(input.documentId, "processing");
    if (input.jobId) {
      await updateJobStatus(input.jobId, "processing");
    }

    // Get orchestrator instance
    const orchestrator = await getOrchestrator();

    // Convert legacy input to new format
    const processingInput = {
      content: input.document.content ?? "",
      url: input.document.url,
      type: input.document.type || "text",
      userId: input.userId,
      organizationId: input.organizationId,
      metadata: input.document.metadata || undefined,
      options: {
        skipSummary: false,
        skipTags: false,
      },
    };

    // Delegate to orchestrator
    const result = await orchestrator.processDocument(processingInput);
    const metadata = (result.metadata ?? {}) as {
      extraction?: ExtractionResult;
      processed?: ProcessedDocument;
      preview?: PreviewResult;
    };

    const extraction =
      metadata.extraction ??
      (result as { extraction?: ExtractionResult }).extraction;
    const processed =
      metadata.processed ??
      (result as { processed?: ProcessedDocument }).processed;
    const preview =
      metadata.preview ?? (result as { preview?: PreviewResult }).preview;

    // Store results to database
    if (result.status === "done") {
      console.log("[ingestion.ts] Starting database save operation", {
        documentId: input.documentId,
        hasChunks: !!processed?.chunks?.length,
        hasSummary: !!processed?.summary,
        hasTags: !!processed?.tags?.length,
        hasPreview: !!preview?.url,
      });

      // Store chunks with embeddings
      if (processed?.chunks?.length) {
        console.log("[ingestion.ts] Processing chunks for insertion", {
          chunkCount: processed.chunks.length,
        });

        try {
          const chunksToInsert = processed.chunks.map((chunk, index) => {
            try {
              const metadata =
                (chunk as { metadata?: Record<string, unknown> }).metadata ?? {};
              const tokenCount =
                typeof (metadata as { tokenCount?: unknown }).tokenCount ===
                "number"
                  ? (metadata as { tokenCount: number }).tokenCount
                  : typeof (chunk as { tokenCount?: unknown }).tokenCount ===
                      "number"
                    ? (chunk as { tokenCount: number }).tokenCount
                    : 0;

              // Safely extract embedding
              const embeddingValue = (chunk as { embedding?: unknown }).embedding;
              let embedding: number[] = [];

              try {
                if (Array.isArray(embeddingValue)) {
                  embedding = embeddingValue as number[];
                } else if (
                  typeof ArrayBuffer !== "undefined" &&
                  embeddingValue &&
                  ArrayBuffer.isView(embeddingValue as ArrayBufferView)
                ) {
                  embedding = Array.from(embeddingValue as ArrayLike<number>);
                }
              } catch (embError) {
                console.warn("[ingestion.ts] Failed to extract embedding for chunk", {
                  index,
                  error: (embError as Error).message,
                });
              }

              // Extract content safely
              const content =
                (chunk as { content?: string; text?: string }).content ??
                (chunk as { content?: string; text?: string }).text ??
                "";

              // Validate content is not empty
              if (!content || content.trim().length === 0) {
                console.warn("[ingestion.ts] Chunk has empty content", { index });
              }

              return {
                document_id: input.documentId,
                org_id: input.organizationId,
                content,
                embedding,
                position:
                  typeof (chunk as { position?: unknown }).position === "number"
                    ? (chunk as { position: number }).position
                    : typeof (chunk as { index?: unknown }).index === "number"
                      ? (chunk as { index: number }).index
                      : index,
                metadata,
              };
            } catch (chunkError) {
              console.error("[ingestion.ts] Failed to process chunk", {
                index,
                error: (chunkError as Error).message,
                stack: (chunkError as Error).stack,
              });
              throw chunkError;
            }
          });

          console.log("[ingestion.ts] Chunks processed, inserting to database:", {
            chunkCount: chunksToInsert.length,
            documentId: input.documentId,
            firstChunkSize: chunksToInsert[0]?.content?.length ?? 0,
            hasEmbeddings: chunksToInsert.every((c) => c.embedding.length > 0),
          });

          const { error: chunksError } = await supabaseAdmin
            .from("document_chunks")
            .insert(chunksToInsert);

          if (chunksError) {
            console.error("[ingestion.ts] Failed to store chunks:", {
              error: chunksError,
              message: chunksError.message,
              code: chunksError.code,
              details: chunksError.details,
              hint: chunksError.hint,
            });
            throw chunksError;
          }

          console.log("[ingestion.ts] Chunks stored successfully");
        } catch (chunksProcessingError) {
          console.error("[ingestion.ts] Error during chunk processing/insertion:", {
            error: (chunksProcessingError as Error).message,
            stack: (chunksProcessingError as Error).stack,
            documentId: input.documentId,
          });
          throw chunksProcessingError;
        }
      }

      // Update document with summary and tags
      console.log("[ingestion.ts] Preparing document update");

      try {
        const processingMetadata = sanitizeProcessingMetadata(
          (processed?.metadata as Record<string, unknown> | null) ?? null,
        );

        // Validate and potentially truncate preview_image if too large
        let previewImage = preview?.url ?? null;
        if (previewImage && previewImage.length > 1000000) {
          // > 1MB
          console.warn("[ingestion.ts] Preview image too large, truncating", {
            originalSize: previewImage.length,
            documentId: input.documentId,
          });
          previewImage = null;
        }

        const contentCandidate =
          typeof processed?.content === "string"
            ? processed.content
            : typeof extraction?.text === "string"
              ? extraction.text
              : input.document.content;
        const sanitizedContent =
          typeof contentCandidate === "string"
            ? sanitizeString(contentCandidate)
            : null;

        const existingMetadata = isJsonRecord(input.document.metadata)
          ? (input.document.metadata as JsonRecord)
          : null;
        const processedMetadata = isJsonRecord(processed?.metadata)
          ? (processed?.metadata as JsonRecord)
          : null;
        const extractionMetadata = isJsonRecord(extraction?.extractionMetadata)
          ? (extraction?.extractionMetadata as JsonRecord)
          : null;

        const mergedMetadataRaw = mergeRecords(
          existingMetadata,
          extractionMetadata,
          processedMetadata,
        );

        let tags: string[] = [];
        if (Array.isArray(processed?.tags)) {
          tags = processed.tags
            .map((tag) =>
              typeof tag === "string" ? sanitizeString(tag).trim() : "",
            )
            .filter((tag) => tag.length > 0);
        }

        if (tags.length > 0) {
          mergedMetadataRaw.aiTags = tags;
          mergedMetadataRaw.aiTagsString = tags.join(", ");
        } else {
          delete mergedMetadataRaw.aiTags;
          delete mergedMetadataRaw.aiTagsString;
        }

        const sanitizedMetadata = sanitizeJson(mergedMetadataRaw);
        const metadata =
          isJsonRecord(sanitizedMetadata) &&
          Object.keys(sanitizedMetadata).length > 0
            ? (sanitizedMetadata as JsonRecord)
            : null;

        const existingRaw = isJsonRecord(input.document.raw)
          ? (input.document.raw as JsonRecord)
          : null;
        const existingExtractionRaw = (() => {
          if (!existingRaw) return null;
          const candidate = (existingRaw as { extraction?: unknown }).extraction;
          return isJsonRecord(candidate) ? (candidate as JsonRecord) : null;
        })();
        const extractionRaw = isJsonRecord(extraction?.raw)
          ? (extraction?.raw as JsonRecord)
          : null;

        const extractionContext: JsonRecord = {};
        if (extraction?.source) extractionContext.source = extraction.source;
        if (extraction?.url) extractionContext.url = extraction.url;
        if (extraction?.contentType)
          extractionContext.contentType = extraction.contentType;
        if (typeof extraction?.wordCount === "number") {
          extractionContext.wordCount = extraction.wordCount;
        }
        if (extraction?.extractorUsed)
          extractionContext.extractorUsed = extraction.extractorUsed;

        const mergedExtractionRaw = mergeRecords(
          existingExtractionRaw,
          extractionRaw,
          extractionContext,
        );

        const rawPayloadBase: JsonRecord = existingRaw ? { ...existingRaw } : {};
        if (Object.keys(mergedExtractionRaw).length > 0) {
          rawPayloadBase.extraction = mergedExtractionRaw;
        }

        // Extract images to root level for frontend compatibility
        // Check both extraction.images and extraction.raw.images (for GitHub URLs)
        let imagesToExtract: unknown[] | undefined;
        if (Array.isArray(extraction?.images) && extraction.images.length > 0) {
          imagesToExtract = extraction.images;
        } else if (extractionRaw && Array.isArray(extractionRaw.images) && extractionRaw.images.length > 0) {
          imagesToExtract = extractionRaw.images;
        } else if (mergedExtractionRaw && Array.isArray(mergedExtractionRaw.images) && mergedExtractionRaw.images.length > 0) {
          imagesToExtract = mergedExtractionRaw.images;
        }

        if (imagesToExtract && imagesToExtract.length > 0) {
          rawPayloadBase.images = imagesToExtract;
        }

        const sanitizedRaw = sanitizeJson(rawPayloadBase);
        const raw =
          isJsonRecord(sanitizedRaw) && Object.keys(sanitizedRaw).length > 0
            ? (sanitizedRaw as JsonRecord)
            : null;

        const sanitizedSummary =
          typeof processed?.summary === "string"
            ? sanitizeString(processed.summary)
            : null;
        const sanitizedPreviewImage =
          typeof previewImage === "string" ? sanitizeString(previewImage) : null;

        let resolvedTitle =
          typeof input.document.title === "string"
            ? input.document.title.trim()
            : "";
        const extractedTitle =
          typeof extraction?.title === "string" ? extraction.title.trim() : "";
        if (!resolvedTitle || resolvedTitle.toLowerCase() === "untitled" || resolvedTitle.toLowerCase() === "unknown") {
          if (extractedTitle) resolvedTitle = extractedTitle;
        }
        const sanitizedTitle = resolvedTitle
          ? sanitizeString(resolvedTitle)
          : null;

        const chunkCount = processed?.chunks?.length ?? 0;
        let averageChunkSize: number | null = null;
        if (processed?.chunks?.length) {
          const totalLength = processed.chunks.reduce((acc, chunk) => {
            const content = (chunk as { content?: unknown }).content;
            return acc + (typeof content === "string" ? content.length : 0);
          }, 0);
          averageChunkSize = processed.chunks.length
            ? Math.round(totalLength / processed.chunks.length)
            : null;
        }

        const updateData: JsonRecord = {
          summary: sanitizedSummary,
          tags,
          word_count:
            typeof extraction?.wordCount === "number"
              ? extraction.wordCount
              : null,
          processing_metadata: processingMetadata,
          chunk_count: chunkCount,
          average_chunk_size: averageChunkSize,
          error: null,
        };

        // Only update preview_image if we have a new value
        // This prevents overwriting existing preview with null during processing
        if (sanitizedPreviewImage) {
          updateData.preview_image = sanitizedPreviewImage;
        }

        updateData.content = sanitizedContent;
        if (sanitizedTitle) {
          updateData.title = sanitizedTitle;
        }
        updateData.metadata = metadata ?? null;
        updateData.raw = raw ?? null;

        console.log("[ingestion.ts] Updating document status to done", {
          documentId: input.documentId,
          hasSummary: !!updateData.summary,
          tagCount: updateData.tags.length,
          hasPreview: !!updateData.preview_image,
          wordCount: updateData.word_count,
        });

        await updateDocumentStatus(input.documentId, "done", updateData);

        console.log("[ingestion.ts] Document status updated to done");

        if (sanitizedSummary && sanitizedSummary.trim().length > 0) {
          console.log("[ingestion.ts] Preparing auto-summary memory", {
            documentId: input.documentId,
            summaryLength: sanitizedSummary.length,
            hasTags: Array.isArray(processed?.tags) && processed.tags.length > 0,
            containerTagsCount: input.containerTags?.length ?? 0,
          });
          const summaryWordCount = sanitizedSummary
            .split(/\s+/)
            .map((part) => part.trim())
            .filter((part) => part.length > 0).length;

          const summaryMetadataRaw: JsonRecord = {
            type: "document-summary",
            generatedBy: "auto-ingestion",
            generatedAt: new Date().toISOString(),
          };

          if (sanitizedTitle) summaryMetadataRaw.title = sanitizedTitle;
          if (input.document.url) summaryMetadataRaw.url = input.document.url;
          if (input.document.source)
            summaryMetadataRaw.source = input.document.source;
          if (
            isJsonRecord(input.document.metadata) &&
            Object.keys(input.document.metadata).length > 0
          ) {
            summaryMetadataRaw.originalMetadata = input.document.metadata;
          }
          if (Array.isArray(processed?.tags) && processed.tags.length > 0) {
            summaryMetadataRaw.tags = processed.tags;
          }
          if (input.containerTags?.length) {
            summaryMetadataRaw.containerTags = input.containerTags;
          }
          if (typeof extraction?.wordCount === "number") {
            summaryMetadataRaw.documentWordCount = extraction.wordCount;
          }
          summaryMetadataRaw.summaryLength = sanitizedSummary.length;
          summaryMetadataRaw.summaryWordCount = summaryWordCount;

          try {
            await upsertAutoSummaryMemory({
              documentId: input.documentId,
              organizationId: input.organizationId,
              userId: input.userId,
              spaceId: input.spaceId,
              summary: sanitizedSummary,
              metadata: summaryMetadataRaw,
            });
            console.log("[ingestion.ts] Auto-summary memory upserted", {
              documentId: input.documentId,
            });
          } catch (memoryError) {
            console.error("[ingestion.ts] Failed to upsert auto-summary memory", {
              documentId: input.documentId,
              error: (memoryError as Error).message,
            });
          }
        }
      } catch (updateError) {
        console.error("[ingestion.ts] Failed to update document status:", {
          error: (updateError as Error).message,
          stack: (updateError as Error).stack,
          documentId: input.documentId,
        });
        throw updateError;
      }

      // Update job status
      if (input.jobId) {
        console.log("[ingestion.ts] Updating job status");
        await updateJobStatus(input.jobId, "done");
        console.log("[ingestion.ts] Job status updated");
      }
    } else {
      // Handle failure
      await updateDocumentStatus(input.documentId, "failed", {
        error: result.error?.message || "Processing failed",
      });

      if (input.jobId) {
        await updateJobStatus(input.jobId, "failed", result.error?.message);
      }
    }

    console.log("[ingestion.ts] Document processed successfully", {
      documentId: input.documentId,
      status: result.status,
    });
  } catch (error) {
    console.error("[ingestion.ts] Processing failed:", error);

    // Update statuses on error
    await updateDocumentStatus(input.documentId, "failed", {
      error: (error as Error).message,
    });

    if (input.jobId) {
      await updateJobStatus(input.jobId, "failed", (error as Error).message);
    }

    throw error;
  }
}

// ============================================================================
// Re-exports for compatibility
// ============================================================================

export { createIngestionOrchestrator } from "./orchestration";
export { createDocumentExtractorService } from "./extraction";
export { createDocumentProcessorService } from "./processing";
export { createPreviewGeneratorService } from "./preview";
