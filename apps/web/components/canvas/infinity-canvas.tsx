"use client"

import {
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	MouseSensor,
	TouchSensor,
	useDraggable,
	useSensor,
	useSensors,
} from "@dnd-kit/core"
import { $fetch } from "@repo/lib/api"
import { Button } from "@repo/ui/components/button"
import { NavigationControls, useGraphInteractions } from "@repo/ui/memory-graph"
import { getColors } from "@repo/ui/memory-graph/constants"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import {
	Brain,
	X as CloseIcon,
	Map as MapIcon,
	Minus,
	Palette as PaletteIcon,
	Plus,
	Sparkles,
	Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { z } from "zod"
import { useToast } from "@/components/ui/rich-editor/hooks/use-toast"
import { Tooltip } from "@/components/ui/tooltip"
import { useProject } from "@/stores"
import {
	useCanvasPositions,
	useCanvasSelection,
	useCanvasState,
} from "@/stores/canvas"
import { DocumentCard } from "./document-card"
import { DocumentSelectorModal } from "./document-selector-modal"
import { DraggableCard } from "./draggable-card"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type DocumentWithMemories = DocumentsResponse["documents"][0]

const CARD_WIDTH = 320
const CARD_HEIGHT = 420
const CARD_HALF_WIDTH = CARD_WIDTH / 2
const CARD_HALF_HEIGHT = CARD_HEIGHT / 2

export function InfinityCanvas() {
	const colors = getColors()
	const { selectedProject } = useProject()
	const {
		placedDocumentIds,
		removePlacedDocument,
		clearCanvas,
		setScopedDocumentIds,
		removeSelected,
		clearSelection,
		setPlacedDocumentIds,
		addPlacedDocuments,
	} = useCanvasSelection()
	const { isEmpty, placedCount, selectedCount } = useCanvasState()
	const { cardPositions, setCardPositions, updateCardPosition } =
		useCanvasPositions()
	const { toast } = useToast()

	const [documents, setDocuments] = useState<DocumentWithMemories[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [isSelectorOpen, setIsSelectorOpen] = useState(false)
	const [isPaletteOpen, setIsPaletteOpen] = useState(false)
	const [isMinimapOpen, setIsMinimapOpen] = useState(false)
	const [activeDocument, setActiveDocument] =
		useState<DocumentWithMemories | null>(null)
	const hasAutoCenteredRef = useRef(false)
	const [isLoadingCanvas, setIsLoadingCanvas] = useState(false)

	// Palette state
	const [paletteDocs, setPaletteDocs] = useState<DocumentWithMemories[]>([])
	const [paletteLoading, setPaletteLoading] = useState(false)
	const [paletteError, setPaletteError] = useState<string | null>(null)
	const [palettePage, setPalettePage] = useState(1)
	const [paletteHasMore, setPaletteHasMore] = useState(true)

	// Configure drag sensors
	const mouseSensor = useSensor(MouseSensor, {
		activationConstraint: {
			distance: 0, // Start drag immediately
		},
	})
	const touchSensor = useSensor(TouchSensor, {
		activationConstraint: {
			delay: 250, // 250ms hold required to start drag on touch
			tolerance: 5,
		},
	})
	const sensors = useSensors(mouseSensor, touchSensor)

	// Pan/zoom state and container size
	const containerRef = useRef<HTMLDivElement | null>(null)
	const viewportRef = useRef<HTMLDivElement | null>(null)
	const previousPlacedIdsRef = useRef<string[]>([])
	const hydratedFromStorageRef = useRef(false)
	const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
	const {
		panX,
		panY,
		zoom,
		handlePanStart,
		handlePanMove,
		handlePanEnd,
		handleWheel,
		handleTouchStart,
		handleTouchMove,
		handleTouchEnd,
		autoFitToViewport,
		centerViewportOn,
		zoomIn,
		zoomOut,
	} = useGraphInteractions("consumer")

	useEffect(() => {
		const el = containerRef.current
		if (!el) return
		const update = () =>
			setContainerSize({ width: el.clientWidth, height: el.clientHeight })
		update()
		const ro = new ResizeObserver(update)
		ro.observe(el)
		return () => ro.disconnect()
	}, [])

	// Attach a non-passive wheel handler to prevent page zoom/scroll and forward to graph zoom
	useEffect(() => {
		const viewport = viewportRef.current
		if (!viewport) return
		const onWheelNative = (e: WheelEvent) => {
			try {
				const rect = viewport.getBoundingClientRect()
				const inside =
					e.clientX >= rect.left &&
					e.clientX <= rect.right &&
					e.clientY >= rect.top &&
					e.clientY <= rect.bottom
				if (!inside) {
					return
				}
				e.preventDefault()
				e.stopPropagation()
				const synthetic: any = {
					deltaX: e.deltaX,
					deltaY: e.deltaY,
					clientX: e.clientX,
					clientY: e.clientY,
					currentTarget: viewport,
					preventDefault: () => {},
					stopPropagation: () => {},
				}
				;(handleWheel as any)(synthetic)
			} catch {}
		}
		const preventGesture = (e: Event) => {
			// Prevent Safari pinch-to-zoom from zooming the whole page
			e.preventDefault()
			e.stopPropagation()
		}
		viewport.addEventListener("wheel", onWheelNative, { passive: false })
		viewport.addEventListener("gesturestart", preventGesture as EventListener, {
			passive: false,
		})
		viewport.addEventListener(
			"gesturechange",
			preventGesture as EventListener,
			{ passive: false },
		)
		viewport.addEventListener("gestureend", preventGesture as EventListener, {
			passive: false,
		})
		return () => {
			viewport.removeEventListener("wheel", onWheelNative as EventListener)
			viewport.removeEventListener(
				"gesturestart",
				preventGesture as EventListener,
			)
			viewport.removeEventListener(
				"gesturechange",
				preventGesture as EventListener,
			)
			viewport.removeEventListener(
				"gestureend",
				preventGesture as EventListener,
			)
		}
	}, [handleWheel])

	// Optional: throttle wheel handling to one per frame for smoother zoom
	// (matches Graph's snappy feel on heavy scenes)
	/*
    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return
        let raf = 0
        let pending: any = null
        const onWheel = (e: WheelEvent) => {
            e.preventDefault(); e.stopPropagation();
            pending = e
            if (!raf) {
                raf = requestAnimationFrame(() => {
                    if (pending) {
                        const p = pending as WheelEvent
                        const synthetic: any = {
                            deltaX: p.deltaX, deltaY: p.deltaY,
                            clientX: p.clientX, clientY: p.clientY,
                            currentTarget: viewport,
                            preventDefault: () => {}, stopPropagation: () => {},
                        }
                        ;(handleWheel as any)(synthetic)
                    }
                    pending = null; raf = 0
                })
            }
        }
        viewport.addEventListener('wheel', onWheel, { passive: false })
        return () => { viewport.removeEventListener('wheel', onWheel as EventListener); if (raf) cancelAnimationFrame(raf) }
    }, [handleWheel])
    */

	// Initial positions near viewport center laid out in a small grid to avoid overlap
	const computeCenterPositions = useCallback(
		(
			newDocIds: string[],
			existingPositions: Record<string, { x: number; y: number }>,
			options?: { strategy?: "nearest" | "random" },
		) => {
			const newPositions: Record<string, { x: number; y: number }> = {}
			// Validate zoom to prevent division by zero or extreme values
			const safeZoom = Math.max(0.05, Math.min(3, zoom))
			const centerX = (-panX + containerSize.width / 2) / safeZoom
			const centerY = (-panY + containerSize.height / 2) / safeZoom

			const ids = newDocIds.filter((id) => !existingPositions[id])
			if (ids.length === 0) return newPositions

			// Spacing and collision tuned to keep a visible gap between cards
			const spacingX = 460 // card width (320) + generous horizontal margin
			const spacingY = 420 // estimated card height (preview + 6 lines + paddings) + margin
			const halfW = 160 // half of card width (320)
			const halfH = 210 // half of estimated height
			const collisionX = spacingX - 40 // enforce ~40px gap horizontally
			const collisionY = spacingY - 40 // enforce ~40px gap vertically

			// Collect occupied slots around center from existing positions
			const occupied: Array<{ x: number; y: number }> =
				Object.values(existingPositions)

			// Generate candidate offsets in expanding grid rings around center
			const generateCandidates = (maxRing: number) => {
				const candidates: Array<{ offX: number; offY: number }> = []
				for (let r = 0; r <= maxRing; r++) {
					for (let dy = -r; dy <= r; dy++) {
						for (let dx = -r; dx <= r; dx++) {
							if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue // only ring border
							candidates.push({ offX: dx * spacingX, offY: dy * spacingY })
						}
					}
				}
				// Sort by distance to center so we fill nearest free first
				candidates.sort(
					(a, b) =>
						a.offX * a.offX +
						a.offY * a.offY -
						(b.offX * b.offX + b.offY * b.offY),
				)
				return candidates
			}

			let candidates = generateCandidates(6) // up to 13x13 area
			const randomize =
				options?.strategy === "random" ||
				(ids.length === 1 && options?.strategy !== "nearest")
			if (randomize) {
				// Shuffle candidates to spread new single items more randomly
				const shuffled: typeof candidates = []
				const arr = [...candidates]
				while (arr.length) {
					const idx = Math.floor(Math.random() * arr.length)
					shuffled.push(arr.splice(idx, 1)[0]!)
				}
				candidates = shuffled
			}
			const used: Array<{ x: number; y: number }> = []

			const isFree = (x: number, y: number) => {
				const check = (p: { x: number; y: number }) =>
					Math.abs(p.x - x) < collisionX && Math.abs(p.y - y) < collisionY
				return !occupied.some(check) && !used.some(check)
			}

			for (const id of ids) {
				// pick first free candidate
				let placed = false
				for (const c of candidates) {
					const px = centerX - halfW + c.offX
					const py = centerY - halfH + c.offY
					if (isFree(px, py)) {
						newPositions[id] = { x: px, y: py }
						used.push({ x: px, y: py })
						placed = true
						break
					}
				}
				// fallback: place slightly random offset if all occupied
				if (!placed) {
					const px = centerX - halfW + (Math.random() - 0.5) * spacingX
					const py = centerY - halfH + (Math.random() - 0.5) * spacingY
					newPositions[id] = { x: px, y: py }
					used.push({ x: px, y: py })
				}
			}

			return newPositions
		},
		[panX, panY, zoom, containerSize.width, containerSize.height],
	)

	useEffect(() => {
		// Touch these values so eslint understands they are intentionally tracked
		void centerViewportOn
		void zoom
		void zoomIn
		void zoomOut
		void panX
		void panY

		if (containerSize.width <= 0 || containerSize.height <= 0) return
		if (documents.length === 0) return

		const missingIds = documents
			.filter((doc) => !cardPositions[doc.id])
			.map((doc) => doc.id)

		if (missingIds.length > 0) {
			hasAutoCenteredRef.current = false
		} else if (hasAutoCenteredRef.current) {
			return
		}

		if (missingIds.length === 0) return

		const newPositions = computeCenterPositions(missingIds, cardPositions)
		if (Object.keys(newPositions).length === 0) return

		const updatedPositions = { ...cardPositions, ...newPositions }
		setCardPositions(updatedPositions)

		const newNodes = missingIds
			.map((id) => {
				const pos = updatedPositions[id]
				if (!pos) return null
				return {
					id,
					type: "document",
					x: pos.x + CARD_HALF_WIDTH,
					y: pos.y + CARD_HALF_HEIGHT,
					size: Math.max(CARD_WIDTH, CARD_HEIGHT),
					data: { id },
				}
			})
			.filter(Boolean) as any[]

		if (newNodes.length > 0) {
			autoFitToViewport(newNodes, containerSize.width, containerSize.height, {
				animate: true,
			})
			hasAutoCenteredRef.current = true
		}
	}, [
		documents,
		cardPositions,
		containerSize.width,
		containerSize.height,
		computeCenterPositions,
		setCardPositions,
		autoFitToViewport,
		centerViewportOn,
		zoom,
		zoomIn,
		zoomOut,
		panX,
		panY,
	])

	useEffect(() => {
		const previous = previousPlacedIdsRef.current
		const newIds = placedDocumentIds.filter((id) => !previous.includes(id))

		previousPlacedIdsRef.current = placedDocumentIds

		// Skip if data is still loading from API
		if (isLoadingCanvas) return

		if (newIds.length === 0) return
		if (containerSize.width <= 0 || containerSize.height <= 0) return

		for (let i = newIds.length - 1; i >= 0; i--) {
			const id = newIds[i]!
			const position = cardPositions[id]
			if (!position) continue

			centerViewportOn(
				position.x + CARD_HALF_WIDTH,
				position.y + CARD_HALF_HEIGHT,
				containerSize.width,
				containerSize.height,
				true,
			)
			break
		}
	}, [
		placedDocumentIds,
		cardPositions,
		containerSize.width,
		containerSize.height,
		centerViewportOn,
	])

	// Load palette documents (like modal list) lazily when panel opens or project changes
	const loadPalette = useCallback(
		async (pageNum: number, append = false) => {
			setPaletteLoading(true)
			setPaletteError(null)
			try {
				const containerTags =
					selectedProject && selectedProject !== "sm_project_default"
						? [selectedProject]
						: undefined
				const response = await $fetch("@post/documents/documents", {
					body: {
						containerTags,
						limit: 20,
						page: pageNum,
						sort: "updatedAt",
						order: "desc",
					},
					disableValidation: true,
				})
				if (response.data) {
					const newDocs = response.data.documents
					setPaletteDocs((prev) => (append ? [...prev, ...newDocs] : newDocs))
					setPaletteHasMore(
						response.data.pagination.currentPage <
							response.data.pagination.totalPages,
					)
				}
			} catch (err) {
				setPaletteError(
					err instanceof Error ? err.message : "Failed to load documents",
				)
			} finally {
				setPaletteLoading(false)
			}
		},
		[selectedProject],
	)

	useEffect(() => {
		if (isPaletteOpen) {
			setPalettePage(1)
			loadPalette(1, false)
		}
	}, [isPaletteOpen, loadPalette])

	// Build pseudo-nodes from card positions to reuse NavigationControls
	const controlNodeColor = colors.text.primary
	const nodesForControls = useMemo(() => {
		const nodeSize = Math.max(CARD_WIDTH, CARD_HEIGHT)
		return documents.map((doc) => {
			const pos = cardPositions[doc.id] ?? { x: 0, y: 0 }
			const centerX = pos.x + CARD_HALF_WIDTH
			const centerY = pos.y + CARD_HALF_HEIGHT
			return {
				id: doc.id,
				type: "document",
				x: centerX,
				y: centerY,
				size: nodeSize,
				data: doc,
				color: controlNodeColor,
				isHovered: false,
				isDragging: false,
			}
		}) as any[]
	}, [documents, cardPositions, controlNodeColor])

	useEffect(() => {
		hasAutoCenteredRef.current = false
	}, [])

	const handleCenter = useCallback(() => {
		if (documents.length === 0) return
		// Center on the first document or center of all documents
		if (documents.length === 1) {
			const doc = documents[0]
			if (!doc) return
			const pos = cardPositions[doc.id] ?? { x: 0, y: 0 }
			centerViewportOn(
				pos.x + CARD_HALF_WIDTH,
				pos.y + CARD_HALF_HEIGHT,
				containerSize.width,
				containerSize.height,
				true,
			)
		} else if (nodesForControls.length > 0) {
			// Center and fit all documents
			autoFitToViewport(
				nodesForControls as any,
				containerSize.width,
				containerSize.height,
				{ animate: true },
			)
		}
	}, [
		documents,
		cardPositions,
		nodesForControls,
		autoFitToViewport,
		centerViewportOn,
		containerSize.width,
		containerSize.height,
	])

	const handleAutoFit = useCallback(() => {
		if (documents.length === 0) return
		// Use current positions and fit to viewport
		if (nodesForControls.length > 0) {
			autoFitToViewport(
				nodesForControls as any,
				containerSize.width,
				containerSize.height,
				{ animate: true },
			)
		}
	}, [
		documents,
		nodesForControls,
		autoFitToViewport,
		containerSize.width,
		containerSize.height,
	])

	// Fetch documents by IDs
	const fetchDocuments = useCallback(async () => {
		if (placedDocumentIds.length === 0) {
			setDocuments([])
			return
		}

		// Only show loading if we don't have any documents yet (initial load)
		// Don't show loading for incremental additions (optimistic updates)
		const isInitialLoad = documents.length === 0
		if (isInitialLoad) {
			setIsLoading(true)
		}
		try {
			const containerTags =
				selectedProject && selectedProject !== "sm_project_default"
					? [selectedProject]
					: undefined

			const response = await $fetch("@post/documents/documents/by-ids", {
				body: {
					ids: placedDocumentIds,
					by: "id",
					containerTags,
				},
				disableValidation: true,
			})

			if (response.data?.documents) {
				const fetched: DocumentWithMemories[] = response.data.documents
				// Preserve any existing docs that are in placedDocumentIds but missing from fetch
				// BUT filter out stale optimistic documents (temp IDs that weren't found by API)
				const STALE_OPTIMISTIC_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes
				const now = Date.now()

				setDocuments((prev) => {
					const byIdFetched = new Map(fetched.map((d) => [d.id, d]))
					const byIdPrev = new Map(prev.map((d) => [d.id, d]))
					const ordered: DocumentWithMemories[] = []
					for (const id of placedDocumentIds) {
						const fetchedDoc = byIdFetched.get(id)
						const prevDoc = byIdPrev.get(id)

						if (fetchedDoc) {
							// Prefer fresh data from API
							ordered.push(fetchedDoc)
						} else if (prevDoc) {
							// Check if this is a stale optimistic document
							const isOptimistic =
								id.startsWith("temp-") || (prevDoc as any).isOptimistic
							if (isOptimistic) {
								// Parse timestamp from temp ID or use createdAt
								const timestamp = id.startsWith("temp-")
									? Number.parseInt(id.replace("temp-", ""), 10)
									: new Date(prevDoc.createdAt).getTime()
								const isStale = now - timestamp > STALE_OPTIMISTIC_THRESHOLD_MS

								if (!isStale) {
									// Keep recent optimistic documents (still processing)
									ordered.push(prevDoc)
								}
								// Drop stale optimistic documents - they failed or timed out
							} else {
								// Keep non-optimistic documents
								ordered.push(prevDoc)
							}
						}
					}
					return ordered
				})
				// Auto-scope all placed documents for chat
				setScopedDocumentIds(placedDocumentIds)
			}
		} catch (error) {
			console.error("Error fetching canvas documents:", error)
		} finally {
			// Only clear loading if this was an initial load
			if (isInitialLoad) {
				setIsLoading(false)
			}
		}
	}, [
		placedDocumentIds,
		selectedProject,
		setScopedDocumentIds,
		documents.length, // Add dependency for isInitialLoad check
		// Keep fetch stable; positioning handled by a dedicated effect
	])

	// Fetch documents when IDs change
	useEffect(() => {
		fetchDocuments()
	}, [fetchDocuments])

	// Clear canvas when project changes
	useEffect(() => {
		clearCanvas()
	}, [clearCanvas])

	// Load canvas state from API when project changes
	useEffect(() => {
		const loadCanvasState = async () => {
			if (!selectedProject || typeof window === "undefined") return

			setIsLoadingCanvas(true)
			try {
				const response = await $fetch(`@get/canvas/${selectedProject}`, {
					disableValidation: true,
				})

				if (response.error) {
					console.error("Failed to load canvas state:", response.error)
					return
				}

				const data = response.data as { state?: { positions?: Record<string, { x: number; y: number }>; documentIds?: string[] } } | undefined
				const state = data?.state

				if (state?.positions) {
					setCardPositions(state.positions)
				}
				if (state?.documentIds && Array.isArray(state.documentIds)) {
					setPlacedDocumentIds(state.documentIds)
				}
			} catch (error) {
				console.error("Failed to load canvas state:", error)
			} finally {
				setIsLoadingCanvas(false)
			}
		}

		loadCanvasState()
	}, [selectedProject, setCardPositions, setPlacedDocumentIds])

	// Debounced save to API
	useEffect(() => {
		if (!selectedProject || typeof window === "undefined") return
		if (isLoadingCanvas) return

		const timeoutId = setTimeout(async () => {
			try {
				await $fetch(`@post/canvas/${selectedProject}`, {
					body: {
						state: {
							positions: cardPositions,
							documentIds: placedDocumentIds,
						},
					},
					disableValidation: true,
				})
			} catch (error) {
				console.error("Failed to save canvas state:", error)
			}
		}, 1000)

		return () => clearTimeout(timeoutId)
	}, [cardPositions, placedDocumentIds, selectedProject, isLoadingCanvas])

	// Handle drag start
	const handleDragStart = useCallback((event: DragStartEvent) => {
		const { active } = event
		const document = active.data.current?.document as
			| DocumentWithMemories
			| undefined
		if (document) {
			setActiveDocument(document)
		}
	}, [])

	// Handle drag end
	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			setActiveDocument(null)
			// If dragging from palette, add to canvas near drop point
			const type = event.active?.data?.current?.type as string | undefined
			if (type === "palette-document") {
				const doc = event.active?.data?.current?.document as
					| DocumentWithMemories
					| undefined
				if (!doc) return
				// Estimate drop center from active rect
				const rect =
					event.active?.rect?.current?.translated ||
					event.active?.rect?.current?.initial
				const container = containerRef.current
				if (!container) return
				const bounds = container.getBoundingClientRect()
				const screenX = rect
					? rect.left + rect.width / 2
					: bounds.left + bounds.width / 2
				const screenY = rect
					? rect.top + rect.height / 2
					: bounds.top + bounds.height / 2
				// Convert screen -> world (with zoom validation to prevent division by zero)
				const safeZoom = Math.max(0.05, zoom)
				const worldX = (screenX - bounds.left - panX) / safeZoom
				const worldY = (screenY - bounds.top - panY) / safeZoom

				// SET POSITION FIRST before adding document, so effect won't recalculate
				updateCardPosition(
					doc.id,
					worldX - CARD_HALF_WIDTH,
					worldY - CARD_HALF_HEIGHT,
				)

				// Then add document (effect will skip since position already exists)
				if (!placedDocumentIds.includes(doc.id)) {
					addPlacedDocuments([doc.id])
				}

				// Use functional update to avoid stale state from batching
				setScopedDocumentIds(
					Array.from(new Set([...placedDocumentIds, doc.id])),
				)
				// Optimistically show the card immediately
				if (!documents.find((d) => d.id === doc.id)) {
					setDocuments((prev) => [...prev, doc])
				}
			}
		},
		[
			panX,
			panY,
			zoom,
			placedDocumentIds,
			documents,
			addPlacedDocuments,
			updateCardPosition,
			setScopedDocumentIds,
		],
	)

	// Handle document removal
	const handleRemoveDocument = useCallback(
		(document: DocumentWithMemories) => {
			removePlacedDocument(document.id)
		},
		[removePlacedDocument],
	)

	// Handle open selector
	const handleOpenSelector = useCallback(() => {
		setIsSelectorOpen(true)
	}, [])

	// Minimap dynamic bounds based on current card positions (with margin)
	const minimapWidth = 160
	const minimapHeight = 120
	const bounds = useMemo(() => {
		let minX = Number.POSITIVE_INFINITY
		let minY = Number.POSITIVE_INFINITY
		let maxX = Number.NEGATIVE_INFINITY
		let maxY = Number.NEGATIVE_INFINITY
		const positions = Object.values(cardPositions)
		if (positions.length === 0) {
			// Default bounds around origin if no cards yet
			return { minX: -2000, minY: -2000, maxX: 2000, maxY: 2000 }
		}
		for (const p of positions) {
			if (!p) continue
			minX = Math.min(minX, p.x)
			minY = Math.min(minY, p.y)
			maxX = Math.max(maxX, p.x)
			maxY = Math.max(maxY, p.y)
		}
		const pad = 200
		return {
			minX: minX - pad,
			minY: minY - pad,
			maxX: maxX + pad,
			maxY: maxY + pad,
		}
	}, [cardPositions])

	const worldW = Math.max(1, bounds.maxX - bounds.minX)
	const worldH = Math.max(1, bounds.maxY - bounds.minY)
	const scaleX = minimapWidth / worldW
	const scaleY = minimapHeight / worldH

	const viewportRect = {
		w: (containerSize.width / zoom) * scaleX,
		h: (containerSize.height / zoom) * scaleY,
		x: (-panX / zoom - bounds.minX) * scaleX,
		y: (-panY / zoom - bounds.minY) * scaleY,
	}

	const centerOnMinimap = (e: React.MouseEvent<HTMLDivElement>) => {
		e.preventDefault()
		e.stopPropagation()
		const target = e.currentTarget.getBoundingClientRect()
		const mx = Math.min(Math.max(0, e.clientX - target.left), minimapWidth)
		const my = Math.min(Math.max(0, e.clientY - target.top), minimapHeight)
		const worldX = bounds.minX + (mx / minimapWidth) * worldW
		const worldY = bounds.minY + (my / minimapHeight) * worldH
		centerViewportOn(worldX, worldY, containerSize.width, containerSize.height)
	}

	// Empty state
	if (isEmpty && !isLoading) {
		return (
			<div className="h-full w-full flex items-center justify-center bg-background">
				<div className="flex flex-col items-center gap-4 max-w-md text-center px-4">
					<div className="p-4 rounded-full bg-secondary">
						<Brain
							className="w-12 h-12"
							style={{ color: colors.text.secondary }}
						/>
					</div>
					<div>
						<h2
							className="text-xl font-semibold mb-2"
							style={{ color: colors.text.primary }}
						>
							Welcome to Infinity Canvas
						</h2>
						<p className="text-sm" style={{ color: colors.text.muted }}>
							Select documents to create a focused workspace. The chat will
							respond exclusively based on your selected documents.
						</p>
					</div>
					<Button
						className="backdrop-blur-sm"
						onClick={handleOpenSelector}
						size="sm"
						style={{
							borderColor: "rgba(255,255,255,0.1)",
							color: colors.text.secondary,
							backgroundColor: "rgba(0,0,0,0.2)",
						}}
						variant="outline"
					>
						<Plus className="w-4 h-4 mr-2" /> Add Documents
					</Button>
				</div>

				<DocumentSelectorModal
					onOpenChange={setIsSelectorOpen}
					open={isSelectorOpen}
				/>
			</div>
		)
	}

	// Canvas with documents
	return (
		<div
			className="h-full w-full relative overflow-hidden bg-background"
			ref={containerRef}
			style={{ touchAction: "none", overscrollBehavior: "contain" as any }}
		>
			{/* Action controls above Graph controls (mesmo estilo do Graph) */}
			<div
				className="absolute left-4 z-20 flex flex-col gap-2"
				style={{ bottom: 160 }}
			>
				<Tooltip content="Add documents to canvas" side="right">
					<Button
						className="bg-background/80 backdrop-blur-md hover:bg-blue-500/20 border-2 border-border hover:border-blue-500/50 rounded-xl px-3 py-2 text-foreground/80 hover:text-blue-400 transition-all duration-200 text-sm font-semibold min-w-[120px] shadow-lg hover:shadow-xl group"
						onClick={handleOpenSelector}
						size="sm"
						variant="outline"
					>
						<Plus className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
						Add
					</Button>
				</Tooltip>
				<Tooltip content="Toggle document palette" side="right">
					<Button
						className={`bg-background/80 backdrop-blur-md border-2 rounded-xl px-3 py-2 transition-all duration-200 text-sm font-semibold min-w-[120px] shadow-lg hover:shadow-xl group ${
							isPaletteOpen
								? "bg-purple-500/20 border-purple-500 text-purple-400"
								: "hover:bg-purple-500/20 border-border hover:border-purple-500/50 text-foreground/80 hover:text-purple-400"
						}`}
						onClick={() => setIsPaletteOpen((v) => !v)}
						size="sm"
						variant="outline"
					>
						<PaletteIcon className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
						Palette
					</Button>
				</Tooltip>
				<Tooltip
					content={
						selectedCount > 0
							? `Remove ${selectedCount} selected document(s)`
							: "Select documents to remove"
					}
					side="right"
				>
					<Button
						className="bg-background/80 backdrop-blur-md hover:bg-orange-500/20 border-2 border-border hover:border-orange-500/50 rounded-xl px-3 py-2 text-foreground/80 hover:text-orange-400 transition-all duration-200 text-sm font-semibold min-w-[120px] shadow-lg hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed group"
						disabled={selectedCount === 0}
						onClick={() => {
							removeSelected()
							toast({ title: "Removed selected" })
						}}
						size="sm"
						variant="outline"
					>
						<Minus className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
						Remove
					</Button>
				</Tooltip>
				<Tooltip
					content={
						selectedCount > 0
							? `Clear ${selectedCount} selected document(s)`
							: "No selection to clear"
					}
					side="right"
				>
					<Button
						className="bg-background/80 backdrop-blur-md hover:bg-red-500/20 border-2 border-border hover:border-red-500/50 rounded-xl px-3 py-2 text-foreground/80 hover:text-red-400 transition-all duration-200 text-sm font-semibold min-w-[120px] shadow-lg hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed group"
						disabled={selectedCount === 0}
						onClick={clearSelection}
						size="sm"
						variant="outline"
					>
						<CloseIcon className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
						Clear
					</Button>
				</Tooltip>
				<Tooltip content="Remove all documents from canvas" side="right">
					<Button
						className="bg-background/80 backdrop-blur-md hover:bg-red-600/20 border-2 border-border hover:border-red-600/50 rounded-xl px-3 py-2 text-foreground/80 hover:text-red-500 transition-all duration-200 text-sm font-semibold min-w-[120px] shadow-lg hover:shadow-xl group"
						onClick={() => {
							clearCanvas()
							toast({ title: "Canvas cleared" })
						}}
						size="sm"
						variant="outline"
					>
						<Trash2 className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
						Clear All
					</Button>
				</Tooltip>
			</div>

			{/* Canvas area with drag & drop + pan/zoom */}
			<DndContext
				onDragEnd={handleDragEnd}
				onDragStart={handleDragStart}
				sensors={sensors}
			>
				<div className="h-full w-full pt-24 pb-8 px-8">
					{isLoading ? (
						<div className="flex items-center justify-center h-full">
							<div className="flex items-center gap-2">
								<Sparkles
									className="w-5 h-5 animate-spin"
									style={{ color: colors.text.secondary }}
								/>
								<span style={{ color: colors.text.muted }}>
									Loading documents...
								</span>
							</div>
						</div>
					) : (
						<div
							className="absolute inset-0"
							onMouseDown={handlePanStart as any}
							onMouseLeave={handlePanEnd as any}
							onMouseMove={handlePanMove as any}
							onMouseUp={handlePanEnd as any}
							onTouchEnd={handleTouchEnd as any}
							onTouchMove={handleTouchMove as any}
							onTouchStart={handleTouchStart as any}
							ref={viewportRef}
							style={{ touchAction: "none" }}
						>
							{/* Grid overlay aligned to pan (screen-space, like Graph) */}
							{(() => {
								const GRID = 480 // 4 * 120px majors, como no Graph
								const offsetX = ((panX % GRID) + GRID) % GRID
								const offsetY = ((panY % GRID) + GRID) % GRID
								const gridStyle: React.CSSProperties = {
									position: "absolute",
									inset: 0,
									zIndex: 0,
									backgroundColor: "transparent",
									backgroundImage: `repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 1px, transparent ${GRID}px), repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0, rgba(255,255,255,0.03) 1px, transparent 1px, transparent ${GRID}px)`,
									backgroundSize: `${GRID}px ${GRID}px` as any,
									backgroundPosition: `${-offsetX}px ${-offsetY}px` as any,
									pointerEvents: "none",
								}
								return <div aria-hidden style={gridStyle} />
							})()}

							{/* World layer with cards */}
							<div
								className="absolute z-0"
								style={{
									transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
									transformOrigin: "0 0",
									width: 40000,
									height: 40000,
								}}
							>
								{documents.map((document) => (
									<DraggableCard
										document={document}
										key={document.id}
										onRemove={handleRemoveDocument}
										zoom={zoom}
									/>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Drag overlay for better visual feedback */}
				<DragOverlay
					style={{
						cursor: "grabbing",
					}}
				>
					{activeDocument ? (
						<div
							style={{
								width: "320px",
								transform: "rotate(2deg)",
								opacity: 0.9,
							}}
						>
							<DocumentCard
								document={activeDocument}
								isDragging={true}
								showDragHandle={false}
							/>
						</div>
					) : null}
				</DragOverlay>
			</DndContext>

			{/* Navigation controls */}
			{containerSize.width > 0 && (
				<NavigationControls
					className="absolute bottom-4 left-4 z-30"
					nodes={nodesForControls as any}
					onAutoFit={handleAutoFit}
					onCenter={handleCenter}
					onZoomIn={() =>
						zoomIn(containerSize.width / 2, containerSize.height / 2)
					}
					onZoomOut={() =>
						zoomOut(containerSize.width / 2, containerSize.height / 2)
					}
				/>
			)}

			{/* Palette lateral (drag ou clique para adicionar) */}
			{isPaletteOpen && (
				<div className="absolute top-24 right-4 bottom-4 w-[360px] z-20 border border-border rounded-lg overflow-hidden backdrop-blur-sm bg-background/20">
					<div className="p-3 border-b border-border flex items-center justify-between">
						<p className="text-sm" style={{ color: colors.text.primary }}>
							Documents
						</p>
						<Button
							onClick={() => {
								if (!paletteLoading && paletteHasMore) {
									const next = palettePage + 1
									setPalettePage(next)
									loadPalette(next, true)
								}
							}}
							size="sm"
							style={{
								color: colors.text.secondary,
								borderColor: "rgba(255,255,255,0.1)",
							}}
							variant="outline"
						>
							Load more
						</Button>
					</div>
					<div className="h-full overflow-y-auto p-2 space-y-2">
						{paletteError && (
							<div className="text-xs" style={{ color: colors.text.error }}>
								{paletteError}
							</div>
						)}
						{paletteLoading && paletteDocs.length === 0 && (
							<div className="text-xs" style={{ color: colors.text.muted }}>
								Loading...
							</div>
						)}
						{paletteDocs
							.filter((d) => !placedDocumentIds.includes(d.id))
							.map((doc) => {
								const isOnCanvas = placedDocumentIds.includes(doc.id)
								const DraggablePaletteItem = () => {
									const { attributes, listeners, setNodeRef, isDragging } =
										useDraggable({
											id: `palette-${doc.id}`,
											data: { type: "palette-document", document: doc },
										})
									return (
										<div
											className={`rounded-md border border-border backdrop-blur-sm bg-background/20 ${isDragging ? "opacity-60" : ""}`}
											ref={setNodeRef}
										>
											<div className="p-2">
												<DocumentCard
													document={doc as any}
													dragHandleProps={{ ...attributes, ...listeners }}
													onClick={() => {}}
													showDragHandle
												/>
											</div>
											<div className="px-2 pb-2">
												<Button
													className="w-full"
													disabled={isOnCanvas}
													onClick={(e) => {
														e.stopPropagation()
														if (!placedDocumentIds.includes(doc.id)) {
															// Optimistically inject into canvas
															if (!documents.find((d) => d.id === doc.id)) {
																setDocuments([...documents, doc])
															}
															addPlacedDocuments([doc.id])
															// Position and zoom will be handled by effect automatically
														}
													}}
													size="sm"
													style={{
														color: colors.text.secondary,
														borderColor: "rgba(255,255,255,0.1)",
														backgroundColor: "rgba(0,0,0,0.2)",
													}}
													variant="outline"
												>
													{isOnCanvas ? "On Canvas" : "Add to Canvas"}
												</Button>
											</div>
										</div>
									)
								}
								return <DraggablePaletteItem key={doc.id} />
							})}
						{paletteDocs.filter((d) => !placedDocumentIds.includes(d.id))
							.length === 0 && (
							<div className="text-xs text-muted-foreground px-2 py-3">
								All documents are already on the canvas
							</div>
						)}
						{paletteHasMore && (
							<div className="flex justify-center py-2">
								<Button
									disabled={paletteLoading}
									onClick={() => {
										const next = palettePage + 1
										setPalettePage(next)
										loadPalette(next, true)
									}}
									size="sm"
									style={{
										color: colors.text.secondary,
										borderColor: "rgba(255,255,255,0.1)",
										backgroundColor: "rgba(0,0,0,0.2)",
									}}
									variant="outline"
								>
									Load more
								</Button>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Minimap simples */}
			{isMinimapOpen ? (
				<div
					className="absolute bottom-4 z-20 border border-border rounded-md backdrop-blur-sm"
					onClick={centerOnMinimap}
					style={{
						width: minimapWidth,
						height: minimapHeight,
						backgroundColor: "rgba(0,0,0,0.3)",
						right: isPaletteOpen ? 380 : 16,
						cursor: "crosshair",
					}}
				>
					<button
						aria-label="Close minimap"
						className="absolute -top-2 -right-2 bg-background/40 hover:bg-muted/60 border border-border rounded-full p-1 text-foreground/70 hover:text-foreground"
						onClick={(e) => {
							e.stopPropagation()
							setIsMinimapOpen(false)
						}}
					>
						<CloseIcon className="w-3 h-3" />
					</button>
					<svg height={minimapHeight} width={minimapWidth}>
						{documents.map((doc) => {
							const pos = cardPositions[doc.id] || { x: 0, y: 0 }
							const x = (pos.x - bounds.minX) * scaleX
							const y = (pos.y - bounds.minY) * scaleY
							return <circle cx={x} cy={y} fill="#7aa2ff" key={doc.id} r={2} />
						})}
						<rect
							fill="none"
							height={Math.min(minimapHeight, viewportRect.h)}
							stroke="white"
							strokeWidth={1}
							width={Math.min(minimapWidth, viewportRect.w)}
							x={Math.max(
								0,
								Math.min(minimapWidth - viewportRect.w, viewportRect.x),
							)}
							y={Math.max(
								0,
								Math.min(minimapHeight - viewportRect.h, viewportRect.y),
							)}
						/>
					</svg>
				</div>
			) : (
				<button
					aria-label="Open minimap"
					className="absolute bottom-4 z-20 bg-background/20 hover:bg-muted/30 border border-border hover:border-border/50 rounded-lg p-2 text-foreground/70 hover:text-foreground backdrop-blur-sm"
					onClick={() => setIsMinimapOpen(true)}
					style={{ right: isPaletteOpen ? 380 : 16 }}
				>
					<MapIcon className="w-4 h-4" />
				</button>
			)}

			<DocumentSelectorModal
				onOpenChange={setIsSelectorOpen}
				open={isSelectorOpen}
			/>
		</div>
	)
}
