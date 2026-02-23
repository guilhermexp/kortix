"use client"

import { useIsMobile } from "@hooks/use-mobile"
import { BACKEND_URL } from "@lib/env"
import { useDeleteDocument } from "@lib/queries"
import {
	asRecord,
	cn,
	formatPreviewLabel,
	getYouTubeId,
	getYouTubeThumbnail,
	isInlineSvgDataUrl,
	isValidPreviewUrl,
	isYouTubeUrl,
	PAUSED_STATUS,
	PROCESSING_STATUSES,
	proxyImageUrl,
	safeHttpUrl,
} from "@lib/utils"
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
} from "@repo/ui/components/alert-dialog"
import { Button } from "@repo/ui/components/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
	AlertTriangle,
	Brain,
	ChevronLeft,
	ChevronRight,
	Expand,
	ExternalLink,
	FileText,
	Folder,
	Loader,
	Pause,
	Pin,
	Play,
	RefreshCw,
	Trash2,
} from "lucide-react"
import { useRouter } from "next/navigation"
import type { CSSProperties } from "react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { z } from "zod"
import { $fetch } from "@lib/api"
import { analytics } from "@/lib/analytics"
import { cancelDocument } from "@/lib/api/documents-client"
import { useProject } from "@/stores"
import { DocumentProjectTransfer } from "./editor/document-project-transfer"
import { MarkdownContent } from "./markdown-content"

// Project interface for type safety
interface Project {
	id: string
	name?: string | null
	containerTag?: string | null
}

// Simple hook to get projects list (shared with DocumentProjectTransfer)
function useProjectsList() {
	return useQuery({
		queryKey: ["projects"],
		queryFn: async () => {
			const response = await $fetch("@get/projects")
			if (response.error) {
				throw new Error(response.error?.message || "Failed to load projects")
			}
			return response.data?.projects ?? []
		},
		staleTime: 30_000,
	})
}

// Helper to get project name from containerTag
function getProjectName(projects: Project[] | undefined, containerTag: string | null | undefined): string | null {
	if (!containerTag || !projects?.length) return null
	const project = projects.find(p => p.containerTag === containerTag)
	return project?.name ?? null
}
import {
	getDocumentSnippet,
	getDocumentSummaryFormatted,
	stripMarkdown,
} from "./memories"
import { TweetCard } from "./content-cards/tweet"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type DocumentWithMemories = DocumentsResponse["documents"][0]

// Hook to persist pinned document IDs per project in localStorage
function usePinnedDocuments(projectId: string | null | undefined) {
	const storageKey = `pinned-docs:${projectId ?? "default"}`
	const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
		if (typeof window === "undefined") return new Set()
		try {
			const stored = localStorage.getItem(storageKey)
			return stored ? new Set(JSON.parse(stored) as string[]) : new Set()
		} catch {
			return new Set()
		}
	})

	// Re-read from localStorage when project changes
	useEffect(() => {
		try {
			const stored = localStorage.getItem(storageKey)
			setPinnedIds(stored ? new Set(JSON.parse(stored) as string[]) : new Set())
		} catch {
			setPinnedIds(new Set())
		}
	}, [storageKey])

	// Persist to localStorage whenever pinnedIds changes
	useEffect(() => {
		try {
			localStorage.setItem(storageKey, JSON.stringify([...pinnedIds]))
		} catch {
			// localStorage full or unavailable — silently ignore
		}
	}, [storageKey, pinnedIds])

	const togglePin = useCallback((docId: string) => {
		setPinnedIds((prev) => {
			const next = new Set(prev)
			if (next.has(docId)) {
				next.delete(docId)
			} else {
				next.add(docId)
			}
			return next
		})
	}, [])

	const isPinned = useCallback((docId: string) => pinnedIds.has(docId), [pinnedIds])

	return { pinnedIds, togglePin, isPinned }
}

export type PreviewData =
	| {
			kind: "image"
			src: string
			label: string
			href?: string
	  }
	| {
			kind: "video"
			src?: string
			label: string
			href?: string
	  }
	| {
			kind: "link"
			src?: string
			label: string
			href: string
	  }

const previewsEqual = (
	a: PreviewData | null,
	b: PreviewData | null,
): boolean => {
	if (a === b) return true
	if (!a || !b) return false
	return (
		a.kind === b.kind &&
		a.src === b.src &&
		a.href === b.href &&
		a.label === b.label
	)
}

const _shimmerStyle: CSSProperties = {
	backgroundImage:
		"linear-gradient(110deg, rgba(255,255,255,0.04) 20%, rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.04) 80%)",
	backgroundSize: "200% 100%",
	animation: "shimmer 1.8s linear infinite",
}

/** Picks the first valid image URL from a record scanning common image keys */
const pickFirstImageUrl = (
	record: ReturnType<typeof asRecord>,
	baseUrl?: string,
): string | undefined => {
	if (!record) return undefined
	const keys = [
		"ogImage", "og_image",
		"twitterImage", "twitter_image",
		"previewImage", "preview_image",
		"image", "thumbnail", "thumbnailUrl", "thumbnail_url",
		"firstContentImage",
	]
	for (const key of keys) {
		const url = safeHttpUrl(record[key], baseUrl)
		if (isValidPreviewUrl(url)) return url
	}
	return undefined
}

