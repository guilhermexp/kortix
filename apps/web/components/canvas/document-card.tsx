"use client";

import { cn } from "@lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader } from "@repo/ui/components/card";
import { getColors } from "@repo/ui/memory-graph/constants";
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api";
import {
  Brain,
  Clapperboard,
  ExternalLink,
  GripVertical,
  Image as ImageIcon,
  Link2,
  Play,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { getDocumentIcon } from "@/lib/document-icon";
import { formatDate, getSourceUrl } from "../memories";
import { getDocumentSnippet, stripMarkdown } from "../memories";
import { cancelDocument } from "@/lib/api/documents-client";

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>;
type DocumentWithMemories = DocumentsResponse["documents"][0];

type BaseRecord = Record<string, unknown>;

type PreviewData =
  | {
      kind: "image";
      src: string;
      label: string;
      href?: string;
    }
  | {
      kind: "video";
      src?: string;
      label: string;
      href?: string;
    }
  | {
      kind: "link";
      src?: string;
      label: string;
      href: string;
    };

const isInlineSvgDataUrl = (value?: string | null): boolean => {
  if (!value) return false;
  return value.trim().toLowerCase().startsWith("data:image/svg+xml");
};

const previewsEqual = (a: PreviewData | null, b: PreviewData | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.src === b.src && a.href === b.href && a.label === b.label;
};

const PROCESSING_STATUSES = new Set([
  "queued",
  "fetching",
  "extracting",
  "chunking",
  "embedding",
  "processing",
]);

const asRecord = (value: unknown): BaseRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as BaseRecord;
};

/**
 * Sanitize and validate URLs for image previews
 * Security: Prevents XSS via javascript:, data:text/html, and other malicious URLs
 */
const safeHttpUrl = (value: unknown, baseUrl?: string): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  // Handle data: URLs - only allow image types
  if (trimmed.startsWith("data:")) {
    // Only allow data:image/ URLs
    if (trimmed.startsWith("data:image/svg+xml") ||
        trimmed.startsWith("data:image/png") ||
        trimmed.startsWith("data:image/jpeg") ||
        trimmed.startsWith("data:image/jpg") ||
        trimmed.startsWith("data:image/gif") ||
        trimmed.startsWith("data:image/webp")) {
      // Limit data URL size to prevent DoS (2MB max)
      if (trimmed.length > 2 * 1024 * 1024) {
        console.warn("Data URL too large, ignoring");
        return undefined;
      }
      return trimmed;
    }
    // Reject any other data: URLs (text/html, application/javascript, etc.)
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    // Only allow http: and https: protocols (blocks javascript:, file:, etc.)
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    if (baseUrl) {
      try {
        const url = new URL(trimmed, baseUrl);
        if (url.protocol === "http:" || url.protocol === "https:") {
          return url.toString();
        }
      } catch {}
    }
  }
  return undefined;
};

const pickFirstUrl = (
  record: BaseRecord | null,
  keys: string[],
  baseUrl?: string,
): string | undefined => {
  if (!record) return undefined;
  for (const key of keys) {
    const candidate = record[key];
    const url = safeHttpUrl(candidate, baseUrl);
    if (url) return url;
  }
  return undefined;
};

// Prefer images from the same host as the original URL (avoid cross-site OG leaks)
const sameHostOrTrustedCdn = (candidate?: string, baseUrl?: string): boolean => {
  if (!candidate) return false;
  if (candidate.startsWith("data:image/")) return true;
  if (!baseUrl) return true; // no base to compare — allow
  try {
    const c = new URL(candidate);
    const b = new URL(baseUrl);
    if (c.hostname === b.hostname) return true;
    // Allow GitHub CDN for GitHub pages
    if (
      /(^|\.)github\.com$/i.test(b.hostname) &&
      /(^|\.)githubassets\.com$/i.test(c.hostname)
    )
      return true;
  } catch {}
  return false;
};

const pickFirstUrlSameHost = (
  record: BaseRecord | null,
  keys: string[],
  baseUrl?: string,
): string | undefined => {
  if (!record) return undefined;
  for (const key of keys) {
    const candidate = record[key];
    const url = safeHttpUrl(candidate, baseUrl);
    if (url && sameHostOrTrustedCdn(url, baseUrl)) return url;
  }
  return undefined;
};

