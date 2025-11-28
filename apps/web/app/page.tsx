"use client"

import { useIsMobile } from "@hooks/use-mobile"
import { useAuth } from "@lib/auth-context"
import { APP_URL } from "@lib/env"
import { $fetch } from "@repo/lib/api"
import { MemoryGraph } from "@repo/ui/memory-graph"
import type { DocumentConnectionEdge } from "@repo/ui/memory-graph/types"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import { Button } from "@ui/components/button"
import { GlassMenuEffect } from "@ui/other/glass-effect"
import {
	HelpCircle,
	LayoutGrid,
	List,
	LoaderIcon,
	MessageSquare,
	SquareDashed,
	Unplug,
} from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { z } from "zod"
import { TldrawCanvas } from "@/components/canvas"
import { CanvasAgentProvider } from "@/components/canvas/canvas-agent-provider"
import { ConnectAIModal } from "@/components/connect-ai-modal"
import { InstallPrompt } from "@/components/install-prompt"
import { MemoryListView } from "@/components/memory-list-view"
import Menu from "@/components/menu"
import { ProjectSelector } from "@/components/project-selector"
import { ReferralUpgradeModal } from "@/components/referral-upgrade-modal"
import { ThemeToggle } from "@/components/theme-toggle"
import { AddMemoryView } from "@/components/views/add-memory"
import { ChatRewrite } from "@/components/views/chat"
import { TOUR_STEP_IDS } from "@/lib/tour-constants"
import { useViewMode } from "@/lib/view-mode-context"
import { useChatOpen, useProject } from "@/stores"
import { useGraphHighlights } from "@/stores/highlights"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type DocumentWithMemories = DocumentsResponse["documents"][0]
// Experimental mode removed from UI; no project meta needed here
// type Project = z.infer<typeof ProjectSchema>