export const getDocumentPreview = (
	document: DocumentWithMemories,
): PreviewData | null => {
	const metadata = asRecord(document.metadata)
	const raw = asRecord((document as any).raw)
	const rawExtraction = asRecord(raw?.extraction)
	const rawYoutube = asRecord(rawExtraction?.youtube)
	const metaTags = asRecord((rawExtraction as any)?.metaTags)
	const rawFirecrawl =
		asRecord(raw?.firecrawl) ?? asRecord(rawExtraction?.firecrawl)
	const rawFirecrawlMetadata = asRecord(rawFirecrawl?.metadata) ?? rawFirecrawl

	// Resolve original URL (needed for relative URL resolution and YouTube detection)
	const originalUrl =
		safeHttpUrl(metadata?.originalUrl) ??
		safeHttpUrl((metadata as any)?.source_url) ??
		safeHttpUrl((metadata as any)?.sourceUrl) ??
		safeHttpUrl(document.url) ??
		safeHttpUrl(rawYoutube?.url)

	const normalizedType = document.type?.toLowerCase() ?? ""
	const label = formatPreviewLabel(document.type)

	const contentType =
		(typeof rawExtraction?.contentType === "string" && rawExtraction.contentType) ||
		(typeof rawExtraction?.content_type === "string" && rawExtraction.content_type) ||
		(typeof raw?.contentType === "string" && raw.contentType) ||
		(typeof raw?.content_type === "string" && raw.content_type) ||
		undefined

	// --- YouTube / Video detection (before image resolution) ---
	const youtubeUrl =
		safeHttpUrl(rawYoutube?.url) ?? safeHttpUrl(rawYoutube?.embedUrl)
	const isVideoDocument =
		normalizedType === "video" ||
		contentType?.startsWith("video/") ||
		!!youtubeUrl ||
		(isYouTubeUrl(originalUrl) && !!originalUrl)

	// --- Resolve preview image with simple priority chain ---
	// 1. document.previewImage (backend persisted in Supabase)
	const documentPreviewImage = safeHttpUrl(
		(document as any).previewImage ?? (document as any).preview_image,
		originalUrl,
	)

	// 2-3. OG / Twitter images from metaTags, then Firecrawl metadata, then page metadata
	const ogImage =
		safeHttpUrl(metaTags?.ogImage, originalUrl) ??
		safeHttpUrl(rawFirecrawlMetadata?.ogImage, originalUrl) ??
		safeHttpUrl(rawFirecrawl?.ogImage, originalUrl)
	const twitterImage =
		safeHttpUrl((metaTags as any)?.twitterImage, originalUrl) ??
		safeHttpUrl(rawFirecrawlMetadata?.twitterImage, originalUrl)

	// 4. Scan common image keys across metadata records
	const metadataImage = pickFirstImageUrl(metadata, originalUrl)
	const extractionImage = pickFirstImageUrl(rawExtraction, originalUrl)
	const firecrawlImage = pickFirstImageUrl(rawFirecrawlMetadata, originalUrl)
	const rawDirectImage = pickFirstImageUrl(raw, originalUrl)

	// 5. First valid image from various image arrays
	const firstFromArray = (source: unknown): string | undefined => {
		if (!source) return undefined
		// Handle string (e.g. firecrawl screenshot)
		if (typeof source === "string") {
			const url = safeHttpUrl(source, originalUrl)
			return isValidPreviewUrl(url) ? url : undefined
		}
		if (!Array.isArray(source)) return undefined
		for (const item of source) {
			const url = safeHttpUrl(
				typeof item === "string" ? item : (asRecord(item)?.url as string ?? asRecord(item)?.src as string),
				originalUrl,
			)
			if (isValidPreviewUrl(url)) return url
		}
		return undefined
	}

	const firstExtractionImage = firstFromArray((rawExtraction as any)?.images)
	const firstRawImage = firstFromArray((raw as any)?.images)
	const firstFirecrawlImage =
		firstFromArray((rawFirecrawl as any)?.images) ??
		firstFromArray((rawFirecrawlMetadata as any)?.images)
	const firecrawlScreenshot = firstFromArray((rawFirecrawl as any)?.screenshot)
	const firstMetadataImage = firstFromArray((metadata as any)?.images)
	const extractionMetaImages = firstFromArray(asRecord((rawExtraction as any)?.metadata)?.images)

	// 6. First image from memoryEntries metadata
	const firstMemoryImage = (() => {
		for (const entry of document.memoryEntries) {
			const meta = asRecord(entry.metadata)
			if (!meta) continue
			const images = Array.isArray(meta.images) ? meta.images : []
			for (const img of images) {
				const resolved = safeHttpUrl(typeof img === "string" ? img : (asRecord(img)?.url as string), originalUrl)
				if (isValidPreviewUrl(resolved)) return resolved
			}
		}
		return undefined
	})()

	// Pick first valid URL from priority chain
	const previewImage = [
		documentPreviewImage,
		ogImage,
		twitterImage,
		metadataImage,
		extractionImage,
		firecrawlImage,
		rawDirectImage,
		firstExtractionImage,
		firstFirecrawlImage,
		firstRawImage,
		firecrawlScreenshot,
		firstMetadataImage,
		extractionMetaImages,
		firstMemoryImage,
	].find(isValidPreviewUrl) ?? null

	// --- Image-type documents ---
	if (normalizedType === "image" || contentType?.startsWith("image/")) {
		const src = previewImage ?? originalUrl
		if (src) {
			return { kind: "image", src, href: originalUrl ?? undefined, label: label || "Image" }
		}
	}

	// --- Video documents ---
	if (isVideoDocument) {
		const youtubeThumbnail = safeHttpUrl(rawYoutube?.thumbnail)
		return {
			kind: "video",
			src: (isValidPreviewUrl(youtubeThumbnail) ? youtubeThumbnail : undefined) ??
				previewImage ??
				getYouTubeThumbnail(originalUrl),
			href: youtubeUrl ?? originalUrl ?? undefined,
			label: contentType === "video/youtube" ? "YouTube" : label || "Video",
		}
	}

	// --- Generic document with preview image ---
	if (previewImage) {
		return { kind: "image", src: previewImage, href: originalUrl ?? undefined, label: label || "Preview" }
	}

	return null
}

