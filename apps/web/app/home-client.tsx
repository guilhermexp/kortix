"use client"

// Build: 2025-01-04-v8 - Fixed page.tsx server/client boundary
import { useIsMobile } from "@hooks/use-mobile"
import { useAuth } from "@lib/auth-context"
import { $fetch } from "@repo/lib/api"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Button } from "@ui/components/button"
import { GlassMenuEffect } from "@ui/other/glass-effect"
import {
	LoaderIcon,
	MessageSquare,
	RefreshCcw,
	Search,
	X,
} from "lucide-react"
import { motion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { z } from "zod"
import { InstallPrompt } from "@/components/install-prompt"
import { MemoryListView } from "@/components/memory-list-view"
import Menu from "@/components/menu"
import { ProjectSelector } from "@/components/project-selector"
import { ReferralUpgradeModal } from "@/components/referral-upgrade-modal"
import {
	MetadataFilters,
	type MetadataFilterState,
} from "@/components/search/metadata-filters"
import { ThemeToggle } from "@/components/theme-toggle"
import { AddMemoryView } from "@/components/views/add-memory"
import { ChatRewrite } from "@/components/views/chat"
import { CouncilChat } from "@/components/views/council"
import { TOUR_STEP_IDS } from "@/lib/tour-constants"
import { useViewMode } from "@/lib/view-mode-context"
import { useChatMode, useChatOpen, useProject } from "@/stores"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type DocumentWithMemories = DocumentsResponse["documents"][0]
// Experimental mode removed from UI; no project meta needed here
// type Project = z.infer<typeof ProjectSchema>

const MemoryGraphPage = () => {
	const isMobile = useIsMobile()
	const { viewMode } = useViewMode()
	const { selectedProject } = useProject()
	const { isOpen, setIsOpen } = useChatOpen()
	const { mode, setMode } = useChatMode()
	const [showAddMemoryView, setShowAddMemoryView] = useState(false)

	// URL params for filter persistence
	const router = useRouter()
	const searchParams = useSearchParams()

	// Search state with debounce
	const [searchQuery, setSearchQuery] = useState("")
	const [debouncedSearch, setDebouncedSearch] = useState("")

	// Metadata filter state - initialize from URL params
	const [metadataFilters, setMetadataFilters] = useState<MetadataFilterState>(
		() => {
			const tags = searchParams.get("tags")
			const mentions = searchParams.get("mentions")
			const properties = searchParams.get("properties")

			return {
				tags: tags ? tags.split(",").filter(Boolean) : [],
				mentions: mentions ? mentions.split(",").filter(Boolean) : [],
				properties: properties ? JSON.parse(properties) : {},
			}
		},
	)

	useEffect(() => {
		// If search is cleared, reset immediately (no debounce)
		if (!searchQuery.trim()) {
			setDebouncedSearch("")
			return
		}
		// Otherwise debounce the search
		const timer = setTimeout(() => {
			setDebouncedSearch(searchQuery)
		}, 400)
		return () => clearTimeout(timer)
	}, [searchQuery])

	// Update URL params when filters change
	useEffect(() => {
		const params = new URLSearchParams(searchParams.toString())

		// Update or remove tags param
		if (metadataFilters.tags.length > 0) {
			params.set("tags", metadataFilters.tags.join(","))
		} else {
			params.delete("tags")
		}

		// Update or remove mentions param
		if (metadataFilters.mentions.length > 0) {
			params.set("mentions", metadataFilters.mentions.join(","))
		} else {
			params.delete("mentions")
		}

		// Update or remove properties param
		if (Object.keys(metadataFilters.properties).length > 0) {
			params.set("properties", JSON.stringify(metadataFilters.properties))
		} else {
			params.delete("properties")
		}

		// Only update URL if params changed
		const newParamsString = params.toString()
		const currentParamsString = searchParams.toString()
		if (newParamsString !== currentParamsString) {
			const newUrl = newParamsString ? `?${newParamsString}` : window.location.pathname
			router.replace(newUrl, { scroll: false })
		}
	}, [metadataFilters, router, searchParams])
	const [showReferralModal, setShowReferralModal] = useState(false)
	const [pausePolling, setPausePolling] = useState(false)
	const [isWindowVisible, setIsWindowVisible] = useState(true)
	const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null)
	const [now, setNow] = useState(() => Date.now())

	useEffect(() => {
		if (typeof document === "undefined") return
		const handleVisibility = () => {
			setIsWindowVisible(document.visibilityState === "visible")
		}
		document.addEventListener("visibilitychange", handleVisibility)
		handleVisibility()
		return () =>
			document.removeEventListener("visibilitychange", handleVisibility)
	}, [])

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
	const REFETCH_MS = 30_000 // 30 seconds - reduced database load
	const REFETCH_MS_PROCESSING = 3_000 // 3 seconds when documents are being processed - fast preview updates
	const RATE_LIMIT_BACKOFF_MS = 90_000 // backoff after 429 responses

	useEffect(() => {
		if (!rateLimitedUntil) return
		const timeout = window.setTimeout(
			() => {
				setRateLimitedUntil(null)
			},
			Math.max(rateLimitedUntil - Date.now(), 0),
		)
		return () => window.clearTimeout(timeout)
	}, [rateLimitedUntil])

	useEffect(() => {
		if (!rateLimitedUntil) return
		// Update countdown every 5 seconds instead of every 1 second to reduce re-renders
		const interval = window.setInterval(() => setNow(Date.now()), 5000)
		return () => window.clearInterval(interval)
	}, [rateLimitedUntil])

	const isRateLimited = rateLimitedUntil !== null && now < rateLimitedUntil
	const rateLimitSecondsLeft = isRateLimited
		? Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000))
		: 0

	// State to track if there are processing documents (updated after data fetch)
	const [hasProcessingDocs, setHasProcessingDocs] = useState(false)

	const effectiveRefetchInterval = useMemo(() => {
		if (pausePolling) return false
		if (!isWindowVisible) return false
		if (isRateLimited) return false
		// Use faster polling when documents are being processed
		return hasProcessingDocs ? REFETCH_MS_PROCESSING : REFETCH_MS
	}, [isWindowVisible, pausePolling, isRateLimited, hasProcessingDocs])

	const {
		data,
		error,
		isPending,
		isRefetching,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
		refetch,
	} = useInfiniteQuery<DocumentsResponse, Error>({
		queryKey: [
			"documents-with-memories",
			selectedProject,
			debouncedSearch,
			metadataFilters,
		],
		initialPageParam: 1,
		queryFn: async ({ pageParam }) => {
			const markRateLimited = () => {
				setRateLimitedUntil(Date.now() + RATE_LIMIT_BACKOFF_MS)
				setNow(Date.now())
			}

			const parseStatusAndMessage = (err: unknown) => {
				const maybe = err as {
					status?: number
					statusCode?: number
					code?: number | string
					message?: string
				}
				const status =
					maybe?.status ??
					maybe?.statusCode ??
					(typeof maybe?.code === "number" ? maybe.code : undefined)
				const message = maybe?.message ?? (typeof err === "string" ? err : "")
				return { status, message }
			}

			const isRateLimitError = (status?: number | null, message?: string) => {
				if (status === 429) return true
				if (!message) return false
				const normalized = message.toLowerCase()
				return (
					normalized.includes("too many requests") || normalized.includes("429")
				)
			}

			try {
				const response = await $fetch("@post/documents/documents", {
					body: {
						page: pageParam as number,
						limit: PAGE_SIZE,
						sort: "createdAt",
						order: "desc",
						containerTags:
							selectedProject && selectedProject !== "sm_project_default"
								? [selectedProject]
								: undefined,
						search: debouncedSearch || undefined,
						tagsFilter:
							metadataFilters.tags.length > 0
								? metadataFilters.tags
								: undefined,
						mentionsFilter:
							metadataFilters.mentions.length > 0
								? metadataFilters.mentions
								: undefined,
						propertiesFilter:
							Object.keys(metadataFilters.properties).length > 0
								? metadataFilters.properties
								: undefined,
					},
					disableValidation: true,
				})

				if (response.error) {
					const { status, message } = parseStatusAndMessage(response.error)

					// Handle authentication errors
					if (status === 401 || status === 403) {
						const authError = new Error(
							message || "Authentication failed. Please sign in again.",
						)
						;(authError as any).status = status
						throw authError
					}

					if (isRateLimitError(status, message)) {
						markRateLimited()
						const rateError = new Error(
							message || "Rate limited: too many requests",
						)
						;(rateError as any).status = 429
						throw rateError
					}
					throw new Error(message || "Failed to fetch documents")
				}

				// Validate response structure
				if (!response.data || !response.data.documents) {
					console.error("Invalid response structure:", response)
					throw new Error("Invalid response from server")
				}

				return response.data
			} catch (err) {
				const { status, message } = parseStatusAndMessage(err)

				// Handle authentication errors - don't retry
				if (status === 401 || status === 403) {
					console.error("Authentication error:", message)
					// Don't mark as rate limited for auth errors
					const authError = new Error(message || "Authentication failed")
					;(authError as any).status = status
					throw authError
				}

				if (isRateLimitError(status, message)) {
					markRateLimited()
				}
				throw err
			}
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
		staleTime: 10 * 60 * 1000, // 10 minutes - data stays fresh longer to reduce refetches
		refetchInterval: effectiveRefetchInterval, // Avoid hammering the API; pause in background/when optimistic docs exist
		refetchIntervalInBackground: false,
		refetchOnWindowFocus: false,
		refetchOnMount: false, // Don't refetch on every mount - use cached data
		retry: (failureCount, error) => {
			const status = (error as any)?.status ?? (error as any)?.statusCode
			// Don't retry on authentication errors (401, 403) or rate limits (429)
			if (status === 401 || status === 403 || status === 429) {
				return false
			}
			// Limit retries to prevent infinite loading
			return failureCount < 2
		},
		retryDelay: (attemptIndex) => Math.min(5000, 1000 * (attemptIndex + 1)),
		// Add timeout to prevent infinite loading
		gcTime: 10 * 60 * 1000, // 10 minutes garbage collection time
	})

	// Pause polling when optimistic documents are present so they stay visible until replaced
	// Also track if there are processing documents for faster polling
	useEffect(() => {
		if (!data) {
			setPausePolling(false)
			setHasProcessingDocs(false)
			return
		}

		const processingStatuses = new Set([
			"queued",
			"fetching",
			"generating_preview",
			"extracting",
			"chunking",
			"embedding",
			"processing",
			"indexing",
		])
		let hasOptimistic = false
		let hasProcessing = false

		for (const page of data.pages) {
			for (const doc of page.documents ?? []) {
				if ((doc as { isOptimistic?: boolean }).isOptimistic) {
					hasOptimistic = true
				}
				const status = String(doc.status ?? "").toLowerCase()
				if (processingStatuses.has(status)) {
					hasProcessing = true
				}
			}
		}

		setPausePolling(hasOptimistic)
		setHasProcessingDocs(hasProcessing)
	}, [data])

	const allDocuments = useMemo(() => {
		const docs =
			data?.pages.flatMap((pageData) => pageData.documents ?? []) ?? []
		// Deduplicate by id to prevent React key warnings when pagination returns overlapping results
		const seen = new Set<string>()
		return docs.filter((doc) => {
			if (seen.has(doc.id)) return false
			seen.add(doc.id)
			return true
		})
	}, [data])

	// Extract available filter values from documents
	const availableFilterValues = useMemo(() => {
		const tagsSet = new Set<string>()
		const mentionsSet = new Set<string>()
		const propertiesSet = new Set<string>()

		allDocuments.forEach((doc) => {
			// Extract tags from document metadata
			const extracted = doc.metadata?.extracted as any
			if (extracted) {
				// Tags
				if (Array.isArray(extracted.tags)) {
					extracted.tags.forEach((tag: string) => tagsSet.add(tag))
				}
				// Mentions
				if (Array.isArray(extracted.mentions)) {
					extracted.mentions.forEach((mention: string) =>
						mentionsSet.add(mention),
					)
				}
				// Properties (keys only)
				if (extracted.properties && typeof extracted.properties === "object") {
					Object.keys(extracted.properties).forEach((key) =>
						propertiesSet.add(key),
					)
				}
			}
		})

		return {
			tags: Array.from(tagsSet).sort(),
			mentions: Array.from(mentionsSet).sort(),
			properties: Array.from(propertiesSet).sort(),
		}
	}, [allDocuments])

	const totalLoaded = allDocuments.length
	const hasMore = hasNextPage
	const isLoadingMore = isFetchingNextPage
	const isRefreshing = isRefetching && !isFetchingNextPage
	const manualRefreshDisabled = isRateLimited || isPending || isRefreshing

	const handleManualRefresh = useCallback(() => {
		if (isRateLimited) return
		void refetch({ throwOnError: false })
	}, [isRateLimited, refetch])

	const loadMoreDocuments = useCallback(async (): Promise<void> => {
		if (hasNextPage && !isFetchingNextPage) {
			await fetchNextPage()
			return
		}
		return
	}, [hasNextPage, isFetchingNextPage, fetchNextPage])

	const handleDocumentDeleted = useCallback((_documentId: string) => {
		// Document deletion handled by refetch
	}, [])

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

	return (
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
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between gap-2">
								<div className="flex-1" />

								{/* Search Input - only visible in list view, centered */}
								{viewMode === "list" && (
									<div className="relative pointer-events-auto flex-shrink-0">
										<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/60 pointer-events-none" />
										<input
											className="h-8 w-[140px] sm:w-[180px] pl-8 pr-7 text-sm
                               bg-background border border-foreground/15 rounded-md
                               text-foreground/80 placeholder:text-foreground/40
                               hover:bg-foreground/5 focus:outline-none focus:border-foreground/30
                               transition-colors"
											onChange={(e) => setSearchQuery(e.target.value)}
											placeholder="Search..."
											type="text"
											value={searchQuery}
										/>
										{searchQuery && (
											<button
												className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground/80"
												onClick={() => setSearchQuery("")}
												type="button"
											>
												<X className="h-3.5 w-3.5" />
											</button>
										)}
									</div>
								)}
								<div
									className="flex items-center gap-2 pointer-events-auto flex-1 justify-end"
									id={TOUR_STEP_IDS.VIEW_TOGGLE}
								>
									{isRateLimited ? (
										<span className="text-xs text-amber-500 font-medium">
											Rate limit · aguarde {rateLimitSecondsLeft}s
										</span>
									) : null}
									<div
										className="flex items-center gap-2 pointer-events-auto"
										id={TOUR_STEP_IDS.MENU_PROJECTS}
									>
										<ProjectSelector className="pointer-events-auto" />
									</div>
									<Button
										className="bg-background border border-foreground/15 text-foreground/80 hover:text-foreground hover:bg-foreground/10 px-2 sm:px-3 rounded-md"
										disabled={manualRefreshDisabled}
										onClick={handleManualRefresh}
										size="sm"
										variant="ghost"
									>
										{isRefreshing ? (
											<LoaderIcon className="h-4 w-4 animate-spin text-current" />
										) : (
											<RefreshCcw className="h-4 w-4 text-current" />
										)}
										<span className="hidden md:inline ml-2">Atualizar</span>
									</Button>
								</div>
							</div>

							{/* Metadata Filters - only visible in list view */}
							{viewMode === "list" &&
								(availableFilterValues.tags.length > 0 ||
									availableFilterValues.mentions.length > 0 ||
									availableFilterValues.properties.length > 0) && (
									<div className="pointer-events-auto px-4 md:px-8">
										<MetadataFilters
											availableMentions={availableFilterValues.mentions}
											availableProperties={availableFilterValues.properties}
											availableTags={availableFilterValues.tags}
											filters={metadataFilters}
											onFiltersChange={setMetadataFilters}
										/>
									</div>
								)}
						</div>
					</motion.div>

					<motion.div
						animate={{ opacity: 1, scale: 1 }}
						className="absolute inset-0 md:ml-18"
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
								<AddMemoryView inline onClose={() => {}} />
							</div>
						</MemoryListView>
					</motion.div>

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

					{/* Fixed Bottom Left Controls */}
					<motion.div
						animate={{ opacity: 1, scale: 1 }}
						className="fixed bottom-6 left-6 z-50 flex items-center gap-2"
						initial={{ opacity: 0, scale: 0.8 }}
						transition={{
							type: "spring",
							stiffness: 300,
							damping: 25,
						}}
					>
						{/* Theme Toggle */}
						<div className="relative">
							<div className="absolute inset-0 rounded-full">
								<GlassMenuEffect rounded="rounded-full" />
							</div>
							<ThemeToggle className="relative z-10 w-10 h-10 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 p-0" />
						</div>

					</motion.div>
				</motion.div>

				{/* Floating Menu - Left side */}
				<Menu />

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
						{isOpen &&
							(mode === "council" ? (
								<CouncilChat
									onClose={() => setIsOpen(false)}
									onSwitchToAgent={() => setMode("default")}
								/>
							) : (
								<ChatRewrite
									onSwitchToCouncil={() => setMode("council")}
								/>
							))}
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
	)
}

// Wrapper component to handle auth and waitlist checks
export default function HomePage() {
	const { user, session, isLoading } = useAuth()
	// Track if component is mounted (client-side) to prevent SSR/hydration issues
	const [isMounted, setIsMounted] = useState(false)

	useEffect(() => {
		setIsMounted(true)
	}, [])

	useEffect(() => {
		if (!isMounted) return

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
	}, [user, session, isMounted])

	// Wait for client-side mount before rendering anything that uses React Query
	if (!isMounted || isLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-4">
					<LoaderIcon className="w-8 h-8 text-orange-500 animate-spin" />
					<p className="text-white/60">Loading...</p>
				</div>
			</div>
		)
	}

	// Not loading and no user = redirect to login
	if (!user) {
		if (typeof window !== "undefined") {
			window.location.href = "/login"
		}
		return null
	}

	// If we have a user and they have access, show the main component
	return (
		<>
			<MemoryGraphPage />
			<InstallPrompt />
		</>
	)
}