const MemoryGraphPage = () => {
	const { documentIds: allHighlightDocumentIds } = useGraphHighlights()
	const isMobile = useIsMobile()
	const { viewMode, setViewMode } = useViewMode()
	const { selectedProject } = useProject()
	const { isOpen, setIsOpen } = useChatOpen()
	const [injectedDocs, setInjectedDocs] = useState<DocumentWithMemories[]>([])
	const [graphEdges, setGraphEdges] = useState<DocumentConnectionEdge[] | null>(
		null,
	)
	const [showAddMemoryView, setShowAddMemoryView] = useState(false)
	const [showReferralModal, setShowReferralModal] = useState(false)
	const [showConnectAIModal, setShowConnectAIModal] = useState(false)
	const [pausePolling, setPausePolling] = useState(false)

	const isCurrentProjectExperimental = false

	// Resizable chat panel width (desktop only)
	const MIN_CHAT_WIDTH = 420
	const MAX_CHAT_WIDTH = 1100
	const [chatWidth, setChatWidth] = useState<number>(() => {
		if (typeof window === "undefined") return 600
		const v = Number(localStorage.getItem("chatPanelWidth"))
		return Number.isFinite(v)
			? Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, v))
			: 600
	})

	useEffect(() => {
		try {
			localStorage.setItem("chatPanelWidth", String(chatWidth))
		} catch {}
	}, [chatWidth])

	const resizingRef = useRef(false)
	const startXRef = useRef(0)
	const startWRef = useRef(0)
	const beginResize = (e: React.MouseEvent<HTMLDivElement>) => {
		if (isMobile) return
		resizingRef.current = true
		startXRef.current = e.clientX
		startWRef.current = chatWidth
		document.body.style.cursor = "ew-resize"
		const onMove = (ev: MouseEvent) => {
			if (!resizingRef.current) return
			const delta = startXRef.current - ev.clientX // drag left increases width
			const next = Math.min(
				MAX_CHAT_WIDTH,
				Math.max(MIN_CHAT_WIDTH, startWRef.current + delta),
			)
			setChatWidth(next)
		}
		const onUp = () => {
			resizingRef.current = false
			document.body.style.cursor = ""
			window.removeEventListener("mousemove", onMove)
			window.removeEventListener("mouseup", onUp)
		}
		window.addEventListener("mousemove", onMove)
		window.addEventListener("mouseup", onUp)
		e.preventDefault()
	}

	// Progressive loading via useInfiniteQuery
	const IS_DEV = process.env.NODE_ENV === "development"
	const PAGE_SIZE = IS_DEV ? 100 : 100
	const MAX_TOTAL = 1000

	const {
		data,
		error,
		isPending,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useInfiniteQuery<DocumentsResponse, Error>({
		queryKey: ["documents-with-memories", selectedProject],
		initialPageParam: 1,
		queryFn: async ({ pageParam }) => {
			const response = await $fetch("@post/documents/documents", {
				body: {
					page: pageParam as number,
					limit: (pageParam as number) === 1 ? (IS_DEV ? 50 : 50) : PAGE_SIZE,
					sort: "createdAt",
					order: "desc",
					containerTags:
						selectedProject && selectedProject !== "sm_project_default"
							? [selectedProject]
							: undefined,
				},
				disableValidation: true,
			})

			if (response.error) {
				throw new Error(response.error?.message || "Failed to fetch documents")
			}

			return response.data
		},
		getNextPageParam: (lastPage, allPages) => {
			const loaded = allPages.reduce(
				(acc, p) => acc + (p.documents?.length ?? 0),
				0,
			)
			if (loaded >= MAX_TOTAL) return undefined

			const { currentPage, totalPages } = lastPage.pagination
			if (currentPage < totalPages) {
				return currentPage + 1
			}
			return undefined
		},
		staleTime: 5 * 60 * 1000,
		refetchInterval: pausePolling ? false : 3000, // Temporarily pause when optimistic docs exist
	})

	// Pause polling when optimistic documents are present so they stay visible until replaced
	useEffect(() => {
		if (!data) {
			setPausePolling(false)
			return
		}

		const hasOptimisticDocs = data.pages.some((page) =>
			(page.documents ?? []).some(
				(doc) => (doc as { isOptimistic?: boolean }).isOptimistic,
			),
		)
		setPausePolling(hasOptimisticDocs)
	}, [data])

	const baseDocuments = useMemo(() => {
		return data?.pages.flatMap((pageData) => pageData.documents ?? []) ?? []
	}, [data])

	const allDocuments = useMemo(() => {
		if (injectedDocs.length === 0) return baseDocuments
		const byId = new Map<string, DocumentWithMemories>()
		for (const d of injectedDocs) byId.set(d.id, d)
		for (const d of baseDocuments) if (!byId.has(d.id)) byId.set(d.id, d)
		return Array.from(byId.values())
	}, [baseDocuments, injectedDocs])

	const docIdsForEdges = useMemo(() => {
		if (!allDocuments || allDocuments.length === 0) return []
		// Filter out temporary/optimistic IDs that start with "temp-"
		return allDocuments
			.slice(0, 200)
			.map((doc) => doc.id)
			.filter((id) => !id.startsWith("temp-"))
	}, [allDocuments])

	useEffect(() => {
		if (!allDocuments || allDocuments.length === 0) {
			setGraphEdges([])
		}
	}, [allDocuments])

	const graphEdgesKey = useMemo(() => {
		if (docIdsForEdges.length === 0) return ""
		const projectKey =
			selectedProject && selectedProject !== "sm_project_default"
				? selectedProject
				: "__all__"
		return JSON.stringify({
			project: projectKey,
			docIds: docIdsForEdges,
		})
	}, [docIdsForEdges, selectedProject])

	const totalLoaded = allDocuments.length
	const hasMore = hasNextPage
	const isLoadingMore = isFetchingNextPage

	const loadMoreDocuments = useCallback(async (): Promise<void> => {
		if (hasNextPage && !isFetchingNextPage) {
			await fetchNextPage()
			return
		}
		return
	}, [hasNextPage, isFetchingNextPage, fetchNextPage])

	const handleDocumentDeleted = useCallback((documentId: string) => {
		setInjectedDocs((prev) =>
			prev.filter(
				(doc) => doc.id !== documentId && doc.customId !== documentId,
			),
		)
	}, [])

	const previousProjectRef = useRef<string | null>(null)

	// Reset injected docs when project changes
	useEffect(() => {
		const projectKey = selectedProject ?? null
		if (previousProjectRef.current === projectKey) {
			return
		}
		previousProjectRef.current = projectKey
		setInjectedDocs([])
	}, [selectedProject])

	// Surgical fetch of missing highlighted documents (customId-based IDs from search)
	useEffect(() => {
		if (!isOpen) return
		if (!allHighlightDocumentIds || allHighlightDocumentIds.length === 0) return
		const present = new Set<string>()
		for (const doc of [...baseDocuments, ...injectedDocs]) {
			present.add(doc.id)
			if (doc.customId) {
				present.add(doc.customId)
			}
		}
		const missing = (allHighlightDocumentIds ?? []).filter(
			(id) => !present.has(id),
		)
		if (missing.length === 0) return
		let cancelled = false
		const run = async () => {
			try {
				const response = await $fetch("@post/documents/documents/by-ids", {
					body: {
						ids: missing,
						by: "customId",
						containerTags:
							selectedProject && selectedProject !== "sm_project_default"
								? [selectedProject]
								: undefined,
					},
					disableValidation: true,
				})
				if (cancelled || response.error) return
				const extraDocs = response.data?.documents ?? []
				if (extraDocs.length === 0) return
				setInjectedDocs((prev) => {
					const seen = new Set<string>([
						...prev.flatMap(
							(document) =>
								[document.id, document.customId].filter(Boolean) as string[],
						),
						...baseDocuments.flatMap(
							(document) =>
								[document.id, document.customId].filter(Boolean) as string[],
						),
					])
					const merged = [...prev]
					for (const document of extraDocs) {
						if (!seen.has(document.id)) {
							merged.push(document)
							seen.add(document.id)
						}
						if (document.customId) {
							seen.add(document.customId)
						}
					}
					return merged
				})
			} catch (fetchError) {
				if (process.env.NODE_ENV !== "production") {
					console.error(fetchError)
				}
			}
		}
		void run()
		return () => {
			cancelled = true
		}
	}, [
		isOpen,
		allHighlightDocumentIds?.length,
		baseDocuments,
		injectedDocs,
		selectedProject,
	])

	useEffect(() => {
		if (!graphEdgesKey) {
			setGraphEdges([])
			return
		}

		let parsed: { project: string; docIds: string[] }
		try {
			parsed = JSON.parse(graphEdgesKey) as {
				project: string
				docIds: string[]
			}
		} catch {
			setGraphEdges(null)
			return
		}

		const docIds = Array.isArray(parsed.docIds) ? parsed.docIds : []
		if (docIds.length === 0) {
			setGraphEdges([])
			return
		}

		let cancelled = false
		const loadConnections = async () => {
			try {
				const body: Record<string, unknown> = {
					documentIds: docIds,
				}
				if (parsed.project && parsed.project !== "__all__") {
					body.containerTags = [parsed.project]
				}
				const response = (await $fetch("@post/graph/connections", {
					body,
					disableValidation: true,
				})) as { error?: unknown; data?: { edges?: unknown[] } }
				if (cancelled) return
				// Type guard to check error property exists
				if (response.error) {
					if (process.env.NODE_ENV !== "production") {
						const message =
							typeof response.error === "object"
								? JSON.stringify(response.error)
								: String(response.error)
						console.error("Failed to load graph connections", message)
					}
					setGraphEdges([])
					return
				}
				const edges = Array.isArray(response.data?.edges)
					? (response.data.edges as DocumentConnectionEdge[])
					: []
				setGraphEdges(edges)
			} catch (error) {
				if (!cancelled) {
					if (process.env.NODE_ENV !== "production") {
						console.error("Failed to load graph connections", error)
					}
					setGraphEdges([])
				}
			}
		}
		void loadConnections()
		return () => {
			cancelled = true
		}
	}, [graphEdgesKey])

	// Handle view mode change
	const handleViewModeChange = useCallback(
		(mode: "graph" | "graphEmpty" | "list" | "infinity") => {
			setViewMode(mode)
		},
		[setViewMode],
	)

	useEffect(() => {
		if ((allDocuments?.length ?? 0) === 0) {
			setShowConnectAIModal(true)
		}
	}, [allDocuments?.length])

	// Prevent body scrolling
	useEffect(() => {
		document.body.style.overflow = "hidden"
		document.body.style.height = "100vh"
		document.documentElement.style.overflow = "hidden"
		document.documentElement.style.height = "100vh"

		return () => {
			document.body.style.overflow = ""
			document.body.style.height = ""
			document.documentElement.style.overflow = ""
			document.documentElement.style.height = ""
		}
	}, [])

	const viewToggleBaseClasses =
		"bg-background border text-foreground/80 hover:text-foreground hover:bg-foreground/10 px-2 sm:px-3 rounded-md"
	const viewToggleActiveClasses = "border-foreground/40 text-foreground"
	const viewToggleInactiveClasses = "border-foreground/15"

	return (
		<CanvasAgentProvider>
		<div className="relative h-screen bg-background overflow-hidden touch-none">
			{/* Main content area */}
			<motion.div
				animate={{
					marginRight: isOpen && !isMobile ? chatWidth : 0,
				}}
				className="h-full relative"
				transition={{
					duration: 0.2,
					ease: [0.4, 0, 0.2, 1], // Material Design easing - snappy but smooth
				}}
			>
				<motion.div className="absolute top-0 left-0 right-0 z-20 px-4 pt-2">
					<div className="flex items-center justify-between">
						<div
							className="flex items-center gap-2 pointer-events-auto"
							id={TOUR_STEP_IDS.MENU_PROJECTS}
						>
							<ProjectSelector className="pointer-events-auto" />
						</div>
						<div className="flex items-center gap-2">
							<div
								className="flex gap-2 pointer-events-auto"
								id={TOUR_STEP_IDS.VIEW_TOGGLE}
							>
								<Button
									className={`${viewToggleBaseClasses} ${
										viewMode === "graph"
											? viewToggleActiveClasses
											: viewToggleInactiveClasses
									}`}
									onClick={() => handleViewModeChange("graph")}
									size="sm"
									variant="outline"
								>
									<LayoutGrid className="h-4 w-4" />
									<span className="hidden md:inline ml-2">Graph</span>
								</Button>

								<Button
									className={`${viewToggleBaseClasses} ${
										viewMode === "infinity"
											? viewToggleActiveClasses
											: viewToggleInactiveClasses
									}`}
									onClick={() => handleViewModeChange("infinity")}
									size="sm"
									variant="outline"
								>
									<SquareDashed className="h-4 w-4" />
									<span className="hidden md:inline ml-2">Infinity</span>
								</Button>

								<Button
									className={`${viewToggleBaseClasses} ${
										viewMode === "list"
											? viewToggleActiveClasses
											: viewToggleInactiveClasses
									}`}
									onClick={() => handleViewModeChange("list")}
									size="sm"
									variant="outline"
								>
									<List className="h-4 w-4" />
									<span className="hidden md:inline ml-2">List</span>
								</Button>
							</div>
							<Menu chatRightOffset={isOpen && !isMobile ? chatWidth : 0} />
						</div>
					</div>
				</motion.div>

				{/* Animated content switching */}
				<AnimatePresence mode="wait">
					{viewMode === "graph" ? (
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="absolute inset-0"
							exit={{ opacity: 0, scale: 0.95 }}
							id={TOUR_STEP_IDS.MEMORY_GRAPH}
							initial={{ opacity: 0, scale: 0.95 }}
							key="graph"
							transition={{
								type: "spring",
								stiffness: 500,
								damping: 30,
							}}
						>
							<MemoryGraph
								autoLoadOnViewport={false}
								documentEdges={graphEdges ?? undefined}
								documents={allDocuments}
								error={error}
								hasMore={hasMore}
								highlightDocumentIds={allHighlightDocumentIds}
								highlightsVisible={isOpen}
								isExperimental={isCurrentProjectExperimental}
								isLoading={isPending}
								isLoadingMore={isLoadingMore}
								legendId={TOUR_STEP_IDS.LEGEND}
								loadMoreDocuments={loadMoreDocuments}
								occludedRightPx={isOpen && !isMobile ? chatWidth : 0}
								showSpacesSelector={false}
								totalLoaded={totalLoaded}
								variant="consumer"
							>
								<div className="absolute inset-0 flex items-center justify-center">
									<ConnectAIModal
										onOpenChange={setShowConnectAIModal}
										open={showConnectAIModal}
									>
										<div className="rounded-xl overflow-hidden cursor-pointer hover:bg-white/5 transition-colors p-6">
											<div className="relative z-10 text-slate-200 text-center">
												<p className="text-lg font-medium mb-4">
													Get Started with Kortix
												</p>
												<div className="flex flex-col gap-3">
													<p className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
														Click here to set up your AI connection
													</p>
													<p className="text-xs text-white/60">or</p>
													<button
														className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline"
														onClick={(e) => {
															e.stopPropagation()
															setShowAddMemoryView(true)
															setShowConnectAIModal(false)
														}}
														type="button"
													>
														Add your first memory
													</button>
												</div>
											</div>
										</div>
									</ConnectAIModal>
								</div>
							</MemoryGraph>
						</motion.div>
					) : viewMode === "graphEmpty" ? (
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="absolute inset-0"
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
							key="graph-empty"
							transition={{
								type: "spring",
								stiffness: 500,
								damping: 30,
							}}
						>
							<MemoryGraph
								autoLoadOnViewport={false}
								documents={[]}
								error={null}
								hasMore={false}
								highlightDocumentIds={[]}
								highlightsVisible={false}
								isExperimental={isCurrentProjectExperimental}
								isLoading={false}
								isLoadingMore={false}
								legendId={`${TOUR_STEP_IDS.LEGEND}-empty`}
								loadMoreDocuments={async () => {}}
								occludedRightPx={isOpen && !isMobile ? chatWidth : 0}
								showSpacesSelector={false}
								totalLoaded={0}
								variant="consumer"
							/>
						</motion.div>
					) : viewMode === "infinity" ? (
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="absolute inset-0"
							exit={{ opacity: 0, scale: 0.95 }}
							initial={{ opacity: 0, scale: 0.95 }}
							key="infinity"
							transition={{
								type: "spring",
								stiffness: 500,
								damping: 30,
							}}
						>
							<TldrawCanvas />
						</motion.div>
					) : (
						<motion.div
							animate={{ opacity: 1, scale: 1 }}
							className="absolute inset-0 md:ml-18"
							exit={{ opacity: 0, scale: 0.95 }}
							id={TOUR_STEP_IDS.MEMORY_LIST}
							initial={{ opacity: 0, scale: 0.95 }}
							key="list"
							transition={{
								type: "spring",
								stiffness: 500,
								damping: 30,
							}}
						>
							<MemoryListView
								documents={allDocuments}
								error={error}
								hasMore={hasMore}
								isLoading={isPending}
								isLoadingMore={isLoadingMore}
								loadMoreDocuments={loadMoreDocuments}
								onDocumentDeleted={handleDocumentDeleted}
								totalLoaded={totalLoaded}
							>
								<div className="absolute inset-0 flex items-center justify-center">
									<ConnectAIModal
										onOpenChange={setShowConnectAIModal}
										open={showConnectAIModal}
									>
										<div className="rounded-xl overflow-hidden cursor-pointer hover:bg-white/5 transition-colors p-6">
											<div className="relative z-10 text-slate-200 text-center">
												<p className="text-lg font-medium mb-4">
													Get Started with Kortix
												</p>
												<div className="flex flex-col gap-3">
													<p className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
														Click here to set up your AI connection
													</p>
													<p className="text-xs text-white/60">or</p>
													<button
														className="text-sm text-blue-400 hover:text-blue-300 transition-colors underline"
														onClick={(e) => {
															e.stopPropagation()
															setShowAddMemoryView(true)
															setShowConnectAIModal(false)
														}}
														type="button"
													>
														Add your first memory
													</button>
												</div>
											</div>
										</div>
									</ConnectAIModal>
								</div>
							</MemoryListView>
						</motion.div>
					)}
				</AnimatePresence>

				{/* Top Bar */}
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
							className="w-10 h-10 bg-white hover:bg-white/80 text-[#001A39] shadow-lg hover:shadow-xl transition-all duration-200 rounded-full flex items-center justify-center cursor-pointer p-0"
							onClick={() => setIsOpen(true)}
						>
							<MessageSquare className="h-4 w-4" />
						</Button>
					</motion.div>
				)}

				{/* Fixed Theme Toggle Button - Bottom Left */}
				<motion.div
					animate={{ opacity: 1, scale: 1 }}
					className="fixed bottom-6 left-6 z-50"
					initial={{ opacity: 0, scale: 0.8 }}
					transition={{
						type: "spring",
						stiffness: 300,
						damping: 25,
					}}
				>
					<div className="relative">
						<div className="absolute inset-0 rounded-full">
							<GlassMenuEffect rounded="rounded-full" />
						</div>
						<ThemeToggle className="relative z-10 w-10 h-10 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 p-0" />
					</div>
				</motion.div>
			</motion.div>

			{/* Chat panel - positioned absolutely */}
			<motion.div
				className="fixed top-0 right-0 h-full z-50 md:z-auto"
				id={TOUR_STEP_IDS.FLOATING_CHAT}
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
					key="chat"
					transition={{
						type: "spring",
						stiffness: 500,
						damping: 40,
					}}
				>
					{/* Resize handle */}
					{!isMobile && (
						<div
							className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/5 hover:bg-white/10 border-l border-white/10"
							onMouseDown={beginResize}
							title="Drag to resize"
						/>
					)}
					<ChatRewrite />
				</motion.div>
			</motion.div>

			{showAddMemoryView && (
				<AddMemoryView onClose={() => setShowAddMemoryView(false)} />
			)}

			{/* Referral/Upgrade Modal */}
			<ReferralUpgradeModal
				isOpen={showReferralModal}
				onClose={() => setShowReferralModal(false)}
			/>
		</div>
		</CanvasAgentProvider>
	)
}

// Wrapper component to handle auth and waitlist checks
export default function Page() {
	const { user, session } = useAuth()

	useEffect(() => {
		const url = new URL(window.location.href)
		const authenticateChromeExtension = url.searchParams.get(
			"extension-auth-success",
		)

		if (authenticateChromeExtension) {
			const sessionToken = session?.token
			const userData = {
				email: user?.email,
				name: user?.name,
				userId: user?.id,
			}

			if (sessionToken && userData?.email) {
				const encodedToken = encodeURIComponent(sessionToken)
				window.postMessage({ token: encodedToken, userData }, "*")
				url.searchParams.delete("extension-auth-success")
				window.history.replaceState({}, "", url.toString())
			}
		}
	}, [user, session])

	// Show loading state while checking authentication and waitlist status
	if (!user) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-4">
					<LoaderIcon className="w-8 h-8 text-orange-500 animate-spin" />
					<p className="text-white/60">Loading...</p>
				</div>
			</div>
		)
	}

	// If we have a user and they have access, show the main component
	return (
		<>
			<MemoryGraphPage />
			<InstallPrompt />
		</>
	)
}
