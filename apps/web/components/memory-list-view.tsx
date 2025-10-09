"use client"

import { useIsMobile } from "@hooks/use-mobile"
import { useDeleteDocument } from "@lib/queries"
import { cn } from "@lib/utils"
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
import { Badge } from "@repo/ui/components/badge"
import { Card, CardContent, CardHeader } from "@repo/ui/components/card"
import { colors } from "@repo/ui/memory-graph/constants"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
	Brain,
	Clapperboard,
	ExternalLink,
	Image as ImageIcon,
	Link2,
	Play,
	Sparkles,
	Trash2,
} from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { z } from "zod"
import useResizeObserver from "@/hooks/use-resize-observer"
import { analytics } from "@/lib/analytics"
import { getDocumentIcon } from "@/lib/document-icon"
import { useProject } from "@/stores"
import { formatDate, getSourceUrl } from "./memories"
import { MemoryDetail } from "./memories/memory-detail"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type DocumentWithMemories = DocumentsResponse["documents"][0]

type BaseRecord = Record<string, unknown>

type PreviewData =
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

const asRecord = (value: unknown): BaseRecord | null => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null
	}
	return value as BaseRecord
}

const safeHttpUrl = (value: unknown, baseUrl?: string): string | undefined => {
	if (typeof value !== "string") return undefined
	const trimmed = value.trim()
	if (!trimmed) return undefined
	// Only accept data URLs that are images, not text or other types
	if (trimmed.startsWith("data:")) {
		if (trimmed.startsWith("data:image/")) {
			return trimmed
		}
		return undefined
	}
	
	// Try absolute URL first
	try {
		const url = new URL(trimmed)
		if (url.protocol === "http:" || url.protocol === "https:") {
			return url.toString()
		}
	} catch {
		// If it fails, try as relative URL with baseUrl
		if (baseUrl) {
			try {
				const url = new URL(trimmed, baseUrl)
				if (url.protocol === "http:" || url.protocol === "https:") {
					return url.toString()
				}
			} catch {}
		}
	}
	return undefined
}

const pickFirstUrl = (
	record: BaseRecord | null,
	keys: string[],
	baseUrl?: string,
): string | undefined => {
	if (!record) return undefined
	for (const key of keys) {
		const candidate = record[key]
		const url = safeHttpUrl(candidate, baseUrl)
		if (url) return url
	}
	return undefined
}