const formatPreviewLabel = (type?: string | null): string => {
  if (!type) return "Link";
  return type
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const isYouTubeUrl = (value?: string): boolean => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("youtube.com") && !host.includes("youtu.be"))
      return false;
    return true;
  } catch {
    return false;
  }
};

const getYouTubeId = (value?: string): string | undefined => {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace(/^\//, "") || undefined;
    }
    if (parsed.searchParams.has("v")) {
      return parsed.searchParams.get("v") ?? undefined;
    }
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    if (pathSegments[0] === "embed" && pathSegments[1]) {
      return pathSegments[1];
    }
  } catch {}
  return undefined;
};

const getYouTubeThumbnail = (value?: string): string | undefined => {
  const videoId = getYouTubeId(value);
  if (!videoId) return undefined;
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
};

const getDocumentPreview = (
  document: DocumentWithMemories,
): PreviewData | null => {
  const metadata = asRecord(document.metadata);
  const raw = asRecord(document.raw);
  const rawExtraction = asRecord(raw?.extraction);
  const rawYoutube = asRecord(rawExtraction?.youtube);
  const rawFirecrawl =
    asRecord(raw?.firecrawl) ?? asRecord(rawExtraction?.firecrawl);
  const rawFirecrawlMetadata = asRecord(rawFirecrawl?.metadata) ?? rawFirecrawl;
  const rawGemini = asRecord(raw?.geminiFile);

  const isLikelyGeneric = (v?: string) => {
    if (!v) return true;
    const s = v.toLowerCase();
    return s.endsWith(".svg") || s.includes("favicon") || s.includes("sprite") || s.includes("logo");
  };

  const imageKeys = [
    "ogImage",
    "og_image",
    "twitterImage",
    "twitter_image",
    "previewImage",
    "preview_image",
    "image",
    "thumbnail",
    "thumbnailUrl",
    "thumbnail_url",
    "favicon",
  ];

  const originalUrl =
    safeHttpUrl(metadata?.originalUrl) ??
    safeHttpUrl((metadata as any)?.source_url) ??
    safeHttpUrl((metadata as any)?.sourceUrl) ??
    safeHttpUrl(document.url) ??
    safeHttpUrl(rawYoutube?.url);
  const geminiFileUri = safeHttpUrl(rawGemini?.["uri"], originalUrl);
  const geminiFileUrl = safeHttpUrl(rawGemini?.["url"], originalUrl);

  // No special-casing by domain for main preview

  const metadataImage = pickFirstUrlSameHost(metadata, imageKeys, originalUrl);
  const rawDirectImage = pickFirstUrlSameHost(raw, imageKeys, originalUrl);
  const rawImage =
    pickFirstUrlSameHost(rawExtraction, imageKeys, originalUrl) ??
    pickFirstUrlSameHost(rawFirecrawl, imageKeys, originalUrl) ??
    pickFirstUrlSameHost(rawFirecrawlMetadata, imageKeys, originalUrl) ??
    pickFirstUrlSameHost(rawGemini, imageKeys, originalUrl);

  const firecrawlOgImage =
    safeHttpUrl(rawFirecrawlMetadata?.ogImage, originalUrl) ??
    safeHttpUrl(rawFirecrawl?.ogImage, originalUrl);

  // Heuristics: avoid badges/svg; prefer GitHub social preview when available
  const isSvgOrBadge = (u?: string) => {
    if (!u) return true;
    const s = u.toLowerCase();
    return (
      s.startsWith("data:image/svg+xml") ||
      s.endsWith(".svg") ||
      s.includes("badge") ||
      s.includes("shields") ||
      s.includes("sprite") ||
      s.includes("logo") ||
      s.includes("icon") ||
      s.includes("topics")
    );
  };

  // Prefer images extracted from page content before generic OG images
  const extractedImages: string[] = (() => {
    const arr =
      (Array.isArray((rawExtraction as any)?.images) &&
        ((rawExtraction as any).images as unknown[])) ||
      (Array.isArray((raw as any)?.images) &&
        ((raw as any).images as unknown[])) ||
      [];
    const out: string[] = [];
    for (const u of arr) {
      const s = safeHttpUrl(u as string | undefined, originalUrl);
      if (!s) continue;
      if (isSvgOrBadge(s)) continue;
      if (!out.includes(s)) out.push(s);
    }
    return out;
  })();

  const preferredFromExtracted =
    extractedImages.find((u) => !isLikelyGeneric(u)) || extractedImages[0];

  const isDisallowedBadgeDomain = (u?: string) => {
    if (!u) return false;
    try {
      const h = new URL(u).hostname.toLowerCase();
      return h === 'img.shields.io' || h.endsWith('.shields.io');
    } catch { return false; }
  };

  const isGitHubHost = (u?: string) => {
    if (!u) return false;
    try { return new URL(u).hostname.toLowerCase().includes("github.com"); } catch { return false; }
  };
  const isGitHubAssets = (u?: string) => {
    if (!u) return false;
    try { return new URL(u).hostname.toLowerCase().endsWith("githubassets.com"); } catch { return false; }
  };
  const isGitHubOpenGraph = (u?: string) => {
    if (!u) return false;
    try { return isGitHubAssets(u) && new URL(u).pathname.includes("/opengraph/"); } catch { return false; }
  };

  // For GitHub pages, prefer the official OpenGraph banner
  const preferredGitHubOg = isGitHubHost(originalUrl)
    ? [firecrawlOgImage, metadataImage, rawImage, rawDirectImage].find(isGitHubOpenGraph)
    : undefined;

  const ordered = [rawImage, firecrawlOgImage, rawDirectImage, geminiFileUri, geminiFileUrl, metadataImage].filter(Boolean) as string[];
  const filtered = ordered.filter((u) => !isSvgOrBadge(u) && !isDisallowedBadgeDomain(u));
  const finalPreviewImage = preferredGitHubOg || filtered[0] || ordered.find(isGitHubOpenGraph) || metadataImage;
  const contentType =
    (typeof rawExtraction?.contentType === "string" &&
      rawExtraction.contentType) ||
    (typeof rawExtraction?.content_type === "string" &&
      rawExtraction.content_type) ||
    (typeof raw?.contentType === "string" && raw.contentType) ||
    (typeof raw?.content_type === "string" && raw.content_type) ||
    undefined;

  const normalizedType = document.type?.toLowerCase() ?? "";
  const label = formatPreviewLabel(document.type);

  // Fallback SVG placeholders (data URLs)
  const PDF_PLACEHOLDER =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7f1d1d"/><stop offset="100%" stop-color="#ef4444"/></linearGradient></defs>' +
        '<rect width="100%" height="100%" fill="url(#g)"/>' +
        '<rect x="24" y="24" width="96" height="32" rx="6" fill="rgba(255,255,255,0.2)"/>' +
        '<text x="40" y="48" font-family="system-ui,Segoe UI,Roboto" font-size="18" fill="#fff" opacity="0.9">PDF</text>' +
        '<text x="32" y="96" font-family="system-ui,Segoe UI,Roboto" font-size="28" fill="#fff" opacity="0.95">Document</text>' +
      '</svg>'
    );

  const XLSX_PLACEHOLDER =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">' +
        '<defs><linearGradient id="gx" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#064e3b"/><stop offset="100%" stop-color="#10b981"/></linearGradient></defs>' +
        '<rect width="100%" height="100%" fill="url(#gx)"/>' +
        '<rect x="24" y="24" width="120" height="32" rx="6" fill="rgba(255,255,255,0.2)"/>' +
        '<text x="40" y="48" font-family="system-ui,Segoe UI,Roboto" font-size="18" fill="#fff" opacity="0.9">Spreadsheet</text>' +
        '<text x="32" y="96" font-family="system-ui,Segoe UI,Roboto" font-size="28" fill="#fff" opacity="0.95">XLSX</text>' +
      '</svg>'
    );

  if (normalizedType === "image" || contentType?.startsWith("image/")) {
    const src = finalPreviewImage ?? originalUrl;
    if (src) {
      return {
        kind: "image",
        src,
        href: originalUrl ?? undefined,
        label: label || "Image",
      };
    }
  }

  // PDF preview fallback
  if (
    normalizedType.includes("pdf") ||
    (typeof contentType === "string" && contentType.toLowerCase().includes("pdf"))
  ) {
    return {
      kind: "image",
      src: finalPreviewImage || PDF_PLACEHOLDER,
      href: originalUrl ?? undefined,
      label: label || "PDF",
    };
  }

  // Spreadsheet (XLSX/Google Sheets) preview fallback
  if (
    normalizedType.includes("sheet") ||
    normalizedType.includes("excel") ||
    (typeof contentType === "string" && (
      contentType.toLowerCase().includes("spreadsheet") ||
      contentType.toLowerCase().includes("excel") ||
      contentType.toLowerCase().includes("sheet") ||
      contentType.toLowerCase().includes(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
    ))
  ) {
    return {
      kind: "image",
      src: finalPreviewImage || XLSX_PLACEHOLDER,
      href: originalUrl ?? undefined,
      label: label || "Spreadsheet",
    };
  }

  const youtubeUrl =
    safeHttpUrl(rawYoutube?.url) ?? safeHttpUrl(rawYoutube?.embedUrl);
  const youtubeThumbnail = safeHttpUrl(rawYoutube?.thumbnail);

  // IMPORTANT: Check document.previewImage first (from database)
  // This field is set by the backend during ingestion and should take priority
  // NEVER use SVG placeholders - they provide poor UX
  const documentPreviewImage = (() => {
    const url = safeHttpUrl(document.previewImage);
    // Block SVG placeholders - they're generic and provide no value
    if (url && url.includes('data:image/svg+xml')) {
      return undefined;
    }
    return url;
  })();

  const isVideoDocument =
    normalizedType === "video" ||
    contentType?.startsWith("video/") ||
    !!youtubeUrl ||
    (isYouTubeUrl(originalUrl) && !!originalUrl);

  if (isVideoDocument) {
    return {
      kind: "video",
      src:
        documentPreviewImage ??
        youtubeThumbnail ??
        finalPreviewImage ??
        getYouTubeThumbnail(originalUrl),
      href: youtubeUrl ?? originalUrl ?? undefined,
      label: contentType === "video/youtube" ? "YouTube" : label || "Video",
    };
  }

  if (finalPreviewImage) {
    return {
      kind: "image",
      src: finalPreviewImage,
      href: originalUrl ?? undefined,
      label: label || "Preview",
    };
  }

  return null;
};

