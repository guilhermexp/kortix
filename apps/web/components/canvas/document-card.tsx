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
import { memo, useCallback, useMemo, useRef } from "react";
import type { z } from "zod";
import { getDocumentIcon } from "@/lib/document-icon";
import { formatDate, getSourceUrl } from "../memories";
import { getDocumentSnippet } from "../memories";

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
  if (trimmed.startsWith("data:")) {
    if (trimmed.startsWith("data:image/")) {
      return trimmed;
    }
    return undefined;
  }

  try {
    const url = new URL(trimmed);
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

  const metadataImage = pickFirstUrl(metadata, imageKeys, originalUrl);
  const rawDirectImage = pickFirstUrl(raw, imageKeys, originalUrl);
  const rawImage =
    pickFirstUrl(rawExtraction, imageKeys, originalUrl) ??
    pickFirstUrl(rawFirecrawl, imageKeys, originalUrl) ??
    pickFirstUrl(rawFirecrawlMetadata, imageKeys, originalUrl) ??
    pickFirstUrl(rawGemini, imageKeys, originalUrl);

  const firecrawlOgImage =
    safeHttpUrl(rawFirecrawlMetadata?.ogImage, originalUrl) ??
    safeHttpUrl(rawFirecrawl?.ogImage, originalUrl);
  const finalPreviewImage =
    rawDirectImage ?? metadataImage ?? rawImage ?? firecrawlOgImage;
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
          "h-full w-full p-4 transition-all cursor-pointer group relative overflow-hidden border gap-2 rounded-lg",
          isDragging
            ? "border-blue-500/50 shadow-lg shadow-blue-500/20 opacity-60"
            : "border-white/10",
          className,
        )}
        onClick={handleCardClick}
        onFocus={handlePrefetchEdit}
        onMouseEnter={handlePrefetchEdit}
        onTouchStart={handlePrefetchEdit}
        style={{
          backgroundColor: "#0f1419",
        }}
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
            onClick={(e) => {
              e.stopPropagation();
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
          <div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center pointer-events-none">
            <svg
              className="animate-spin h-5 w-5 text-white/70"
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
                {document.title?.startsWith("data:")
                  ? "Untitled Document"
                  : document.title || "Untitled Document"}
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
          {preview && (
            <div
              className="mb-3 rounded-lg overflow-hidden border"
              style={{
                borderColor: "rgba(255, 255, 255, 0.08)",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
              }}
            >
              <div className="relative w-full aspect-[16/10] overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0f1624] via-[#101c2d] to-[#161f33]" />
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
                    <span>{preview.label}</span>
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
                {show.map((t) => (
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
