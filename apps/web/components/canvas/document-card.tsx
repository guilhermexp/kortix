"use client"

import {
	asRecord,
	cn,
	extractGalleryImages,
	formatPreviewLabel,
	getYouTubeThumbnail,
	isInlineSvgDataUrl,
	isYouTubeUrl,
	PROCESSING_STATUSES,
	pickFirstUrlSameHost,
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
import { Badge } from "@repo/ui/components/badge"
import { Card, CardContent, CardHeader } from "@repo/ui/components/card"
import { getColors } from "@repo/ui/memory-graph/constants"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
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
} from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { z } from "zod"
import { MarkdownContent } from "@/components/markdown-content"
import { cancelDocument } from "@/lib/api/documents-client"
import { getDocumentIcon } from "@/lib/document-icon"
import {
	formatDate,
	getDocumentSnippet,
	getSourceUrl,
	stripMarkdown,
} from "../memories"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type DocumentWithMemories = DocumentsResponse["documents"][0]

type PreviewData =
	| {
			kind: "image"
			src: string
			label: string
			href?: string
			isFavicon?: boolean
	  }
	| {
			kind: "video"
			src?: string
			label: string
			href?: string
			isFavicon?: boolean
	  }
	| {
			kind: "link"
			src?: string
			label: string
			href: string
			isFavicon?: boolean
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

	const isLikelyGeneric = (v?: string) => {
		if (!v) return true
		const s = v.toLowerCase()
		return (
			s.endsWith(".svg") ||
			s.includes("favicon") ||
			s.includes("sprite") ||
			s.includes("logo")
		)
	}

	const isFaviconUrl = (v?: string) => {
		if (!v) return false
		const s = v.toLowerCase()
		return (
			s.includes("favicon") ||
			s.includes("apple-touch-icon") ||
			s.endsWith(".ico") ||
			(s.includes("icon") && (s.includes("32") || s.includes("64") || s.includes("128") || s.includes("180") || s.includes("192")))
		)
	}

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
		safeHttpUrl(rawYoutube?.url)
	const geminiFileUri = safeHttpUrl(rawGemini?.uri, originalUrl)
	const geminiFileUrl = safeHttpUrl(rawGemini?.url, originalUrl)

	// No special-casing by domain for main preview

	const metadataImage = pickFirstUrlSameHost(metadata, imageKeys, originalUrl)
	const rawDirectImage = pickFirstUrlSameHost(raw, imageKeys, originalUrl)
	const rawImage =
		pickFirstUrlSameHost(rawExtraction, imageKeys, originalUrl) ??
		pickFirstUrlSameHost(rawFirecrawl, imageKeys, originalUrl) ??
		pickFirstUrlSameHost(rawFirecrawlMetadata, imageKeys, originalUrl) ??
		pickFirstUrlSameHost(rawGemini, imageKeys, originalUrl)

	const firecrawlOgImage =
		safeHttpUrl(rawFirecrawlMetadata?.ogImage, originalUrl) ??
		safeHttpUrl(rawFirecrawl?.ogImage, originalUrl)

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

	// Prefer images extracted from page content before generic OG images
	const extractedImages: string[] = (() => {
		const arr =
			(Array.isArray((rawExtraction as any)?.images) &&
				((rawExtraction as any).images as unknown[])) ||
			(Array.isArray((raw as any)?.images) &&
				((raw as any).images as unknown[])) ||
			[]
		const out: string[] = []
		for (const u of arr) {
			const s = safeHttpUrl(u as string | undefined, originalUrl)
			if (!s) continue
			if (isSvgOrBadge(s)) continue
			if (!out.includes(s)) out.push(s)
		}
		return out
	})()

	const _preferredFromExtracted =
		extractedImages.find((u) => !isLikelyGeneric(u)) || extractedImages[0]

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

	// For GitHub pages, prefer the official OpenGraph banner
	const preferredGitHubOg = isGitHubHost(originalUrl)
		? [firecrawlOgImage, metadataImage, rawImage, rawDirectImage].find(
				isGitHubOpenGraph,
			)
		: undefined

	const ordered = [
		rawImage,
		firecrawlOgImage,
		rawDirectImage,
		geminiFileUri,
		geminiFileUrl,
		metadataImage,
	].filter(Boolean) as string[]
	const filtered = ordered.filter(
		(u) => !isSvgOrBadge(u) && !isDisallowedBadgeDomain(u),
	)
	const finalPreviewImage =
		preferredGitHubOg ||
		filtered[0] ||
		ordered.find(isGitHubOpenGraph) ||
		metadataImage
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
				"</svg>",
		)

	const XLSX_PLACEHOLDER =
		"data:image/svg+xml;utf8," +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">' +
				'<defs><linearGradient id="gx" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#064e3b"/><stop offset="100%" stop-color="#10b981"/></linearGradient></defs>' +
				'<rect width="100%" height="100%" fill="url(#gx)"/>' +
				'<rect x="24" y="24" width="120" height="32" rx="6" fill="rgba(255,255,255,0.2)"/>' +
				'<text x="40" y="48" font-family="system-ui,Segoe UI,Roboto" font-size="18" fill="#fff" opacity="0.9">Spreadsheet</text>' +
				'<text x="32" y="96" font-family="system-ui,Segoe UI,Roboto" font-size="28" fill="#fff" opacity="0.95">XLSX</text>' +
				"</svg>",
		)

	const WEBAPP_PLACEHOLDER =
		"data:image/svg+xml;utf8," +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400">' +
				'<defs><linearGradient id="gw" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e3a5f"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient></defs>' +
				'<rect width="100%" height="100%" fill="url(#gw)"/>' +
				'<rect x="24" y="24" width="100" height="32" rx="6" fill="rgba(255,255,255,0.2)"/>' +
				'<text x="40" y="48" font-family="system-ui,Segoe UI,Roboto" font-size="18" fill="#fff" opacity="0.9">Web App</text>' +
				'<text x="32" y="96" font-family="system-ui,Segoe UI,Roboto" font-size="28" fill="#fff" opacity="0.95">&lt;/&gt;</text>' +
				'<rect x="32" y="130" width="200" height="8" rx="4" fill="rgba(255,255,255,0.15)"/>' +
				'<rect x="32" y="150" width="160" height="8" rx="4" fill="rgba(255,255,255,0.1)"/>' +
				'<rect x="32" y="170" width="180" height="8" rx="4" fill="rgba(255,255,255,0.1)"/>' +
				"</svg>",
		)

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

	// PDF preview fallback
	if (
		normalizedType.includes("pdf") ||
		(typeof contentType === "string" &&
			contentType.toLowerCase().includes("pdf"))
	) {
		return {
			kind: "image",
			src: finalPreviewImage || PDF_PLACEHOLDER,
			href: originalUrl ?? undefined,
			label: label || "PDF",
		}
	}

	// Spreadsheet (XLSX/Google Sheets) preview fallback
	if (
		normalizedType.includes("sheet") ||
		normalizedType.includes("excel") ||
		(typeof contentType === "string" &&
			(contentType.toLowerCase().includes("spreadsheet") ||
				contentType.toLowerCase().includes("excel") ||
				contentType.toLowerCase().includes("sheet") ||
				contentType
					.toLowerCase()
					.includes(
						"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
					)))
	) {
		return {
			kind: "image",
			src: finalPreviewImage || XLSX_PLACEHOLDER,
			href: originalUrl ?? undefined,
			label: label || "Spreadsheet",
		}
	}

	// Web App (HTML/JS/CSS) preview fallback
	const isWebApp =
		normalizedType.includes("html") ||
		normalizedType.includes("javascript") ||
		normalizedType.includes("typescript") ||
		normalizedType.includes("webapp") ||
		normalizedType.includes("web_app") ||
		(typeof contentType === "string" &&
			(contentType.toLowerCase().includes("text/html") ||
				contentType.toLowerCase().includes("text/javascript") ||
				contentType.toLowerCase().includes("application/javascript") ||
				contentType.toLowerCase().includes("text/typescript") ||
				contentType.toLowerCase().includes("text/css")))

	if (isWebApp) {
		return {
			kind: "image",
			src: finalPreviewImage || WEBAPP_PLACEHOLDER,
			href: originalUrl ?? undefined,
			label: label || "Web App",
		}
	}

	const youtubeUrl =
		safeHttpUrl(rawYoutube?.url) ?? safeHttpUrl(rawYoutube?.embedUrl)
	const youtubeThumbnail = safeHttpUrl(rawYoutube?.thumbnail)

	// IMPORTANT: Check document.previewImage first (from database)
	// This field is set by the backend during ingestion and should take priority
	// NEVER use SVG placeholders - they provide poor UX
	const documentPreviewImage = (() => {
		const url = safeHttpUrl(document.previewImage)
		// Block SVG placeholders - they're generic and provide no value
		if (url?.includes("data:image/svg+xml")) {
			return undefined
		}
		return url
	})()

	const isVideoDocument =
		normalizedType === "video" ||
		contentType?.startsWith("video/") ||
		!!youtubeUrl ||
		(isYouTubeUrl(originalUrl) && !!originalUrl)

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
		}
	}

	// Prioritize database preview_image (set immediately on document creation)
	// This ensures instant preview while full processing happens in background
	if (documentPreviewImage) {
		return {
			kind: "image",
			src: documentPreviewImage,
			href: originalUrl ?? undefined,
			label: label || "Preview",
			isFavicon: isFaviconUrl(documentPreviewImage),
		}
	}

	if (finalPreviewImage) {
		return {
			kind: "image",
			src: finalPreviewImage,
			href: originalUrl ?? undefined,
			label: label || "Preview",
			isFavicon: isFaviconUrl(finalPreviewImage),
		}
	}

	return null
}

