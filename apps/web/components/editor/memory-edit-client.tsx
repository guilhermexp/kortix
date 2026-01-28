"use client"

import { useIsMobile } from "@hooks/use-mobile"
import { BACKEND_URL } from "@lib/env"
import { useDeleteDocument } from "@lib/queries"
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
	ExternalLink,
	FileText,
	Link as LinkIcon,
	Loader2,
	MessageSquare,
	Play,
	Sparkles,
	X,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ChatRewrite } from "@/components/views/chat"
import type { DocumentWithMemories } from "@/lib/types/document"
import { useChatMentionQueue, useChatOpen, useProject } from "@/stores"
import { useCanvasSelection } from "@/stores/canvas"
import { formatDate, getDocumentSnippet, stripMarkdown } from "../memories"
import { RelatedDocumentsPanel } from "../memories/related-documents-panel"
import { DocumentProjectTransfer } from "./document-project-transfer"

const _LazyMemoryEntriesSidebar = dynamic(
	() =>
		import("./memory-entries-sidebar").then((mod) => mod.MemoryEntriesSidebar),
	{
		ssr: false,
		loading: () => null,
	},
)

const LazyRichEditorWrapper = dynamic(
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

const getYouTubeThumbnail = (value?: string): string | undefined => {
	if (!value) return undefined
	try {
		const parsed = new URL(value)
		let videoId: string | undefined
		if (parsed.hostname.includes("youtu.be")) {
			videoId = parsed.pathname.replace(/^\//, "") || undefined
		} else if (parsed.searchParams.has("v")) {
			videoId = parsed.searchParams.get("v") ?? undefined
		}
		if (videoId)
			return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
	} catch {}
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
]

const proxyImageUrl = (url: string | undefined | null): string | undefined => {
	if (!url) return undefined
	if (url.startsWith("data:")) return url
	if (!url.startsWith("http://") && !url.startsWith("https://")) return url
	try {
		const parsed = new URL(url)
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
	const raw = asRecord(document.raw)
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

// Type for related links from backend
type RelatedLink = {
	title: string
	url: string
	image?: string | null
	favicon?: string | null
	snippet?: string | null
	type: "repository" | "tool" | "framework" | "website" | "video" | "article"
	mentionedAs: string
	isAlternative?: boolean
}

const extractRelatedLinks = (document: DocumentWithMemories): RelatedLink[] => {
	const raw = asRecord(document.raw)
	if (!raw) return []

	const relatedLinks = raw.relatedLinks
	if (!Array.isArray(relatedLinks)) return []

	return relatedLinks.filter(
		(link): link is RelatedLink =>
			link &&
			typeof link === "object" &&
			typeof link.title === "string" &&
			typeof link.url === "string",
	)
}

const getTypeBadge = (link: RelatedLink) => {
	if (link.isAlternative) {
		return "Alternativa"
	}
	const labels: Record<RelatedLink["type"], string> = {
		repository: "Repo",
		tool: "Tool",
		framework: "Framework",
		website: "Site",
		video: "Video",
		article: "Article",
	}
	return labels[link.type] || "Link"
}

interface MemoryEditClientProps {
	document: DocumentWithMemories
}

export function MemoryEditClient({
	document: initialDocument,
}: MemoryEditClientProps) {
	const isMobile = useIsMobile()
	const { isOpen, setIsOpen } = useChatOpen()
	const { selectedProject } = useProject()
	const router = useRouter()
	const deleteDocumentMutation = useDeleteDocument(selectedProject)
	const [isDeleting, setIsDeleting] = useState(false)
	const { enqueue } = useChatMentionQueue()
	const { scopedDocumentIds, setScopedDocumentIds, clearScope } =
		useCanvasSelection()
	const initialScopeRef = useRef<string[] | null>(null)

	const [activeProjectTag, setActiveProjectTag] = useState<string>(
		initialDocument.containerTags?.[0] ?? DEFAULT_PROJECT_ID,
	)

	// Related links state
	const [isLoadingRelatedLinks, setIsLoadingRelatedLinks] = useState(false)
	const [relatedLinksError, setRelatedLinksError] = useState<string | null>(
		null,
	)

	// Hidden items (local state for deletion)
	const [hiddenImages, setHiddenImages] = useState<Set<string>>(new Set())
	const [hiddenLinks, setHiddenLinks] = useState<Set<string>>(new Set())

	useEffect(() => {
		const projectTag = initialDocument.containerTags?.[0] ?? DEFAULT_PROJECT_ID
		console.log("[MemoryEditClient] Document project info:", {
			documentId: initialDocument.id,
			containerTags: initialDocument.containerTags,
			selectedTag: projectTag,
		})
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

	const handleDeleteDocument = useCallback(async () => {
		if (isDeleting || deleteDocumentMutation.isPending) {
			return
		}
		setIsDeleting(true)
		try {
			await deleteDocumentMutation.mutateAsync(document.id)
			router.push("/")
		} catch (error) {
			console.error("Failed to delete document:", error)
		} finally {
			setIsDeleting(false)
		}
	}, [deleteDocumentMutation, document.id, isDeleting, router])

	// Find related links handler
	const handleFindRelatedLinks = useCallback(async () => {
		if (isLoadingRelatedLinks) return

		setIsLoadingRelatedLinks(true)
		setRelatedLinksError(null)

		try {
			const response = await fetch(
				`${BACKEND_URL}/v3/documents/${document.id}/related-links`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
				},
			)

			const result = await response.json()

			if (!result.success) {
				setRelatedLinksError(result.error || "Erro ao buscar links")
				return
			}

			// Refresh the page to show new links
			if (result.relatedLinks?.length > 0) {
				router.refresh()
			} else {
				setRelatedLinksError("Nenhum link encontrado no conteúdo")
			}
		} catch (error) {
			console.error("Failed to find related links:", error)
			setRelatedLinksError("Erro de conexão")
		} finally {
			setIsLoadingRelatedLinks(false)
		}
	}, [document.id, isLoadingRelatedLinks, router])

	if (initialScopeRef.current === null) {
		initialScopeRef.current = Array.isArray(scopedDocumentIds)
			? [...scopedDocumentIds]
			: []
	}

	useEffect(() => {
		enqueue([document.id])
		setScopedDocumentIds([document.id])
		return () => {
			const previous = initialScopeRef.current ?? []
			if (previous.length > 0) {
				setScopedDocumentIds(previous)
			} else {
				clearScope()
			}
		}
	}, [clearScope, document.id, enqueue, setScopedDocumentIds])

	// Resizable chat panel width (desktop only)
	const MIN_CHAT_WIDTH = 420
	const MAX_CHAT_WIDTH = 1100
	const DEFAULT_CHAT_WIDTH = 420

	// Always initialize with default value to avoid hydration mismatch
	const [chatWidth, setChatWidth] = useState<number>(DEFAULT_CHAT_WIDTH)

	// Load from localStorage AFTER hydration
	useEffect(() => {
		if (typeof window !== "undefined") {
			try {
				const stored = Number(localStorage.getItem("chatPanelWidth"))
				if (Number.isFinite(stored)) {
					const validWidth = Math.min(
						MAX_CHAT_WIDTH,
						Math.max(MIN_CHAT_WIDTH, stored),
					)
					setChatWidth(validWidth)
				}
			} catch {
				// ignore storage errors
			}
		}
	}, [])

	// Save to localStorage when width changes
	useEffect(() => {
		if (typeof window !== "undefined") {
			try {
				localStorage.setItem("chatPanelWidth", String(chatWidth))
			} catch {
				// ignore storage errors
			}
		}
	}, [chatWidth])

	const resizingRef = useRef(false)
	const startXRef = useRef(0)
	const startWidthRef = useRef(0)

	const onResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
		if (isMobile) return
		const browserDocument =
			typeof window !== "undefined" ? window.document : null
		if (!browserDocument?.body) return

		resizingRef.current = true
		startXRef.current = event.clientX
		startWidthRef.current = chatWidth
		browserDocument.body.style.cursor = "ew-resize"

		const handleMouseMove = (e: MouseEvent) => {
			if (!resizingRef.current) return
			const delta = startXRef.current - e.clientX
			const next = Math.min(
				MAX_CHAT_WIDTH,
				Math.max(MIN_CHAT_WIDTH, startWidthRef.current + delta),
			)
			setChatWidth(next)
		}

		const handleMouseUp = () => {
			resizingRef.current = false
			if (browserDocument?.body) {
				browserDocument.body.style.cursor = ""
			}
			window.removeEventListener("mousemove", handleMouseMove)
			window.removeEventListener("mouseup", handleMouseUp)
		}

		window.addEventListener("mousemove", handleMouseMove)
		window.addEventListener("mouseup", handleMouseUp)
		event.preventDefault()
	}

	const [isContentOpen, setIsContentOpen] = useState(false)

	const documentTitle = (() => {
		const raw = document.title || ""
		const cleaned = stripMarkdown(raw)
			.trim()
			.replace(/^['"""''`]+|['"""''`]+$/g, "")
		return !cleaned || raw.startsWith("data:") ? "Untitled document" : cleaned
	})()

	// Extract images for Pinterest-style layout
	const { mainImage, relatedImages } = useMemo(
		() => extractDocumentImages(document),
		[document],
	)

	// Extract related links from document
	const relatedLinks = useMemo(() => extractRelatedLinks(document), [document])

	const documentSnippet = useMemo(
		() => getDocumentSnippet(document),
		[document],
	)
	const activeMemories = document.memoryEntries.filter((m) => !m.isForgotten)
	const sourceUrl =
		document.url ||
		(document.metadata as any)?.originalUrl ||
		(document.metadata as any)?.source_url
	const isVideo = isYouTubeUrl(sourceUrl) || document.type === "video"

	return (
		<div className="relative h-screen bg-background overflow-hidden">
			<motion.div
				animate={{
					marginRight: isOpen && !isMobile ? chatWidth : 0,
				}}
				className="flex h-full flex-col"
				transition={{
					duration: 0.2,
					ease: [0.4, 0, 0.2, 1],
				}}
			>
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

				{/* Main content - Two column layout with sticky gallery */}
				<main className="flex-1 overflow-hidden flex">
					<div className="flex-1 min-w-0 overflow-y-auto px-4 py-6 lg:px-8">
						<div className="max-w-4xl space-y-6">
							{/* Left column - Main image and details */}
							<div className="space-y-6">
								{/* Main image */}
								{mainImage && (
									<div className="relative rounded-2xl overflow-hidden bg-muted group">
										<img
											alt={documentTitle}
											className="w-full object-cover max-h-[70vh] transition-transform duration-500 group-hover:scale-[1.02]"
											referrerPolicy="no-referrer"
											src={proxyImageUrl(mainImage) || mainImage}
											onError={(e) => {
												// Fallback to original URL if proxy fails
												const target = e.currentTarget
												const originalUrl = mainImage
												if (target.src !== originalUrl) {
													target.src = originalUrl
												}
											}}
										/>
										{/* Video play overlay */}
										{isVideo && (
											<div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
												<a
													className="rounded-full bg-white/90 p-4 shadow-lg hover:bg-white transition-colors"
													href={sourceUrl}
													onClick={(e) => e.stopPropagation()}
													rel="noopener noreferrer"
													target="_blank"
												>
													<Play className="h-8 w-8 text-black fill-black" />
												</a>
											</div>
										)}
									</div>
								)}

								{/* Document details card */}
								<div className="rounded-2xl border border-border/50 bg-card p-6 space-y-4">
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

									{/* Description/snippet (markdown, full text, internal scroll) */}
									{documentSnippet && !documentSnippet.startsWith("data:") && (
										<div className="mt-2 rounded-xl border border-border/60 bg-card/60 p-3 max-h-64 overflow-y-auto shadow-inner">
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
									)}
								</div>

								{/* Original content collapsible */}
								<Collapsible
									onOpenChange={setIsContentOpen}
									open={isContentOpen}
								>
									<CollapsibleTrigger asChild>
										<button
											className="flex w-full items-center justify-between rounded-2xl border border-border/50 bg-card px-5 py-4 text-left text-foreground transition hover:border-border hover:bg-card/80"
											type="button"
										>
											<span className="text-sm font-semibold">
												Conteúdo original
											</span>
											<ChevronDown
												className={cn(
													"h-4 w-4 transition-transform duration-200",
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
													className="mt-4 overflow-hidden rounded-2xl border border-border/50 bg-card"
													exit={{ opacity: 0, height: 0 }}
													initial={{ opacity: 0, height: 0 }}
													transition={{ duration: 0.2 }}
												>
													<div className="h-[60vh] min-h-[400px]">
														<LazyRichEditorWrapper
															document={document}
															onDelete={handleDeleteDocument}
															showNavigation={true}
														/>
													</div>
												</motion.div>
											</CollapsibleContent>
										)}
									</AnimatePresence>
								</Collapsible>

								{/* Related documents panel */}
								<RelatedDocumentsPanel document={document} />
							</div>
						</div>
					</div>

					{/* Right panel - Related content gallery with internal scroll */}
					<motion.div
						animate={{ width: isOpen ? "30vw" : "45vw" }}
						className="hidden lg:flex flex-col shrink-0 border-l border-border/30 bg-background/50"
						transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
					>
						{/* Header with discover button */}
						<div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
							<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
								Imagens relacionadas
							</h2>
							{relatedLinks.length === 0 && (
								<button
									className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all disabled:opacity-50"
									disabled={isLoadingRelatedLinks}
									onClick={handleFindRelatedLinks}
									type="button"
								>
									{isLoadingRelatedLinks ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<Sparkles className="w-3 h-3" />
									)}
									<span>
										{isLoadingRelatedLinks ? "Buscando..." : "Descobrir links"}
									</span>
								</button>
							)}
						</div>
						{relatedLinksError && (
							<p className="text-xs text-red-400 px-4 py-2">
								{relatedLinksError}
							</p>
						)}

						{/* Scrollable gallery */}
						<div className="flex-1 overflow-y-auto p-4">
							{relatedImages.length > 0 || relatedLinks.length > 0 ? (
								<div className="columns-2 gap-3">
									{/* Related images */}
									{relatedImages
										.filter((img) => !hiddenImages.has(img))
										.map((img, index) => (
											<div
												className="mb-3 break-inside-avoid rounded-xl overflow-hidden bg-muted group cursor-pointer relative"
												key={`img-${img}-${index}`}
											>
												<img
													alt={`Imagem relacionada ${index + 1}`}
													className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
													loading="lazy"
													onClick={() => window.open(img, "_blank")}
													referrerPolicy="no-referrer"
													src={proxyImageUrl(img) || img}
													onError={(e) => {
														const target = e.currentTarget
														if (target.src !== img) {
															target.src = img
														}
													}}
												/>
												{/* Delete button */}
												<button
													className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
													onClick={(e) => {
														e.stopPropagation()
														setHiddenImages((prev) => new Set([...prev, img]))
													}}
													type="button"
												>
													<X className="w-3 h-3" />
												</button>
											</div>
										))}

									{/* Related links as preview cards */}
									{relatedLinks
										.filter((link) => !hiddenLinks.has(link.url))
										.map((link, index) => (
											<div
												className="mb-3 break-inside-avoid rounded-xl overflow-hidden bg-muted group cursor-pointer relative"
												key={`link-${link.url}-${index}`}
											>
												<a
													className="block"
													href={link.url}
													rel="noopener noreferrer"
													target="_blank"
												>
													{/* Preview image */}
													{link.image ? (
														<img
															alt={link.title}
															className="w-full object-cover transition-transform duration-300 group-hover:scale-105"
															loading="lazy"
															referrerPolicy="no-referrer"
															src={proxyImageUrl(link.image) || link.image}
															onError={(e) => {
																const target = e.currentTarget
																if (target.src !== link.image) {
																	target.src = link.image!
																}
															}}
														/>
													) : (
														<div className="w-full aspect-video flex items-center justify-center bg-gradient-to-br from-muted to-muted/80">
															{link.favicon ? (
																<img
																	alt=""
																	className="w-10 h-10 rounded-lg opacity-60"
																	referrerPolicy="no-referrer"
																	src={
																		proxyImageUrl(link.favicon) || link.favicon
																	}
																/>
															) : (
																<LinkIcon className="w-6 h-6 text-muted-foreground/40" />
															)}
														</div>
													)}
													{/* Overlay with title on hover */}
													<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 pointer-events-none">
														<span className="text-white text-xs font-medium line-clamp-2">
															{link.title}
														</span>
														<span className="text-white/60 text-[10px] mt-1">
															{(() => {
																try {
																	return new URL(link.url).hostname
																} catch {
																	return link.url
																}
															})()}
														</span>
													</div>
												</a>
												{/* Type badge - always visible */}
												<div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-sm bg-black/60 text-white">
													{getTypeBadge(link)}
												</div>
												{/* Delete button */}
												<button
													className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
													onClick={(e) => {
														e.stopPropagation()
														setHiddenLinks(
															(prev) => new Set([...prev, link.url]),
														)
													}}
													type="button"
												>
													<X className="w-3 h-3" />
												</button>
											</div>
										))}
								</div>
							) : (
								<div className="rounded-2xl border border-dashed border-border/50 bg-muted/30 p-8 text-center">
									<p className="text-sm text-muted-foreground">
										Nenhuma imagem relacionada encontrada
									</p>
								</div>
							)}
						</div>
					</motion.div>
				</main>
			</motion.div>
			{/* Floating Open Chat Button */}
			{!isOpen && !isMobile && (
				<motion.div
					animate={{ opacity: 1, scale: 1 }}
					className="fixed bottom-6 right-6 z-50"
					initial={{ opacity: 0, scale: 0.8 }}
					transition={{
						type: "spring",
						stiffness: 300,
						damping: 25,
					}}
				>
					<Button
						className="flex h-14 w-14 items-center justify-center rounded-full bg-white p-0 text-[#001A39] shadow-lg transition-all duration-200 hover:bg-white/80 hover:shadow-xl"
						onClick={() => setIsOpen(true)}
					>
						<MessageSquare className="h-6 w-6" />
					</Button>
				</motion.div>
			)}

			{/* Chat panel (page-level) */}
			<motion.div
				className="fixed top-0 right-0 z-50 h-full md:z-auto"
				style={{
					width: isOpen ? (isMobile ? "100vw" : `${chatWidth}px`) : 0,
					pointerEvents: isOpen ? "auto" : "none",
				}}
			>
				<motion.div
					animate={{ x: isOpen ? 0 : isMobile ? "100%" : chatWidth }}
					className="absolute inset-0"
					exit={{ x: isMobile ? "100%" : chatWidth }}
					initial={{ x: isMobile ? "100%" : chatWidth }}
					transition={{
						type: "spring",
						stiffness: 500,
						damping: 40,
					}}
				>
					{/* Resize handle */}
					{!isMobile && (
						<div
							className="absolute left-0 top-0 h-full w-1 cursor-ew-resize bg-transparent"
							onMouseDown={onResizeStart}
						>
							<div className="absolute left-1/2 top-1/2 h-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-muted/50" />
						</div>
					)}
					<ChatRewrite />
				</motion.div>
			</motion.div>
		</div>
	)
}
