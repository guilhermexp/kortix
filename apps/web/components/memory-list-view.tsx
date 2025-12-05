"use client";

import { useIsMobile } from "@hooks/use-mobile";
import { useDeleteDocument } from "@lib/queries";
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
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api";
import {
	Brain,
	Loader,
	Play,
	Trash2,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import type { z } from "zod"
import { analytics } from "@/lib/analytics"
import { cancelDocument } from "@/lib/api/documents-client"
import { useProject } from "@/stores"
import {
	getDocumentSnippet,
	stripMarkdown,
} from "./memories"

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

const previewsEqual = (
  a: PreviewData | null,
  b: PreviewData | null,
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    a.src === b.src &&
    a.href === b.href &&
    a.label === b.label
  );
};

const PROCESSING_STATUSES = new Set([
  "queued",
  "fetching",
  "extracting",
  "chunking",
  "embedding",
  "processing",
]);

const shimmerStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(110deg, rgba(255,255,255,0.04) 20%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.04) 80%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.8s linear infinite",
};

const asRecord = (value: unknown): BaseRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as BaseRecord;
};

const safeHttpUrl = (value: unknown, baseUrl?: string): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Only accept data URLs that are images, not text or other types
  if (trimmed.startsWith("data:")) {
    if (trimmed.startsWith("data:image/")) {
      return trimmed;
    }
    return undefined;
  }

  // Try absolute URL first
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    // If it fails, try as relative URL with baseUrl
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