interface MemoryListViewProps {
	children?: React.ReactNode
	documents: DocumentWithMemories[]
	isLoading: boolean
	isLoadingMore: boolean
	error: Error | null
	totalLoaded: number
	hasMore: boolean
	loadMoreDocuments: () => Promise<void>
	onDocumentDeleted?: (id: string) => void
}

// Document Preview Modal
function DocumentPreviewModal({
	document,
	onClose,
}: {
	document: DocumentWithMemories
	onClose: () => void
}) {
	const router = useRouter()
	const preview = useMemo(() => getDocumentPreview(document), [document])
	const activeMemories = document.memoryEntries.filter((m) => !(m as any).isForgotten)
	// Use formatted summary WITH markdown for expanded dialog view
	const displayText = getDocumentSummaryFormatted(document)

	// Check if document is still processing
	const docStatus = String(document.status ?? "").toLowerCase()
	const isDocProcessing =
		PROCESSING_STATUSES.has(docStatus) || (document as any).isOptimistic

	const cleanedTitle = (() => {
		const raw = document.title || ""
		const isData = raw.startsWith("data:")
		const cleaned = stripMarkdown(raw)
			.trim()
			.replace(/^['"""''`]+|['"""''`]+$/g, "")
		if (isData || !cleaned) {
			return isDocProcessing ? "Processando..." : "Sem título"
		}
		return cleaned
	})()

	const originalUrl =
		document.url ||
		(document.metadata as any)?.originalUrl ||
		(document.metadata as any)?.source_url

	// Check if this is a YouTube video
	const youtubeId = getYouTubeId(originalUrl)
	const isYouTube = !!youtubeId

	// Check if this is a tweet
	const rawDoc = asRecord((document as any).raw)
	const rawTweet = rawDoc?.tweet
	const isTweet =
		document.type === "tweet" ||
		(document.metadata as any)?.type === "tweet"
	const hasTweetData = isTweet && rawTweet

	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open>
			<DialogContent className="!max-w-[85vw] !w-[1000px] max-h-[90vh] overflow-hidden p-0 sm:!max-w-[85vw]">
				{/* Top right actions: Project selector + Expand button */}
				<div className="absolute top-4 right-12 z-20 flex items-center gap-2">
					<DocumentProjectTransfer
						currentProject={(document as any).containerTags?.[0]}
						documentId={document.id}
						onProjectChanged={() => {
							// Optionally close modal or refresh
						}}
					/>
					<Button
						onClick={(e) => {
							e.stopPropagation()
							e.preventDefault()
							router.push(`/memory/${document.id}/edit`)
						}}
						size="sm"
						variant="secondary"
						className="gap-2"
					>
						<Expand className="w-4 h-4" />
						Expandir
					</Button>
				</div>

				{/* Scrollable container */}
				<div className="h-[85vh] overflow-y-auto">
					{/* Tweet Card - rich rendering via react-tweet */}
					{hasTweetData ? (
						<div className="p-6">
							<TweetCard
								data={rawTweet as any}
								activeMemories={activeMemories}
							/>
						</div>
					) : null}

					{/* YouTube Video Player */}
					{isYouTube && !hasTweetData && (
						<div className="sticky top-0 w-full aspect-video min-h-[300px] max-h-[50vh] overflow-hidden z-0 bg-black">
							<iframe
								src={`https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1`}
								title={cleanedTitle}
								className="w-full h-full"
								allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
								allowFullScreen
							/>
							{/* Gradient overlay at bottom */}
							<div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
						</div>
					)}

					{/* Preview Image - Sticky at top (only if not YouTube and not tweet) */}
					{!isYouTube && !hasTweetData && preview?.src && (
						<div className="sticky top-0 w-full h-[50vh] min-h-[300px] overflow-hidden z-0">
							<img
								alt={cleanedTitle}
								className="w-full h-full object-contain bg-muted/50"
								referrerPolicy="no-referrer"
								src={proxyImageUrl(preview.src) || preview.src}
								onError={(e) => {
									// Fallback to original URL if proxy fails
									const target = e.currentTarget
									if (preview?.src && target.src !== preview.src) {
										target.src = preview.src
									}
								}}
							/>
							{/* Gradient overlay at bottom of image */}
							<div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
						</div>
					)}

					{/* Content area - scrolls over image/video */}
					<div
						className={cn(
							"relative z-10 bg-background rounded-t-3xl p-8 min-h-[50vh]",
							(isYouTube || (!hasTweetData && preview?.src)) ? "-mt-16" : "",
						)}
					>
						{/* Title */}
						<DialogHeader className="mb-2">
							<DialogTitle className="text-2xl leading-tight">
								{cleanedTitle}
							</DialogTitle>
							<DialogDescription className="sr-only">
								Preview of document: {cleanedTitle}
							</DialogDescription>
						</DialogHeader>

						{/* Original URL */}
						{originalUrl && (
							<a
								className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
								href={originalUrl}
								onClick={(e) => e.stopPropagation()}
								rel="noopener noreferrer"
								target="_blank"
							>
								<ExternalLink className="w-3.5 h-3.5" />
								<span className="truncate max-w-[600px]">
									{(() => {
										try {
											const url = new URL(originalUrl)
											// Show hostname + pathname (without query/hash) for more context
											const path = url.pathname === "/" ? "" : url.pathname
											return url.hostname + path
										} catch {
											return originalUrl
										}
									})()}
								</span>
							</a>
						)}

						{/* Full Summary/Description */}
						{displayText && !displayText.startsWith("data:") && (
							<div className="text-muted-foreground text-base mt-6 prose prose-sm dark:prose-invert max-w-none">
								<MarkdownContent content={displayText} />
							</div>
						)}

						{/* Metadata Section */}
						{(() => {
							const extracted = asRecord((document.metadata as any)?.extracted)
							const tags = Array.isArray(extracted?.tags) ? extracted.tags : []
							const mentions = Array.isArray(extracted?.mentions) ? extracted.mentions : []
							const properties = asRecord(extracted?.properties) ?? {}
							const hasMetadata = tags.length > 0 || mentions.length > 0 || Object.keys(properties).length > 0

							if (!hasMetadata) return null

							return (
								<div className="mt-6 border-t border-border pt-4">
									<h4 className="text-sm font-medium text-foreground mb-3">Metadata</h4>
									<div className="flex flex-col gap-3">
										{/* Tags */}
										{tags.length > 0 && (
											<div>
												<span className="text-xs text-muted-foreground mr-2">Tags:</span>
												<div className="inline-flex flex-wrap gap-1.5">
													{tags.map((tag, idx) => (
														<span
															className="px-2 py-1 text-xs rounded bg-primary/10 text-primary/80 border border-primary/20"
															key={`modal-tag-${idx}`}
														>
															#{String(tag)}
														</span>
													))}
												</div>
											</div>
										)}

										{/* Mentions */}
										{mentions.length > 0 && (
											<div>
												<span className="text-xs text-muted-foreground mr-2">Mentions:</span>
												<div className="inline-flex flex-wrap gap-1.5">
													{mentions.map((mention, idx) => (
														<span
															className="px-2 py-1 text-xs rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
															key={`modal-mention-${idx}`}
														>
															@{String(mention)}
														</span>
													))}
												</div>
											</div>
										)}

										{/* Properties */}
										{Object.keys(properties).length > 0 && (
											<div>
												<span className="text-xs text-muted-foreground mr-2">Properties:</span>
												<div className="inline-flex flex-wrap gap-1.5">
													{Object.entries(properties).map(([key, value], idx) => {
														// Format value for display
														let displayValue = String(value)
														if (typeof value === 'object' && value !== null) {
															displayValue = JSON.stringify(value)
														}
														if (displayValue.length > 50) {
															displayValue = displayValue.slice(0, 50) + '...'
														}

														return (
															<span
																className="px-2 py-1 text-xs rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
																key={`modal-prop-${idx}`}
																title={`${key}: ${String(value)}`}
															>
																{key}: {displayValue}
															</span>
														)
													})}
												</div>
											</div>
										)}
									</div>
								</div>
							)
						})()}

						{/* Memory Count */}
						{activeMemories.length > 0 && (
							<div className="flex items-center gap-2 mt-8 text-sm text-muted-foreground">
								<Brain className="w-4 h-4" />
								{activeMemories.length}{" "}
								{activeMemories.length === 1 ? "memory" : "memories"}
							</div>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}

// Pinterest-style masonry card
const MasonryCard = memo(
	({
		document,
		isPinned,
		onDelete,
		onPreview,
		onTogglePin,
	}: {
		document: DocumentWithMemories
		isPinned: boolean
		onDelete: (document: DocumentWithMemories) => void
		onPreview: (document: DocumentWithMemories) => void
		onTogglePin: (document: DocumentWithMemories) => void
	}) => {
		const router = useRouter()
		const hasPrefetchedRef = useRef(false)
		const activeMemories = document.memoryEntries.filter((m) => !(m as any).isForgotten)
		const preview = useMemo(() => getDocumentPreview(document), [document])

		// Fetch bundle children for carousel
		const isBundle = document.type === "bundle"
		const { data: bundleChildren } = useQuery({
			queryKey: ["document-children", document.id],
			queryFn: async () => {
				const res = await $fetch(`@get/documents/${document.id}/children`)
				return ((res.data as any)?.children ?? []) as Array<{
					id: string
					title: string | null
					previewImage: string | null
					summary: string | null
					url: string | null
				}>
			},
			enabled: isBundle,
			staleTime: 60_000,
		})
		const [bundleIndex, setBundleIndex] = useState(0)

		// Get projects list for showing project name
		const { data: projects } = useProjectsList()
		// containerTag comes from document.containerTags[0] (now properly included in schema)
		const containerTag =
			(document as any).containerTags?.[0] ??
			(document.memoryEntries?.[0] as any)?.spaceContainerTag
		const projectName = useMemo(
			() => getProjectName(projects, containerTag),
			[projects, containerTag]
		)

		const sanitizedPreview = useMemo(() => {
			if (!preview) return null
			// If preview src is an inline SVG, try YouTube fallback for videos, otherwise hide
			if (preview.src && isInlineSvgDataUrl(preview.src)) {
				if (preview.kind === "video") {
					const fallback = getYouTubeThumbnail(document.url ?? undefined)
					if (fallback) return { ...preview, src: fallback } as PreviewData
				}
				return null
			}
			return preview
		}, [preview, document.url])

		// Check if document is still being processed
		const statusIsProcessing = document.status
			? PROCESSING_STATUSES.has(String(document.status).toLowerCase())
			: false

		// Check if document is paused (queue halted due to systemic error)
		const isPaused = String(document.status).toLowerCase() === PAUSED_STATUS

		// Check if this is an optimistic (pending) document
		const isOptimisticDoc = !!(document as any).isOptimistic

		// Also consider as "processing" if content is not ready yet:
		// - No memory entries AND title looks like just a domain (incomplete extraction)
		const titleLooksIncomplete = (() => {
			const title = (document.title || "").trim().toLowerCase()
			if (!title) return true
			// If title is just a domain like "github.com" or "youtube.com", content isn't ready
			if (/^[a-z0-9-]+\.(com|org|net|io|xyz|dev|co|ai)$/i.test(title))
				return true
			return false
		})()

		const contentNotReady = activeMemories.length === 0 && titleLooksIncomplete
		const [forcedStop, setForcedStop] = useState(false)
		const [isResuming, setIsResuming] = useState(false)

		// Check if document is just waiting in queue (standby) vs actively processing
		const isQueued = String(document.status).toLowerCase() === "queued"
		const isDone = String(document.status).toLowerCase() === "done"
		const _isActivelyProcessing = statusIsProcessing && !isQueued
		// IMPORTANT: If status is "done", document is complete - don't show as processing
		const isProcessing =
			!forcedStop &&
			!isPaused &&
			!isDone &&
			(statusIsProcessing || contentNotReady || isOptimisticDoc)

		// Check if document was recently created (< 10 seconds) - show "Iniciando..." instead of "Na fila"
		const isRecentlyCreated = (() => {
			const createdAt = document.createdAt || (document as any).created_at
			if (!createdAt) return false
			const created = new Date(createdAt).getTime()
			const now = Date.now()
			return now - created < 10000 // Less than 10 seconds
		})()

		// Function to resume a paused document
		const handleResume = async (e: React.MouseEvent) => {
			e.stopPropagation()
			setIsResuming(true)
			try {
				const response = await fetch(
					`${BACKEND_URL}/v3/documents/${document.id}/resume`,
					{
						method: "POST",
						credentials: "include",
					},
				)
				if (!response.ok) throw new Error("Failed to resume")
				toast.success("Documento retomado")
				queryClient.invalidateQueries({
					queryKey: ["documents-with-memories", selectedProject],
					exact: false,
				})
			} catch (error) {
				toast.error("Falha ao retomar", {
					description: error instanceof Error ? error.message : String(error),
				})
			} finally {
				setIsResuming(false)
			}
		}

		const [stickyPreview, setStickyPreview] = useState<PreviewData | null>(null)
		const [imageLoaded, setImageLoaded] = useState(false)
		const [imageError, setImageError] = useState(false)
		const [retryWithoutProxy, setRetryWithoutProxy] = useState(false)

		const handleImageError = useCallback(() => {
			// Step 1: Try without proxy if not tried yet
			if (!retryWithoutProxy) {
				setRetryWithoutProxy(true)
				setImageError(false)
				setImageLoaded(false)
				return
			}
			// Step 2: All fallbacks failed, hide image
			setImageError(true)
		}, [retryWithoutProxy])

		useEffect(() => {
			setStickyPreview(null)
			setImageLoaded(false)
			setImageError(false)
			setRetryWithoutProxy(false)
		}, [])

		useEffect(() => {
			if (!isProcessing) {
				setStickyPreview(null)
				return
			}
			if (!sanitizedPreview) return
			setStickyPreview((current) =>
				previewsEqual(current, sanitizedPreview) ? current : sanitizedPreview,
			)
		}, [isProcessing, sanitizedPreview])

		const previewToRender = isProcessing
			? (stickyPreview ?? sanitizedPreview)
			: sanitizedPreview

		// Get progress configuration for each status - realistic progression
		const getProgressConfig = (status: string | null | undefined) => {
			if (!status)
				return { label: "Processing", from: 5, to: 20, duration: 3000 }
			const st = String(status).toLowerCase()
			switch (st) {
				case "queued":
					return { label: "Na fila", from: 0, to: 10, duration: 2000 }
				case "fetching":
					return { label: "Buscando", from: 10, to: 25, duration: 3000 }
				case "extracting":
					return { label: "Extraindo", from: 25, to: 50, duration: 5000 }
				case "chunking":
					return { label: "Processando", from: 50, to: 60, duration: 2000 }
				case "embedding":
					return {
						label: "Gerando embeddings",
						from: 60,
						to: 75,
						duration: 4000,
					}
				case "processing":
					return { label: "Analisando", from: 50, to: 80, duration: 8000 }
				case "indexing":
					return { label: "Indexando", from: 80, to: 95, duration: 3000 }
				default:
					return { label: "Processando", from: 5, to: 20, duration: 3000 }
			}
		}

		// Animated progress state
		const stageRef = useRef<string>(String(document.status || "unknown"))
		const startTimeRef = useRef<number>(performance.now())
		const [progressPct, setProgressPct] = useState<number>(
			() => getProgressConfig(document.status).from,
		)
		const [progressLabel, setProgressLabel] = useState<string>(() =>
			forcedStop ? "Cancelled" : getProgressConfig(document.status).label,
		)

		// Update progress when status changes
		useEffect(() => {
			const currentStage = String(document.status || "unknown")
			if (currentStage !== stageRef.current) {
				stageRef.current = currentStage
				const config = getProgressConfig(document.status)
				setProgressLabel(forcedStop ? "Cancelled" : config.label)
				setProgressPct(config.from)
				startTimeRef.current = performance.now()
			}
		}, [document.status, forcedStop, getProgressConfig])

		// Animate progress smoothly
		useEffect(() => {
			if (!isProcessing || forcedStop) return

			let rafId = 0
			startTimeRef.current = performance.now()

			const tick = () => {
				const config = getProgressConfig(document.status)
				const elapsed = performance.now() - startTimeRef.current
				const t = Math.min(1, elapsed / Math.max(1, config.duration))
				// Ease-out cubic for smooth deceleration
				const eased = 1 - (1 - t) ** 3
				const nextPct = config.from + (config.to - config.from) * eased
				setProgressPct(nextPct)
				setProgressLabel(config.label)

				if (t < 1 && isProcessing) {
					rafId = requestAnimationFrame(tick)
				}
			}

			rafId = requestAnimationFrame(tick)
			return () => cancelAnimationFrame(rafId)
		}, [isProcessing, forcedStop, document.status, getProgressConfig])
		const queryClient = useQueryClient()
		const { selectedProject } = useProject()

		const handlePrefetchEdit = useCallback(() => {
			if (hasPrefetchedRef.current) return
			router.prefetch(`/memory/${document.id}/edit`)
			hasPrefetchedRef.current = true
		}, [router, document.id])
		const hasBundlePreview = isBundle && bundleChildren && bundleChildren.length > 0
		const hasPreviewImage = hasBundlePreview || (previewToRender?.src && !imageError)
		const displayText = getDocumentSnippet(document)
		const markdownContent = (document as any).content || document.summary || null
		const isTextNote = document.type === "text" && !hasPreviewImage && !!markdownContent
		const cleanedTitle = (() => {
			const raw = document.title || ""
			const isData = raw.startsWith("data:")
			const cleaned = stripMarkdown(raw)
				.trim()
				.replace(/^['"""''`]+|['"""''`]+$/g, "")
			// Show "Processando..." for documents still being processed without a title
			if (isData || !cleaned) {
				if (isProcessing || isOptimisticDoc || isQueued) {
					return "Processando..."
				}
				return "Sem título"
			}
			return cleaned
		})()

		return (
			<div
				className="group relative mb-4 break-inside-avoid cursor-pointer rounded-xl overflow-hidden bg-card border border-border/50 hover:border-border transition-all duration-300 hover:shadow-lg hover:shadow-black/10"
				onClick={() => {
					analytics.documentCardClicked()
					onPreview(document)
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
								disabled={isResuming}
								onClick={handleResume}
								size="sm"
								variant="outline"
							>
								{isResuming ? (
									<Loader className="h-4 w-4 animate-spin mr-1" />
								) : (
									<RefreshCw className="h-4 w-4 mr-1" />
								)}
								Retomar
							</Button>
							<Button
								onClick={(e) => {
									e.stopPropagation()
									onDelete?.(document)
								}}
								size="sm"
								variant="ghost"
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
							className="mt-1 opacity-70 hover:opacity-100"
							onClick={async (e) => {
								e.stopPropagation()
								try {
									await cancelDocument(document.id)
									setForcedStop(true)
									toast.success("Cancelado")
									queryClient.invalidateQueries({
										queryKey: ["documents-with-memories", selectedProject],
										exact: false,
									})
								} catch (error) {
									toast.error("Falha ao cancelar", {
										description:
											error instanceof Error ? error.message : String(error),
									})
								}
							}}
							size="sm"
							variant="ghost"
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
							className="mt-1 opacity-70 hover:opacity-100"
							onClick={async (e) => {
								e.stopPropagation()
								try {
									await cancelDocument(document.id)
									setForcedStop(true)
									toast.success("Cancelado")
									queryClient.invalidateQueries({
										queryKey: ["documents-with-memories", selectedProject],
										exact: false,
									})
								} catch (error) {
									toast.error("Falha ao cancelar", {
										description:
											error instanceof Error ? error.message : String(error),
									})
								}
							}}
							size="sm"
							variant="ghost"
						>
							Cancelar
						</Button>
					</div>
				) : isQueued ? (
					/* Queued for a while - waiting in backend queue */
					<div className="p-6 flex flex-col items-center justify-center min-h-[140px] gap-3">
						<div className="relative">
							<Loader className="h-6 w-6 text-muted-foreground animate-spin" />
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
							className="mt-1 opacity-70 hover:opacity-100"
							onClick={async (e) => {
								e.stopPropagation()
								try {
									await cancelDocument(document.id)
									setForcedStop(true)
									toast.success("Cancelado")
									queryClient.invalidateQueries({
										queryKey: ["documents-with-memories", selectedProject],
										exact: false,
									})
								} catch (error) {
									toast.error("Falha ao cancelar", {
										description:
											error instanceof Error ? error.message : String(error),
									})
								}
							}}
							size="sm"
							variant="ghost"
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
							className="mt-1"
							onClick={async (e) => {
								e.stopPropagation()
								try {
									await cancelDocument(document.id)
									setForcedStop(true)
									toast.success("Processamento cancelado")
									queryClient.invalidateQueries({
										queryKey: ["documents-with-memories", selectedProject],
										exact: false,
									})
								} catch (error) {
									toast.error("Falha ao cancelar", {
										description:
											error instanceof Error ? error.message : String(error),
									})
								}
							}}
							size="sm"
							variant="outline"
						>
							Cancelar
						</Button>
					</div>
				) : (
					<>
						{/* Bundle carousel preview */}
						{isBundle && bundleChildren && bundleChildren.length > 0 ? (
							<div className="relative w-full overflow-hidden bg-muted">
								{(() => {
									const child = bundleChildren[bundleIndex] ?? bundleChildren[0]
									if (!child) return null
									const childSrc = child.previewImage
									return childSrc ? (
										<img
											key={`bundle-${child.id}`}
											alt={child.title ?? "Preview"}
											className="w-full object-cover transition-all duration-300"
											loading="lazy"
											referrerPolicy="no-referrer"
											src={proxyImageUrl(childSrc) || childSrc}
										/>
									) : (
										<div className="w-full h-32 flex items-center justify-center bg-muted/50">
											<FileText className="h-8 w-8 text-muted-foreground/40" />
										</div>
									)
								})()}

								{/* Child title overlay */}
								<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8">
									<p className="text-xs font-medium text-white line-clamp-1">
										{bundleChildren[bundleIndex]?.title || bundleChildren[bundleIndex]?.url || "Untitled"}
									</p>
								</div>

								{/* Navigation arrows */}
								{bundleChildren.length > 1 && (
									<>
										<button
											className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 rounded-full p-1 text-white transition-colors z-10"
											onClick={(e) => {
												e.stopPropagation()
												e.preventDefault()
												setBundleIndex((i) => (i > 0 ? i - 1 : bundleChildren.length - 1))
											}}
											type="button"
										>
											<ChevronLeft className="h-3.5 w-3.5" />
										</button>
										<button
											className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 rounded-full p-1 text-white transition-colors z-10"
											onClick={(e) => {
												e.stopPropagation()
												e.preventDefault()
												setBundleIndex((i) => (i < bundleChildren.length - 1 ? i + 1 : 0))
											}}
											type="button"
										>
											<ChevronRight className="h-3.5 w-3.5" />
										</button>
									</>
								)}

								{/* Dot indicators */}
								{bundleChildren.length > 1 && (
									<div className="absolute top-2 left-0 right-0 flex justify-center gap-1 z-10">
										{bundleChildren.map((_, i) => (
											<button
												key={i}
												className={cn(
													"w-1.5 h-1.5 rounded-full transition-all",
													i === bundleIndex
														? "bg-white scale-110"
														: "bg-white/40 hover:bg-white/60",
												)}
												onClick={(e) => {
													e.stopPropagation()
													e.preventDefault()
													setBundleIndex(i)
												}}
												type="button"
											/>
										))}
									</div>
								)}
							</div>
						) : !isBundle && previewToRender?.src && !imageError ? (
						/* Image/Preview area - Pinterest style variable height */
							<div className="relative w-full overflow-hidden bg-muted">
								{!imageError && (
									<img
										key={`preview-${previewToRender.src}-${retryWithoutProxy ? "direct" : "proxy"}`}
										alt={cleanedTitle}
										className={cn(
											"w-full object-cover transition-all duration-500",
											"group-hover:scale-105",
											imageLoaded ? "opacity-100" : "opacity-0",
										)}
										loading="lazy"
										onError={handleImageError}
										onLoad={(e) => {
											const img = e.currentTarget
											if (img.naturalWidth <= 1 || img.naturalHeight <= 1) {
												handleImageError()
												return
											}
											setImageLoaded(true)
										}}
										referrerPolicy="no-referrer"
										src={
											retryWithoutProxy
												? previewToRender.src
												: proxyImageUrl(previewToRender.src) || previewToRender.src
										}
									/>
								)}
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
						) : isTextNote ? (
							/* Markdown content preview for text/note documents */
							<div className="relative w-full overflow-hidden bg-muted/30">
								{/* Header bar with document title */}
								<div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/50">
									<span className="text-[11px] text-muted-foreground font-mono truncate">
										{cleanedTitle}
									</span>
									<FileText className="h-3 w-3 text-muted-foreground/60 flex-shrink-0 ml-2" />
								</div>
								{/* Rendered markdown content with fade-out */}
								<div className="px-3 py-2.5 max-h-[200px] overflow-hidden relative">
									<MarkdownContent
										content={markdownContent.slice(0, 800)}
										className="text-xs text-muted-foreground leading-relaxed [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-foreground [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:text-foreground [&_h3]:text-xs [&_h3]:font-medium [&_h3]:text-foreground [&_p]:text-xs [&_p]:mb-1.5 [&_strong]:text-foreground [&_code]:text-[10px] [&_pre]:text-[10px]"
									/>
									{/* Gradient fade-out at bottom */}
									<div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent pointer-events-none" />
								</div>
							</div>
						) : null}

						{/* Content area */}
						<div className={cn("p-3", hasPreviewImage && "pt-2")}>
							{/* Title */}
							<h3 className="text-sm font-medium text-foreground line-clamp-2 leading-snug mb-1.5">
								{cleanedTitle}
							</h3>

							{/* Bundle badge */}
							{isBundle && (
								<span className="inline-block px-2 py-0.5 text-[10px] rounded bg-primary/10 text-primary mb-1.5">
									{bundleChildren?.length || (document as any).childCount || (document.metadata as any)?.childCount || "?"} items
								</span>
							)}

							{/* Snippet - only if no preview image or short snippet */}
							{!isTextNote && displayText && !displayText.startsWith("data:") && (
								<p
									className={cn(
										"text-xs text-muted-foreground line-clamp-3 leading-relaxed",
										hasPreviewImage ? "line-clamp-2" : "line-clamp-4",
									)}
								>
									{stripMarkdown(displayText).slice(0, 200)}
								</p>
							)}

							{/* Metadata: Tags, Mentions, Properties */}
							{(() => {
								const extracted = asRecord((document.metadata as any)?.extracted)
								const tags = Array.isArray(extracted?.tags) ? extracted.tags : []
								const mentions = Array.isArray(extracted?.mentions) ? extracted.mentions : []
								const properties = asRecord(extracted?.properties) ?? {}

								const hasMetadata = tags.length > 0 || mentions.length > 0 || Object.keys(properties).length > 0

								if (!hasMetadata) return null

								return (
									<div className="flex flex-col gap-1.5 mt-2">
										{/* Tags */}
										{tags.length > 0 && (
											<div className="flex flex-wrap gap-1">
												{tags.slice(0, 3).map((tag, idx) => (
													<span
														className="px-1.5 py-0.5 text-[10px] rounded bg-primary/10 text-primary/80 border border-primary/20"
														key={`tag-${idx}`}
													>
														#{String(tag)}
													</span>
												))}
												{tags.length > 3 && (
													<span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
														+{tags.length - 3} tags
													</span>
												)}
											</div>
										)}

										{/* Mentions */}
										{mentions.length > 0 && (
											<div className="flex flex-wrap gap-1">
												{mentions.slice(0, 3).map((mention, idx) => (
													<span
														className="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
														key={`mention-${idx}`}
													>
														@{String(mention)}
													</span>
												))}
												{mentions.length > 3 && (
													<span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
														+{mentions.length - 3} mentions
													</span>
												)}
											</div>
										)}

										{/* Properties */}
										{Object.keys(properties).length > 0 && (
											<div className="flex flex-wrap gap-1">
												{Object.entries(properties)
													.slice(0, 2)
													.map(([key, value], idx) => {
														// Format value for display
														let displayValue = String(value)
														if (typeof value === 'object' && value !== null) {
															displayValue = JSON.stringify(value)
														}
														if (displayValue.length > 20) {
															displayValue = displayValue.slice(0, 20) + '...'
														}

														return (
															<span
																className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
																key={`prop-${idx}`}
																title={`${key}: ${String(value)}`}
															>
																{key}: {displayValue}
															</span>
														)
													})}
												{Object.keys(properties).length > 2 && (
													<span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
														+{Object.keys(properties).length - 2} props
													</span>
												)}
											</div>
										)}
									</div>
								)
							})()}

							{/* Footer with memory count and delete */}
							<div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
								<div className="flex items-center gap-2">
									{activeMemories.length > 0 && (
										<span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
											<Brain className="w-3 h-3" />
											{activeMemories.length}{" "}
											{activeMemories.length === 1 ? "memory" : "memories"}
										</span>
									)}
									{/* Project selector - click to change project */}
									<div
										className="max-w-[100px]"
										onClick={(e) => e.stopPropagation()}
									>
										<DocumentProjectTransfer
											documentId={document.id}
											currentProject={containerTag}
											compact
										/>
									</div>
								</div>

								<div className="flex items-center gap-1">
									{/* Pin button */}
									<button
										className={cn(
											"p-1 rounded transition-all",
											isPinned
												? "text-primary opacity-100"
												: "opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary",
										)}
										onClick={(e) => {
											e.stopPropagation()
											onTogglePin(document)
										}}
										title={isPinned ? "Desafixar" : "Fixar no topo"}
										type="button"
									>
										<Pin className={cn("w-3.5 h-3.5", isPinned && "fill-primary")} />
									</button>

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
													Are you sure you want to delete this document and all
													its related memories? This action cannot be undone.
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel onClick={(e) => e.stopPropagation()}>
													Cancel
												</AlertDialogCancel>
												<AlertDialogAction
													className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
													onClick={async (e) => {
														e.stopPropagation()
														if (isProcessing) {
															try {
																await cancelDocument(document.id)
															} catch (error) {
																console.error(
																	"[MemoryListView] Failed to cancel document:",
																	error,
																)
															}
														}
														onDelete(document)
													}}
												>
													Delete
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								</div>
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
		)
	},
)

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
	const [selectedSpace, _] = useState<string>("all")
	const scrollRef = useRef<HTMLDivElement>(null)
	const sentinelRef = useRef<HTMLDivElement>(null)
	const _isMobile = useIsMobile()
	const { selectedProject } = useProject()
	const { pinnedIds, togglePin, isPinned } = usePinnedDocuments(selectedProject)
	const deleteDocumentMutation = useDeleteDocument(selectedProject)
	const [previewDocument, setPreviewDocument] =
		useState<DocumentWithMemories | null>(null)

	const handleDeleteDocument = useCallback(
		(document: DocumentWithMemories) => {
			deleteDocumentMutation.mutate(document.id, {
				onSuccess: () => {
					onDocumentDeleted?.(document.id)
				},
			})
		},
		[deleteDocumentMutation, onDocumentDeleted],
	)

	// Filter documents based on selected space, then sort pinned to top
	const filteredDocuments = useMemo(() => {
		if (!documents) return []

		let docs: DocumentWithMemories[]
		if (selectedSpace === "all") {
			docs = documents
		} else {
			docs = documents
				.map((doc) => ({
					...doc,
					memoryEntries: doc.memoryEntries.filter(
						(memory) =>
							((memory as any).spaceContainerTag ?? (memory as any).spaceId) === selectedSpace,
					),
				}))
				.filter((doc) => doc.memoryEntries.length > 0)
		}

		// Sort pinned documents to the top, preserving relative order
		if (pinnedIds.size > 0) {
			docs = [...docs].sort((a, b) => {
				const aPinned = pinnedIds.has(a.id) ? 1 : 0
				const bPinned = pinnedIds.has(b.id) ? 1 : 0
				return bPinned - aPinned
			})
		}

		return docs
	}, [documents, selectedSpace, pinnedIds])

	// Infinite scroll with IntersectionObserver
	useEffect(() => {
		if (!sentinelRef.current || !hasMore || isLoadingMore) return

		const observer = new IntersectionObserver(
			(entries) => {
				const firstEntry = entries[0]
				if (firstEntry?.isIntersecting && hasMore && !isLoadingMore) {
					loadMoreDocuments()
				}
			},
			{ rootMargin: "200px" },
		)

		observer.observe(sentinelRef.current)
		return () => observer.disconnect()
	}, [hasMore, isLoadingMore, loadMoreDocuments])

	return (
		<div className="h-full overflow-hidden relative bg-background">
			{error ? (
				<div className="h-full flex items-center justify-center p-4">
					<div className="rounded-xl overflow-hidden max-w-md">
						<div className="relative z-10 px-6 py-4 text-foreground">
							<div className="text-lg font-semibold mb-2">
								Error loading documents
							</div>
							<div className="text-sm text-muted-foreground mb-4">
								{error.message || "An unexpected error occurred"}
							</div>
							{(error as any)?.status === 401 ||
							(error as any)?.status === 403 ? (
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
								isPinned={isPinned(document.id)}
								key={document.id}
								onDelete={handleDeleteDocument}
								onPreview={setPreviewDocument}
								onTogglePin={(doc) => togglePin(doc.id)}
							/>
						))}
					</div>

					{/* Infinite scroll sentinel */}
					<div className="h-4" ref={sentinelRef} />

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
	)
}
