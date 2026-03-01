"use client"

import { $fetch } from "@lib/api"
import { BACKEND_URL } from "@lib/env"
import { cn } from "@lib/utils"
import { DEFAULT_PROJECT_ID } from "@repo/lib/constants"
import { Button } from "@repo/ui/components/button"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@repo/ui/components/collapsible"
import {
	ArrowLeft,
	Brain,
	Calendar,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Download,
	ExternalLink,
	FileText,
	Link as LinkIcon,
	Play,
	X,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ChatRewrite } from "@/components/views/chat"
import type { DocumentWithMemories } from "@/lib/types/document"
import { TweetCard } from "@/components/content-cards/tweet"
import { useChatMentionQueue } from "@/stores"
import { formatDate, getDocumentSnippet, stripMarkdown } from "../memories"
import { RelatedDocumentsPanel } from "../memories/related-documents-panel"
import { LazyImageGallery } from "./lazy-components"
import { DocumentAttachments } from "./document-attachments"
import { DocumentProjectTransfer } from "./document-project-transfer"

const _LazyMemoryEntriesSidebar = dynamic(
	() =>
		import("./memory-entries-sidebar").then((mod) => mod.MemoryEntriesSidebar),
	{
		ssr: false,
		loading: () => null,
	},
)

const _LazyRichEditorWrapper = dynamic(
	() => import("./rich-editor-wrapper").then((mod) => mod.RichEditorWrapper),
	{
		ssr: false,
		loading: () => null,
	},
)

// Helper functions to extract images from document
type BaseRecord = Record<string, unknown>

const asRecord = (value: unknown): BaseRecord | null => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null
	return value as BaseRecord
}

const safeHttpUrl = (value: unknown, baseUrl?: string): string | undefined => {
	if (typeof value !== "string") return undefined
	const trimmed = value.trim()
	if (!trimmed) return undefined
	if (trimmed.startsWith("data:image/")) return trimmed
	try {
		const url = new URL(trimmed)
		if (url.protocol === "http:" || url.protocol === "https:")
			return url.toString()
	} catch {
		if (baseUrl) {
			try {
				const url = new URL(trimmed, baseUrl)
				if (url.protocol === "http:" || url.protocol === "https:")
					return url.toString()
			} catch {}
		}
	}
	return undefined
}

const isYouTubeUrl = (value?: string): boolean => {
	if (!value) return false
	try {
		const parsed = new URL(value)
		const host = parsed.hostname.toLowerCase()
		return host.includes("youtube.com") || host.includes("youtu.be")
	} catch {
		return false
	}
}