interface DocumentCardProps {
	document: DocumentWithMemories
	onRemove?: (document: DocumentWithMemories) => void
	showRemoveButton?: boolean
	onClick?: (document: DocumentWithMemories) => void
	className?: string
	showDragHandle?: boolean
	isDragging?: boolean
	dragHandleProps?: Record<string, unknown>
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
		const colors = getColors()
		const router = useRouter()
		const hasPrefetchedRef = useRef(false)
		const activeMemories = document.memoryEntries.filter((m) => !m.isForgotten)
		const forgottenMemories = document.memoryEntries.filter(
			(m) => m.isForgotten,
		)
		const preview = useMemo(() => getDocumentPreview(document), [document])

		const sanitizedPreview = useMemo(() => {
			if (!preview) return null
			if (preview.src && isInlineSvgDataUrl(preview.src)) {
				if (preview.kind === "video") {
					const fallback =
						getYouTubeThumbnail(document.url ?? undefined) ?? undefined
					if (fallback) return { ...preview, src: fallback } as PreviewData
				}
				return null
			}
			return preview
		}, [preview, document.url])

		const isProcessing = document.status
			? PROCESSING_STATUSES.has(String(document.status).toLowerCase())
			: false

		// Check if this is an optimistic (pending) document
		const isOptimisticDoc = !!(document as any).isOptimistic

