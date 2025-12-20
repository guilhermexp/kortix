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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Button } from "@repo/ui/components/button";
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api";
import {
	AlertTriangle,
	Brain,
	Clock,
	ExternalLink,
	Expand,
	Loader,
	Pause,
	Play,
	RefreshCw,
	Trash2,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import type { CSSProperties } from "react"
import type { z } from "zod"
import { analytics } from "@/lib/analytics"
import { cancelDocument } from "@/lib/api/documents-client"
import { useProject } from "@/stores"
import {
	getDocumentSnippet,
	getDocumentSummaryFormatted,
	stripMarkdown,
} from "./memories"
import { MarkdownContent } from "./markdown-content"
import {
	asRecord,
	safeHttpUrl,
	pickFirstUrl,
	pickFirstUrlSameHost,
	sameHostOrTrustedCdn,
	formatPreviewLabel,
	isYouTubeUrl,
	getYouTubeId,
	getYouTubeThumbnail,
	isLowResolutionImage,
	isInlineSvgDataUrl,
	PROCESSING_STATUSES,
	PAUSED_STATUS,
	proxyImageUrl,
	type BaseRecord,
} from "@lib/utils"
import { BACKEND_URL } from "@lib/env"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>;
type DocumentWithMemories = DocumentsResponse["documents"][0];

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

const shimmerStyle: CSSProperties = {
  backgroundImage:
    "linear-gradient(110deg, rgba(255,255,255,0.04) 20%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.04) 80%)",
  backgroundSize: "200% 100%",
  animation: "shimmer 1.8s linear infinite",
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

// Document Preview Modal
function DocumentPreviewModal({
  document,
  onClose,
}: {
  document: DocumentWithMemories;
  onClose: () => void;
}) {
  const router = useRouter();
  const preview = useMemo(() => getDocumentPreview(document), [document]);
  const activeMemories = document.memoryEntries.filter((m) => !m.isForgotten);
  // Use formatted summary WITH markdown for expanded dialog view
  const displayText = getDocumentSummaryFormatted(document);

  // Check if document is still processing
  const docStatus = String(document.status ?? "").toLowerCase();
  const isDocProcessing = PROCESSING_STATUSES.has(docStatus) || (document as any).isOptimistic;

  const cleanedTitle = (() => {
    const raw = document.title || "";
    const isData = raw.startsWith("data:");
    const cleaned = stripMarkdown(raw)
      .trim()
      .replace(/^['"""''`]+|['"""''`]+$/g, "");
    if (isData || !cleaned) {
      return isDocProcessing ? "Processando..." : "Sem título";
    }
    return cleaned;
  })();

  const originalUrl =
    document.url ||
    (document.metadata as any)?.originalUrl ||
    (document.metadata as any)?.source_url;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!max-w-[85vw] !w-[1000px] max-h-[90vh] overflow-hidden p-0 sm:!max-w-[85vw]">
        {/* Expand button - top right */}
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-4 right-12 z-20 gap-2"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            router.push(`/memory/${document.id}/edit`);
          }}
        >
          <Expand className="w-4 h-4" />
          Expandir
        </Button>

        {/* Scrollable container */}
        <div className="h-[85vh] overflow-y-auto">
          {/* Preview Image - Sticky at top */}
          {preview?.src && (
            <div className="sticky top-0 w-full h-[50vh] min-h-[300px] overflow-hidden z-0">
              <img
                src={proxyImageUrl(preview.src) || preview.src}
                alt={cleanedTitle}
                className="w-full h-full object-contain bg-muted/50"
                referrerPolicy="no-referrer"
              />
              {/* Gradient overlay at bottom of image */}
              <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
            </div>
          )}

          {/* Content area - scrolls over image */}
          <div className={cn(
            "relative z-10 bg-background rounded-t-3xl p-8 min-h-[50vh]",
            preview?.src ? "-mt-16" : ""
          )}>
            {/* Title */}
            <DialogHeader className="mb-2">
              <DialogTitle className="text-2xl leading-tight">{cleanedTitle}</DialogTitle>
              <DialogDescription className="sr-only">
                Preview of document: {cleanedTitle}
              </DialogDescription>
            </DialogHeader>

            {/* Original URL */}
            {originalUrl && (
              <a
                href={originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="truncate max-w-[600px]">{(() => {
                  try {
                    const url = new URL(originalUrl);
                    // Show hostname + pathname (without query/hash) for more context
                    const path = url.pathname === "/" ? "" : url.pathname;
                    return url.hostname + path;
                  } catch {
                    return originalUrl;
                  }
                })()}</span>
              </a>
            )}

            {/* Full Summary/Description */}
            {displayText && !displayText.startsWith("data:") && (
              <div className="text-muted-foreground text-base mt-6 prose prose-sm dark:prose-invert max-w-none">
                <MarkdownContent content={displayText} />
              </div>
            )}

            {/* Memory Count */}
            {activeMemories.length > 0 && (
              <div className="flex items-center gap-2 mt-8 text-sm text-muted-foreground">
                <Brain className="w-4 h-4" />
                {activeMemories.length} {activeMemories.length === 1 ? "memory" : "memories"}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Pinterest-style masonry card
  const MasonryCard = memo(
  ({
    document,
    onDelete,
    onPreview,
  }: {
    document: DocumentWithMemories;
    onDelete: (document: DocumentWithMemories) => void;
    onPreview: (document: DocumentWithMemories) => void;
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

    // Check if document is still being processed
    const statusIsProcessing = document.status
      ? PROCESSING_STATUSES.has(String(document.status).toLowerCase())
      : false;

    // Check if document is paused (queue halted due to systemic error)
    const isPaused = String(document.status).toLowerCase() === PAUSED_STATUS;

    // Check if this is an optimistic (pending) document
    const isOptimisticDoc = !!(document as any).isOptimistic;

    // Also consider as "processing" if content is not ready yet:
    // - No memory entries AND title looks like just a domain (incomplete extraction)
    const titleLooksIncomplete = (() => {
      const title = (document.title || "").trim().toLowerCase();
      if (!title) return true;
      // If title is just a domain like "github.com" or "youtube.com", content isn't ready
      if (/^[a-z0-9-]+\.(com|org|net|io|xyz|dev|co|ai)$/i.test(title)) return true;
      return false;
    })();

    const contentNotReady = activeMemories.length === 0 && titleLooksIncomplete;
    const [forcedStop, setForcedStop] = useState(false);
    const [isResuming, setIsResuming] = useState(false);

    // Check if document is just waiting in queue (standby) vs actively processing
    const isQueued = String(document.status).toLowerCase() === "queued";
    const isActivelyProcessing = statusIsProcessing && !isQueued;
    const isProcessing = !forcedStop && !isPaused && (statusIsProcessing || contentNotReady || isOptimisticDoc);

    // Check if document was recently created (< 10 seconds) - show "Iniciando..." instead of "Na fila"
    const isRecentlyCreated = (() => {
      const createdAt = document.createdAt || (document as any).created_at;
      if (!createdAt) return false;
      const created = new Date(createdAt).getTime();
      const now = Date.now();
      return (now - created) < 10000; // Less than 10 seconds
    })();

    // Function to resume a paused document
    const handleResume = async (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsResuming(true);
      try {
        const response = await fetch(`${BACKEND_URL}/v3/documents/${document.id}/resume`, {
          method: "POST",
          credentials: "include",
        });
        if (!response.ok) throw new Error("Failed to resume");
        toast.success("Documento retomado");
        queryClient.invalidateQueries({ queryKey: ["documents-with-memories", selectedProject], exact: false });
      } catch (error) {
        toast.error("Falha ao retomar", { description: error instanceof Error ? error.message : String(error) });
      } finally {
        setIsResuming(false);
      }
    };

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

    // Get progress configuration for each status - realistic progression
    const getProgressConfig = (status: string | null | undefined) => {
      if (!status) return { label: "Processing", from: 5, to: 20, duration: 3000 };
      const st = String(status).toLowerCase();
      switch (st) {
        case "queued":
          return { label: "Na fila", from: 0, to: 10, duration: 2000 };
        case "fetching":
          return { label: "Buscando", from: 10, to: 25, duration: 3000 };
        case "extracting":
          return { label: "Extraindo", from: 25, to: 50, duration: 5000 };
        case "chunking":
          return { label: "Processando", from: 50, to: 60, duration: 2000 };
        case "embedding":
          return { label: "Gerando embeddings", from: 60, to: 75, duration: 4000 };
        case "processing":
          return { label: "Analisando", from: 50, to: 80, duration: 8000 };
        case "indexing":
          return { label: "Indexando", from: 80, to: 95, duration: 3000 };
        default:
          return { label: "Processando", from: 5, to: 20, duration: 3000 };
      }
    };

    // Animated progress state
    const stageRef = useRef<string>(String(document.status || "unknown"));
    const startTimeRef = useRef<number>(performance.now());
    const [progressPct, setProgressPct] = useState<number>(() => getProgressConfig(document.status).from);
    const [progressLabel, setProgressLabel] = useState<string>(() =>
      forcedStop ? "Cancelled" : getProgressConfig(document.status).label
    );

    // Update progress when status changes
    useEffect(() => {
      const currentStage = String(document.status || "unknown");
      if (currentStage !== stageRef.current) {
        stageRef.current = currentStage;
        const config = getProgressConfig(document.status);
        setProgressLabel(forcedStop ? "Cancelled" : config.label);
        setProgressPct(config.from);
        startTimeRef.current = performance.now();
      }
    }, [document.status, forcedStop]);

    // Animate progress smoothly
    useEffect(() => {
      if (!isProcessing || forcedStop) return;

      let rafId = 0;
      startTimeRef.current = performance.now();

      const tick = () => {
        const config = getProgressConfig(document.status);
        const elapsed = performance.now() - startTimeRef.current;
        const t = Math.min(1, elapsed / Math.max(1, config.duration));
        // Ease-out cubic for smooth deceleration
        const eased = 1 - (1 - t) ** 3;
        const nextPct = config.from + (config.to - config.from) * eased;
        setProgressPct(nextPct);
        setProgressLabel(config.label);

        if (t < 1 && isProcessing) {
          rafId = requestAnimationFrame(tick);
        }
      };

      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }, [isProcessing, forcedStop, document.status]);
    const queryClient = useQueryClient();
    const { selectedProject } = useProject();

    const handlePrefetchEdit = useCallback(() => {
      if (hasPrefetchedRef.current) return;
      router.prefetch(`/memory/${document.id}/edit`);
      hasPrefetchedRef.current = true;
    }, [router, document.id]);
    const hasPreviewImage = previewToRender?.src && !imageError;
    const displayText = getDocumentSnippet(document);
    const cleanedTitle = (() => {
      const raw = document.title || "";
      const isData = raw.startsWith("data:");
      const cleaned = stripMarkdown(raw)
        .trim()
        .replace(/^['"""''`]+|['"""''`]+$/g, "");
      // Show "Processando..." for documents still being processed without a title
      if (isData || !cleaned) {
        if (isProcessing || isOptimisticDoc || isQueued) {
          return "Processando...";
        }
        return "Sem título";
      }
      return cleaned;
    })();

    return (
      <div
        className="group relative mb-4 break-inside-avoid cursor-pointer rounded-xl overflow-hidden bg-card border border-border/50 hover:border-border transition-all duration-300 hover:shadow-lg hover:shadow-black/10"
        onClick={() => {
          analytics.documentCardClicked();
          onPreview(document);
        }}
        onFocus={handlePrefetchEdit}
        onMouseEnter={handlePrefetchEdit}
        onTouchStart={handlePrefetchEdit}
      >
        {/* Paused state - show warning and resume button */}
        {isPaused ? (
          <div className="p-6 flex flex-col items-center justify-center min-h-[140px] gap-3">
            <div className="flex items-center gap-2 text-amber-500">
              <Pause className="h-6 w-6" />
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                Fila Pausada
              </p>
              <p className="text-xs text-muted-foreground max-w-[180px]">
                Erro detectado. Verifique as configurações antes de retomar.
              </p>
            </div>
            <div className="flex gap-2 mt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResume}
                disabled={isResuming}
              >
                {isResuming ? (
                  <Loader className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Retomar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(document.id, document.title || "Untitled");
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : isOptimisticDoc ? (
          /* Optimistic - still sending to backend */
          <div className="p-6 flex flex-col items-center justify-center min-h-[140px] gap-3">
            <div className="relative">
              <Loader className="h-6 w-6 text-muted-foreground animate-spin" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Enviando...
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 opacity-70 hover:opacity-100"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await cancelDocument(document.id);
                  setForcedStop(true);
                  toast.success("Cancelado");
                  queryClient.invalidateQueries({ queryKey: ["documents-with-memories", selectedProject], exact: false });
                } catch (error) {
                  toast.error("Falha ao cancelar", { description: error instanceof Error ? error.message : String(error) });
                }
              }}
            >
              Cancelar
            </Button>
          </div>
        ) : isQueued && isRecentlyCreated ? (
          /* Recently created and queued - show "Iniciando..." with spinner */
          <div className="p-6 flex flex-col items-center justify-center min-h-[140px] gap-3">
            <div className="relative">
              <Loader className="h-6 w-6 text-primary animate-spin" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Iniciando...
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 opacity-70 hover:opacity-100"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await cancelDocument(document.id);
                  setForcedStop(true);
                  toast.success("Cancelado");
                  queryClient.invalidateQueries({ queryKey: ["documents-with-memories", selectedProject], exact: false });
                } catch (error) {
                  toast.error("Falha ao cancelar", { description: error instanceof Error ? error.message : String(error) });
                }
              }}
            >
              Cancelar
            </Button>
          </div>
        ) : isQueued ? (
          /* Queued for a while - waiting in backend queue */
          <div className="p-6 flex flex-col items-center justify-center min-h-[140px] gap-3">
            <div className="relative">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Na fila
              </p>
              <p className="text-xs text-muted-foreground/70">
                Aguardando processamento
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 opacity-70 hover:opacity-100"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await cancelDocument(document.id);
                  setForcedStop(true);
                  toast.success("Cancelado");
                  queryClient.invalidateQueries({ queryKey: ["documents-with-memories", selectedProject], exact: false });
                } catch (error) {
                  toast.error("Falha ao cancelar", { description: error instanceof Error ? error.message : String(error) });
                }
              }}
            >
              Cancelar
            </Button>
          </div>
        ) : isProcessing ? (
          /* Active processing state - animated progress */
          <div className="p-6 flex flex-col items-center justify-center min-h-[140px] gap-3">
            <Loader className="h-6 w-6 text-primary animate-spin" />
            <div className="w-full max-w-[200px] space-y-2">
              {/* Progress bar */}
              <div className="relative h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${Math.round(progressPct)}%` }}
                />
              </div>
              {/* Label and percentage */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">
                  {progressLabel}
                </span>
                <span className="text-primary font-semibold tabular-nums">
                  {Math.round(progressPct)}%
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await cancelDocument(document.id);
                  setForcedStop(true);
                  toast.success("Processamento cancelado");
                  queryClient.invalidateQueries({ queryKey: ["documents-with-memories", selectedProject], exact: false });
                } catch (error) {
                  toast.error("Falha ao cancelar", { description: error instanceof Error ? error.message : String(error) });
                }
              }}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <>
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
              referrerPolicy="no-referrer"
              src={proxyImageUrl(previewToRender.src) || previewToRender.src}
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
          {/* Title */}
          <h3 className="text-sm font-medium text-foreground line-clamp-2 leading-snug mb-1.5">
            {cleanedTitle}
          </h3>

          {/* Snippet - only if no preview image or short snippet */}
          {displayText && !displayText.startsWith("data:") && (
            <p
              className={cn(
                "text-xs text-muted-foreground line-clamp-3 leading-relaxed",
                hasPreviewImage ? "line-clamp-2" : "line-clamp-4",
              )}
            >
              {stripMarkdown(displayText).slice(0, 200)}
            </p>
          )}

          {/* Tags */}
          {Array.isArray((document as any).tags) && (document as any).tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {((document as any).tags as string[]).slice(0, 4).map((tag, idx) => (
                <span
                  key={`${tag}-${idx}`}
                  className="px-1.5 py-0.5 text-[10px] rounded bg-primary/10 text-primary/80 border border-primary/20"
                >
                  {tag}
                </span>
              ))}
              {(document as any).tags.length > 4 && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
                  +{(document as any).tags.length - 4}
                </span>
              )}
            </div>
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
          </>
        )}
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
  const [previewDocument, setPreviewDocument] = useState<DocumentWithMemories | null>(null);

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
          <div className="rounded-xl overflow-hidden max-w-md">
            <div className="relative z-10 px-6 py-4 text-foreground">
              <div className="text-lg font-semibold mb-2">Error loading documents</div>
              <div className="text-sm text-muted-foreground mb-4">
                {error.message || "An unexpected error occurred"}
              </div>
              {(error as any)?.status === 401 || (error as any)?.status === 403 ? (
                <div className="text-xs text-muted-foreground">
                  Please refresh the page or sign in again.
                </div>
              ) : null}
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
                onPreview={setPreviewDocument}
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

      {/* Document Preview Modal */}
      {previewDocument && (
        <DocumentPreviewModal
          document={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      )}
    </div>
  );
};