const getYouTubeVideoId = (value?: string): string | undefined => {
	if (!value) return undefined
	try {
		const parsed = new URL(value)
		if (parsed.hostname.includes("youtu.be")) {
			return parsed.pathname.replace(/^\//, "") || undefined
		}
		if (parsed.searchParams.has("v")) {
			return parsed.searchParams.get("v") ?? undefined
		}
	} catch {}
	return undefined
}

const getYouTubeThumbnail = (value?: string): string | undefined => {
	const videoId = getYouTubeVideoId(value)
	if (videoId) return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
	return undefined
}

// Domains that are safe and don't need proxying
const SAFE_DOMAINS = [
	"localhost",
	"127.0.0.1",
	"kortix.ai",
	"kortix.com",
	"img.youtube.com",
	"i.ytimg.com",
	"cloudflare.com",
	"cdnjs.cloudflare.com",
	"unpkg.com",
	"jsdelivr.net",
	// Supabase Storage (persisted preview images)
	"supabase.co",
]

const proxyImageUrl = (url: string | undefined | null): string | undefined => {
	if (!url) return undefined
	if (url.startsWith("data:")) return url
	if (!url.startsWith("http://") && !url.startsWith("https://")) return url
	try {
		const parsed = new URL(url)
		// Always proxy plain HTTP images to avoid CSP/mixed-content issues.
		if (parsed.protocol === "http:") {
			return `/api/image-proxy?url=${encodeURIComponent(url)}`
		}
		const hostname = parsed.hostname.toLowerCase()
		// Only skip proxying for safe domains
		const isSafe = SAFE_DOMAINS.some(
			(domain) => hostname === domain || hostname.endsWith(`.${domain}`),
		)
		if (isSafe) return url
		// Proxy all other external images
		return `/api/image-proxy?url=${encodeURIComponent(url)}`
	} catch {
		return url
	}
}

const extractDocumentImages = (
	document: DocumentWithMemories,
): { mainImage: string | null; relatedImages: string[] } => {
	const metadata = asRecord(document.metadata)
	const raw = asRecord((document as any).raw)
	const rawExtraction = asRecord(raw?.extraction)
	const rawFirecrawl =
		asRecord(raw?.firecrawl) ?? asRecord(rawExtraction?.firecrawl)
	const rawFirecrawlMetadata = asRecord(rawFirecrawl?.metadata) ?? rawFirecrawl

	const documentPreviewImage =
		(document as any).previewImage ?? (document as any).preview_image

	const originalUrl =
		safeHttpUrl(metadata?.originalUrl) ??
		safeHttpUrl((metadata as any)?.source_url) ??
		safeHttpUrl(document.url)

	// Collect all possible images
	const allImages: string[] = []
	const seen = new Set<string>()

	const addImage = (src: string | undefined | null) => {
		if (!src || seen.has(src)) return
		// Skip badges, shields, and avatars (but NOT GitHub content images)
		const lower = src.toLowerCase()
		if (
			lower.includes("badge") ||
			lower.includes("shields.io") ||
			lower.includes("avatars.githubusercontent.com") ||
			lower.includes("gravatar.com") ||
			lower.includes("pbs.twimg.com/profile") ||
			lower.includes("/avatar/") ||
			lower.includes("/avatars/") ||
			lower.includes("profile_images") ||
			// Skip small icons
			lower.endsWith(".ico")
		)
			return
		seen.add(src)
		allImages.push(src)
	}

	// Document preview image (highest priority)
	if (typeof documentPreviewImage === "string") {
		addImage(safeHttpUrl(documentPreviewImage, originalUrl))
	}

	// OpenGraph images
	const imageKeys = [
		"ogImage",
		"og_image",
		"twitterImage",
		"twitter_image",
		"previewImage",
		"preview_image",
		"image",
		"thumbnail",
	]
	for (const key of imageKeys) {
		addImage(safeHttpUrl(metadata?.[key], originalUrl))
		addImage(safeHttpUrl(rawExtraction?.[key], originalUrl))
		addImage(safeHttpUrl(rawFirecrawlMetadata?.[key], originalUrl))
	}

	// YouTube thumbnail
	if (isYouTubeUrl(originalUrl)) {
		addImage(getYouTubeThumbnail(originalUrl))
	}

	// Extraction images array
	const extractionImages = Array.isArray((rawExtraction as any)?.images)
		? (rawExtraction as any).images
		: []
	for (const img of extractionImages) {
		addImage(safeHttpUrl(img, originalUrl))
	}

	// Memory entry images
	for (const entry of document.memoryEntries) {
		const meta = asRecord(entry.metadata)
		if (!meta) continue
		const images = Array.isArray(meta.images) ? meta.images : []
		for (const img of images) {
			if (typeof img === "string") addImage(safeHttpUrl(img, originalUrl))
			else if (typeof img === "object" && img !== null && "url" in img) {
				addImage(safeHttpUrl((img as any).url, originalUrl))
			}
		}
		const thumbs = Array.isArray((meta as any).thumbnails)
			? (meta as any).thumbnails
			: []
		for (const thumb of thumbs) {
			if (typeof thumb === "string") addImage(safeHttpUrl(thumb, originalUrl))
		}
	}

	const mainImage = allImages[0] ?? null
	const relatedImages = allImages.slice(1)

	return { mainImage, relatedImages }
}

type BundleChild = {
	id: string
	title: string | null
	previewImage: string | null
	summary: string | null
	status?: string
	url: string | null
	type?: string
	content: string | null
	childOrder?: number
}

function BundleCarousel({ children }: { children: BundleChild[] }) {
	const [activeIndex, setActiveIndex] = useState(0)
	const child = children[activeIndex]
	if (!child) return null

	const prev = () => setActiveIndex((i) => (i > 0 ? i - 1 : children.length - 1))
	const next = () => setActiveIndex((i) => (i < children.length - 1 ? i + 1 : 0))

	return (
		<div className="relative rounded-2xl overflow-hidden bg-muted">
			{/* Preview image */}
			{child.previewImage ? (
				<img
					alt={child.title ?? "Preview"}
					className="w-full object-cover max-h-[40vh]"
					referrerPolicy="no-referrer"
					src={proxyImageUrl(child.previewImage) || child.previewImage}
				/>
			) : (
				<div className="w-full h-32 flex items-center justify-center bg-muted/50">
					<FileText className="h-8 w-8 text-muted-foreground/40" />
				</div>
			)}

			{/* Overlay with title/summary */}
			<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
				<p className="text-sm font-medium text-white line-clamp-1">
					{child.title || child.url || "Untitled"}
				</p>
				{child.summary && (
					<p className="text-xs text-white/70 line-clamp-2 mt-0.5">
						{child.summary}
					</p>
				)}
			</div>

			{/* Navigation arrows */}
			{children.length > 1 && (
				<>
					<button
						className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 rounded-full p-1.5 text-white transition-colors"
						onClick={prev}
						type="button"
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<button
						className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 rounded-full p-1.5 text-white transition-colors"
						onClick={next}
						type="button"
					>
						<ChevronRight className="h-4 w-4" />
					</button>
				</>
			)}

			{/* Dot indicators */}
			{children.length > 1 && (
				<div className="absolute bottom-14 left-0 right-0 flex justify-center gap-1.5">
					{children.map((_, i) => (
						<button
							key={i}
							className={cn(
								"w-2 h-2 rounded-full transition-all",
								i === activeIndex
									? "bg-white scale-110"
									: "bg-white/40 hover:bg-white/60",
							)}
							onClick={() => setActiveIndex(i)}
							type="button"
						/>
					))}
				</div>
			)}
		</div>
	)
}

interface MemoryEditClientProps {
	document: DocumentWithMemories
}

export function MemoryEditClient({
	document: initialDocument,
}: MemoryEditClientProps) {
	const router = useRouter()
	const { enqueue } = useChatMentionQueue()

	const [activeProjectTag, setActiveProjectTag] = useState<string>(
		initialDocument.containerTags?.[0] ?? DEFAULT_PROJECT_ID,
	)

	useEffect(() => {
		const projectTag = initialDocument.containerTags?.[0] ?? DEFAULT_PROJECT_ID
		setActiveProjectTag(projectTag)
	}, [initialDocument.id, initialDocument.containerTags])

	const document = useMemo(
		() => ({
			...initialDocument,
			containerTags:
				activeProjectTag !== undefined && activeProjectTag !== null
					? [activeProjectTag]
					: (initialDocument.containerTags ?? []),
		}),
		[initialDocument, activeProjectTag],
	)

	useEffect(() => {
		enqueue([document.id])
	}, [document.id, enqueue])

	const [isContentOpen, setIsContentOpen] = useState(false)
	const [isDesktopLayout, setIsDesktopLayout] = useState(false)

	// Bundle: fetch children when document is a bundle
	const isBundle = document.type === "bundle"
	const { data: bundleChildren } = useQuery({
		queryKey: ["document-children", document.id],
		queryFn: async () => {
			const res = await $fetch(`@get/documents/${document.id}/children`)
			return (res.data as any)?.children ?? []
		},
		enabled: isBundle,
	})

	useEffect(() => {
		if (typeof window === "undefined") return
		const mediaQuery = window.matchMedia("(min-width: 1024px)")
		const handleChange = () => setIsDesktopLayout(mediaQuery.matches)
		handleChange()

		if (typeof mediaQuery.addEventListener === "function") {
			mediaQuery.addEventListener("change", handleChange)
			return () => mediaQuery.removeEventListener("change", handleChange)
		}

		mediaQuery.addListener(handleChange)
		return () => mediaQuery.removeListener(handleChange)
	}, [])

	const documentTitle = (() => {
		const raw = document.title || ""
		const cleaned = stripMarkdown(raw)
			.trim()
			.replace(/^['"""''`]+|['"""''`]+$/g, "")
		return !cleaned || raw.startsWith("data:") ? "Untitled document" : cleaned
	})()

	// Extract main image for header
	const { mainImage } = useMemo(
		() => extractDocumentImages(document),
		[document],
	)

	const documentSnippet = useMemo(
		() => getDocumentSnippet(document),
		[document],
	)
	const activeMemories = document.memoryEntries.filter((m) => !(m as any).isForgotten)
	const sourceUrl =
		document.url ||
		(document.metadata as any)?.originalUrl ||
		(document.metadata as any)?.source_url
	const isVideo = isYouTubeUrl(sourceUrl) || document.type === "video"
	const youtubeVideoId = getYouTubeVideoId(sourceUrl)
	const [isPlayingVideo, setIsPlayingVideo] = useState(false)
	const [isVideoOutOfView, setIsVideoOutOfView] = useState(false)
	const [pipDismissed, setPipDismissed] = useState(false)
	const videoContainerRef = useRef<HTMLDivElement>(null)

	// IntersectionObserver for PiP mode
	useEffect(() => {
		if (!isPlayingVideo || !videoContainerRef.current) return
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0]
				if (entry) setIsVideoOutOfView(!entry.isIntersecting)
			},
			{ threshold: 0.3 },
		)
		observer.observe(videoContainerRef.current)
		return () => observer.disconnect()
	}, [isPlayingVideo])

	// Reset PiP dismissed when video stops or changes
	useEffect(() => {
		setPipDismissed(false)
	}, [isPlayingVideo, youtubeVideoId])

	const showPip = isPlayingVideo && isVideoOutOfView && !pipDismissed && youtubeVideoId

	// Check if this is a tweet with raw data
	const rawDoc = asRecord((document as any).raw)
	const rawTweet = rawDoc?.tweet
	const isTweet =
		document.type === "tweet" ||
		(document.metadata as any)?.type === "tweet"
	const hasTweetData = isTweet && rawTweet

	// Document context for chat (image + metadata only)
	const chatDocumentContext = (
		<>
			{/* Bundle carousel */}
			{isBundle && bundleChildren && bundleChildren.length > 0 && (
				<BundleCarousel children={bundleChildren as BundleChild[]} />
			)}

			{/* Tweet card - rich rendering */}
			{!isBundle && hasTweetData && (
				<div className="flex justify-center rounded-2xl overflow-hidden">
					<TweetCard
						data={rawTweet as any}
						activeMemories={activeMemories}
					/>
				</div>
			)}

			{/* Main image / Video player (skip for tweets and bundles) */}
			{!isBundle && !hasTweetData && mainImage && (
				<div ref={isVideo ? videoContainerRef : undefined} className="relative rounded-xl overflow-hidden bg-muted group">
					{isVideo && isPlayingVideo && youtubeVideoId ? (
						<div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
							<iframe
								allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
								allowFullScreen
								className="absolute inset-0 w-full h-full"
								src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1`}
								title={documentTitle}
							/>
						</div>
					) : (
						<>
								<img
									alt={documentTitle}
									className="w-full h-[38vh] object-contain transition-transform duration-500"
									referrerPolicy="no-referrer"
									src={proxyImageUrl(mainImage) || mainImage}
									onError={(e) => {
									const target = e.currentTarget
									const originalUrl = mainImage
									if (target.src !== originalUrl) {
										target.src = originalUrl
									}
								}}
							/>
							{/* Video play overlay */}
							{isVideo && youtubeVideoId && (
								<button
									className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
									onClick={() => setIsPlayingVideo(true)}
									type="button"
								>
									<span className="rounded-full bg-white/90 p-3 shadow-lg hover:bg-white transition-colors">
										<Play className="h-6 w-6 text-black fill-black" />
									</span>
								</button>
							)}
						</>
					)}
				</div>
			)}

			{/* Document details */}
			<div className="space-y-3 px-1">
				{/* Metadata row */}
				<div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
					{document.createdAt && (
						<span className="flex items-center gap-1.5">
							<Calendar className="h-4 w-4" />
							{formatDate(document.createdAt)}
						</span>
					)}
					{document.type && (
						<span className="flex items-center gap-1.5">
							<FileText className="h-4 w-4" />
							{document.type}
						</span>
					)}
					{activeMemories.length > 0 && (
						<span className="flex items-center gap-1.5">
							<Brain className="h-4 w-4" />
							{activeMemories.length}{" "}
							{activeMemories.length === 1 ? "memory" : "memories"}
						</span>
					)}
				</div>

				{/* Source URL */}
				{sourceUrl && (
					<a
						className="flex items-center gap-2 text-sm text-primary hover:underline truncate"
						href={sourceUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						<LinkIcon className="h-4 w-4 flex-shrink-0" />
						<span className="truncate">{sourceUrl}</span>
						<ExternalLink className="h-3 w-3 flex-shrink-0" />
					</a>
				)}

				{/* Description/snippet (markdown, collapsible) */}
				{documentSnippet && !documentSnippet.startsWith("data:") && (
					<Collapsible>
						<CollapsibleTrigger asChild>
							<button
								className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
								type="button"
							>
								<ChevronDown className="h-3 w-3 transition-transform duration-200 data-[state=open]:rotate-180" />
								<span>Resumo do conteúdo</span>
							</button>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<div className="mt-2 max-h-64 overflow-y-auto">
								<div className="prose prose-sm prose-invert max-w-none prose-headings:mb-2 prose-headings:mt-1 prose-p:my-1.5 prose-strong:text-foreground prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:text-foreground prose-code:bg-muted">
									<ReactMarkdown
										components={{
											h1: ({ node, ...props }) => (
												<h3
													className="text-base font-semibold text-primary leading-snug"
													{...props}
												/>
											),
											h2: ({ node, ...props }) => (
												<h4
													className="text-sm font-semibold text-primary/90 leading-snug"
													{...props}
												/>
											),
											h3: ({ node, ...props }) => (
												<h5
													className="text-sm font-semibold text-primary/80 leading-snug"
													{...props}
												/>
											),
										}}
										remarkPlugins={[remarkGfm]}
									>
										{documentSnippet}
									</ReactMarkdown>
								</div>
							</div>
						</CollapsibleContent>
					</Collapsible>
				)}
			</div>
		</>
	)

	const originalContent = document.content || ""
	const documentMetadata = asRecord(document.metadata)
	const agentGeneratedMarkdown = (() => {
		const enriched = documentMetadata?.agentGeneratedMarkdown
		if (typeof enriched === "string" && enriched.trim().length > 0) {
			return enriched
		}
		const raw = documentMetadata?.agentGeneratedMarkdownRaw
		if (typeof raw === "string" && raw.trim().length > 0) {
			return raw
		}
		return ""
	})()

	const handleDownloadMarkdown = useCallback(() => {
		const slug = (document.title || "content")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "")
			.slice(0, 48)
		const blob = new Blob([originalContent], { type: "text/markdown;charset=utf-8" })
		const href = URL.createObjectURL(blob)
		const a = globalThis.document.createElement("a")
		a.href = href
		a.download = `${slug}.md`
		a.click()
		URL.revokeObjectURL(href)
	}, [originalContent, document.title])

	const handleDownloadAgentMarkdown = useCallback(() => {
		if (!agentGeneratedMarkdown) return
		const slug = (document.title || "agent-markdown")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "")
			.slice(0, 48)
		const blob = new Blob([agentGeneratedMarkdown], {
			type: "text/markdown;charset=utf-8",
		})
		const href = URL.createObjectURL(blob)
		const a = globalThis.document.createElement("a")
		a.href = href
		a.download = `${slug}-agent.md`
		a.click()
		URL.revokeObjectURL(href)
	}, [agentGeneratedMarkdown, document.title])

	// Content for right panel (original content + related docs)
	const rightPanelContent = (
		<>
			{/* Bundle: per-child collapsibles */}
			{isBundle && bundleChildren && bundleChildren.length > 0 ? (
				<div className="space-y-3">
					{(bundleChildren as BundleChild[]).map((child, i) => (
						<Collapsible key={child.id}>
							<CollapsibleTrigger asChild>
								<button
									className="flex w-full items-center justify-between rounded-2xl border border-border/50 bg-card px-5 py-4 text-left text-foreground transition hover:border-border hover:bg-card/80 group"
									type="button"
								>
									<div className="flex items-center gap-2 flex-1 min-w-0">
										<span className="text-xs text-muted-foreground font-mono">{i + 1}.</span>
										<span className="text-sm font-semibold truncate">
											{child.title || child.url || "Untitled"}
										</span>
										{child.url && (
											<a
												className="flex-shrink-0 text-muted-foreground hover:text-primary"
												href={child.url}
												onClick={(e) => e.stopPropagation()}
												rel="noopener noreferrer"
												target="_blank"
											>
												<ExternalLink className="h-3 w-3" />
											</a>
										)}
									</div>
									<ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<div className="mt-2 rounded-2xl border border-border/50 bg-card overflow-hidden">
									<div className="max-h-[40vh] overflow-y-auto px-4 py-3">
										{child.content ? (
											<div className={cn(
												"prose prose-xs dark:prose-invert max-w-none",
												"prose-p:text-[11px] prose-p:leading-[1.6] prose-p:text-muted-foreground",
												"prose-headings:font-medium",
												"prose-h1:text-sm prose-h2:text-[13px] prose-h3:text-xs",
												"prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
											)}>
												<ReactMarkdown remarkPlugins={[remarkGfm]}>
													{child.content}
												</ReactMarkdown>
											</div>
										) : child.summary ? (
											<p className="text-xs text-muted-foreground">{child.summary}</p>
										) : (
											<p className="text-xs text-muted-foreground/60 italic">
												{child.status === "done" ? "Sem conteúdo." : "Processando..."}
											</p>
										)}
									</div>
								</div>
							</CollapsibleContent>
						</Collapsible>
					))}
				</div>
			) : (
				/* Original content collapsible (non-bundle) */
				<div className="space-y-2">
					{agentGeneratedMarkdown ? (
						<Collapsible>
							<CollapsibleTrigger asChild>
								<button
									className="flex w-full items-center justify-between px-1 py-2 text-left text-foreground transition hover:text-foreground/80"
									type="button"
								>
									<span className="text-sm font-semibold">Markdown do agente</span>
									<ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 data-[state=open]:rotate-180" />
								</button>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<div className="flex items-center justify-end px-1 py-1">
									<button
										className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground"
										onClick={(e) => {
											e.stopPropagation()
											handleDownloadAgentMarkdown()
										}}
										title="Download markdown do agente"
										type="button"
									>
										<Download className="h-3.5 w-3.5" />
										<span>.md</span>
									</button>
								</div>
								<div className="h-[40vh] min-h-[220px] max-h-[460px] overflow-y-auto px-1 py-2">
									<div className={cn(
										"prose prose-xs dark:prose-invert max-w-none",
										"prose-headings:font-medium prose-headings:tracking-tight",
										"prose-h1:text-sm prose-h2:text-[13px] prose-h3:text-xs",
										"prose-p:text-[11px] prose-p:leading-[1.6] prose-p:text-muted-foreground",
										"prose-li:text-[11px] prose-li:text-muted-foreground prose-li:leading-[1.6]",
										"prose-blockquote:text-[11px] prose-blockquote:text-muted-foreground/80 prose-blockquote:border-border/40",
										"prose-code:text-[10px] prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
										"prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/30 prose-pre:rounded-lg prose-pre:text-[10px]",
										"prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
										"prose-strong:text-foreground/90",
										"prose-hr:border-border/30",
									)}>
										<ReactMarkdown remarkPlugins={[remarkGfm]}>
											{agentGeneratedMarkdown}
										</ReactMarkdown>
									</div>
								</div>
							</CollapsibleContent>
						</Collapsible>
					) : null}

					<Collapsible onOpenChange={setIsContentOpen} open={isContentOpen}>
						<CollapsibleTrigger asChild>
							<button
								className="flex w-full items-center justify-between px-1 py-2 text-left text-foreground transition hover:text-foreground/80"
								type="button"
							>
								<span className="text-sm font-semibold">Conteúdo original</span>
								<ChevronDown
									className={cn(
										"h-4 w-4 text-muted-foreground transition-transform duration-200",
										isContentOpen ? "rotate-180" : "",
									)}
								/>
							</button>
						</CollapsibleTrigger>
						<AnimatePresence initial={false}>
							{isContentOpen && (
								<CollapsibleContent asChild>
									<motion.div
										animate={{ opacity: 1, height: "auto" }}
										exit={{ opacity: 0, height: 0 }}
										initial={{ opacity: 0, height: 0 }}
										transition={{ duration: 0.2 }}
									>
										{/* Toolbar */}
										<div className="flex items-center justify-end px-1 py-1">
											<button
												className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground transition hover:text-foreground"
												onClick={(e) => {
													e.stopPropagation()
													handleDownloadMarkdown()
												}}
												title="Download .md"
												type="button"
											>
												<Download className="h-3.5 w-3.5" />
												<span>.md</span>
											</button>
										</div>

										{/* Markdown content */}
										<div className="h-[48vh] min-h-[280px] max-h-[520px] overflow-y-auto px-1 py-2">
											{originalContent ? (
												<div className={cn(
													"prose prose-xs dark:prose-invert max-w-none",
													"prose-headings:font-medium prose-headings:tracking-tight",
													"prose-h1:text-sm prose-h2:text-[13px] prose-h3:text-xs",
													"prose-p:text-[11px] prose-p:leading-[1.6] prose-p:text-muted-foreground",
													"prose-li:text-[11px] prose-li:text-muted-foreground prose-li:leading-[1.6]",
													"prose-blockquote:text-[11px] prose-blockquote:text-muted-foreground/80 prose-blockquote:border-border/40",
													"prose-code:text-[10px] prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded",
													"prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/30 prose-pre:rounded-lg prose-pre:text-[10px]",
													"prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
													"prose-strong:text-foreground/90",
													"prose-hr:border-border/30",
												)}>
													<ReactMarkdown
														components={{
															h1: ({ node, ...props }) => <h1 className="text-sm font-medium tracking-tight mb-2 mt-3 first:mt-0 text-foreground" {...props} />,
															h2: ({ node, ...props }) => <h2 className="text-[13px] font-medium tracking-tight mb-1.5 mt-2.5 first:mt-0 text-foreground" {...props} />,
															h3: ({ node, ...props }) => <h3 className="text-xs font-medium mb-1.5 mt-2 first:mt-0 text-foreground" {...props} />,
														}}
														remarkPlugins={[remarkGfm]}
													>
														{originalContent}
													</ReactMarkdown>
												</div>
											) : (
												<p className="text-sm text-muted-foreground/60 italic">
													Sem conteúdo original disponível.
												</p>
											)}
										</div>
									</motion.div>
								</CollapsibleContent>
							)}
						</AnimatePresence>
					</Collapsible>
				</div>
			)}

			{/* Document attachments */}
			<DocumentAttachments documentId={document.id} />

			{/* Related documents panel */}
			<RelatedDocumentsPanel document={document} />

			{/* Image gallery from extracted content */}
			<LazyImageGallery document={document as any} />
		</>
	)

	return (
		<div className="relative h-screen bg-background overflow-hidden">
			<motion.div className="flex h-full flex-col">
				{/* Minimal header */}
				<header className="flex items-center gap-2 px-3 h-10 border-b border-border/20">
					<Button
						aria-label="Voltar"
						asChild
						className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50"
						size="icon"
						variant="ghost"
					>
						<Link href="/">
							<ArrowLeft className="h-3 w-3" />
						</Link>
					</Button>
					<div className="flex-1" />
					<DocumentProjectTransfer
						currentProject={document.containerTags?.[0]}
						documentId={document.id}
						onProjectChanged={setActiveProjectTag}
					/>
				</header>

				{/* Main content - Chat with document integrated + gallery panel */}
				<main className="flex-1 overflow-hidden flex">
					{/* Left column - Chat with document context */}
					<div className="flex-1 min-w-0 flex flex-col">
						<ChatRewrite
							contextDocumentData={{
								id: document.id,
								title: document.title ?? null,
								content: document.content ?? null,
							}}
							documentContext={chatDocumentContext}
							documentId={document.id}
							embedded
						/>
					</div>

					{/* Right panel - Original content + Related images */}
					<motion.div
						animate={{ width: isDesktopLayout ? "35vw" : "0px" }}
						className="hidden lg:flex flex-col shrink-0 border-l border-border/30 bg-background/50"
						transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
					>
						<div className="flex-1 overflow-y-auto p-4 space-y-6">
							{/* Original content + Related documents */}
							{rightPanelContent}

						</div>
					</motion.div>
				</main>
			</motion.div>

			{/* PiP floating video player */}
			<AnimatePresence>
				{showPip && (
					<motion.div
						animate={{ opacity: 1, scale: 1, y: 0 }}
						className="fixed bottom-4 right-4 z-50 rounded-xl overflow-hidden shadow-2xl shadow-black/50 border border-white/10"
						exit={{ opacity: 0, scale: 0.8, y: 20 }}
						initial={{ opacity: 0, scale: 0.8, y: 20 }}
						style={{ width: 320, aspectRatio: "16/9" }}
						transition={{ duration: 0.2 }}
					>
						<iframe
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
							allowFullScreen
							className="w-full h-full"
							src={`https://www.youtube.com/embed/${youtubeVideoId}?autoplay=1`}
							title={documentTitle}
						/>
						<button
							className="absolute top-1.5 right-1.5 rounded-full bg-black/70 hover:bg-black/90 p-1 text-white/80 hover:text-white transition-colors"
							onClick={() => setPipDismissed(true)}
							type="button"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}
