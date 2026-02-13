"use client"

import {
	asRecord,
	cn,
	formatPreviewLabel,
	getYouTubeId,
	getYouTubeThumbnail,
	isInlineSvgDataUrl,
	pickFirstUrlSameHost,
	safeHttpUrl,
} from "@lib/utils"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import { AlertCircle, Loader2, Play, Plus, Save, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { z } from "zod"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
	createMemoryEntry,
	deleteMemoryEntry,
	getMemoryEntriesForDocument,
} from "@/lib/api/memory-entries"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type MemoryEntry = DocumentsResponse["documents"][0]["memoryEntries"][0]
type DocumentWithMemories = DocumentsResponse["documents"][0]

interface MemoryEntriesSidebarProps {
	documentId: string
	containerTags?: string[]
	document?: DocumentWithMemories
	variant?: "sidebar" | "standalone"
}

interface EditingMemory {
	id: string | null
	content: string
}

export function MemoryEntriesSidebar({
	documentId,
	containerTags = [],
	document,
	variant = "sidebar",
}: MemoryEntriesSidebarProps) {
	const [memories, setMemories] = useState<MemoryEntry[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [isCreating, setIsCreating] = useState(false)
	const [editingMemory, setEditingMemory] = useState<EditingMemory | null>(null)
	const [deletingId, setDeletingId] = useState<string | null>(null)

	const abortControllerRef = useRef<AbortController | null>(null)

	// Fetch memory entries
	const fetchMemories = useCallback(async () => {
		if (
			abortControllerRef.current &&
			!abortControllerRef.current.signal.aborted
		) {
			abortControllerRef.current.abort("refresh-memories")
		}
		const controller = new AbortController()
		abortControllerRef.current = controller

		try {
			setLoading(true)
			setError(null)
			const entries = await getMemoryEntriesForDocument(
				documentId,
				controller.signal,
			)
			if (controller.signal.aborted) return
			setMemories(entries)
		} catch (err) {
			const isAborted =
				controller.signal.aborted ||
				(err instanceof DOMException && err.name === "AbortError")

			if (isAborted) {
				return
			}

			console.error("Failed to fetch memory entries:", err)
			setError("Failed to load memory entries")
		} finally {
			if (!controller.signal.aborted) {
				setLoading(false)
			}
		}
	}, [documentId])

	// Load memories on mount
	useEffect(() => {
		fetchMemories()
		return () => {
			const controller = abortControllerRef.current
			if (controller && !controller.signal.aborted) {
				controller.abort("memory-sidebar-unmount")
			}
			abortControllerRef.current = null
		}
	}, [fetchMemories])

	// Handle creating a new memory
	const handleCreateMemory = useCallback(async () => {
		if (!editingMemory?.content.trim()) {
			return
		}

		try {
			setIsCreating(true)
			setError(null)

			await createMemoryEntry({
				content: editingMemory.content,
				containerTags,
				metadata: {
					source: "editor",
					documentId,
				},
			})

			// Refresh the list
			await fetchMemories()

			// Clear the form
			setEditingMemory(null)
		} catch (err) {
			console.error("Failed to create memory entry:", err)
			setError("Failed to create memory entry")
		} finally {
			setIsCreating(false)
		}
	}, [editingMemory, containerTags, documentId, fetchMemories])

	// Handle deleting a memory
	const handleDeleteMemory = useCallback(
		async (id: string) => {
			try {
				setDeletingId(id)
				setError(null)

				await deleteMemoryEntry(id)

				// Refresh the list
				await fetchMemories()
			} catch (err) {
				console.error("Failed to delete memory entry:", err)
				setError("Failed to delete memory entry")
			} finally {
				setDeletingId(null)
			}
		},
		[fetchMemories],
	)

	// Start creating a new memory
	const startCreating = useCallback(() => {
		setEditingMemory({
			id: null,
			content: "",
		})
	}, [])

	// Cancel editing
	const cancelEditing = useCallback(() => {
		setEditingMemory(null)
	}, [])

	// Format date
	const formatDate = (dateString: string) => {
		const date = new Date(dateString)
		const now = new Date()
		const diffMs = now.getTime() - date.getTime()
		const diffMins = Math.floor(diffMs / 60000)
		const diffHours = Math.floor(diffMs / 3600000)
		const diffDays = Math.floor(diffMs / 86400000)

		if (diffMins < 1) return "just now"
		if (diffMins < 60) return `${diffMins}m ago`
		if (diffHours < 24) return `${diffHours}h ago`
		if (diffDays < 7) return `${diffDays}d ago`
		return date.toLocaleDateString()
	}

	const autoSummaryMemory = useMemo<MemoryEntry | null>(() => {
		if (memories.length > 0 || !document) return null

		const raw = asRecord((document as any).raw)
		const extraction = asRecord(raw?.extraction)
		const metadata = asRecord(document.metadata)

		const summary =
			(typeof extraction?.analysis === "string" && extraction.analysis) ||
			(typeof raw?.analysis === "string" && raw.analysis) ||
			(typeof metadata?.description === "string" && metadata.description) ||
			(typeof document.summary === "string" && document.summary) ||
			null

		const displayText = summary || document.content
		if (!displayText || displayText.startsWith("data:")) {
			return null
		}

		const timestamp = (() => {
			const rawTs =
				(typeof document.updatedAt === "string" && document.updatedAt) ||
				(typeof document.createdAt === "string" && document.createdAt) ||
				null
			return rawTs ? new Date(rawTs) : new Date()
		})()

		const autoSummary: any = {
			id: `auto-summary-${document.id}`,
			documentId: document.id,
			spaceId: (document.memoryEntries?.[0] as any)?.spaceId ?? null,
			orgId: (document as any).orgId,
			userId: (document as any).userId ?? null,
			memory: displayText,
			metadata: {
				type: "auto-summary",
				source: "document-processing",
			},
			memoryEmbedding: null,
			memoryEmbeddingModel: null,
			memoryEmbeddingNew: null,
			memoryEmbeddingNewModel: null,
			version: 1,
			isLatest: true,
			sourceCount: 0,
			isInference: true,
			isForgotten: false,
			forgetAfter: null,
			forgetReason: null,
			createdAt: timestamp.toISOString(),
			updatedAt: timestamp.toISOString(),
			sourceAddedAt: null,
			sourceRelevanceScore: null,
			sourceMetadata: null,
			spaceContainerTag: null,
		}

		return autoSummary as MemoryEntry
	}, [document, memories.length])

	const renderMemories = useMemo(() => {
		if (memories.length > 0) return memories
		return autoSummaryMemory ? [autoSummaryMemory] : []
	}, [autoSummaryMemory, memories])

	const buildYouTubeEmbedUrl = (value?: string): string | undefined => {
		const id = getYouTubeId(value)
		if (!id) return undefined
		return `https://www.youtube.com/embed/${id}`
	}

	type DocumentPreviewData =
		| {
				kind: "video"
				label: string
				thumbnail?: string
				url?: string
				embedUrl?: string
		  }
		| {
				kind: "image"
				label: string
				thumbnail: string
				url?: string
		  }
		| {
				kind: "link"
				label: string
				url: string
				thumbnail?: string
		  }

	const previewsEqual = (
		a: DocumentPreviewData | null,
		b: DocumentPreviewData | null,
	): boolean => {
		if (a === b) return true
		if (!a || !b) return false
		if (a.kind !== b.kind) return false
		if (a.label !== b.label) return false
		const thumbA = "thumbnail" in a ? (a.thumbnail ?? "") : ""
		const thumbB = "thumbnail" in b ? (b.thumbnail ?? "") : ""
		if (thumbA !== thumbB) return false
		const urlA = "url" in a ? (a.url ?? "") : ""
		const urlB = "url" in b ? (b.url ?? "") : ""
		if (urlA !== urlB) return false
		const embedA = "kind" in a && a.kind === "video" ? (a.embedUrl ?? "") : ""
		const embedB = "kind" in b && b.kind === "video" ? (b.embedUrl ?? "") : ""
		return embedA === embedB
	}

	const PROCESSING_STATUSES = new Set([
		"queued",
		"fetching",
		"generating_preview",
		"extracting",
		"chunking",
		"embedding",
		"processing",
		"indexing",
	])

	const documentPreview = useMemo<DocumentPreviewData | null>(() => {
		if (!document) return null

		const metadata = asRecord(document.metadata)
		const raw = asRecord((document as any).raw)
		const extraction = asRecord(raw?.extraction)
		const youtube = asRecord(extraction?.youtube)
		const firecrawl =
			asRecord(raw?.firecrawl) || asRecord(extraction?.firecrawl)
		const firecrawlMetadata = asRecord(firecrawl?.metadata) || firecrawl
		const rawGemini = asRecord(raw?.geminiFile)

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
		]

		const originalUrl =
			safeHttpUrl(metadata?.originalUrl) ??
			safeHttpUrl((metadata as any)?.source_url) ??
			safeHttpUrl((metadata as any)?.sourceUrl) ??
			safeHttpUrl(document.url) ??
			safeHttpUrl(youtube?.url)

		const documentPreviewImage = (() => {
			const rawPreview =
				(document as any)?.previewImage ?? (document as any)?.preview_image
			if (typeof rawPreview !== "string") return undefined
			const trimmed = rawPreview.trim()
			if (!trimmed) return undefined
			if (isInlineSvgDataUrl(trimmed)) return undefined
			if (trimmed.startsWith("data:image/")) return trimmed
			const resolved = safeHttpUrl(trimmed, originalUrl)
			if (!resolved) return undefined
			if (resolved.toLowerCase().endsWith(".svg")) return undefined
			return resolved
		})()

		// No special-casing by domain for main thumbnail

		const metadataImage = pickFirstUrlSameHost(metadata, imageKeys, originalUrl)
		const rawDirectImage = pickFirstUrlSameHost(raw, imageKeys, originalUrl)
		const rawImage =
			pickFirstUrlSameHost(extraction, imageKeys, originalUrl) ??
			pickFirstUrlSameHost(firecrawl, imageKeys, originalUrl) ??
			pickFirstUrlSameHost(firecrawlMetadata, imageKeys, originalUrl) ??
			pickFirstUrlSameHost(rawGemini, imageKeys, originalUrl)

		const firecrawlOgImage =
			safeHttpUrl(firecrawlMetadata?.ogImage, originalUrl) ??
			safeHttpUrl(firecrawl?.ogImage, originalUrl)

		// Prefer page-extracted images over generic opengraph banners
		const isLikelyGeneric = (v?: string) => {
			if (!v) return true
			const s = v.toLowerCase()
			return (
				s.endsWith(".svg") ||
				s.includes("favicon") ||
				s.includes("sprite") ||
				s.includes("logo") ||
				s.includes("opengraph.githubassets.com")
			)
		}

		const extractedImages: string[] = (() => {
			const arr =
				(Array.isArray((extraction as any)?.images) &&
					((extraction as any).images as unknown[])) ||
				(Array.isArray((raw as any)?.images) &&
					((raw as any).images as unknown[])) ||
				[]
			const out: string[] = []
			for (const u of arr) {
				const s = safeHttpUrl(u as string | undefined, originalUrl)
				if (!s) continue
				if (s.toLowerCase().startsWith("data:image/svg+xml")) continue
				if (!out.includes(s)) out.push(s)
			}
			return out
		})()

		const _preferredFromExtracted =
			extractedImages.find((u) => !isLikelyGeneric(u)) || extractedImages[0]

		const youtubeFallback = (() => {
			const youtubeUrl = youtube?.url as string | undefined
			const id = getYouTubeId(youtubeUrl ?? originalUrl)
			return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined
		})()

		// Heuristics: avoid badges/svg; prefer GitHub social preview when available
		const isSvgOrBadge = (u?: string) => {
			if (!u) return true
			const s = u.toLowerCase()
			return (
				s.startsWith("data:image/svg+xml") ||
				s.endsWith(".svg") ||
				s.includes("badge") ||
				s.includes("shields") ||
				s.includes("sprite") ||
				s.includes("logo") ||
				s.includes("icon") ||
				s.includes("topics")
			)
		}
		const isDisallowedBadgeDomain = (u?: string) => {
			if (!u) return false
			try {
				const h = new URL(u).hostname.toLowerCase()
				return h === "img.shields.io" || h.endsWith(".shields.io")
			} catch {
				return false
			}
		}
		const isGitHubHost = (u?: string) => {
			if (!u) return false
			try {
				return new URL(u).hostname.toLowerCase().includes("github.com")
			} catch {
				return false
			}
		}
		const isGitHubAssets = (u?: string) => {
			if (!u) return false
			try {
				return new URL(u).hostname.toLowerCase().endsWith("githubassets.com")
			} catch {
				return false
			}
		}
		const isGitHubOpenGraph = (u?: string) => {
			if (!u) return false
			try {
				return isGitHubAssets(u) && new URL(u).pathname.includes("/opengraph/")
			} catch {
				return false
			}
		}

		const preferredGitHubOg = isGitHubHost(originalUrl)
			? [
					documentPreviewImage,
					firecrawlOgImage,
					metadataImage,
					rawImage,
					rawDirectImage,
				].find(isGitHubOpenGraph)
			: undefined

		// Build ordered list: prioritize documentPreviewImage, then other sources, then extracted images
		// Include all extracted images (not just preferred) to ensure we have fallbacks when preview_image is SVG
		const seen = new Set<string>()
		const ordered: string[] = []

		const addIfNotSeen = (url: string | undefined) => {
			if (!url || seen.has(url)) return
			seen.add(url)
			ordered.push(url)
		}

		// Priority order: document preview, then metadata sources, then extracted images
		addIfNotSeen(documentPreviewImage)
		addIfNotSeen(rawImage)
		addIfNotSeen(firecrawlOgImage)
		addIfNotSeen(rawDirectImage)
		addIfNotSeen(metadataImage)

		// Add extracted images: prefer non-generic ones first
		for (const img of extractedImages) {
			if (!isLikelyGeneric(img)) {
				addIfNotSeen(img)
			}
		}
		// Then add generic extracted images as fallback
		for (const img of extractedImages) {
			if (isLikelyGeneric(img)) {
				addIfNotSeen(img)
			}
		}

		addIfNotSeen(youtubeFallback)

		const filtered = ordered.filter(
			(u) => !isSvgOrBadge(u) && !isDisallowedBadgeDomain(u),
		)
		const finalThumbnail =
			preferredGitHubOg ||
			filtered[0] ||
			ordered.find(isGitHubOpenGraph) ||
			metadataImage ||
			youtubeFallback

		const youtubeUrl =
			safeHttpUrl(youtube?.url) ??
			safeHttpUrl(youtube?.embedUrl) ??
			(originalUrl && getYouTubeId(originalUrl) ? originalUrl : undefined)
		const youtubeEmbed = buildYouTubeEmbedUrl(youtubeUrl ?? originalUrl)

		const label = formatPreviewLabel(document.type)

		if (youtubeEmbed) {
			return {
				kind: "video",
				label: label || "YouTube",
				thumbnail: finalThumbnail ?? youtubeFallback,
				url: youtubeUrl ?? originalUrl ?? undefined,
				embedUrl: youtubeEmbed,
			}
		}

		if (finalThumbnail) {
			return {
				kind: "image",
				label: label || "Preview",
				thumbnail: finalThumbnail,
				url: originalUrl ?? undefined,
			}
		}

		if (originalUrl) {
			return {
				kind: "link",
				label: label || "Link",
				url: originalUrl,
			}
		}

		return null
	}, [document, buildYouTubeEmbedUrl])

	const sanitizedDocumentPreview = useMemo<DocumentPreviewData | null>(() => {
		if (!documentPreview) return null
		if (
			documentPreview.kind !== "link" &&
			documentPreview.thumbnail &&
			isInlineSvgDataUrl(documentPreview.thumbnail)
		) {
			if (documentPreview.kind === "video") {
				const fallback = getYouTubeThumbnail(
					documentPreview.url ?? document?.url ?? undefined,
				)
				if (fallback) {
					return { ...documentPreview, thumbnail: fallback }
				}
			}
			return null
		}
		if (
			documentPreview.kind === "link" &&
			documentPreview.thumbnail &&
			isInlineSvgDataUrl(documentPreview.thumbnail)
		) {
			return { ...documentPreview, thumbnail: undefined }
		}
		return documentPreview
	}, [documentPreview, document?.url])

	const isProcessing = document?.status
		? PROCESSING_STATUSES.has(String(document.status).toLowerCase())
		: false

	const [stickyPreview, setStickyPreview] =
		useState<DocumentPreviewData | null>(null)

	useEffect(() => {
		setStickyPreview(null)
	}, [])

	useEffect(() => {
		if (!isProcessing) {
			setStickyPreview(null)
			return
		}
		if (!sanitizedDocumentPreview) return
		setStickyPreview((current) =>
			previewsEqual(current, sanitizedDocumentPreview)
				? current
				: sanitizedDocumentPreview,
		)
	}, [isProcessing, sanitizedDocumentPreview, previewsEqual])

	const previewToRender = isProcessing
		? (stickyPreview ?? sanitizedDocumentPreview)
		: sanitizedDocumentPreview

	const [isVideoPlaying, setIsVideoPlaying] = useState(false)

	useEffect(() => {
		setIsVideoPlaying(false)
	}, [])

	// Build small gallery of additional images for web/repository URLs
	const additionalImages = useMemo(() => {
		if (!document) return [] as string[]
		const raw = asRecord((document as any).raw)
		const extraction = asRecord(raw?.extraction) || asRecord(raw)
		const baseUrl =
			document.url && typeof document.url === "string"
				? document.url
				: undefined

		const list: string[] = []
		const isDisallowedBadgeDomain = (u?: string) => {
			if (!u) return true
			try {
				const h = new URL(u).hostname.toLowerCase()
				return h === "img.shields.io" || h.endsWith(".shields.io")
			} catch {
				return true
			}
		}

		const push = (u?: unknown) => {
			const s = safeHttpUrl(u as string | undefined, baseUrl)
			if (!s) return
			if (s.toLowerCase().endsWith(".svg")) return
			if (s.toLowerCase().startsWith("data:image/svg+xml")) return
			if (
				s.toLowerCase().includes("badge") ||
				s.toLowerCase().includes("shields")
			)
				return
			if (isDisallowedBadgeDomain(s)) return
			if (!list.includes(s)) list.push(s)
		}

		// Prefer images array produced by extractor
		const images =
			extraction && Array.isArray((extraction as any).images)
				? ((extraction as any).images as unknown[])
				: []
		for (const u of images) push(u as string)

		// Fallbacks: consider metaTags images if present
		const metaTags = asRecord((extraction as any)?.metaTags)
		if (metaTags) {
			push(metaTags.ogImage)
			push((metaTags as any).twitterImage)
		}

		// Remove the main preview thumbnail to avoid duplication
		const mainThumb =
			previewToRender && "thumbnail" in previewToRender
				? previewToRender.thumbnail
				: undefined
		const filtered = list.filter((u) => u !== mainThumb)

		// Cap to 4 thumbnails
		return filtered.slice(0, 4)
	}, [document, previewToRender])

	// Get status badge
	const getStatusBadge = (memory: MemoryEntry) => {
		const mem = memory as any
		if (mem.isForgotten) {
			return (
				<span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
					Forgotten
				</span>
			)
		}
		if (mem.isInference) {
			return (
				<span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
					Inference
				</span>
			)
		}
		if (mem.isLatest) {
			return (
				<span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
					Latest
				</span>
			)
		}
		return null
	}

	const containerClasses = cn(
		"w-full flex flex-col",
		variant === "sidebar"
			? "h-full border-l border-border bg-background/80"
			: "border border-border/70 rounded-2xl bg-card/90 shadow-lg backdrop-blur-sm",
	)

	const headerClasses =
		variant === "sidebar"
			? "px-3 md:px-4 py-1.5 border-b border-border/80 bg-card/40"
			: "px-5 py-4 border-b border-border/80 bg-card/60 rounded-t-2xl"

	const thumbnailMargin =
		variant === "sidebar" ? "mx-3 md:mx-4 mt-4" : "mx-5 mt-5"

	const contentPadding =
		variant === "sidebar" ? "px-3 md:px-4 py-3" : "px-5 py-4"

	const footerPadding =
		variant === "sidebar" ? "px-3 md:px-4 py-3" : "px-5 py-4"

	return (
		<div className={containerClasses}>
			{/* Header */}
			<div className={headerClasses}>
				<h2
					className={cn(
						"font-semibold text-foreground mb-0.5",
						variant === "sidebar" ? "text-sm md:text-base" : "text-base",
					)}
				>
					Memory Entries
				</h2>
				<p className="text-xs text-muted-foreground">
					Associated memories and insights
				</p>
			</div>

			{/* Thumbnail/Preview */}
			{previewToRender && previewToRender.kind === "video" && (
				<div className={thumbnailMargin}>
					<div className="relative w-full overflow-hidden rounded-lg border border-border/80 bg-card">
						{isVideoPlaying && previewToRender.embedUrl ? (
							<iframe
								allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
								allowFullScreen
								className="aspect-video w-full"
								src={
									previewToRender.embedUrl.includes("?")
										? `${previewToRender.embedUrl}&autoplay=1`
										: `${previewToRender.embedUrl}?autoplay=1`
								}
								title={document?.title || previewToRender.label}
							/>
						) : (
							<button
								className="group relative block w-full overflow-hidden"
								onClick={() => {
									if (previewToRender.embedUrl) {
										setIsVideoPlaying(true)
										return
									}
									if (previewToRender.url && typeof window !== "undefined") {
										window.open(
											previewToRender.url,
											"_blank",
											"noopener,noreferrer",
										)
									}
								}}
								type="button"
							>
								{previewToRender.thumbnail ? (
									<img
										alt={document?.title || "Video preview"}
										className="aspect-video w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
										src={previewToRender.thumbnail}
									/>
								) : (
									<div className="aspect-video flex items-center justify-center text-sm text-muted-foreground">
										{previewToRender.label}
									</div>
								)}
								<span className="absolute inset-0 flex items-center justify-center">
									<span className="flex h-14 w-14 items-center justify-center rounded-full bg-background/80 text-foreground shadow-lg transition-transform duration-200 group-hover:scale-110">
										<Play className="h-6 w-6" fill="currentColor" />
									</span>
								</span>
							</button>
						)}
					</div>
				</div>
			)}

			{previewToRender &&
				previewToRender.kind !== "video" &&
				(previewToRender.thumbnail || previewToRender.url) && (
					<div className={thumbnailMargin}>
						{(() => {
							const previewLink = previewToRender.url ?? document?.url ?? null
							const content = previewToRender.thumbnail ? (
								<img
									alt={document?.title || "Document preview"}
									className="w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
									src={previewToRender.thumbnail}
									style={{ maxHeight: "200px" }}
								/>
							) : (
								<div className="flex min-h-[160px] items-center justify-center bg-muted/30 text-sm text-muted-foreground">
									{previewToRender.label}
								</div>
							)

							const containerClass =
								"group relative block overflow-hidden rounded-lg border border-border transition-transform duration-200 hover:-translate-y-0.5"

							return previewLink ? (
								<a
									className={containerClass}
									href={previewLink}
									rel="noopener noreferrer"
									target="_blank"
								>
									{content}
									<span className="absolute left-3 top-3 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm backdrop-blur">
										{previewToRender.label}
									</span>
								</a>
							) : (
								<div className={containerClass}>{content}</div>
							)
						})()}
					</div>
				)}

			{/* Additional images grid (for web/repo) */}
			{additionalImages.length > 0 && (
				<div className={cn(thumbnailMargin, "")}>
					<div className="grid grid-cols-2 md:grid-cols-4 gap-2">
						{additionalImages.map((src, idx) => (
							<a
								className="block rounded-md overflow-hidden border border-border/70 bg-card group"
								href={src}
								key={`${src}-${idx}`}
								rel="noopener noreferrer"
								target="_blank"
								title="Open image"
							>
								<div className="aspect-[4/3] w-full overflow-hidden">
									<img
										alt="Related image"
										className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
										loading="lazy"
										src={src}
									/>
								</div>
							</a>
						))}
					</div>
				</div>
			)}

			{/* Error message */}
			{error && (
				<div
					className={cn(
						variant === "sidebar" ? "mx-3 md:mx-4 mt-4" : "mx-5 mt-5",
						"p-3 bg-red-500/10 border border-red-500/20 rounded-md flex items-start gap-2",
					)}
				>
					<AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
					<p className="text-xs text-red-400">{error}</p>
				</div>
			)}

			{/* Content */}
			<div className={cn("flex-1 overflow-y-auto", contentPadding)}>
				<div className="space-y-3">
					{/* Loading state */}
					{loading && (
						<div className="flex items-center justify-center py-8">
							<Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
						</div>
					)}

					{/* Empty state */}
					{!loading && renderMemories.length === 0 && !editingMemory && (
						<div className="text-center py-8">
							<div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
								<Plus className="w-6 h-6 text-muted-foreground" />
							</div>
							<p className="text-sm text-muted-foreground mb-4">
								No memory entries yet
							</p>
							<Button onClick={startCreating} size="sm" variant="outline">
								<Plus className="w-4 h-4 mr-2" />
								Add first memory
							</Button>
						</div>
					)}

					{/* Memory list */}
					{!loading &&
						renderMemories.map((memory) => {
							const isSynthetic = memory.id.startsWith("auto-summary-")
							return (
								<div className="rounded-lg p-3" key={memory.id}>
									<div className="flex items-start justify-between gap-2 mb-2">
										<div className="flex items-center gap-2 flex-1 min-w-0">
											{getStatusBadge(memory)}
											<span className="text-xs text-muted-foreground">
												v{(memory as any).version}
											</span>
										</div>
										{!isSynthetic && (
											<Button
												className="flex-shrink-0"
												disabled={deletingId === memory.id}
												onClick={() => handleDeleteMemory(memory.id)}
												size="icon-sm"
												variant="ghost"
											>
												{deletingId === memory.id ? (
													<Loader2 className="w-3.5 h-3.5 animate-spin" />
												) : (
													<Trash2 className="w-3.5 h-3.5 text-red-400" />
												)}
											</Button>
										)}
									</div>

									<div className="text-sm text-foreground mb-2 prose prose-sm max-w-none prose-p:my-2 prose-headings:my-2 prose-headings:text-foreground prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-strong:text-foreground prose-strong:font-semibold prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:text-foreground prose-code:bg-muted">
										<ReactMarkdown remarkPlugins={[remarkGfm]}>
											{memory.memory}
										</ReactMarkdown>
									</div>

									<div className="flex items-center justify-between text-xs text-muted-foreground">
										<span>{formatDate(memory.createdAt.toString())}</span>
										{(memory as any).sourceCount > 0 && (
											<span>{(memory as any).sourceCount} sources</span>
										)}
									</div>
								</div>
							)
						})}

					{/* Create/Edit form */}
					{editingMemory && (
						<div className="bg-muted/50 rounded-lg p-3 border-2 border-blue-500/30">
							<div className="mb-3">
								<label className="text-xs text-muted-foreground mb-2 block">
									Memory content
								</label>
								<Textarea
									autoFocus
									className="min-h-24 resize-none bg-background/20"
									onChange={(e) =>
										setEditingMemory({
											...editingMemory,
											content: e.target.value,
										})
									}
									placeholder="Enter memory content..."
									value={editingMemory.content}
								/>
							</div>

							<div className="flex items-center gap-2">
								<Button
									className="flex-1"
									disabled={!editingMemory.content.trim() || isCreating}
									onClick={handleCreateMemory}
									size="sm"
								>
									{isCreating ? (
										<Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
									) : (
										<Save className="w-3.5 h-3.5 mr-2" />
									)}
									{isCreating ? "Creating..." : "Create"}
								</Button>
								<Button
									disabled={isCreating}
									onClick={cancelEditing}
									size="sm"
									variant="ghost"
								>
									<X className="w-3.5 h-3.5" />
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Footer with Add button */}
			{!editingMemory && !loading && (
				<div
					className={cn(
						footerPadding,
						"border-t border-border/80",
						variant === "sidebar"
							? "bg-background/60"
							: "bg-card/60 rounded-b-2xl",
					)}
				>
					<Button
						className="w-full"
						onClick={startCreating}
						size="sm"
						variant="outline"
					>
						<Plus className="w-4 h-4 mr-2" />
						Add memory entry
					</Button>
				</div>
			)}
		</div>
	)
}