const formatPreviewLabel = (type?: string | null): string => {
	if (!type) return "Link"
	return type
		.split(/[_-]/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ")
}

const isYouTubeUrl = (value?: string): boolean => {
	if (!value) return false
	try {
		const parsed = new URL(value)
		const host = parsed.hostname.toLowerCase()
		if (!host.includes("youtube.com") && !host.includes("youtu.be"))
			return false
		return true
	} catch {
		return false
	}
}

const getYouTubeId = (value?: string): string | undefined => {
	if (!value) return undefined
	try {
		const parsed = new URL(value)
		if (parsed.hostname.includes("youtu.be")) {
			return parsed.pathname.replace(/^\//, "") || undefined
		}
		if (parsed.searchParams.has("v")) {
			return parsed.searchParams.get("v") ?? undefined
		}
		const pathSegments = parsed.pathname.split("/").filter(Boolean)
		if (pathSegments[0] === "embed" && pathSegments[1]) {
			return pathSegments[1]
		}
	} catch {}
	return undefined
}

const getYouTubeThumbnail = (value?: string): string | undefined => {
	const videoId = getYouTubeId(value)
	if (!videoId) return undefined
	return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

const getDocumentPreview = (
	document: DocumentWithMemories,
): PreviewData | null => {
	const metadata = asRecord(document.metadata)
	const raw = asRecord(document.raw)
	const rawExtraction = asRecord(raw?.extraction)
	const rawYoutube = asRecord(rawExtraction?.youtube)
	const rawFirecrawl =
		asRecord(raw?.firecrawl) ?? asRecord(rawExtraction?.firecrawl)
	const rawFirecrawlMetadata = asRecord(rawFirecrawl?.metadata) ?? rawFirecrawl
	const rawGemini = asRecord(raw?.geminiFile)

	const imageKeys = [
		"ogImage",
		"og_image",
		"previewImage",
		"preview_image",
		"image",
		"thumbnail",
		"thumbnailUrl",
		"thumbnail_url",
		"favicon",
	]

	// Get URL from multiple possible locations first (needed as baseUrl)
	const originalUrl =
		safeHttpUrl(metadata?.originalUrl) ??
		safeHttpUrl(document.url) ??
		safeHttpUrl(rawYoutube?.url)

	// Now search for images with baseUrl context
	const metadataImage = pickFirstUrl(metadata, imageKeys, originalUrl)
	// Check raw object directly first (new extracted og:image metadata)
	const rawDirectImage = pickFirstUrl(raw, imageKeys, originalUrl)
	const rawImage =
		pickFirstUrl(rawExtraction, imageKeys, originalUrl) ??
		pickFirstUrl(rawFirecrawl, imageKeys, originalUrl) ??
		pickFirstUrl(rawFirecrawlMetadata, imageKeys, originalUrl) ??
		pickFirstUrl(rawGemini, imageKeys, originalUrl)

	// Check Firecrawl metadata directly for Open Graph images
	const firecrawlOgImage =
		safeHttpUrl(rawFirecrawlMetadata?.ogImage, originalUrl) ??
		safeHttpUrl(rawFirecrawl?.ogImage, originalUrl)
	// Prioritize: raw direct (new og:image) > metadata > rawImage > firecrawl
	const finalPreviewImage = rawDirectImage ?? metadataImage ?? rawImage ?? firecrawlOgImage
	const contentType =
		(typeof rawExtraction?.contentType === "string" &&
			rawExtraction.contentType) ||
		(typeof rawExtraction?.content_type === "string" &&
			rawExtraction.content_type) ||
		(typeof raw?.contentType === "string" && raw.contentType) ||
		(typeof raw?.content_type === "string" && raw.content_type) ||
		undefined

	const normalizedType = document.type?.toLowerCase() ?? ""
	const label = formatPreviewLabel(document.type)

	if (normalizedType === "image" || contentType?.startsWith("image/")) {
		const src = finalPreviewImage ?? originalUrl
		if (src) {
			return {
				kind: "image",
				src,
				href: originalUrl ?? undefined,
				label: label || "Image",
			}
		}
	}

	// Check for YouTube video data first
	const youtubeUrl =
		safeHttpUrl(rawYoutube?.url) ?? safeHttpUrl(rawYoutube?.embedUrl)
	const youtubeThumbnail = safeHttpUrl(rawYoutube?.thumbnail)

	const isVideoDocument =
		normalizedType === "video" ||
		contentType?.startsWith("video/") ||
		!!youtubeUrl ||
		(isYouTubeUrl(originalUrl) && !!originalUrl)

	if (isVideoDocument) {
		return {
			kind: "video",
			src:
				youtubeThumbnail ??
				finalPreviewImage ??
				getYouTubeThumbnail(originalUrl),
			href: youtubeUrl ?? originalUrl ?? undefined,
			label: contentType === "video/youtube" ? "YouTube" : label || "Video",
		}
	}

	if (finalPreviewImage) {
		return {
			kind: "image",
			src: finalPreviewImage,
			href: originalUrl ?? undefined,
			label: label || "Preview",
		}
	}

	// For links without preview images, don't render preview at all
	// The card will just show the title and content
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
}

const GreetingMessage = memo(() => {
	const getGreeting = () => {
		const hour = new Date().getHours()
		if (hour < 12) return "Good morning"
		if (hour < 17) return "Good afternoon"
		return "Good evening"
	}

	return (
		<div className="flex items-center gap-3 mb-3 px-4 md:mb-6 md:mt-3">
			<div>
				<h1
					className="text-lg md:text-xl font-semibold"
					style={{ color: colors.text.primary }}
				>
					{getGreeting()}!
				</h1>
				<p className="text-xs md:text-sm" style={{ color: colors.text.muted }}>
					Welcome back to your memory collection
				</p>
			</div>
		</div>
	)
})

const DocumentCard = memo(
	({
		document,
		onOpenDetails,
		onDelete,
	}: {
		document: DocumentWithMemories
		onOpenDetails: (document: DocumentWithMemories) => void
		onDelete: (document: DocumentWithMemories) => void
	}) => {
		const activeMemories = document.memoryEntries.filter((m) => !m.isForgotten)
		const forgottenMemories = document.memoryEntries.filter(
			(m) => m.isForgotten,
		)
		const preview = useMemo(() => getDocumentPreview(document), [document])

		const PreviewBadgeIcon = useMemo(() => {
			switch (preview?.kind) {
				case "image":
					return ImageIcon
				case "video":
					return Clapperboard
				case "link":
					return Link2
				default:
					return null
			}
		}, [preview?.kind])

    const processingStates = new Set([
      "queued",
      "fetching",
      "extracting",
      "chunking",
      "embedding",
      "processing",
    ])

    const isProcessing = document.status
      ? processingStates.has(String(document.status).toLowerCase())
      : false

    return (
      <Card
        className="h-full mx-4 p-4 transition-all cursor-pointer group relative overflow-hidden border border-white/10 gap-2 md:w-full rounded-lg"
        onClick={() => {
          analytics.documentCardClicked()
          onOpenDetails(document)
        }}
        style={{
          backgroundColor: "#0f1419",
        }}
      >
        {/* Inline processing feedback overlay inside the card */}
        {isProcessing && (
          <div className="absolute inset-0 z-20 bg-black/45 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="px-3 py-2 rounded-md border border-white/10 bg-white/8 text-white/90 text-sm flex items-center gap-2 shadow-lg">
              <svg className="animate-spin h-4 w-4 text-white/80" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
              </svg>
              Processing...
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
								{document.title?.startsWith("data:") ? "Untitled Document" : (document.title || "Untitled Document")}
							</p>
						</div>
						{document.url && (
							<button
								className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
								onClick={(e) => {
									e.stopPropagation()
									const sourceUrl = getSourceUrl(document)
									window.open(sourceUrl ?? undefined, "_blank")
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
					{document.content && !document.content.startsWith("data:") && (
						<p
							className="text-xs line-clamp-2 mb-3"
							style={{ color: colors.text.muted }}
						>
							{document.content}
						</p>
					)}
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

						<AlertDialog>
							<AlertDialogTrigger asChild>
								<button
									className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-red-500/20"
									onClick={(e) => {
										e.stopPropagation()
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
											e.stopPropagation()
										}}
									>
										Cancel
									</AlertDialogCancel>
									<AlertDialogAction
										className="bg-red-600 hover:bg-red-700 text-white"
										onClick={(e) => {
											e.stopPropagation()
											onDelete(document)
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
}: MemoryListViewProps) => {
	const [selectedSpace, _] = useState<string>("all")
	const [selectedDocument, setSelectedDocument] =
		useState<DocumentWithMemories | null>(null)
	const [isDetailOpen, setIsDetailOpen] = useState(false)
	const parentRef = useRef<HTMLDivElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const isMobile = useIsMobile()
	const { selectedProject } = useProject()
	const deleteDocumentMutation = useDeleteDocument(selectedProject)

	const gap = 14

	const handleDeleteDocument = useCallback(
		(document: DocumentWithMemories) => {
			deleteDocumentMutation.mutate(document.id)
		},
		[deleteDocumentMutation],
	)

	const { width: containerWidth } = useResizeObserver(containerRef)
	const columnWidth = isMobile ? containerWidth : 320
	const columns = Math.max(
		1,
		Math.floor((containerWidth + gap) / (columnWidth + gap)),
	)

	// Filter documents based on selected space
	const filteredDocuments = useMemo(() => {
		if (!documents) return []

		if (selectedSpace === "all") {
			return documents
		}

		return documents
			.map((doc) => ({
				...doc,
				memoryEntries: doc.memoryEntries.filter(
					(memory) =>
						(memory.spaceContainerTag ?? memory.spaceId) === selectedSpace,
				),
			}))
			.filter((doc) => doc.memoryEntries.length > 0)
	}, [documents, selectedSpace])

	const handleOpenDetails = useCallback((document: DocumentWithMemories) => {
		analytics.memoryDetailOpened()
		setSelectedDocument(document)
		setIsDetailOpen(true)
	}, [])

	const handleCloseDetails = useCallback(() => {
		setIsDetailOpen(false)
		setTimeout(() => setSelectedDocument(null), 300)
	}, [])

	const virtualItems = useMemo(() => {
		const items = []
		for (let i = 0; i < filteredDocuments.length; i += columns) {
			items.push(filteredDocuments.slice(i, i + columns))
		}
		return items
	}, [filteredDocuments, columns])

	const virtualizer = useVirtualizer({
		count: virtualItems.length,
		getScrollElement: () => parentRef.current,
		overscan: 5,
		estimateSize: () => 200,
	})
	const virtualRows = virtualizer.getVirtualItems()

	useEffect(() => {
		const [lastItem] = [...virtualRows].reverse()

		if (!lastItem || !hasMore || isLoadingMore) {
			return
		}

		if (lastItem.index >= virtualItems.length - 1) {
			loadMoreDocuments()
		}
	}, [
		hasMore,
		isLoadingMore,
		loadMoreDocuments,
		virtualRows,
		virtualItems.length,
	])

	// Always render with consistent structure
	return (
		<>
			<div
				className="h-full overflow-hidden relative pb-20"
				ref={containerRef}
				style={{ backgroundColor: colors.background.primary }}
			>
				{error ? (
					<div className="h-full flex items-center justify-center p-4">
						<div className="rounded-xl overflow-hidden">
							<div
								className="relative z-10 px-6 py-4"
								style={{ color: colors.text.primary }}
							>
								Error loading documents: {error.message}
							</div>
						</div>
					</div>
				) : isLoading ? (
					<div className="h-full flex items-center justify-center p-4">
						<div className="rounded-xl overflow-hidden">
							<div
								className="relative z-10 px-6 py-4"
								style={{ color: colors.text.primary }}
							>
								<div className="flex items-center gap-2">
									<Sparkles className="w-4 h-4 animate-spin text-blue-400" />
									<span>Loading memory list...</span>
								</div>
							</div>
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
						<GreetingMessage />

						<div
							className="w-full relative"
							style={{
								height: `${virtualizer.getTotalSize() + virtualItems.length * gap}px`,
							}}
						>
							{virtualizer.getVirtualItems().map((virtualRow) => {
								const rowItems = virtualItems[virtualRow.index]
								if (!rowItems) return null

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
												gridTemplateColumns: `repeat(${columns}, ${columnWidth}px)`,
												gap: `${gap}px`,
											}}
										>
											{rowItems.map((document, columnIndex) => (
												<DocumentCard
													document={document}
													key={`${document.id}-${virtualRow.index}-${columnIndex}`}
													onDelete={handleDeleteDocument}
													onOpenDetails={handleOpenDetails}
												/>
											))}
										</div>
									</div>
								)
							})}
						</div>

						{isLoadingMore && (
							<div className="py-8 flex items-center justify-center">
								<div className="flex items-center gap-2">
									<Sparkles className="w-4 h-4 animate-spin text-blue-400" />
									<span style={{ color: colors.text.primary }}>
										Loading more memories...
									</span>
								</div>
							</div>
						)}
					</div>
				)}
			</div>

			<MemoryDetail
				document={selectedDocument}
				isMobile={isMobile}
				isOpen={isDetailOpen}
				onClose={handleCloseDetails}
			/>
		</>
	)
}