interface DocumentCardProps {
  document: DocumentWithMemories;
  onRemove?: (document: DocumentWithMemories) => void;
  showRemoveButton?: boolean;
  onClick?: (document: DocumentWithMemories) => void;
  className?: string;
  showDragHandle?: boolean;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
}

export const DocumentCard = memo(
  ({
    document,
    onRemove,
    showRemoveButton = false,
    onClick,
    className,
    showDragHandle = false,
    isDragging = false,
    dragHandleProps,
  }: DocumentCardProps) => {
    const colors = getColors();
    const router = useRouter();
    const hasPrefetchedRef = useRef(false);
    const activeMemories = document.memoryEntries.filter((m) => !m.isForgotten);
    const forgottenMemories = document.memoryEntries.filter(
      (m) => m.isForgotten,
    );
    const preview = useMemo(() => getDocumentPreview(document), [document]);

    const sanitizedPreview = useMemo(() => {
      if (!preview) return null;
      if (preview.src && isInlineSvgDataUrl(preview.src)) {
        if (preview.kind === "video") {
          const fallback = getYouTubeThumbnail(document.url ?? undefined) ?? undefined;
          if (fallback) return { ...preview, src: fallback } as PreviewData;
        }
        return null;
      }
      return preview;
    }, [preview, document.url]);

    const isProcessing = document.status
      ? PROCESSING_STATUSES.has(String(document.status).toLowerCase())
      : false;

    const [stickyPreview, setStickyPreview] = useState<PreviewData | null>(null);

    useEffect(() => {
      setStickyPreview(null);
    }, [document.id]);

    useEffect(() => {
      if (!isProcessing) {
        setStickyPreview(null);
        return;
      }
      if (!sanitizedPreview) return;
      setStickyPreview((current) =>
        previewsEqual(current, sanitizedPreview) ? current : sanitizedPreview,
      );
    }, [isProcessing, sanitizedPreview]);

    const previewToRender = isProcessing
      ? stickyPreview ?? sanitizedPreview
      : sanitizedPreview;

    const PreviewBadgeIcon = useMemo(() => {
      switch (previewToRender?.kind) {
        case "image":
          return ImageIcon;
        case "video":
          return Clapperboard;
        case "link":
          return Link2;
        default:
          return null;
      }
    }, [previewToRender?.kind]);

    const stageForStatus = (stRaw: string) => {
      const st = stRaw.toLowerCase();
      switch (st) {
        case "queued":
          return { label: "Queued", from: 2, to: 10, duration: 6000 };
        case "fetching":
        case "extracting":
          return { label: "Extracting", from: 10, to: 40, duration: 12000 };
        case "chunking":
          return { label: "Chunking", from: 40, to: 65, duration: 8000 };
        case "embedding":
        case "processing":
          return { label: "Embedding", from: 65, to: 90, duration: 16000 };
        case "indexing":
          return { label: "Indexing", from: 90, to: 98, duration: 8000 };
        default:
          return { label: "Processing", from: 5, to: 15, duration: 6000 };
      }
    };
    const stageRef = useRef<string>(String(document.status || "unknown"));
    const startRef = useRef<number>(0);
    const [progressPct, setProgressPct] = useState<number>(() => stageForStatus(stageRef.current).from);
    const [progressLabel, setProgressLabel] = useState<string>(() => stageForStatus(stageRef.current).label);

    useEffect(() => {
      const currentStage = String(document.status || "unknown");
      if (currentStage !== stageRef.current) {
        stageRef.current = currentStage;
        const s = stageForStatus(currentStage);
        setProgressLabel(s.label);
        setProgressPct(s.from);
        startRef.current = performance.now();
      }
    }, [document.status]);

    useEffect(() => {
      if (!isProcessing) return;
      let rafId = 0;
      startRef.current = performance.now();
      const tick = () => {
        const s = stageForStatus(stageRef.current);
        const elapsed = performance.now() - startRef.current;
        const t = Math.min(1, elapsed / Math.max(1, s.duration));
        const eased = 1 - Math.pow(1 - t, 3);
        const next = s.from + (s.to - s.from) * eased;
        setProgressPct(next);
        setProgressLabel(s.label);
        if (t < 1 && isProcessing) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [isProcessing]);

    const getProgressInfo = () => {
      const st = String(document.status || "unknown").toLowerCase();
      switch (st) {
        case "queued":
          return { label: "Queued", pct: 5 };
        case "fetching":
        case "extracting":
          return { label: "Extracting", pct: 25 };
        case "chunking":
          return { label: "Chunking", pct: 50 };
        case "embedding":
        case "processing":
          return { label: "Embedding", pct: 75 };
        case "indexing":
          return { label: "Indexing", pct: 90 };
        default:
          return { label: "Processing", pct: 15 };
      }
    };

    const handlePrefetchEdit = useCallback(() => {
      if (hasPrefetchedRef.current) return;
      router.prefetch(`/memory/${document.id}/edit`);
      hasPrefetchedRef.current = true;
    }, [router, document.id]);

    const handleCardClick = useCallback(() => {
      if (onClick) {
        onClick(document);
      } else {
        router.push(`/memory/${document.id}/edit`);
      }
    }, [onClick, document, router]);

    return (
      <Card
        className={cn(
          "h-full w-full p-4 cursor-pointer group relative overflow-hidden border border-border gap-2 rounded-lg bg-card",
          isDragging
            ? "opacity-50 pointer-events-none"
            : "transition-all",
          className,
        )}
        onClick={handleCardClick}
        onFocus={isDragging ? undefined : handlePrefetchEdit}
        onMouseEnter={isDragging ? undefined : handlePrefetchEdit}
        onTouchStart={isDragging ? undefined : handlePrefetchEdit}
      >
        {/* Drag handle */}
        {showDragHandle && (
          <div
            {...dragHandleProps}
            data-dnd-handle="true"
            className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1.5 rounded-md"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              color: colors.text.secondary,
            }}
          >
            <GripVertical className="w-4 h-4" />
          </div>
        )}

        {/* Remove button for canvas */}
        {showRemoveButton && onRemove && (
          <button
            className="absolute top-2 left-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-red-500/20"
            onClick={async (e) => {
              e.stopPropagation();

              // If document is processing, cancel it via API
              if (isProcessing) {
                try {
                  await cancelDocument(document.id);
                  console.log(`[DocumentCard] Cancelled processing for document ${document.id}`);
                } catch (error) {
                  console.error("[DocumentCard] Failed to cancel document:", error);
                }
              }

              // Always call onRemove to update UI
              onRemove(document);
            }}
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              color: colors.text.muted,
            }}
            type="button"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Processing overlay */}
        {isProcessing && (
            <div className="absolute inset-0 z-20 bg-black/60 flex items-end justify-center pb-8 pointer-events-none">
              <div className="flex flex-col items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white/70" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" fill="none" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" />
                </svg>
                <div className="text-[11px] text-white/80">{progressLabel} • {Math.floor(progressPct)}%</div>
                <div className="h-1 w-24 rounded bg-white/20">
                  <div className="h-1 rounded bg-white" style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }} />
                </div>
              </div>
            </div>
        )}

        <CardHeader className="relative z-10 px-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {getDocumentIcon(document.type, "w-4 h-4 flex-shrink-0")}
              <p
                className={cn(
                  "text-sm font-medium line-clamp-1",
                  document.url ? "max-w-[190px]" : "max-w-[200px]",
                )}
              >
                {(() => {
                  const raw = document.title || "";
                  const isData = raw.startsWith("data:");
                  const cleaned = stripMarkdown(raw).trim().replace(/^[\'"“”‘’`]+|[\'"“”‘’`]+$/g, "");
                  return isData || !cleaned ? "Untitled Document" : cleaned;
                })()}
              </p>
            </div>
            {document.url && (
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  const sourceUrl = getSourceUrl(document);
                  window.open(sourceUrl ?? undefined, "_blank");
                }}
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                  color: colors.text.secondary,
                }}
                type="button"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>{formatDate(document.createdAt)}</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="relative z-10 px-0">
          {previewToRender && (
            <div
              className="mb-3 rounded-lg overflow-hidden border"
              style={{
                borderColor: "rgba(255, 255, 255, 0.08)",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
              }}
            >
              <div className="relative w-full aspect-[16/10] overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0f1624] via-[#101c2d] to-[#161f33] z-0" />
                {previewToRender.src && (
                  previewToRender.src.startsWith('data:') ? (
                    <img
                      alt={`${previewToRender.label} preview`}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] z-10"
                      loading="lazy"
                      src={previewToRender.src}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <Image
                      alt={`${previewToRender.label} preview`}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] z-10"
                      src={previewToRender.src}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      priority={false}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  )
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/45 z-20" />
                {previewToRender.kind === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-full border border-white/40 bg-black/40 p-2 backdrop-blur-sm">
                      <Play className="h-5 w-5 text-white" />
                    </div>
                  </div>
                )}
                {PreviewBadgeIcon && (
                  <div
                    className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
                    style={{
                      backgroundColor: "rgba(12, 18, 30, 0.55)",
                      color: "rgba(255, 255, 255, 0.92)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                    }}
                  >
                    <PreviewBadgeIcon className="h-3 w-3" />
                    <span>{previewToRender.label}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {(() => {
            const displayText = getDocumentSnippet(document);

            return (
              displayText &&
              !displayText.startsWith("data:") && (
                <p
                  className="text-xs line-clamp-6 mb-3"
                  style={{ color: colors.text.muted }}
                >
                  {displayText}
                </p>
              )
            );
          })()}

          {(() => {
            const raw = (document as any)?.metadata;
            const tagStr =
              typeof raw?.aiTagsString === "string"
                ? raw.aiTagsString
                : undefined;
            const tags = tagStr
              ? tagStr
                  .split(/[,\n]+/)
                  .map((t: string) => t.trim())
                  .filter(Boolean)
              : [];
            if (!tags.length) return null;
            const show = tags.slice(0, 4);
            return (
              <div className="mb-2 flex flex-wrap gap-1">
                {show.map((t: string) => (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 text-[10px] rounded border"
                    style={{
                      borderColor: "rgba(255, 255, 255, 0.12)",
                      color: colors.text.muted,
                      backgroundColor: "rgba(255,255,255,0.03)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            );
          })()}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {activeMemories.length > 0 && (
                <Badge
                  className="text-xs text-accent-foreground"
                  style={{
                    backgroundColor: colors.memory.secondary,
                  }}
                  variant="secondary"
                >
                  <Brain className="w-3 h-3 mr-1" />
                  {activeMemories.length}{" "}
                  {activeMemories.length === 1 ? "memory" : "memories"}
                </Badge>
              )}
              {forgottenMemories.length > 0 && (
                <Badge
                  className="text-xs"
                  style={{
                    borderColor: "rgba(255, 255, 255, 0.2)",
                    color: colors.text.muted,
                  }}
                  variant="outline"
                >
                  {forgottenMemories.length} forgotten
                </Badge>
              )}
            </div>

            {!showRemoveButton && onRemove && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-red-500/20"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    style={{
                      color: colors.text.muted,
                    }}
                    type="button"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Document</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this document and all its
                      related memories? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(document);
                      }}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>
    );
  },
);

DocumentCard.displayName = "DocumentCard";
