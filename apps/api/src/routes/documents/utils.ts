/**
 * Documents — shared helpers, types & constants
 */

import {
  BundleCreateSchema,
  DocumentsWithMemoriesQuerySchema,
  ListMemoriesQuerySchema,
  MemoryAddSchema,
} from "@repo/validation/api";
import { z } from "zod";
import {
  documentCache,
  documentListCache,
} from "../../services/query-cache";
import { DEFAULT_PROJECT_ID, FIXED_PROJECTS } from "@repo/lib/constants";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const defaultContainerTag = DEFAULT_PROJECT_ID;

export const ALLOWED_DOCUMENT_TYPES = new Set([
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

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

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
export type BundleCreateInput = z.infer<typeof BundleCreateSchema>;

// ---------------------------------------------------------------------------
// Internal types (used across modules)
// ---------------------------------------------------------------------------

export type DocumentSpaceRelation = {
  space_id?: string | null;
  spaces?: { container_tag?: string | null } | null;
};

export type ProcessingMetadata = {
  startTime?: number;
  steps?: unknown;
} & Record<string, unknown>;

export type MemoryRow = {
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

export type SortKey = "createdAt" | "updatedAt" | undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Auto-route documents to fixed projects based on type/source/URL.
 * Only acts when the document would fall into the default project.
 */
export function resolveDefaultProject(params: {
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

  // Instagram Reels
  if (
    /(?:^|\/\/)(?:www\.)?(?:instagram\.com|instagr\.am)\/reel\//.test(lowerUrl)
  )
    return FIXED_PROJECTS.INSTAGRAM_REELS;

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
export async function extractOgImageQuick(
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

export const invalidateDocumentCaches = () => {
  documentListCache.clear();
  documentCache.clear();
};

export function _isDocumentSpaceRelation(
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

export function extractContainerTags(relation: unknown): string[] {
  if (!relation || typeof relation !== "object") return [];
  const rel = relation as DocumentSpaceRelation;
  const tag = rel.spaces?.container_tag;
  return tag && typeof tag === "string" && tag.length > 0 ? [tag] : [];
}

export function extractSpaceIds(relation: unknown): string[] {
  if (!relation || typeof relation !== "object") return [];
  const rel = relation as DocumentSpaceRelation;
  const spaceId = rel.space_id;
  return spaceId && typeof spaceId === "string" && spaceId.length > 0
    ? [spaceId]
    : [];
}

export function normalizeProcessingMetadata(value: unknown):
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
    ...record,
    startTime,
    steps: stepsArray,
  };
}

export function resolveSortColumn(sort: SortKey) {
  if (sort === "updatedAt") {
    return "updated_at";
  }
  return "created_at";
}

export function isPermissionDenied(e: unknown) {
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: string }).code;
  if (code === "42501") return true;
  const msg = String((e as { message?: string }).message ?? "");
  return msg.includes("permission denied");
}
