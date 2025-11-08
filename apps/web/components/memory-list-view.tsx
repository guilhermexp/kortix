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
import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader } from "@repo/ui/components/card";
import { getColors } from "@repo/ui/memory-graph/constants";
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Brain,
  Clapperboard,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Play,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import useResizeObserver from "@/hooks/use-resize-observer";
import { analytics } from "@/lib/analytics";
import { getDocumentIcon } from "@/lib/document-icon";
import { useProject } from "@/stores";
import { InlineLoader } from "./editor/loading-states";
import { formatDate, getSourceUrl } from "./memories";
import { getDocumentSnippet, stripMarkdown } from "./memories";
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

const sameHostOrTrustedCdn = (candidate?: string, baseUrl?: string): boolean => {
  if (!candidate) return false;
  if (candidate.startsWith("data:image/")) return true;
  if (!baseUrl) return true;
  try {
    const c = new URL(candidate);
    const b = new URL(baseUrl);
    if (c.hostname === b.hostname) return true;
    if ((/(^|\.)github\.com$/i.test(b.hostname)) && (/((^|\.)githubassets\.com$)/i.test(c.hostname))) return true;
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
  const documentPreviewImage = (document as any).previewImage ?? (document as any).preview_image;

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

  const preferredGitHubOg = isGitHubHost(originalUrl)
    ? [documentPreviewImage, firecrawlOgImage, metadataImage, rawImage, rawDirectImage].find(isGitHubOpenGraph)
    : undefined;
  const ordered = [documentPreviewImage, rawImage, firecrawlOgImage, rawDirectImage, geminiFileUri, geminiFileUrl, metadataImage].filter(Boolean) as string[];
  const filtered = ordered.filter(
    (u) => !isSvgOrBadge(u) && !isDisallowedBadgeDomain(u) && !isLowResolutionImage(u),
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
        const resolved =
          trimmed.startsWith("data:image/")
            ? trimmed
            : safeHttpUrl(trimmed, originalUrl);
        if (!resolved) return;
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

  const previewImageCandidate =
    typeof documentPreviewImage === "string"
      ? documentPreviewImage.trim()
      : null;
  const sanitizedPreviewImage =
    previewImageCandidate && previewImageCandidate.startsWith("data:image/")
      ? previewImageCandidate
      : safeHttpUrl(previewImageCandidate, originalUrl);

  let fallbackImage =
    finalPreviewImage ??
    sanitizedPreviewImage ??
    extractionImages[0] ??
    memoryImages[0] ??
    (ordered.find((candidate) => !isLowResolutionImage(candidate)) ?? null);

  if (!fallbackImage && isGitHubHost(originalUrl)) {
    try {
      const parsed = new URL(originalUrl ?? "");
      const segments = parsed.pathname
        .split("/")
        .filter(Boolean)
        .slice(0, 2);
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
      src: youtubeThumbnail ?? fallbackImage ?? getYouTubeThumbnail(originalUrl),
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
}

const GreetingMessage = memo(() => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="flex items-center gap-3 mb-3 md:mb-6 md:mt-3">
      <div>
        <h1 className="text-lg md:text-xl font-semibold text-foreground">
          {getGreeting()}!
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Welcome back to your memory collection
        </p>
      </div>
    </div>
  );
});

const DocumentCard = memo(
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
    const forgottenMemories = document.memoryEntries.filter(
      (m) => m.isForgotten,
    );
    const preview = useMemo(() => getDocumentPreview(document), [document]);

    const PreviewBadgeIcon = useMemo(() => {
      switch (preview?.kind) {
        case "image":
          return ImageIcon;
        case "video":
          return Clapperboard;
        case "link":
          return Link2;
        default:
          return null;
      }
    }, [preview?.kind]);

    const processingStates = new Set([
      "queued",
      "fetching",
      "extracting",
      "chunking",
      "embedding",
      "processing",
    ]);

    const isProcessing = document.status
      ? processingStates.has(String(document.status).toLowerCase())
      : false;

    // Dynamic progress per stage (time-based tween while waiting backend status update)
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
        // ease-out
        const eased = 1 - Math.pow(1 - t, 3);
        const next = s.from + (s.to - s.from) * eased;
        setProgressPct(next);
        setProgressLabel(s.label);
        if (t < 1 && isProcessing) rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [isProcessing]);

    const handlePrefetchEdit = useCallback(() => {
      if (hasPrefetchedRef.current) return;
      router.prefetch(`/memory/${document.id}/edit`);
      hasPrefetchedRef.current = true;
    }, [router, document.id]);

    return (
      <Card
        className="h-full w-full p-4 transition-all cursor-pointer group relative overflow-hidden border border-border gap-2 md:w-full rounded-lg bg-card"
        onClick={() => {
          analytics.documentCardClicked();
          router.push(`/memory/${document.id}/edit`);
        }}
        onFocus={handlePrefetchEdit}
        onMouseEnter={handlePrefetchEdit}
        onTouchStart={handlePrefetchEdit}
      >
        {/* Inline processing feedback overlay inside the card */}
        {isProcessing && (
            <div className="absolute inset-0 z-20 bg-background/60 flex items-end justify-center pb-8 pointer-events-none">
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <svg className="animate-spin h-5 w-5 text-muted-foreground" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" fill="none" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" />
                  </svg>
                </div>
                <div className="text-[11px] text-muted-foreground">{progressLabel} • {Math.floor(progressPct)}%</div>
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
                  const cleaned = stripMarkdown(raw)
                    .trim()
                    .replace(/^[\'"“”‘’`]+|[\'"“”‘’`]+$/g, "");
                  return isData || !cleaned ? "Untitled Document" : cleaned;
                })()}
              </p>
            </div>
            {document.url && (
              <button
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-muted/50 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  const sourceUrl = getSourceUrl(document);
                  window.open(sourceUrl ?? undefined, "_blank");
                }}
                type="button"
              >
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              {String(document.status).toLowerCase() === "failed" && (
                <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">Failed</span>
              )}
              <span>{formatDate(document.createdAt)}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative z-10 px-0">
          {preview && (
            <div className="mb-3 rounded-lg overflow-hidden border border-border bg-muted/30 relative h-48">
              <div className="absolute inset-0 bg-muted" />
              {preview.src && (
                <img
                  alt={`${preview.label} preview`}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  loading="lazy"
                  src={preview.src}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/45" />
              {preview.kind === "video" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full border border-border bg-background/40 p-2 backdrop-blur-sm">
                    <Play className="h-5 w-5 text-foreground" />
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
                  <span>{preview.label}</span>
                </div>
              )}
            </div>
          )}
          {(() => {
            const displayText = getDocumentSnippet(document);

            return (
              displayText &&
              !displayText.startsWith("data:") && (
                <p className="text-xs line-clamp-6 mb-3 text-muted-foreground">
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
                {show.map((t) => (
                  <span
                    key={t}
                    className="px-1.5 py-0.5 text-[10px] rounded border border-border bg-muted/30 text-muted-foreground"
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
                    backgroundColor: "hsl(var(--secondary))",
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
                  className="text-xs border-border text-muted-foreground"
                  variant="outline"
                >
                  {forgottenMemories.length} forgotten
                </Badge>
              )}
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-opacity duration-200 p-1.5 rounded-md hover:bg-red-500/20 text-muted-foreground hover:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
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
                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    onClick={async (e) => {
                      e.stopPropagation();

                      // If document is processing, cancel it first
                      if (isProcessing) {
                        try {
                          await cancelDocument(document.id);
                          console.log(`[MemoryListView] Cancelled processing for document ${document.id}`);
                        } catch (error) {
                          console.error("[MemoryListView] Failed to cancel document:", error);
                        }
                      }

                      // Then delete
                      onDelete(document);
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
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
}: MemoryListViewProps) => {
  const colors = getColors();
  const [selectedSpace, _] = useState<string>("all");
  const parentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { selectedProject } = useProject();
  const deleteDocumentMutation = useDeleteDocument(selectedProject);

  const gap = 14;

  const handleDeleteDocument = useCallback(
    (document: DocumentWithMemories) => {
      deleteDocumentMutation.mutate(document.id);
    },
    [deleteDocumentMutation],
  );

  const { width: containerWidth } = useResizeObserver(containerRef);
  const horizontalPadding = isMobile ? 16 : 72;
  const effectiveWidth = Math.max(containerWidth - horizontalPadding * 2, 0);
  const baseColumnWidth = isMobile ? effectiveWidth || containerWidth : 320;

  const columns = useMemo(() => {
    if (isMobile) {
      return 1;
    }

    if (!effectiveWidth) {
      return 1;
    }

    return Math.max(
      1,
      Math.floor((effectiveWidth + gap) / ((baseColumnWidth || 1) + gap)),
    );
  }, [baseColumnWidth, effectiveWidth, gap, isMobile]);

  const columnWidth = useMemo(() => {
    if (isMobile) {
      return effectiveWidth || containerWidth || baseColumnWidth || 320;
    }

    if (!effectiveWidth || columns <= 1) {
      return effectiveWidth || baseColumnWidth || 320;
    }

    const availableWidth = effectiveWidth - gap * (columns - 1);
    const widthPerColumn = availableWidth / columns;

    return widthPerColumn;
  }, [baseColumnWidth, columns, containerWidth, effectiveWidth, gap, isMobile]);

  const safeColumnWidth = Math.max(columnWidth || 0, 1);

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

  const virtualItems = useMemo(() => {
    const items = [];
    for (let i = 0; i < filteredDocuments.length; i += columns) {
      items.push(filteredDocuments.slice(i, i + columns));
    }
    return items;
  }, [filteredDocuments, columns]);

  const virtualizer = useVirtualizer({
    count: virtualItems.length,
    getScrollElement: () => parentRef.current,
    overscan: 5,
    estimateSize: () => 200,
  });
  const virtualRows = virtualizer.getVirtualItems();

  useEffect(() => {
    const [lastItem] = [...virtualRows].reverse();

    if (!lastItem || !hasMore || isLoadingMore) {
      return;
    }

    if (lastItem.index >= virtualItems.length - 1) {
      loadMoreDocuments();
    }
  }, [
    hasMore,
    isLoadingMore,
    loadMoreDocuments,
    virtualRows,
    virtualItems.length,
  ]);

  // Always render with consistent structure
  return (
    <>
      <div
        className="h-full overflow-hidden relative pb-20 bg-background"
        ref={containerRef}
      >
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
            <div className="flex items-center gap-2 text-foreground/80">
              <InlineLoader className="w-5 h-5 text-blue-400" />
              <span>Loading...</span>
            </div>
          </div>
        ) : filteredDocuments.length === 0 && !isLoading ? (
          <div className="h-full flex items-center justify-center p-4">
            {children}
          </div>
        ) : (
          <div
            className="h-full overflow-auto mt-20 custom-scrollbar"
            ref={parentRef}
          >
            <div style={{ paddingInline: `${horizontalPadding}px` }}>
              <GreetingMessage />
            </div>

            <div
              className="w-full relative"
              style={{
                height: `${virtualizer.getTotalSize() + virtualItems.length * gap}px`,
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const rowItems = virtualItems[virtualRow.index];
                if (!rowItems) return null;

                return (
                  <div
                    className="absolute top-0 left-0 w-full"
                    data-index={virtualRow.index}
                    key={virtualRow.key}
                    ref={virtualizer.measureElement}
                    style={{
                      transform: `translateY(${virtualRow.start + virtualRow.index * gap}px)`,
                    }}
                  >
                    <div
                      className="grid justify-start"
                      style={{
                        gridTemplateColumns: `repeat(${columns}, ${safeColumnWidth}px)`,
                        gap: `${gap}px`,
                        paddingInline: `${horizontalPadding}px`,
                      }}
                    >
                      {rowItems.map((document, columnIndex) => (
                        <DocumentCard
                          document={document}
                          key={`${document.id}-${virtualRow.index}-${columnIndex}`}
                          onDelete={handleDeleteDocument}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {isLoadingMore && (
              <div className="py-8 flex items-center justify-center">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 animate-spin text-blue-400" />
                  <span className="text-foreground">
                    Loading more memories...
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
