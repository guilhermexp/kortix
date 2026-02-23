/**
 * Documents API Routes
 *
 * Architecture: Queue-based document processing with fallback
 * - Documents are queued for processing using BullMQ (when Redis available)
 * - Falls back to inline processing when Redis unavailable
 * - Queue workers can be scaled independently (bun run dev:queue)
 * - Preview image extracted immediately for fast UI feedback
 */

import {
  BundleCreateSchema,
  BundleResponseSchema,
  DocumentsWithMemoriesQuerySchema,
  DocumentsWithMemoriesResponseSchema,
  ListMemoriesQuerySchema,
  ListMemoriesResponseSchema,
  MemoryAddSchema,
  MemoryResponseSchema,
  MigrateMCPRequestSchema,
  MigrateMCPResponseSchema,
} from "@repo/validation/api";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { processDocumentInline } from "../services/document-processor-inline";
import { sanitizeJson, sanitizeString } from "../services/ingestion/utils";
import {
  documentCache,
  documentListCache,
  generateCacheKey,
} from "../services/query-cache";
import {
  addDocumentJob,
  documentQueue,
  getQueueStats,
  isRedisEnabled,
} from "../services/queue";
import { findRelatedLinks, type RelatedLink } from "../services/related-links";
import { addConnectionUpdateJob } from "../worker/connection-updater-job";
import {
  matchesNormalizedSearch,
  normalizeSearchText,
} from "./documents-search-utils";

import { DEFAULT_PROJECT_ID, FIXED_PROJECTS } from "@repo/lib/constants";

const defaultContainerTag = DEFAULT_PROJECT_ID;

/**
 * Auto-route documents to fixed projects based on type/source/URL.
 * Only acts when the document would fall into the default project.
 */
function resolveDefaultProject(params: {
  type: string;
  source: string;
  url: string | null;
}): string {
  const { type, source, url } = params;
  const lowerUrl = url?.toLowerCase() ?? "";

  // YouTube
  if (
    source === "youtube" ||
    lowerUrl.includes("youtube.com") ||
    lowerUrl.includes("youtu.be")
  )
    return FIXED_PROJECTS.YOUTUBE;

  // Bookmarks/X
  if (
    type === "tweet" ||
    lowerUrl.includes("x.com") ||
    lowerUrl.includes("twitter.com")
  )
    return FIXED_PROJECTS.BOOKMARKS_X;

  // Github
  if (lowerUrl.includes("github.com")) return FIXED_PROJECTS.GITHUB;

  // PDF
  if (type === "pdf") return FIXED_PROJECTS.PDF;

  // Audio
  if (type === "audio") return FIXED_PROJECTS.AUDIO;

  // Rich Markdown (text pasted manually, no URL)
  if (type === "text" && source === "manual")
    return FIXED_PROJECTS.RICH_MARKDOWN;

  return defaultContainerTag;
}

/**
 * Quick OG image extraction for immediate preview loading
 * Fetches first 50KB of HTML to find og:image meta tag
 */
async function extractOgImageQuick(
  url: string,
  timeoutMs = 3000,
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KortixBot/1.0; +https://kortix.ai)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    clearTimeout(timeoutId);
    if (!response.ok) return null;

    const reader = response.body?.getReader();
    if (!reader) return null;

    let html = "";
    const decoder = new TextDecoder();
    const maxBytes = 50 * 1024;
    let totalBytes = 0;

    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      totalBytes += value?.length ?? 0;
      if (html.includes("</head>")) break;
    }

    reader.cancel().catch(() => {});

    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        let imageUrl = match[1];
        if (imageUrl.startsWith("/")) {
          try {
            imageUrl = new URL(imageUrl, new URL(url).origin).toString();
          } catch {}
        }
        return imageUrl;
      }
    }
    return null;
  } catch {
    return null;
  }
}

const ALLOWED_DOCUMENT_TYPES = new Set([
  "text",
  "pdf",
  "file", // Generic file uploads (CSV, Excel, Word, PowerPoint, etc.)
  "tweet",
  "google_doc",
  "google_slide",
  "google_sheet",
  "image",
  "video",
  "notion_doc",
  "webpage",
  "onedrive",
  "url", // URL-based content (legacy type from database)
  "document-summary", // AI-generated document summaries
  "bundle", // Multi-link/note bundles
]);

const invalidateDocumentCaches = () => {
  documentListCache.clear();
  documentCache.clear();
};

type DocumentSpaceRelation = {
  space_id?: string | null;
  spaces?: { container_tag?: string | null } | null;
};

type ProcessingMetadata = {
  startTime?: number;
  steps?: unknown;
} & Record<string, unknown>;

type MemoryRow = {
  id: string;
  document_id: string;
  space_id: string | null;
  org_id: string;
  user_id: string | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  memory_embedding: number[] | null;
  memory_embedding_model: string | null;
  memory_embedding_new: number[] | null;
  memory_embedding_new_model: string | null;
  is_latest: boolean | null;
  version: number | null;
  is_inference: boolean | null;
  source_count: number | null;
  created_at: string;
  updated_at: string;
};

function _isDocumentSpaceRelation(
  value: unknown,
): value is DocumentSpaceRelation {
  if (value === null || typeof value !== "object") return false;
  const relation = value as Record<string, unknown>;
  const spaceId = relation.space_id;
  const spaces = relation.spaces;
  const spaceIdValid =
    spaceId === undefined || spaceId === null || typeof spaceId === "string";
  const spacesValid =
    spaces === undefined ||
    spaces === null ||
    (typeof spaces === "object" &&
      (!("container_tag" in spaces) ||
        (spaces as { container_tag?: unknown }).container_tag === null ||
        typeof (spaces as { container_tag?: unknown }).container_tag ===
          "string"));
  return spaceIdValid && spacesValid;
}

function extractContainerTags(relation: unknown): string[] {
  if (!relation || typeof relation !== "object") return [];
  const rel = relation as DocumentSpaceRelation;
  const tag = rel.spaces?.container_tag;
  return tag && typeof tag === "string" && tag.length > 0 ? [tag] : [];
}

function extractSpaceIds(relation: unknown): string[] {
  if (!relation || typeof relation !== "object") return [];
  const rel = relation as DocumentSpaceRelation;
  const spaceId = rel.space_id;
  return spaceId && typeof spaceId === "string" && spaceId.length > 0
    ? [spaceId]
    : [];
}

function normalizeProcessingMetadata(value: unknown):
  | (ProcessingMetadata & {
      startTime: number;
      steps: unknown[];
    })
  | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }

  const record = value as ProcessingMetadata;
  const startTime =
    typeof record.startTime === "number" && Number.isFinite(record.startTime)
      ? record.startTime
      : Date.now();
  const stepsArray = Array.isArray(record.steps) ? record.steps : [];

  return {
    startTime,
    steps: stepsArray,
    ...record,
  };
}