		// Check if document is just waiting in queue vs actively processing
		const isQueued = String(document.status ?? "").toLowerCase() === "queued"

		// Check if document finished processing but preview hasn't loaded yet
		const isDone = String(document.status ?? "").toLowerCase() === "done"
		const hasPreviewImage = !!document.previewImage
		const isAwaitingPreview = isDone && !hasPreviewImage && !sanitizedPreview

		// Check if document was recently created (< 10 seconds) - show "Iniciando..." instead of "Na fila"
		const isRecentlyCreated = (() => {
			const createdAt = document.createdAt || (document as any).created_at
			if (!createdAt) return false
			const created = new Date(createdAt).getTime()
			const now = Date.now()
			return now - created < 10000 // Less than 10 seconds
		})()

		// Check if document was recently completed (< 30 seconds) and still loading preview
		const isRecentlyCompleted = (() => {
			if (!isDone) return false
			const updatedAt = (document as any).updatedAt || (document as any).updated_at || document.createdAt
			if (!updatedAt) return false
			const updated = new Date(updatedAt).getTime()
			const now = Date.now()
			return now - updated < 30000 // Less than 30 seconds
		})()

		const [stickyPreview, setStickyPreview] = useState<PreviewData | null>(null)
		const [imageLoaded, setImageLoaded] = useState(false)
		const [imageError, setImageError] = useState(false)
		const [useFallbackImage, setUseFallbackImage] = useState(false)
		const [fallbackImageSrc, setFallbackImageSrc] = useState<string | null>(null)

