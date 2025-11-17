"use client"

import { useIsMobile } from "@hooks/use-mobile"
import { useDeleteDocument } from "@lib/queries"
import { cn } from "@lib/utils"
import { DEFAULT_PROJECT_ID } from "@repo/lib/constants"
import { Button } from "@repo/ui/components/button"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@repo/ui/components/collapsible"
import { ArrowLeft, ChevronDown, MessageSquare } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChatRewrite } from "@/components/views/chat"
import type { DocumentWithMemories } from "@/lib/types/document"
import { useChatMentionQueue, useChatOpen, useProject } from "@/stores"
import { useCanvasSelection } from "@/stores/canvas"
import { stripMarkdown } from "../memories"
import { DocumentProjectTransfer } from "./document-project-transfer"

const LazyMemoryEntriesSidebar = dynamic(
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
	const [chatWidth, setChatWidth] = useState<number>(() => {
		if (typeof window === "undefined") return 600
		const stored = Number(localStorage.getItem("chatPanelWidth"))
		return Number.isFinite(stored)
			? Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, stored))
			: 600
	})

	useEffect(() => {
		try {
			localStorage.setItem("chatPanelWidth", String(chatWidth))
		} catch {
			// ignore storage errors
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
			.replace(/^['"“”‘’`]+|['"“”‘’`]+$/g, "")
		return !cleaned || raw.startsWith("data:") ? "Untitled document" : cleaned
	})()

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
				<header className="flex flex-col gap-2 border-b border-border bg-background/90 px-6 py-4 backdrop-blur">
					<div className="flex items-center justify-between gap-4">
						<div className="flex items-center gap-3 min-w-0">
							<Button
								aria-label="Voltar para o dashboard"
								asChild
								className="h-8 w-8 rounded-full text-foreground hover:bg-muted"
								size="icon"
								variant="ghost"
							>
								<Link href="/">
									<ArrowLeft className="h-4 w-4" />
									<span className="sr-only">Voltar para o dashboard</span>
								</Link>
							</Button>
							<div className="min-w-0">
								<p className="text-xs uppercase tracking-wide text-muted-foreground">
									Memory
								</p>
								<h1 className="truncate text-xl font-semibold text-foreground">
									{documentTitle}
								</h1>
							</div>
						</div>
						<DocumentProjectTransfer
							currentProject={document.containerTags?.[0]}
							documentId={document.id}
							onProjectChanged={setActiveProjectTag}
						/>
					</div>
					<p className="text-sm text-muted-foreground">
						Gerencie as memórias e revise o conteúdo original quando necessário.
					</p>
				</header>

				<main className="flex-1 overflow-y-auto">
					<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
						<LazyMemoryEntriesSidebar
							document={document}
							documentId={document.id}
							variant="standalone"
						/>

						<Collapsible onOpenChange={setIsContentOpen} open={isContentOpen}>
							<CollapsibleTrigger asChild>
								<button
									className="flex w-full items-center justify-between rounded-2xl border border-border/70 bg-card/80 px-5 py-4 text-left text-foreground shadow-sm transition hover:border-foreground/20 hover:bg-card"
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
								{isContentOpen ? (
									<CollapsibleContent asChild>
										<motion.div
											animate={{ opacity: 1, height: "auto" }}
											className="mt-4 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-inner"
											exit={{ opacity: 0, height: 0 }}
											initial={{ opacity: 0, height: 0 }}
											transition={{ duration: 0.2 }}
										>
											<div className="h-[70vh] min-h-[420px]">
												<LazyRichEditorWrapper
													document={document}
													onDelete={handleDeleteDocument}
													showNavigation={true}
												/>
											</div>
										</motion.div>
									</CollapsibleContent>
								) : null}
							</AnimatePresence>
						</Collapsible>
					</div>
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