const sameHostOrTrustedCdn = (
  candidate?: string,
  baseUrl?: string,
): boolean => {
  if (!candidate) return false;
  if (candidate.startsWith("data:image/")) return true;
  if (!baseUrl) return true;
  try {
    const c = new URL(candidate);
    const b = new URL(baseUrl);
    if (c.hostname === b.hostname) return true;
    if (
      /(^|\.)github\.com$/i.test(b.hostname) &&
      /((^|\.)githubassets\.com$)/i.test(c.hostname)
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

const isLowResolutionImage = (url?: string): boolean => {
  if (!url) return false;
  try {
    const lower = url.toLowerCase();
    if (lower.endsWith(".ico") || lower.includes("favicon")) return true;
    if (/(apple-touch-icon|android-chrome)/.test(lower)) return true;
    const sizeMatch = lower.match(/(\d{1,3})x(\d{1,3})/);
    if (sizeMatch) {
      const width = Number(sizeMatch[1]);
      const height = Number(sizeMatch[2]);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        if (Math.max(width, height) <= 160) return true;
      }
    }
  } catch {
    // ignore parsing errors
  }
  return false;
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

  // Get preview_image directly from document (from database)
  const documentPreviewImage =
    (document as any).previewImage ?? (document as any).preview_image;

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

  // Get URL from multiple possible locations first (needed as baseUrl)
  const originalUrl =
    safeHttpUrl(metadata?.originalUrl) ??
    safeHttpUrl((metadata as any)?.source_url) ??
    safeHttpUrl((metadata as any)?.sourceUrl) ??
    safeHttpUrl(document.url) ??
    safeHttpUrl(rawYoutube?.url);
  const geminiFileUri = safeHttpUrl(rawGemini?.["uri"], originalUrl);
  const geminiFileUrl = safeHttpUrl(rawGemini?.["url"], originalUrl);

  // Now search for images with baseUrl context
  const metadataImage = pickFirstUrlSameHost(metadata, imageKeys, originalUrl);
  // Check raw object directly first (new extracted og:image metadata)
  const rawDirectImage = pickFirstUrlSameHost(raw, imageKeys, originalUrl);
  const rawImage =
    pickFirstUrlSameHost(rawExtraction, imageKeys, originalUrl) ??
    pickFirstUrlSameHost(rawFirecrawl, imageKeys, originalUrl) ??
    pickFirstUrlSameHost(rawFirecrawlMetadata, imageKeys, originalUrl) ??
    pickFirstUrlSameHost(rawGemini, imageKeys, originalUrl);

  // Check Firecrawl metadata directly for Open Graph images
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
  const isDisallowedBadgeDomain = (u?: string) => {
    if (!u) return false;
    try {
      const h = new URL(u).hostname.toLowerCase();
      return h === "img.shields.io" || h.endsWith(".shields.io");
    } catch {
      return false;
    }
  };
  const isGitHubHost = (u?: string) => {
    if (!u) return false;
    try {
      return new URL(u).hostname.toLowerCase().includes("github.com");
    } catch {
      return false;
    }
  };
  const isGitHubAssets = (u?: string) => {
    if (!u) return false;
    try {
      return new URL(u).hostname.toLowerCase().endsWith("githubassets.com");
    } catch {
      return false;
    }
  };
  const isGitHubOpenGraph = (u?: string) => {
    if (!u) return false;
    try {
      return isGitHubAssets(u) && new URL(u).pathname.includes("/opengraph/");
    } catch {
      return false;
    }
  };

  const sanitizedPreviewImage = (() => {
    if (typeof documentPreviewImage !== "string") return null;
    const trimmed = documentPreviewImage.trim();
    if (!trimmed) return null;
    if (isInlineSvgDataUrl(trimmed)) return null;
    if (trimmed.startsWith("data:image/")) return trimmed;
    const resolved = safeHttpUrl(trimmed, originalUrl);
    if (!resolved) return null;
    if (isSvgOrBadge(resolved)) return null;
    return resolved;
  })();

  const preferredGitHubOg = isGitHubHost(originalUrl)
    ? [
        sanitizedPreviewImage,
        firecrawlOgImage,
        metadataImage,
        rawImage,
        rawDirectImage,
      ].find(isGitHubOpenGraph)
    : undefined;
  const ordered = [
    sanitizedPreviewImage,
    rawImage,
    firecrawlOgImage,
    rawDirectImage,
    geminiFileUri,
    geminiFileUrl,
    metadataImage,
  ].filter(Boolean) as string[];
  const filtered = ordered.filter(
    (u) =>
      !isSvgOrBadge(u) &&
      !isDisallowedBadgeDomain(u) &&
      !isLowResolutionImage(u),
  );
  const extractionImages = (() => {
    const list: string[] = [];
    const push = (value?: unknown) => {
      const candidate = safeHttpUrl(value as string | undefined, originalUrl);
      if (!candidate) return;
      if (isSvgOrBadge(candidate)) return;
      if (isDisallowedBadgeDomain(candidate)) return;
      if (isLowResolutionImage(candidate)) return;
      if (!list.includes(candidate)) list.push(candidate);
    };

    const extractionArray = Array.isArray((rawExtraction as any)?.images)
      ? ((rawExtraction as any).images as unknown[])
      : [];
    for (const item of extractionArray) push(item);

    const metaTags = asRecord((rawExtraction as any)?.metaTags);
    if (metaTags) {
      push(metaTags.ogImage);
      push((metaTags as any).twitterImage);
    }

    return list;
  })();
  const memoryImages = (() => {
    const seen = new Set<string>();
    const collected: string[] = [];
    const addCandidate = (value?: unknown) => {
      if (!value) return;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return;
        if (trimmed.toLowerCase().startsWith("data:image/svg+xml")) return;
        const resolved = trimmed.startsWith("data:image/")
          ? trimmed
          : safeHttpUrl(trimmed, originalUrl);
        if (!resolved) return;
        if (isSvgOrBadge(resolved)) return;
        if (isLowResolutionImage(resolved)) return;
        if (!seen.has(resolved)) {
          seen.add(resolved);
          collected.push(resolved);
        }
        return;
      }
      const record = asRecord(value);
      if (record?.url) addCandidate(record.url);
    };

    for (const entry of document.memoryEntries) {
      const meta = asRecord(entry.metadata);
      if (!meta) continue;
      const images = Array.isArray(meta.images) ? meta.images : [];
      for (const img of images) addCandidate(img);
      const thumbs = Array.isArray((meta as any).thumbnails)
        ? ((meta as any).thumbnails as unknown[])
        : [];
      for (const thumb of thumbs) addCandidate(thumb);
      if (typeof meta.cover === "string") addCandidate(meta.cover);
      if (typeof (meta as any).preview === "string")
        addCandidate((meta as any).preview);
      if (typeof (meta as any).previewImage === "string")
        addCandidate((meta as any).previewImage);
    }

    return collected;
  })();
  const finalPreviewImage =
    preferredGitHubOg ||
    filtered[0] ||
    ordered.find(isGitHubOpenGraph) ||
    metadataImage;
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

  let fallbackImage =
    finalPreviewImage ??
    sanitizedPreviewImage ??
    extractionImages[0] ??
    memoryImages[0] ??
    ordered.find((candidate) => !isLowResolutionImage(candidate)) ??
    null;

  if (!fallbackImage && isGitHubHost(originalUrl)) {
    try {
      const parsed = new URL(originalUrl ?? "");
      const segments = parsed.pathname.split("/").filter(Boolean).slice(0, 2);
      if (segments.length === 2) {
        const repoSlug = segments.join("/");
        fallbackImage = `https://opengraph.githubassets.com/${document.id}/${repoSlug}`;
      }
    } catch {
      // ignore
    }
  }

  if (normalizedType === "image" || contentType?.startsWith("image/")) {
    const src = fallbackImage ?? originalUrl;
    if (src) {
      return {
        kind: "image",
        src,
        href: originalUrl ?? undefined,
        label: label || "Image",
      };
    }
  }

  // Check for YouTube video data first
  const youtubeUrl =
    safeHttpUrl(rawYoutube?.url) ?? safeHttpUrl(rawYoutube?.embedUrl);
  const youtubeThumbnail = safeHttpUrl(rawYoutube?.thumbnail);

  const isVideoDocument =
    normalizedType === "video" ||
    contentType?.startsWith("video/") ||
    !!youtubeUrl ||
    (isYouTubeUrl(originalUrl) && !!originalUrl);

  if (isVideoDocument) {
    return {
      kind: "video",
      src:
        youtubeThumbnail ?? fallbackImage ?? getYouTubeThumbnail(originalUrl),
      href: youtubeUrl ?? originalUrl ?? undefined,
      label: contentType === "video/youtube" ? "YouTube" : label || "Video",
    };
  }

  if (fallbackImage) {
    return {
      kind: "image",
      src: fallbackImage,
      href: originalUrl ?? undefined,
      label: label || "Preview",
    };
  }

  // For links without preview images, don't render preview at all
  // The card will just show the title and content
  return null;
};

interface MemoryListViewProps {
  children?: React.ReactNode;
  documents: DocumentWithMemories[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  totalLoaded: number;
  hasMore: boolean;
  loadMoreDocuments: () => Promise<void>;
  onDocumentDeleted?: (id: string) => void;
}

// Pinterest-style masonry card
const MasonryCard = memo(
  ({
    document,
    onDelete,
  }: {
    document: DocumentWithMemories;
    onDelete: (document: DocumentWithMemories) => void;
  }) => {
    const router = useRouter();
    const hasPrefetchedRef = useRef(false);
    const activeMemories = document.memoryEntries.filter((m) => !m.isForgotten);
    const preview = useMemo(() => getDocumentPreview(document), [document]);

    const sanitizedPreview = useMemo(() => {
      if (!preview) return null;
      if (preview.src && isInlineSvgDataUrl(preview.src)) {
        if (preview.kind === "video") {
          const fallback = getYouTubeThumbnail(document.url) ?? undefined;
          if (fallback) return { ...preview, src: fallback } as PreviewData;
        }
        return null;
      }
      return preview;
    }, [preview, document.url]);

    const isProcessing = document.status
      ? PROCESSING_STATUSES.has(String(document.status).toLowerCase())
      : false;

    const [stickyPreview, setStickyPreview] = useState<PreviewData | null>(
      null,
    );
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    useEffect(() => {
      setStickyPreview(null);
      setImageLoaded(false);
      setImageError(false);
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
      ? (stickyPreview ?? sanitizedPreview)
      : sanitizedPreview;

    // Dynamic progress per stage
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
    const [progressPct, setProgressPct] = useState<number>(
      () => stageForStatus(stageRef.current).from,
    );
    const [progressLabel, setProgressLabel] = useState<string>(
      () => stageForStatus(stageRef.current).label,
    );

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
        const duration = Math.max(1200, s.duration);
        const elapsed = (performance.now() - startRef.current) % duration;
        const t = elapsed / duration;
        const eased = 1 - (1 - t) ** 3;
        const wiggle = Math.sin(performance.now() / 650) * 1.5;
        const next = s.from + (s.to - s.from) * eased + wiggle;
        setProgressPct(next);
        setProgressLabel(s.label);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [isProcessing]);

    const handlePrefetchEdit = useCallback(() => {
      if (hasPrefetchedRef.current) return;
      router.prefetch(`/memory/${document.id}/edit`);
      hasPrefetchedRef.current = true;
    }, [router, document.id]);

    const clampedProgress = Math.max(0, Math.min(100, progressPct));
    const progressDisplay = Math.max(
      1,
      Math.min(99, Math.round(clampedProgress)),
    );
    const shimmerTextStyle = isProcessing
      ? {
          backgroundImage:
            "linear-gradient(110deg, rgba(255,255,255,0.25) 20%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0.25) 80%)",
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text",
          color: "transparent",
          animation: "shimmer 1.8s linear infinite",
        }
      : undefined;
    const hasPreviewImage = previewToRender?.src && !imageError;
    const displayText = getDocumentSnippet(document);
    const cleanedTitle = (() => {
      const raw = document.title || "";
      const isData = raw.startsWith("data:");
      const cleaned = stripMarkdown(raw)
        .trim()
        .replace(/^['"""''`]+|['"""''`]+$/g, "");
      return isData || !cleaned ? "Untitled Document" : cleaned;
    })();

    return (
      <div
        className="group relative mb-4 break-inside-avoid cursor-pointer rounded-xl overflow-hidden bg-card border border-border/50 hover:border-border transition-all duration-300 hover:shadow-lg hover:shadow-black/10"
        onClick={() => {
          analytics.documentCardClicked();
          router.push(`/memory/${document.id}/edit`);
        }}
        onFocus={handlePrefetchEdit}
        onMouseEnter={handlePrefetchEdit}
        onTouchStart={handlePrefetchEdit}
      >
        {/* Processing overlay (keep simple, progress still loops) */}
        {isProcessing && (
          <div className="absolute inset-0 z-30 bg-background/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <svg
                className="animate-spin h-6 w-6 text-primary"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  fill="none"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  fill="currentColor"
                />
              </svg>
              <div className="text-xs text-muted-foreground font-medium">
                {progressLabel} • {progressDisplay}%
              </div>
              <div className="h-1.5 w-24 rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all duration-300"
                  style={{
                    width: `${Math.max(6, clampedProgress)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Image/Preview area - Pinterest style variable height */}
        {hasPreviewImage && (
          <div className="relative w-full overflow-hidden bg-muted">
            <img
              alt={cleanedTitle}
              className={cn(
                "w-full object-cover transition-all duration-500",
                "group-hover:scale-105",
                imageLoaded ? "opacity-100" : "opacity-0",
              )}
              loading="lazy"
              onError={() => setImageError(true)}
              onLoad={() => setImageLoaded(true)}
              src={previewToRender.src}
              style={{ display: imageError ? "none" : "block" }}
            />
            {/* Loading shimmer */}
            {!imageLoaded && !imageError && (
              <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/50 to-muted animate-pulse min-h-[120px]" />
            )}
            {/* Video play button overlay */}
            {previewToRender.kind === "video" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="rounded-full bg-black/60 p-3 backdrop-blur-sm">
                  <Play className="h-6 w-6 text-white fill-white" />
                </div>
              </div>
            )}
            {/* Gradient overlay for text readability */}
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        )}

        {/* Content area */}
        <div className={cn("p-3", hasPreviewImage && "pt-2")}>
          {/* Title - hide when processing */}
          {!isProcessing && (
            <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-snug mb-1.5">
              {cleanedTitle}
            </h3>
          )}

          {/* Snippet - only if no preview image or short snippet, hide when processing */}
          {!isProcessing && displayText && !displayText.startsWith("data:") && (
            <p
              className={cn(
                "text-xs text-muted-foreground line-clamp-3 leading-relaxed",
                hasPreviewImage ? "line-clamp-2" : "line-clamp-4",
              )}
            >
              {stripMarkdown(displayText).slice(0, 200)}
            </p>
          )}

          {/* Footer with memory count and delete */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
            <div className="flex items-center gap-1.5">
              {activeMemories.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Brain className="w-3 h-3" />
                  {activeMemories.length}{" "}
                  {activeMemories.length === 1 ? "memory" : "memories"}
                </span>
              )}
            </div>

            {/* Delete button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  onClick={(e) => e.stopPropagation()}
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
                  <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (isProcessing) {
                        try {
                          await cancelDocument(document.id);
                        } catch (error) {
                          console.error(
                            "[MemoryListView] Failed to cancel document:",
                            error,
                          );
                        }
                      }
                      onDelete(document);
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Failed status badge */}
          {String(document.status).toLowerCase() === "failed" && (
            <div className="mt-2">
              <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 border border-red-500/30">
                Failed
              </span>
            </div>
          )}
        </div>
      </div>
    );
  },
);

export const MemoryListView = ({
  children,
  documents,
  isLoading,
  isLoadingMore,
  error,
  hasMore,
  loadMoreDocuments,
  onDocumentDeleted,
}: MemoryListViewProps) => {
  const [selectedSpace, _] = useState<string>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { selectedProject } = useProject();
  const deleteDocumentMutation = useDeleteDocument(selectedProject);

  const handleDeleteDocument = useCallback(
    (document: DocumentWithMemories) => {
      deleteDocumentMutation.mutate(document.id, {
        onSuccess: () => {
          onDocumentDeleted?.(document.id);
        },
      });
    },
    [deleteDocumentMutation, onDocumentDeleted],
  );

  // Filter documents based on selected space
  const filteredDocuments = useMemo(() => {
    if (!documents) return [];

    if (selectedSpace === "all") {
      return documents;
    }

    return documents
      .map((doc) => ({
        ...doc,
        memoryEntries: doc.memoryEntries.filter(
          (memory) =>
            (memory.spaceContainerTag ?? memory.spaceId) === selectedSpace,
        ),
      }))
      .filter((doc) => doc.memoryEntries.length > 0);
  }, [documents, selectedSpace]);

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (firstEntry?.isIntersecting && hasMore && !isLoadingMore) {
          loadMoreDocuments();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMoreDocuments]);

  return (
    <div className="h-full overflow-hidden relative bg-background">
      {error ? (
        <div className="h-full flex items-center justify-center p-4">
          <div className="rounded-xl overflow-hidden">
            <div className="relative z-10 px-6 py-4 text-foreground">
              Error loading documents: {error.message}
            </div>
          </div>
        </div>
      ) : isLoading ? (
        <div className="h-full flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-3">
            <Loader className="w-8 h-8 text-orange-500 animate-spin" />
            <span className="text-muted-foreground">Loading...</span>
          </div>
        </div>
      ) : filteredDocuments.length === 0 && !isLoading ? (
        <div className="h-full flex items-center justify-center p-4">
          {children}
        </div>
      ) : (
        <div
          className="h-full overflow-auto pt-16 pb-20 custom-scrollbar"
          ref={scrollRef}
        >
          {/* Masonry Grid with CSS columns */}
          <div
            className={cn(
              // Padding: left for floating menu, right normal
              "pl-4 pr-4 md:pl-20 md:pr-6 lg:pl-20 lg:pr-8",
              // CSS Columns for masonry layout
              "columns-1 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5",
              "gap-4",
            )}
            style={{
              columnFill: "balance",
            }}
          >
            {filteredDocuments.map((document) => (
              <MasonryCard
                document={document}
                key={document.id}
                onDelete={handleDeleteDocument}
              />
            ))}
          </div>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" />

          {isLoadingMore && (
            <div className="py-8 flex items-center justify-center">
              <div className="flex items-center gap-2">
                <Loader className="w-5 h-5 text-orange-500 animate-spin" />
                <span className="text-muted-foreground">Loading more...</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