		// Handler para erro de carregamento de imagem com fallback de galeria
		const handleImageError = useCallback(() => {
			// Tentar fallback de galeria se ainda não tentamos
			if (!useFallbackImage) {
				const galleryImages = extractGalleryImages(document, { limit: 1 })
				const firstImage = galleryImages[0]
				if (firstImage) {
					setUseFallbackImage(true)
					setFallbackImageSrc(firstImage.src)
					setImageError(false) // Reset erro para tentar fallback
					setImageLoaded(false) // Reset loaded para mostrar shimmer
					return
				}
			}

			// Se fallback também falhou ou não há imagens, mantém erro
			setImageError(true)
		}, [document, useFallbackImage])

		useEffect(() => {
			setStickyPreview(null)
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

		const PreviewBadgeIcon = useMemo(() => {
			switch (previewToRender?.kind) {
				case "image":
					return ImageIcon
				case "video":
					return Clapperboard
				case "link":
					return Link2
				default:
					return null
			}
		}, [previewToRender?.kind])

		const stageForStatus = (stRaw: string) => {
			const st = stRaw.toLowerCase()
			switch (st) {
				case "queued":
					return { label: "Queued", from: 2, to: 10, duration: 6000 }
				case "fetching":
				case "extracting":
					return { label: "Extracting", from: 10, to: 40, duration: 12000 }
				case "chunking":
					return { label: "Chunking", from: 40, to: 65, duration: 8000 }
				case "embedding":
				case "processing":
					return { label: "Embedding", from: 65, to: 90, duration: 16000 }
				case "indexing":
					return { label: "Indexing", from: 90, to: 98, duration: 8000 }
				default:
					return { label: "Processing", from: 5, to: 15, duration: 6000 }
			}
		}
		const stageRef = useRef<string>(String(document.status || "unknown"))
		const startRef = useRef<number>(0)
		const [progressPct, setProgressPct] = useState<number>(
			() => stageForStatus(stageRef.current).from,
		)
		const [progressLabel, setProgressLabel] = useState<string>(
			() => stageForStatus(stageRef.current).label,
		)

		useEffect(() => {
			const currentStage = String(document.status || "unknown")
			if (currentStage !== stageRef.current) {
				stageRef.current = currentStage
				const s = stageForStatus(currentStage)
				setProgressLabel(s.label)
				setProgressPct(s.from)
				startRef.current = performance.now()
			}
		}, [document.status, stageForStatus])

		useEffect(() => {
			if (!isProcessing) return
			let rafId = 0
			startRef.current = performance.now()
			const tick = () => {
				const s = stageForStatus(stageRef.current)
				const elapsed = performance.now() - startRef.current
				const t = Math.min(1, elapsed / Math.max(1, s.duration))
				const eased = 1 - (1 - t) ** 3
				const next = s.from + (s.to - s.from) * eased
				setProgressPct(next)
				setProgressLabel(s.label)
				if (t < 1 && isProcessing) rafId = requestAnimationFrame(tick)
			}
			rafId = requestAnimationFrame(tick)
			return () => cancelAnimationFrame(rafId)
		}, [isProcessing, stageForStatus])

		const _getProgressInfo = () => {
			const st = String(document.status || "unknown").toLowerCase()
			switch (st) {
				case "queued":
					return { label: "Queued", pct: 5 }
				case "fetching":
				case "extracting":
					return { label: "Extracting", pct: 25 }
				case "chunking":
					return { label: "Chunking", pct: 50 }
				case "embedding":
				case "processing":
					return { label: "Embedding", pct: 75 }
				case "indexing":
					return { label: "Indexing", pct: 90 }
				default:
					return { label: "Processing", pct: 15 }
			}
		}

		const handlePrefetchEdit = useCallback(() => {
			if (hasPrefetchedRef.current) return
			router.prefetch(`/memory/${document.id}/edit`)
			hasPrefetchedRef.current = true
		}, [router, document.id])

		const handleCardClick = useCallback(() => {
			if (onClick) {
				onClick(document)
			} else {
				router.push(`/memory/${document.id}/edit`)
			}
		}, [onClick, document, router])

		return (
			<Card
				className={cn(
					"h-full w-full p-4 cursor-pointer group relative overflow-hidden border border-border gap-2 rounded-lg bg-card",
					isDragging ? "opacity-50 pointer-events-none" : "transition-all",
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
						className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1.5 rounded-md"
						data-dnd-handle="true"
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
							e.stopPropagation()

							// If document is processing, cancel it via API
							if (isProcessing) {
								try {
									await cancelDocument(document.id)
									console.log(
										`[DocumentCard] Cancelled processing for document ${document.id}`,
									)
								} catch (error) {
									console.error(
										"[DocumentCard] Failed to cancel document:",
										error,
									)
								}
							}

							// Always call onRemove to update UI
							onRemove(document)
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

				{/* Processing overlay - shows different states */}
				{isOptimisticDoc ? (
					/* Optimistic - still sending to backend */
					<div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center pointer-events-none">
						<div className="flex flex-col items-center gap-2">
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
							<div className="text-[11px] text-white/80">Enviando...</div>
						</div>
					</div>
				) : (isAwaitingPreview || (isRecentlyCompleted && !sanitizedPreview)) ? (
					/* Document done but preview not loaded yet */
					<div className="absolute inset-0 z-20 bg-black/40 flex items-center justify-center pointer-events-none">
						<div className="flex flex-col items-center gap-2">
							<svg
								className="animate-spin h-5 w-5 text-white/60"
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
							<div className="text-[11px] text-white/70">Carregando preview...</div>
						</div>
					</div>
				) : isQueued && isRecentlyCreated ? (
					/* Recently created - show "Iniciando..." */
					<div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center pointer-events-none">
						<div className="flex flex-col items-center gap-2">
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
							<div className="text-[11px] text-white/80">Iniciando...</div>
						</div>
					</div>
				) : isQueued ? (
					/* Queued for a while - in backend queue */
					<div className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center pointer-events-none">
						<div className="flex flex-col items-center gap-2">
							{/* Clock icon */}
							<svg
								className="h-5 w-5 text-white/70"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								viewBox="0 0 24 24"
							>
								<circle cx="12" cy="12" r="10" />
								<polyline points="12,6 12,12 16,14" />
							</svg>
							<div className="text-[11px] text-white/80">Na fila</div>
						</div>
					</div>
				) : (
					isProcessing && (
						/* Active processing state */
						<div className="absolute inset-0 z-20 bg-black/60 flex items-end justify-center pb-8 pointer-events-none">
							<div className="flex flex-col items-center gap-2">
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
								<div className="text-[11px] text-white/80">
									{progressLabel} • {Math.floor(progressPct)}%
								</div>
								<div className="h-1 w-24 rounded bg-white/20">
									<div
										className="h-1 rounded bg-white"
										style={{
											width: `${Math.max(0, Math.min(100, progressPct))}%`,
										}}
									/>
								</div>
							</div>
						</div>
					)
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
									const raw = document.title || ""
									const isData = raw.startsWith("data:")
									const cleaned = stripMarkdown(raw)
										.trim()
										.replace(/^['"""''`]+|['"""''`]+$/g, "")
									if (isData || !cleaned) {
										return isProcessing || isOptimisticDoc || isQueued
											? "Processando..."
											: "Sem título"
									}
									return cleaned
								})()}
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
								{previewToRender.src &&
									(previewToRender.isFavicon ? (
										/* Favicon display - smaller and centered */
										<div className="absolute inset-0 flex items-center justify-center z-10">
											<div className="relative w-16 h-16 rounded-xl overflow-hidden shadow-lg ring-1 ring-white/10">
												{previewToRender.src.startsWith("data:") ? (
													<img
														alt={`${previewToRender.label} icon`}
														className="w-full h-full object-contain"
														loading="lazy"
														onError={(e) => {
															const target = e.target as HTMLImageElement
															target.style.display = "none"
														}}
														src={previewToRender.src}
													/>
												) : (
													<Image
														alt={`${previewToRender.label} icon`}
														className="object-contain"
														fill
														onError={(e) => {
															const target = e.target as HTMLImageElement
															target.style.display = "none"
														}}
														priority={false}
														referrerPolicy="no-referrer"
														sizes="64px"
														src={
															proxyImageUrl(previewToRender.src) ||
															previewToRender.src
														}
													/>
												)}
											</div>
										</div>
									) : previewToRender.src.startsWith("data:") ? (
										<img
											alt={`${previewToRender.label} preview`}
											className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] z-10"
											loading="lazy"
											onError={(e) => {
												const target = e.target as HTMLImageElement
												target.style.display = "none"
											}}
											src={previewToRender.src}
										/>
									) : (
										!imageError && (
											<Image
												key={
													useFallbackImage && fallbackImageSrc
														? `fallback-${fallbackImageSrc}`
														: `preview-${previewToRender.src}`
												}
												alt={`${previewToRender.label} preview`}
												className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] z-10"
												fill
												onError={() => handleImageError()}
												onLoad={() => setImageLoaded(true)}
												priority={false}
												referrerPolicy="no-referrer"
												sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
												src={
													useFallbackImage && fallbackImageSrc
														? proxyImageUrl(fallbackImageSrc) ||
															fallbackImageSrc
														: proxyImageUrl(previewToRender.src) ||
															previewToRender.src
												}
											/>
										)
									))}
								<div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/45 z-20" />
								{previewToRender.kind === "video" && (
									<div className="absolute inset-0 flex items-center justify-center">
										<div className="rounded-full border border-white/40 bg-black/40 p-2 backdrop-blur-sm">
											<Play className="h-5 w-5 text-white" />
										</div>
									</div>
								)}
								{PreviewBadgeIcon && !previewToRender.isFavicon && (
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
						const displayText = getDocumentSnippet(document)

						return (
							displayText &&
							!displayText.startsWith("data:") && (
								<MarkdownContent
									className="text-xs line-clamp-6 mb-3"
									content={displayText}
									style={{ color: colors.text.muted }}
								/>
							)
						)
					})()}

					{(() => {
						const raw = (document as any)?.metadata
						const tagStr =
							typeof raw?.aiTagsString === "string"
								? raw.aiTagsString
								: undefined
						if (!tagStr) return null

						const isValidTag = (t: string): boolean => {
							if (!t || t.length < 2 || t.length > 30) return false
							// Filter tags that look like URL parts or repo names
							if (t.startsWith("/") || t.endsWith(":") || t.endsWith("/"))
								return false
							// Filter tags with only special characters
							if (/^[^a-z0-9]+$/i.test(t)) return false
							// Filter common URL/path fragments
							if (/^(http|https|www|com|org|io|github|hugging)$/i.test(t))
								return false
							return true
						}

						const tags: string[] = tagStr
							.split(/[,\n]+/)
							.map((t: string) => t.trim().toLowerCase())
							.filter(isValidTag)

						// Deduplicate tags
						const uniqueTags = Array.from(new Set(tags))
						if (!uniqueTags.length) return null
						const show = uniqueTags.slice(0, 4)
						const remaining = uniqueTags.length - show.length
						return (
							<div className="mb-2 flex flex-wrap gap-1">
								{show.map((t) => (
									<span
										className="px-1.5 py-0.5 text-[10px] rounded border"
										key={t}
										style={{
											borderColor: "rgba(255, 255, 255, 0.12)",
											color: colors.text.muted,
											backgroundColor: "rgba(255,255,255,0.03)",
										}}
									>
										{t}
									</span>
								))}
								{remaining > 0 && (
									<span
										className="px-1.5 py-0.5 text-[10px] rounded border"
										style={{
											borderColor: "rgba(255, 255, 255, 0.08)",
											color: colors.text.muted,
											backgroundColor: "rgba(255,255,255,0.02)",
										}}
									>
										+{remaining}
									</span>
								)}
							</div>
						)
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
												onRemove(document)
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
		)
	},
)

DocumentCard.displayName = "DocumentCard"