const _DocumentDetailSchema = z.object({
  id: z.string(),
  status: z.string().default("unknown"),
  content: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  containerTags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  memoryEntries: z
    .array(
      z.object({
        id: z.string(),
        content: z.string().nullable().optional(),
        metadata: z.record(z.string(), z.unknown()).nullable().optional(),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    )
    .default([]),
});

type SortKey = "createdAt" | "updatedAt" | undefined;

function resolveSortColumn(sort: SortKey) {
  if (sort === "updatedAt") {
    return "updated_at";
  }
  return "created_at";
}

export const DocumentsByIdsSchema = z.object({
  ids: z.array(z.string()).min(1),
  by: z.enum(["id", "customId"]).optional().default("id"),
  containerTags: z.array(z.string()).optional(),
});

export type MemoryAddInput = z.infer<typeof MemoryAddSchema>;
export type ListMemoriesInput = z.infer<typeof ListMemoriesQuerySchema>;
export type DocumentsQueryInput = z.infer<
  typeof DocumentsWithMemoriesQuerySchema
>;
export type DocumentsByIdsInput = z.infer<typeof DocumentsByIdsSchema>;

export async function getDocument(
  client: SupabaseClient,
  organizationId: string,
  documentId: string,
) {
  const { data: document, error } = await client
    .from("documents")
    .select(
      "id, status, content, summary, metadata, created_at, updated_at, space_id, spaces(container_tag), title, url, type, preview_image, raw, parent_id",
    )
    .eq("org_id", organizationId)
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw error;
  if (!document) return null;

  const containerTags = extractContainerTags(document);

  const { data: memories, error: memoriesError } = await client
    .from("memories")
    .select("id, content, metadata, created_at, updated_at")
    .eq("org_id", organizationId)
    .eq("document_id", documentId)
    .order("created_at", { ascending: true });

  if (memoriesError) throw memoriesError;

  // If this is a bundle, fetch children
  const isBundle = (document as any).type === "bundle";
  let children: Array<{
    id: string;
    title: string | null;
    previewImage: string | null;
    summary: string | null;
    status: string;
    url: string | null;
    type: string;
    content: string | null;
    childOrder: number;
  }> | undefined;
  let childCount: number | undefined;

  if (isBundle) {
    children = await getDocumentChildren(client, organizationId, documentId);
    childCount = children.length;
  }

  return {
    id: document.id,
    status: document.status ?? "unknown",
    content: document.content ?? null,
    summary: document.summary ?? null,
    metadata: document.metadata ?? null,
    containerTags,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    // Additional fields needed for preview rendering
    title: (document as any).title ?? null,
    url: (document as any).url ?? null,
    type: (document as any).type ?? null,
    previewImage: (document as any).preview_image ?? null,
    raw: (document as any).raw ?? null,
    parentId: (document as any).parent_id ?? null,
    // Bundle fields
    ...(childCount !== undefined ? { childCount } : {}),
    ...(children ? { children } : {}),
    // Transform memory entries: database 'content' → API 'memory'
    memoryEntries: (memories ?? []).map((row) => ({
      id: row.id,
      memory: row.content ?? "", // API field (backward compatibility)
      metadata: row.metadata ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

/**
 * Get document processing status including job queue information
 */
export async function getDocumentStatus(
  client: SupabaseClient,
  organizationId: string,
  documentId: string,
) {
  // Get document from database
  const { data: document, error } = await client
    .from("documents")
    .select("id, status, title, url, type, created_at, updated_at")
    .eq("org_id", organizationId)
    .eq("id", documentId)
    .maybeSingle();

  if (error) throw error;
  if (!document) return null;

  const response: any = {
    id: document.id,
    status: document.status ?? "unknown",
    title: document.title ?? null,
    url: document.url ?? null,
    type: document.type ?? null,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
    queueEnabled: isRedisEnabled(),
  };

  // If queue is enabled, try to fetch job info
  if (isRedisEnabled() && documentQueue) {
    try {
      const job = await documentQueue.getJob(`doc-${documentId}`);
      if (job) {
        const state = await job.getState();
        response.job = {
          id: job.id,
          state,
          progress: job.progress,
          attemptsMade: job.attemptsMade,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          failedReason: job.failedReason,
        };
      } else {
        // Job not found in queue (might be completed and removed)
        response.job = null;
      }
    } catch (queueError) {
      console.warn("[getDocumentStatus] Failed to fetch job info", {
        documentId,
        error:
          queueError instanceof Error ? queueError.message : String(queueError),
      });
      response.job = null;
    }
  } else {
    response.job = null;
  }

  return response;
}

/**
 * Get queue metrics and statistics
 */
export async function getQueueMetrics() {
  if (!isRedisEnabled()) {
    return null;
  }

  try {
    const stats = await getQueueStats();
    return stats;
  } catch (error) {
    console.error("[getQueueMetrics] Failed to fetch queue stats", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function ensureSpace(
  client: SupabaseClient,
  organizationId: string,
  containerTag: string,
) {
  const { data: existing, error: fetchError } = await client
    .from("spaces")
    .select("id, name")
    .eq("org_id", organizationId)
    .eq("container_tag", containerTag)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing.id;

  const name =
    containerTag
      .replace(/^sm_project_/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()) || "Untitled";

  const { data: created, error: insertError } = await client
    .from("spaces")
    .upsert(
      {
        org_id: organizationId,
        container_tag: containerTag,
        name,
      },
      { onConflict: "org_id,container_tag", ignoreDuplicates: true },
    )
    .select("id")
    .single();

  if (insertError) {
    // If upsert race: another request created it first, just fetch it
    const { data: retry } = await client
      .from("spaces")
      .select("id")
      .eq("org_id", organizationId)
      .eq("container_tag", containerTag)
      .single();
    if (retry) return retry.id;
    throw insertError;
  }
  return created.id;
}

export async function addDocument({
  organizationId,
  userId,
  payload,
  client,
}: {
  organizationId: string;
  userId: string;
  payload: MemoryAddInput;
  client: SupabaseClient;
}) {
  const parsed = MemoryAddSchema.parse(payload);
  const rawContent = parsed.content?.trim();

  if (!rawContent) {
    throw new Error("Content is required to create a document");
  }

  // Guardrail: local filesystem paths pasted into the URL/text box are not fetchable by the server.
  // They often look like "/var/folders/.../file.png" or "file:///...".
  // If the user intended to upload a file, they should use `/v3/documents/file`.
  const looksLikeLocalFilePath =
    !rawContent.includes("\n") &&
    rawContent.length <= 500 &&
    (/^(file:\/\/|\/|~\/|[a-zA-Z]:\\)/.test(rawContent) ||
      rawContent.includes("/var/folders/")) &&
    /\.[a-z0-9]{2,8}$/i.test(rawContent) &&
    !/^https?:\/\//i.test(rawContent);
  if (looksLikeLocalFilePath) {
    throw new Error(
      "Looks like a local file path. Upload the file instead (POST /v3/documents/file).",
    );
  }

  const isUrl = /^https?:\/\//i.test(rawContent);

  // Infer type/source/url early so auto-routing can use them
  const inferredType =
    (parsed.metadata?.type as string | undefined) ?? (isUrl ? "url" : "text");
  const inferredSource =
    (parsed.metadata?.source as string | undefined) ??
    (isUrl ? "web" : "manual");
  const inferredUrl = isUrl
    ? rawContent
    : ((parsed.metadata?.url as string | undefined) ?? null);

  // Resolve container tag: respect user choice, otherwise auto-route by type/source/URL
  let [containerTag] =
    parsed.containerTags && parsed.containerTags.length > 0
      ? parsed.containerTags
      : [defaultContainerTag];

  if (containerTag === defaultContainerTag) {
    containerTag = resolveDefaultProject({
      type: inferredType,
      source: inferredSource,
      url: inferredUrl,
    });
  }

  const spaceId = await ensureSpace(client, organizationId, containerTag);

  const baseMetadata: Record<string, unknown> = {
    ...(parsed.metadata ?? {}),
  };
  if (isUrl) {
    baseMetadata.originalUrl = rawContent;
    // Provide an immediate preview while extraction runs: use site favicon
    try {
      const u = new URL(rawContent);
      const favicon = new URL("/favicon.ico", u.origin).toString();
      if (!baseMetadata.favicon) {
        baseMetadata.favicon = favicon;
      }
    } catch {}
  }
  // Sanitize metadata to prevent Unicode surrogate errors
  const metadata =
    Object.keys(baseMetadata).length > 0
      ? (sanitizeJson(baseMetadata) as Record<string, unknown>)
      : null;
  const initialTitle = sanitizeString(
    parsed.metadata?.title ??
      (isUrl ? null : rawContent.slice(0, 80)) ??
      "Untitled",
  );
  const initialContent = isUrl ? null : sanitizeString(rawContent);

  // Ensure document is assigned to the target space (direct relationship via space_id)
  async function ensureDocumentInSpace(
    documentId: string,
    targetSpaceId: string,
  ): Promise<boolean> {
    // Check current space_id
    const { data: doc, error: fetchErr } = await client
      .from("documents")
      .select("space_id")
      .eq("id", documentId)
      .eq("org_id", organizationId)
      .maybeSingle();

    if (fetchErr) {
      console.error(
        "[ensureDocumentInSpace] Failed to fetch document",
        fetchErr,
      );
      throw fetchErr;
    }

    if (!doc) {
      throw new Error(`Document ${documentId} not found`);
    }

    // If already in the target space, no action needed
    if (doc.space_id === targetSpaceId) {
      return false;
    }

    // Update to target space
    const { error: updateErr } = await client
      .from("documents")
      .update({ space_id: targetSpaceId })
      .eq("id", documentId)
      .eq("org_id", organizationId);

    if (updateErr) {
      console.error(
        "[ensureDocumentInSpace] Failed to update document space",
        updateErr,
      );
      throw updateErr;
    }
    return true;
  }

  // Deduplicate: check for existing documents with same URL or content hash
  // For URLs: check by URL
  // For text: check by content hash (if content is short enough to be exact match)
  const shouldCheckDuplicates =
    isUrl || (initialContent && initialContent.length < 1000);

  if (shouldCheckDuplicates) {
    let existing: {
      id: string;
      status: string | null;
      space_id: string | null;
    } | null = null;

    if (isUrl && inferredUrl) {
      // Check by URL
      const { data: urlDoc, error: urlError } = await client
        .from("documents")
        .select("id, status, space_id")
        .eq("org_id", organizationId)
        .eq("url", inferredUrl)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!urlError && urlDoc) {
        existing = urlDoc;
      }
    } else if (initialContent) {
      // For short text documents, check by exact content match
      // Only check recent documents (last 7 days) to avoid performance issues
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data: contentDoc, error: contentError } = await client
        .from("documents")
        .select("id, status, space_id")
        .eq("org_id", organizationId)
        .eq("content", initialContent)
        .eq("type", inferredType)
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!contentError && contentDoc) {
        existing = contentDoc;
      }
    }

    if (existing) {
      const currentStatus = String(existing.status ?? "unknown").toLowerCase();
      const processingStates = new Set([
        "queued",
        "fetching",
        "generating_preview",
        "extracting",
        "chunking",
        "embedding",
        "processing",
        "indexing",
      ]);

      // If document already exists and is done or processing, reject the submission
      // This saves resources and provides clear feedback to the user
      if (currentStatus === "done") {
        const error = new Error(
          "Este documento já existe na sua biblioteca. URL duplicada.",
        );
        (error as any).code = "DUPLICATE_DOCUMENT";
        (error as any).existingDocumentId = existing.id;
        (error as any).status = 409;
        throw error;
      }

      if (processingStates.has(currentStatus)) {
        const error = new Error(
          "Este documento já está sendo processado. Aguarde a conclusão.",
        );
        (error as any).code = "DOCUMENT_PROCESSING";
        (error as any).existingDocumentId = existing.id;
        (error as any).status = 409;
        throw error;
      }

      if (currentStatus === "failed") {
        // Requeue existing failed document rather than creating a new one
        // First ensure it's in the right space
        try {
          await ensureDocumentInSpace(existing.id, spaceId);
        } catch (e) {
          console.error("[addDocument] Failed mapping doc to project", {
            documentId: existing.id,
            spaceId,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        const { error: updateError } = await client
          .from("documents")
          .update({ status: "queued", error: null })
          .eq("id", existing.id)
          .eq("org_id", organizationId);
        if (updateError) {
          console.error(
            "[addDocument] Failed to requeue document",
            updateError,
          );
          throw updateError;
        }

        // Check if there's already a pending job for this document (queued or processing)
        const { data: existingJob } = await client
          .from("ingestion_jobs")
          .select("id")
          .eq("document_id", existing.id)
          .in("status", ["queued", "processing"])
          .maybeSingle();

        let jobId: string | undefined;
        if (!existingJob) {
          const { data: jobRecord, error: jobError } = await client
            .from("ingestion_jobs")
            .insert({
              document_id: existing.id,
              org_id: organizationId,
              status: "queued",
              payload: {
                containerTags: parsed.containerTags ?? [containerTag],
                content: rawContent,
                metadata,
                url: inferredUrl,
                type: inferredType,
                source: inferredSource,
              },
            })
            .select("id")
            .single();
          if (jobError) {
            console.error("[addDocument] Failed to create job", jobError);
            throw jobError;
          }
          jobId = jobRecord?.id;
        } else {
          jobId = existingJob.id;
        }

        // Process document inline (async - doesn't block response)
        if (jobId) {
          processDocumentInline({
            documentId: existing.id,
            jobId,
            orgId: organizationId,
            payload: {
              containerTags: parsed.containerTags ?? [containerTag],
              content: rawContent,
              metadata,
              url: inferredUrl,
              type: inferredType,
              source: inferredSource,
            },
          }).catch((err) => {
            console.error("[addDocument] Background reprocessing failed", {
              documentId: existing.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }

        // Queue connection update job (async - doesn't block response)
        addConnectionUpdateJob(existing.id, organizationId).catch((err) => {
          console.error("[addDocument] Failed to queue connection update", {
            documentId: existing.id,
            error: err instanceof Error ? err.message : String(err),
          });
        });

        invalidateDocumentCaches();
        return MemoryResponseSchema.parse({
          id: existing.id,
          status: "processing",
        });
      }
    }
  }

  const { data: document, error: insertError } = await client
    .from("documents")
    .insert({
      org_id: organizationId,
      user_id: userId,
      space_id: spaceId,
      title: initialTitle,
      content: initialContent,
      url: inferredUrl,
      source: inferredSource,
      status: "queued",
      type: inferredType,
      metadata,
      chunk_count: 0,
    })
    .select("id, status")
    .single();

  if (insertError) {
    console.error("[addDocument] Failed to insert document", insertError);
    // Check if it's a duplicate key error (race condition)
    if (
      insertError.code === "23505" ||
      insertError.message.includes("duplicate")
    ) {
      // Document was created by another request - try to find it
      if (isUrl && inferredUrl) {
        const { data: existing } = await client
          .from("documents")
          .select("id, status")
          .eq("org_id", organizationId)
          .eq("url", inferredUrl)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          // Try to ensure it's in the right space
          try {
            await ensureDocumentInSpace(existing.id, spaceId);
          } catch {
            // Ignore errors here
          }
          return {
            id: existing.id,
            status: existing.status ?? "queued",
            alreadyExists: true,
            addedToProject: false,
          };
        }
      }
    }
    throw insertError;
  }

  const docId = document.id;

  // NOTE: No longer using documents_to_spaces junction table
  // Space is set via space_id in the document INSERT above

  // Quick OG image extraction for immediate preview (non-blocking)
  // This runs in the background and updates the document when done
  if (isUrl && inferredUrl) {
    extractOgImageQuick(inferredUrl)
      .then(async (ogImage) => {
        if (ogImage) {
          try {
            await client
              .from("documents")
              .update({ preview_image: ogImage })
              .eq("id", docId)
              .eq("org_id", organizationId);
            console.log("[addDocument] Quick OG image set for document", {
              docId,
              ogImage: ogImage.slice(0, 100),
            });
          } catch (e) {
            console.log(
              "[addDocument] Failed to update OG image:",
              e instanceof Error ? e.message : String(e),
            );
          }
        }
      })
      .catch(() => {
        // Silently ignore - preview is optional
      });
  }

  // Check if job already exists (race condition protection)
  // Include both queued and processing status to prevent duplicate jobs
  const { data: existingJob } = await client
    .from("ingestion_jobs")
    .select("id")
    .eq("document_id", docId)
    .in("status", ["queued", "processing"])
    .maybeSingle();

  let jobId: string | undefined;
  if (!existingJob) {
    const { data: jobRecord, error: jobError } = await client
      .from("ingestion_jobs")
      .insert({
        document_id: docId,
        org_id: organizationId,
        status: "queued",
        payload: {
          containerTags: parsed.containerTags ?? [containerTag],
          content: rawContent,
          metadata,
          url: inferredUrl,
          type: inferredType,
          source: inferredSource,
        },
      })
      .select("id")
      .single();

    if (jobError) {
      console.error("[addDocument] Failed to create job", jobError);
      // If job creation fails, try to clean up the document
      // But don't fail the request - the document exists and can be processed later
      console.warn("[addDocument] Document created but job creation failed", {
        documentId: docId,
        error: jobError.message,
      });
    } else {
      jobId = jobRecord?.id;
    }
  } else {
    jobId = existingJob.id;
  }

  // Always process document inline (doesn't block response)
  if (jobId) {
    // Update document status to "processing" in DB so frontend polling sees it immediately
    await client
      .from("documents")
      .update({ status: "processing" })
      .eq("id", docId);

    // Fire and forget - process in background
    processDocumentInline({
      documentId: docId,
      jobId,
      orgId: organizationId,
      payload: {
        containerTags: parsed.containerTags ?? [containerTag],
        content: rawContent,
        metadata,
        url: inferredUrl,
        type: inferredType,
        source: inferredSource,
      },
    }).catch((err) => {
      console.error("[addDocument] Background processing failed", {
        documentId: docId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  // Queue connection update job (async - doesn't block response)
  addConnectionUpdateJob(docId, organizationId).catch((err) => {
    console.error("[addDocument] Failed to queue connection update", {
      documentId: docId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  invalidateDocumentCaches();
  return MemoryResponseSchema.parse({ id: docId, status: "processing" });
}

export async function listDocuments(
  client: SupabaseClient,
  organizationId: string,
  input: Partial<ListMemoriesInput> = {},
) {
  const query = ListMemoriesQuerySchema.partial({ filters: true }).parse(input);
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const offset = (page - 1) * limit;
  const sortColumn = resolveSortColumn(query.sort);

  const { data, error, count } = await client
    .from("documents")
    .select(
      "id, title, summary, status, type, metadata, preview_image, url, raw, created_at, updated_at, space_id, spaces(container_tag)",
      { count: "exact" },
    )
    .eq("org_id", organizationId)
    .is("parent_id", null)
    .order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const filtered = (data ?? []).filter((doc) => {
    if (!query.containerTags || query.containerTags.length === 0) return true;
    const tags = extractContainerTags(doc);
    return query.containerTags?.some((tag) => tags.includes(tag));
  });

  const memories = filtered.map((doc) => ({
    id: doc.id,
    // customId removed - column does not exist
    // connectionId removed - column does not exist
    title: doc.title ?? null,
    summary: doc.summary ?? null,
    status: ((): string => {
      const s = (doc.status ?? "unknown") as string;
      if (s === "fetching") return "extracting";
      if (s === "processing") return "embedding";
      return s;
    })(),
    type: doc.type ?? "text",
    metadata: doc.metadata ?? null,
    previewImage: (doc as any).preview_image ?? null,
    url: (doc as any).url ?? null,
    raw: (doc as any).raw ?? null,
    containerTags: extractContainerTags(doc),
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  }));

  const totalItems =
    query.containerTags && query.containerTags.length > 0
      ? memories.length
      : (count ?? memories.length);

  return ListMemoriesResponseSchema.parse({
    memories,
    pagination: {
      currentPage: page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  });
}

export async function listDocumentsWithMemories(
  client: SupabaseClient,
  organizationId: string,
  input: DocumentsQueryInput,
) {
  const query = DocumentsWithMemoriesQuerySchema.parse(input);
  const searchRaw = query.search?.trim() || "";
  const hasSearch = searchRaw.length > 0;
  const normalizedSearch = hasSearch ? normalizeSearchText(searchRaw) : "";
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  const offset = (page - 1) * limit;
  const sortColumn = resolveSortColumn(query.sort);

  // Check cache first (only for non-content requests to keep cache size manageable)
  if (!query.includeContent && !query.search) {
    const cacheKey = generateCacheKey("doclist", {
      orgId: organizationId,
      page,
      limit,
      sort: query.sort,
      order: query.order,
      containerTags: query.containerTags,
    });

    const cached = documentListCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Use lightweight fields to improve performance
  const includeHeavyFields = query.includeContent ?? false;
  const selectFields = includeHeavyFields
    ? "id, org_id, user_id, title, content, summary, url, source, type, status, metadata, processing_metadata, raw, tags, preview_image, error, token_count, word_count, chunk_count, average_chunk_size, created_at, updated_at, space_id, spaces(container_tag)"
    : "id, org_id, user_id, title, summary, url, source, type, status, metadata, tags, preview_image, error, token_count, word_count, chunk_count, average_chunk_size, created_at, updated_at, space_id, spaces(container_tag)";
  const fallbackSearchSelectFields = includeHeavyFields
    ? selectFields
    : "id, org_id, user_id, title, content, summary, url, source, type, status, metadata, tags, preview_image, error, token_count, word_count, chunk_count, average_chunk_size, created_at, updated_at, space_id, spaces(container_tag)";

  const isPermissionDenied = (e: unknown) => {
    if (!e || typeof e !== "object") return false;
    const code = (e as { code?: string }).code;
    if (code === "42501") return true;
    const msg = String((e as { message?: string }).message ?? "");
    return msg.includes("permission denied");
  };

  const applyTextSearch = <T>(builder: T): T => {
    if (!hasSearch) return builder;
    const searchTerm = `%${searchRaw}%`;
    return (builder as any).or(
      `title.ilike.${searchTerm},summary.ilike.${searchTerm},content.ilike.${searchTerm}`,
    );
  };

  const runNormalizedSearchFallback = async (scope?: {
    spaceIds?: string[];
  }): Promise<{ count: number; data: any[] }> => {
    if (!hasSearch || !normalizedSearch) return { count: 0, data: [] };

    const fallbackWindow = Math.max(400, limit * 40);
    let builder = client
      .from("documents")
      .select(fallbackSearchSelectFields, { count: "planned" })
      .eq("org_id", organizationId)
      .is("parent_id", null)
      .order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
      .limit(fallbackWindow);

    if (scope?.spaceIds && scope.spaceIds.length > 0) {
      builder = builder.in("space_id", scope.spaceIds);
    }

    const { data: fallbackDocs, error: fallbackErr } = await builder;
    if (fallbackErr && !isPermissionDenied(fallbackErr)) throw fallbackErr;

    const filtered = (fallbackDocs ?? []).filter((doc: any) =>
      matchesNormalizedSearch(
        {
          title: doc.title,
          summary: doc.summary,
          content: typeof doc.content === "string" ? doc.content : null,
        },
        normalizedSearch,
      ),
    );

    return {
      count: filtered.length,
      data: filtered.slice(offset, offset + limit),
    };
  };

  // When filtering by containerTags (projects), constrain at SQL level
  // to avoid empty pages due to post-filtering after pagination.
  let data: any[] | null = null;
  let count: number | null = null;

  if (query.containerTags && query.containerTags.length > 0) {
    // Resolve spaces matching the requested container tags
    const { data: spaces, error: spacesErr } = await client
      .from("spaces")
      .select("id")
      .eq("org_id", organizationId)
      .in("container_tag", query.containerTags);

    if (spacesErr && !isPermissionDenied(spacesErr)) throw spacesErr;

    const spaceIds = Array.isArray(spaces) ? spaces.map((s: any) => s.id) : [];

    if (spaceIds.length === 0) {
      // No spaces for these tags → empty result
      return DocumentsWithMemoriesResponseSchema.parse({
        documents: [],
        pagination: {
          currentPage: page,
          limit,
          totalItems: 0,
          totalPages: 1,
        },
      });
    }

    // Find document IDs that belong to these spaces (direct relationship via space_id)
    const { data: spaceDocs, error: spaceDocsErr } = await client
      .from("documents")
      .select("id")
      .eq("org_id", organizationId)
      .is("parent_id", null)
      .in("space_id", spaceIds);

    if (spaceDocsErr && !isPermissionDenied(spaceDocsErr)) throw spaceDocsErr;

    const docIds = Array.isArray(spaceDocs)
      ? spaceDocs.map((d: any) => d.id)
      : [];

    if (docIds.length === 0) {
      return DocumentsWithMemoriesResponseSchema.parse({
        documents: [],
        pagination: {
          currentPage: page,
          limit,
          totalItems: 0,
          totalPages: 1,
        },
      });
    }

    // Build query with optional search filter
    let queryBuilder = client
      .from("documents")
      .select(selectFields, { count: "planned" })
      .eq("org_id", organizationId)
      .is("parent_id", null)
      .in("id", docIds);

    queryBuilder = applyTextSearch(queryBuilder);

    const {
      data: docs,
      error: docsErr,
      count: docsCount,
    } = await queryBuilder
      .order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
      .range(offset, offset + limit - 1);

    if (docsErr && !isPermissionDenied(docsErr)) throw docsErr;
    data = docs ?? [];
    count = docsCount ?? data.length;

    if ((data?.length ?? 0) === 0 && hasSearch) {
      const fallback = await runNormalizedSearchFallback({ spaceIds });
      data = fallback.data;
      count = fallback.count;
    }
  } else {
    // Build query with optional search filter
    let queryBuilder = client
      .from("documents")
      .select(selectFields, { count: "planned" })
      .eq("org_id", organizationId)
      .is("parent_id", null);

    queryBuilder = applyTextSearch(queryBuilder);

    const {
      data: docs,
      error,
      count: docsCount,
    } = await queryBuilder
      .order(sortColumn, { ascending: (query.order ?? "desc") === "asc" })
      .range(offset, offset + limit - 1);

    if (error && !isPermissionDenied(error)) throw error;
    data = docs ?? [];
    count = docsCount ?? data.length;

    if ((data?.length ?? 0) === 0 && hasSearch) {
      const fallback = await runNormalizedSearchFallback();
      data = fallback.data;
      count = fallback.count;
    }
  }

  const docInfos = (data ?? []).map((doc) => {
    const containerTags = extractContainerTags(doc);
    const spaceIds = extractSpaceIds(doc);

    return { doc, containerTags, spaceIds };
  });

  const docIds = docInfos.map(({ doc }) => doc.id);
  const memoryByDoc = new Map<string, MemoryRow[]>();

  if (docIds.length > 0) {
    // Fetch only essential memory fields to reduce data transfer
    // Limit to 5 most recent memories per document for list views
    const { data: memoryRows, error: memoryError } = await client
      .from("memories")
      .select(
        "id, document_id, space_id, org_id, user_id, content, metadata, is_latest, version, created_at, updated_at",
      )
      .eq("org_id", organizationId)
      .in("document_id", docIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(docIds.length * 5, 250)); // Max 5 memories per doc, cap at 250 total

    if (memoryError && !isPermissionDenied(memoryError)) throw memoryError;

    for (const row of (memoryRows ?? []) as MemoryRow[]) {
      const entries = memoryByDoc.get(row.document_id) ?? [];
      entries.push(row);
      memoryByDoc.set(row.document_id, entries);
    }
  }

  const documents = docInfos.map(({ doc, containerTags, spaceIds }) => {
    const memoryRows = memoryByDoc.get(doc.id) ?? [];

    // Transform database rows to API format (content → memory)
    // Only include essential fields for list views to reduce payload size
    const memoryEntries = memoryRows.slice(0, 5).map((row) => ({
      id: row.id,
      documentId: row.document_id,
      memory: row.content ?? "", // API field: transformed from database 'content'
      spaceId: row.space_id ?? spaceIds[0] ?? "",
      orgId: row.org_id,
      userId: row.user_id ?? null,
      version: row.version ?? 1,
      isLatest: row.is_latest ?? true,
      sourceCount: 1, // Simplified for list view
      isInference: false, // Simplified for list view
      isForgotten: false, // Simplified for list view
      forgetAfter: null,
      forgetReason: null,
      memoryEmbedding: null, // Omit embeddings in list view for performance
      memoryEmbeddingModel: null,
      memoryEmbeddingNew: null,
      memoryEmbeddingNewModel: null,
      metadata: row.metadata ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sourceAddedAt: row.created_at,
      sourceRelevanceScore: null,
      sourceMetadata: null,
      spaceContainerTag: containerTags[0] ?? null,
    }));

    // Normalize document type
    let normalizedType = doc.type ?? "text";
    if (normalizedType === "url") {
      normalizedType = "webpage";
    }
    if (!ALLOWED_DOCUMENT_TYPES.has(normalizedType)) {
      normalizedType = "text";
    }

    // Clean metadata to ensure it only contains string/number/boolean values
    const cleanMetadata =
      doc.metadata && typeof doc.metadata === "object"
        ? Object.fromEntries(
            Object.entries(doc.metadata as Record<string, unknown>).flatMap(
              ([key, value]) => {
                if (
                  typeof value === "string" ||
                  typeof value === "number" ||
                  typeof value === "boolean"
                ) {
                  return [[key, value]];
                }
                if (Array.isArray(value)) {
                  const sanitizedArray = value
                    .map((item) =>
                      typeof item === "string" ||
                      typeof item === "number" ||
                      typeof item === "boolean"
                        ? item
                        : null,
                    )
                    .filter((item) => item !== null);
                  if (sanitizedArray.length > 0) {
                    return [[key, sanitizedArray]];
                  }
                }
                return [] as Array<[string, unknown]>;
              },
            ),
          )
        : null;

    // Ensure processingMetadata has required fields or set to null
    const cleanProcessingMetadata = normalizeProcessingMetadata(
      doc.processing_metadata,
    );

    // Normalize status to allowed enum values
    let normalizedStatus = (doc.status ?? "unknown") as string;
    if (normalizedStatus === "fetching") normalizedStatus = "extracting";
    if (normalizedStatus === "processing") normalizedStatus = "embedding";

    return {
      id: doc.id,
      // customId removed - column does not exist
      // contentHash removed - column does not exist
      orgId: doc.org_id,
      userId: doc.user_id,
      // connectionId removed - column does not exist
      title: doc.title ?? null,
      content: doc.content ?? null,
      summary: doc.summary ?? null,
      url: doc.url ?? null,
      source: doc.source ?? null,
      type: normalizedType,
      status: normalizedStatus,
      metadata: cleanMetadata,
      processingMetadata: cleanProcessingMetadata,
      raw: doc.raw ?? null,
      tags: Array.isArray(doc.tags)
        ? (doc.tags as unknown[])
            .map((tag) => (typeof tag === "string" ? tag : null))
            .filter(
              (tag): tag is string => tag != null && tag.trim().length > 0,
            )
        : [],
      previewImage: doc.preview_image ?? null,
      error: doc.error ?? null,
      tokenCount: doc.token_count ?? null,
      wordCount: doc.word_count ?? null,
      chunkCount: doc.chunk_count ?? 0,
      averageChunkSize: doc.average_chunk_size ?? null,
      summaryEmbedding: doc.summary_embedding ?? null,
      summaryEmbeddingModel: doc.summary_embedding_model ?? null,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      memoryEntries,
      containerTags,
    };
  });

  const totalItems = count ?? documents.length;

  const response = {
    documents,
    pagination: {
      currentPage: page,
      limit,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    },
  };

  try {
    const validatedResponse =
      DocumentsWithMemoriesResponseSchema.parse(response);

    // Cache the result if not including heavy content fields
    if (!query.includeContent) {
      const cacheKey = generateCacheKey("doclist", {
        orgId: organizationId,
        page,
        limit,
        sort: query.sort,
        order: query.order,
        containerTags: query.containerTags,
      });
      documentListCache.set(cacheKey, validatedResponse);
    }

    return validatedResponse;
  } catch (zodError) {
    console.error(
      "Zod validation failed for DocumentsWithMemoriesResponse:",
      zodError,
    );
    console.error("Response data:", JSON.stringify(response, null, 2));
    throw zodError;
  }
}

export async function listDocumentsWithMemoriesByIds(
  client: SupabaseClient,
  organizationId: string,
  input: DocumentsByIdsInput,
) {
  const query = DocumentsByIdsSchema.parse(input);
  const isPermissionDenied = (e: unknown) => {
    if (!e || typeof e !== "object") return false;
    const code = (e as { code?: string }).code;
    if (code === "42501") return true;
    const msg = String((e as { message?: string }).message ?? "");
    return msg.includes("permission denied");
  };
  const column = "id"; // customId removed - column does not exist

  const { data, error } = await client
    .from("documents")
    .select(
      "id, org_id, user_id, title, content, summary, url, source, type, status, metadata, processing_metadata, raw, tags, preview_image, error, token_count, word_count, chunk_count, average_chunk_size, created_at, updated_at, space_id, parent_id, spaces(container_tag)",
    )
    .eq("org_id", organizationId)
    .in(column, query.ids);

  if (error && !isPermissionDenied(error)) throw error;

  const filtered = (data ?? []).filter((doc) => {
    if (!query.containerTags || query.containerTags.length === 0) return true;
    const tags = extractContainerTags(doc);
    return query.containerTags?.some((tag) => tags.includes(tag));
  });

  const docInfos = filtered.map((doc) => {
    const containerTags = extractContainerTags(doc);
    const spaceIds = extractSpaceIds(doc);

    return { doc, containerTags, spaceIds };
  });

  const docIds = docInfos.map(({ doc }) => doc.id);
  const memoryByDoc = new Map<string, MemoryRow[]>();

  if (docIds.length > 0) {
    // Limit memories query to prevent database overload with large IN() clauses
    const { data: memoryRows, error: memoryError } = await client
      .from("memories")
      .select(
        "id, document_id, space_id, org_id, user_id, content, metadata, is_latest, version, is_inference, source_count, created_at, updated_at",
      )
      .eq("org_id", organizationId)
      .in("document_id", docIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(docIds.length * 5, 250)); // Max 5 memories per doc, cap at 250 total

    if (memoryError && !isPermissionDenied(memoryError)) throw memoryError;

    for (const row of (memoryRows ?? []) as MemoryRow[]) {
      const entries = memoryByDoc.get(row.document_id) ?? [];
      entries.push(row);
      memoryByDoc.set(row.document_id, entries);
    }
  }

  const documents = docInfos.map(({ doc, containerTags, spaceIds }) => {
    const memoryRows = memoryByDoc.get(doc.id) ?? [];

    // Transform database rows to API format (content → memory)
    // Only include essential fields for list views to reduce payload size
    const memoryEntries = memoryRows.slice(0, 5).map((row) => ({
      id: row.id,
      documentId: row.document_id,
      memory: row.content ?? "", // API field: transformed from database 'content'
      spaceId: row.space_id ?? spaceIds[0] ?? "",
      orgId: row.org_id,
      userId: row.user_id ?? null,
      version: row.version ?? 1,
      isLatest: row.is_latest ?? true,
      sourceCount: 1, // Simplified for list view
      isInference: false, // Simplified for list view
      isForgotten: false, // Simplified for list view
      forgetAfter: null,
      forgetReason: null,
      memoryEmbedding: null, // Omit embeddings in list view for performance
      memoryEmbeddingModel: null,
      memoryEmbeddingNew: null,
      memoryEmbeddingNewModel: null,
      metadata: row.metadata ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      sourceAddedAt: row.created_at,
      sourceRelevanceScore: null,
      sourceMetadata: null,
      spaceContainerTag: containerTags[0] ?? null,
    }));

    // Normalize document type
    let normalizedType = doc.type ?? "text";
    if (normalizedType === "url") {
      normalizedType = "webpage";
    }
    if (!ALLOWED_DOCUMENT_TYPES.has(normalizedType)) {
      normalizedType = "text";
    }

    // Clean metadata to ensure it only contains string/number/boolean values
    const cleanMetadata =
      doc.metadata && typeof doc.metadata === "object"
        ? Object.fromEntries(
            Object.entries(doc.metadata as Record<string, unknown>).flatMap(
              ([key, value]) => {
                if (
                  typeof value === "string" ||
                  typeof value === "number" ||
                  typeof value === "boolean"
                ) {
                  return [[key, value]];
                }
                if (Array.isArray(value)) {
                  const sanitizedArray = value
                    .map((item) =>
                      typeof item === "string" ||
                      typeof item === "number" ||
                      typeof item === "boolean"
                        ? item
                        : null,
                    )
                    .filter((item) => item !== null);
                  if (sanitizedArray.length > 0) {
                    return [[key, sanitizedArray]];
                  }
                }
                return [] as Array<[string, unknown]>;
              },
            ),
          )
        : null;

    // Ensure processingMetadata has required fields or set to null
    const cleanProcessingMetadata = normalizeProcessingMetadata(
      doc.processing_metadata,
    );

    return {
      id: doc.id,
      // customId removed - column does not exist
      // contentHash removed - column does not exist
      orgId: doc.org_id,
      userId: doc.user_id,
      // connectionId removed - column does not exist
      title: doc.title ?? null,
      content: doc.content ?? null,
      summary: doc.summary ?? null,
      url: doc.url ?? null,
      source: doc.source ?? null,
      type: normalizedType,
      status: doc.status ?? "unknown",
      metadata: cleanMetadata,
      processingMetadata: cleanProcessingMetadata,
      raw: doc.raw ?? null,
      tags: Array.isArray(doc.tags)
        ? (doc.tags as unknown[])
            .map((tag) => (typeof tag === "string" ? tag : null))
            .filter(
              (tag): tag is string => tag != null && tag.trim().length > 0,
            )
        : [],
      containerTags,
      previewImage: doc.preview_image ?? null,
      error: doc.error ?? null,
      // ogImage removed - column does not exist
      tokenCount: doc.token_count ?? null,
      wordCount: doc.word_count ?? null,
      chunkCount: doc.chunk_count ?? 0,
      averageChunkSize: doc.average_chunk_size ?? null,
      summaryEmbedding: doc.summary_embedding ?? null,
      summaryEmbeddingModel: doc.summary_embedding_model ?? null,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      memoryEntries,
      parentId: (doc as any).parent_id ?? null,
    };
  });

  // Enrich bundle documents with children
  for (const doc of documents) {
    if (doc.type === "bundle") {
      try {
        const children = await getDocumentChildren(client, organizationId, doc.id);
        (doc as any).childCount = children.length;
        (doc as any).children = children;
      } catch (err) {
        console.error(`[by-ids] Failed to fetch children for bundle ${doc.id}`, err);
      }
    }
  }

  return DocumentsWithMemoriesResponseSchema.parse({
    documents,
    pagination: {
      currentPage: 1,
      limit: documents.length,
      totalItems: documents.length,
      totalPages: 1,
    },
  });
}

export async function updateDocument(
  client: SupabaseClient,
  {
    organizationId,
    documentId,
    content,
    title,
    containerTags,
    metadata,
  }: {
    organizationId: string;
    documentId: string;
    content?: string;
    title?: string;
    containerTags?: string[];
    metadata?: Record<string, unknown> | null;
  },
) {
  const updates: Record<string, unknown> = {};

  if (content !== undefined) {
    updates.content = content;
  }

  if (title !== undefined) {
    updates.title = title;
  }

  if (metadata !== undefined) {
    updates.metadata = metadata;
  }

  const normalizedTags =
    Array.isArray(containerTags) && containerTags.length > 0
      ? Array.from(
          new Set(
            containerTags
              .map((tag) => tag?.trim())
              .filter((tag): tag is string => Boolean(tag && tag.length > 0)),
          ),
        )
      : undefined;

  if (
    Object.keys(updates).length === 0 &&
    (!normalizedTags || normalizedTags.length === 0)
  ) {
    throw new Error(
      "At least one field (content, title, metadata, or containerTags) must be provided for update",
    );
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await client
      .from("documents")
      .update(updates)
      .eq("id", documentId)
      .eq("org_id", organizationId);

    if (updateError) throw updateError;
  }

  if (normalizedTags && normalizedTags.length > 0) {
    const spaceIds: string[] = [];
    for (const tag of normalizedTags) {
      const spaceId = await ensureSpace(client, organizationId, tag);
      spaceIds.push(spaceId);
    }

    // Update document to use the first space (many-to-one relationship)
    // Note: Schema only supports ONE space per document now
    const primarySpaceId = spaceIds[0];
    const { error: updateSpaceError } = await client
      .from("documents")
      .update({ space_id: primarySpaceId })
      .eq("id", documentId)
      .eq("org_id", organizationId);

    if (updateSpaceError) throw updateSpaceError;
  }

  const updated = await getDocument(client, organizationId, documentId);
  if (!updated) {
    throw new Error("Document not found after update");
  }

  // Queue connection update job (async - doesn't block response)
  addConnectionUpdateJob(documentId, organizationId).catch((err) => {
    console.error("[updateDocument] Failed to queue connection update", {
      documentId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  invalidateDocumentCaches();
  return updated;
}

export async function deleteDocument(
  client: SupabaseClient,
  {
    organizationId,
    documentId,
  }: {
    organizationId: string;
    documentId: string;
  },
) {
  // Skip if this is a temporary ID (not yet created in database)
  if (documentId.startsWith("temp-")) {
    console.log(
      `[deleteDocument] Skipping temporary document ${documentId} - not yet in database`,
    );
    return;
  }

  // Check if this document is a child of a bundle
  const { data: doc } = await client
    .from("documents")
    .select("parent_id")
    .eq("id", documentId)
    .eq("org_id", organizationId)
    .maybeSingle();

  const parentId = doc?.parent_id ?? null;

  const { error } = await client
    .from("documents")
    .delete()
    .eq("id", documentId)
    .eq("org_id", organizationId);

  if (error) throw error;

  // If this was a child, check if parent bundle is now empty and delete it
  if (parentId) {
    const { data: siblings } = await client
      .from("documents")
      .select("id")
      .eq("parent_id", parentId)
      .eq("org_id", organizationId)
      .limit(1);

    if (!siblings || siblings.length === 0) {
      // No more children — delete the empty parent bundle
      await client
        .from("documents")
        .delete()
        .eq("id", parentId)
        .eq("org_id", organizationId);
    }
  }

  invalidateDocumentCaches();
}

export async function cancelDocument(
  client: SupabaseClient,
  {
    organizationId,
    documentId,
  }: {
    organizationId: string;
    documentId: string;
  },
) {
  // Skip if this is a temporary ID (not yet created in database)
  if (documentId.startsWith("temp-")) {
    console.log(
      `[cancelDocument] Skipping temporary document ${documentId} - not yet in database`,
    );
    return;
  }

  // First, delete any partial chunks that may have been created
  const { error: chunksError } = await client
    .from("document_chunks")
    .delete()
    .eq("document_id", documentId);

  if (chunksError) {
    console.error("Failed to delete chunks during cancellation:", chunksError);
    // Don't throw - continue with status update even if chunk deletion fails
  }

  // Update document status to failed with cancellation message
  const { error: updateError } = await client
    .from("documents")
    .update({
      status: "failed",
      error: "Cancelled by user",
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("org_id", organizationId);

  if (updateError) throw updateError;

  console.log(
    `[cancelDocument] Document ${documentId} cancelled by user, cleaned up partial data`,
  );
}

export async function migrateMcpDocuments(
  _organizationId: string,
  body: unknown,
) {
  const payload = MigrateMCPRequestSchema.parse(body ?? {});

  const response = {
    success: true,
    migratedCount: 0,
    message: `MCP migration placeholder for target ${payload.targetUrl}`,
    documentIds: [] as string[],
  };

  return MigrateMCPResponseSchema.parse(response);
}

/**
 * Find related links for a document
 * Extracts mentions from content and searches for related resources
 */
/**
 * Check if a URL already exists in the organization's documents
 * Returns the existing document info if found
 */
export async function checkUrlExists(
  client: SupabaseClient,
  organizationId: string,
  url: string,
): Promise<{
  exists: boolean;
  document?: { id: string; status: string; title: string | null };
}> {
  const { data: existing, error } = await client
    .from("documents")
    .select("id, status, title")
    .eq("org_id", organizationId)
    .eq("url", url)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[checkUrlExists] Error checking URL:", error);
    throw error;
  }

  if (!existing) {
    return { exists: false };
  }

  return {
    exists: true,
    document: {
      id: existing.id,
      status: existing.status ?? "unknown",
      title: existing.title ?? null,
    },
  };
}

export async function findDocumentRelatedLinks(
  supabase: SupabaseClient,
  documentId: string,
  organizationId: string,
): Promise<{ success: boolean; relatedLinks: RelatedLink[]; error?: string }> {
  console.log("[findDocumentRelatedLinks] Starting for document:", documentId);

  // Get document content
  const { data: document, error: fetchError } = await supabase
    .from("documents")
    .select("id, content, title, url, raw")
    .eq("id", documentId)
    .eq("org_id", organizationId)
    .single();

  if (fetchError || !document) {
    console.error(
      "[findDocumentRelatedLinks] Failed to fetch document:",
      fetchError,
    );
    return { success: false, relatedLinks: [], error: "Document not found" };
  }

  const content = document.content || "";
  if (content.length < 100) {
    return {
      success: false,
      relatedLinks: [],
      error: "Content too short for analysis",
    };
  }

  // Find related links
  console.log("[findDocumentRelatedLinks] Finding related links...");
  const relatedLinks = await findRelatedLinks(content, { maxLinks: 10 });

  if (relatedLinks.length === 0) {
    console.log("[findDocumentRelatedLinks] No related links found");
    return { success: true, relatedLinks: [] };
  }

  console.log(
    `[findDocumentRelatedLinks] Found ${relatedLinks.length} related links`,
  );

  // Update document raw with related links
  const existingRaw = (document.raw as Record<string, unknown>) || {};
  const updatedRaw = {
    ...existingRaw,
    relatedLinks,
  };

  const { error: updateError } = await supabase
    .from("documents")
    .update({ raw: updatedRaw })
    .eq("id", documentId);

  if (updateError) {
    console.error(
      "[findDocumentRelatedLinks] Failed to update document:",
      updateError,
    );
    return {
      success: false,
      relatedLinks,
      error: "Failed to save related links",
    };
  }

  console.log("[findDocumentRelatedLinks] Successfully saved related links");
  return { success: true, relatedLinks };
}

// ============================================================================
// Bundle operations
// ============================================================================

export type BundleCreateInput = z.infer<typeof BundleCreateSchema>;

export async function createBundle({
  organizationId,
  userId,
  payload,
  client,
}: {
  organizationId: string;
  userId: string;
  payload: BundleCreateInput;
  client: SupabaseClient;
}) {
  const parsed = BundleCreateSchema.parse(payload);

  // If only 1 item, delegate to the standard addDocument flow
  if (parsed.items.length === 1) {
    const item = parsed.items[0];
    return addDocument({
      organizationId,
      userId,
      payload: {
        content: item.content,
        containerTags: parsed.containerTags,
        metadata: item.metadata ?? parsed.metadata ?? undefined,
      },
      client,
    });
  }

  // --- Multi-item bundle ---

  // Resolve container tag: respect user choice, otherwise auto-route from first link
  let containerTag =
    parsed.containerTags && parsed.containerTags.length > 0
      ? parsed.containerTags[0]
      : defaultContainerTag;

  // Try to infer project from first link item
  const firstLink = parsed.items.find((it) => it.type === "link");
  if (containerTag === defaultContainerTag && firstLink) {
    const isUrl = /^https?:\/\//i.test(firstLink.content);
    containerTag = resolveDefaultProject({
      type: isUrl ? "url" : "text",
      source: isUrl ? "web" : "manual",
      url: isUrl ? firstLink.content : null,
    });
  }

  const spaceId = await ensureSpace(client, organizationId, containerTag);

  // Create the parent bundle document
  const bundleTitle =
    parsed.title ??
    `Bundle (${parsed.items.length} items)`;

  const { data: parentDoc, error: parentError } = await client
    .from("documents")
    .insert({
      org_id: organizationId,
      user_id: userId,
      space_id: spaceId,
      title: bundleTitle,
      content: null,
      url: null,
      source: "bundle",
      status: "processing",
      type: "bundle",
      metadata: parsed.metadata ?? null,
      chunk_count: 0,
    })
    .select("id, status")
    .single();

  if (parentError) {
    console.error("[createBundle] Failed to insert parent", parentError);
    throw parentError;
  }

  const parentId = parentDoc.id;

  // Insert children + create ingestion jobs
  const children: Array<{ id: string; status: string; url: string | null; type: string }> = [];

  for (let i = 0; i < parsed.items.length; i++) {
    const item = parsed.items[i];
    const isUrl = /^https?:\/\//i.test(item.content);
    const inferredType = item.type === "note" ? "text" : isUrl ? "url" : "text";
    const inferredSource = item.type === "note" ? "manual" : isUrl ? "web" : "manual";
    const inferredUrl = isUrl ? item.content : null;
    const initialTitle = isUrl
      ? null
      : sanitizeString(item.content.slice(0, 80));
    const initialContent = isUrl ? null : sanitizeString(item.content);

    const childMetadata: Record<string, unknown> = {
      ...(item.metadata ?? {}),
      ...(isUrl ? { originalUrl: item.content } : {}),
    };

    const { data: childDoc, error: childError } = await client
      .from("documents")
      .insert({
        org_id: organizationId,
        user_id: userId,
        space_id: spaceId,
        parent_id: parentId,
        child_order: i,
        title: initialTitle,
        content: initialContent,
        url: inferredUrl,
        source: inferredSource,
        status: "queued",
        type: inferredType,
        metadata: Object.keys(childMetadata).length > 0 ? childMetadata : null,
        chunk_count: 0,
      })
      .select("id, status")
      .single();

    if (childError) {
      console.error("[createBundle] Failed to insert child", childError);
      continue;
    }

    children.push({
      id: childDoc.id,
      status: childDoc.status ?? "queued",
      url: inferredUrl,
      type: item.type,
    });

    // Quick OG image extraction for URL children (non-blocking)
    if (isUrl && inferredUrl) {
      extractOgImageQuick(inferredUrl)
        .then(async (ogImage) => {
          if (ogImage) {
            await client
              .from("documents")
              .update({ preview_image: ogImage })
              .eq("id", childDoc.id)
              .eq("org_id", organizationId);
          }
        })
        .catch(() => {});
    }

    // Create ingestion job for child
    const { data: jobRecord } = await client
      .from("ingestion_jobs")
      .insert({
        document_id: childDoc.id,
        org_id: organizationId,
        status: "queued",
        payload: {
          containerTags: [containerTag],
          content: item.content,
          metadata: childMetadata,
          url: inferredUrl,
          type: inferredType,
          source: inferredSource,
        },
      })
      .select("id")
      .single();

    // Process inline (async)
    if (jobRecord) {
      processDocumentInline({
        documentId: childDoc.id,
        jobId: jobRecord.id,
        orgId: organizationId,
        payload: {
          containerTags: [containerTag],
          content: item.content,
          metadata: childMetadata,
          url: inferredUrl,
          type: inferredType,
          source: inferredSource,
        },
      }).catch((err) => {
        console.error("[createBundle] Child processing failed", {
          childId: childDoc.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  invalidateDocumentCaches();

  return BundleResponseSchema.parse({
    id: parentId,
    status: "processing",
    children,
  });
}

/**
 * Get children of a bundle document, ordered by child_order
 */
export async function getDocumentChildren(
  client: SupabaseClient,
  organizationId: string,
  parentId: string,
) {
  const { data, error } = await client
    .from("documents")
    .select(
      "id, title, summary, status, url, type, content, preview_image, child_order, created_at, updated_at",
    )
    .eq("org_id", organizationId)
    .eq("parent_id", parentId)
    .order("child_order", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((child) => ({
    id: child.id,
    title: child.title ?? null,
    previewImage: child.preview_image ?? null,
    summary: child.summary ?? null,
    status: child.status ?? "unknown",
    url: child.url ?? null,
    type: child.type ?? "text",
    content: child.content ?? null,
    childOrder: child.child_order ?? 0,
  }));
}

/**
 * Update the parent bundle status based on children statuses.
 * Called after a child finishes processing.
 */
export async function updateBundleParentStatus(
  client: SupabaseClient,
  parentId: string,
  organizationId: string,
) {
  const { data: children, error } = await client
    .from("documents")
    .select("id, status, preview_image, summary")
    .eq("parent_id", parentId)
    .eq("org_id", organizationId);

  if (error) {
    console.error("[updateBundleParentStatus] Failed to fetch children", error);
    return;
  }

  if (!children || children.length === 0) return;

  const statuses = children.map((c) => String(c.status ?? "unknown").toLowerCase());
  const allDone = statuses.every((s) => s === "done" || s === "failed");
  const anyProcessing = statuses.some(
    (s) => !["done", "failed"].includes(s),
  );

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (allDone) {
    updates.status = "done";

    // Set preview image from first child that has one
    const firstPreview = children.find((c) => c.preview_image);
    if (firstPreview) {
      updates.preview_image = firstPreview.preview_image;
    }

    // Combine summaries
    const summaries = children
      .filter((c) => c.summary)
      .map((c, i) => `**${i + 1}.** ${c.summary}`)
      .join("\n\n");
    if (summaries) {
      updates.summary = summaries;
    }
  } else if (anyProcessing) {
    updates.status = "processing";
  }

  await client
    .from("documents")
    .update(updates)
    .eq("id", parentId)
    .eq("org_id", organizationId);
}
