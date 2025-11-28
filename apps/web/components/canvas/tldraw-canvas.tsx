"use client"

import { $fetch } from "@repo/lib/api"
import { Button } from "@repo/ui/components/button"
import { getColors } from "@repo/ui/memory-graph/constants"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import {
	ChevronDown,
	ChevronUp,
	Palette as PaletteIcon,
	Plus,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import {
	DefaultStylePanel,
	DefaultStylePanelContent,
	Editor,
	Tldraw,
	createShapeId,
	type TLComponents,
	type TLEditorSnapshot,
} from "tldraw"
import "tldraw/tldraw.css"
import type { z } from "zod"
import { useToast } from "@/components/ui/rich-editor/hooks/use-toast"
import { Tooltip } from "@/components/ui/tooltip"
import { useProject } from "@/stores"
import { useCanvasSelection } from "@/stores/canvas"
import { useCanvasAgentOptional } from "./canvas-agent-provider"
import { DocumentSelectorModal } from "./document-selector-modal"
import { TargetAreaTool } from "./target-area-tool"
import { TargetShapeTool } from "./target-shape-tool"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type DocumentWithMemories = DocumentsResponse["documents"][0]

// No custom StylePanel - we'll handle hide/show via CSS

// Helper to determine if URL is YouTube
const isYouTubeUrl = (url?: string | null): boolean => {
	if (!url) return false
	try {
		const parsed = new URL(url)
		return parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be")
	} catch {
		return false
	}
}

// Helper to get document URL
const getDocumentUrl = (doc: DocumentWithMemories): string | undefined => {
	const metadata = doc.metadata as Record<string, unknown> | null
	return (
		(metadata?.originalUrl as string) ||
		(metadata?.source_url as string) ||
		(metadata?.sourceUrl as string) ||
		doc.url ||
		undefined
	)
}

export function TldrawCanvas() {
	const colors = getColors()
	const { selectedProject } = useProject()
	const {
		placedDocumentIds,
		clearCanvas,
		setScopedDocumentIds,
		setPlacedDocumentIds,
		addPlacedDocuments,
		removePlacedDocument,
	} = useCanvasSelection()
	const { toast } = useToast()

	const [documents, setDocuments] = useState<DocumentWithMemories[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [isSelectorOpen, setIsSelectorOpen] = useState(false)
	const [isPaletteOpen, setIsPaletteOpen] = useState(false)
	const [isStylePanelOpen, setIsStylePanelOpen] = useState(false)
	const [editor, setEditor] = useState<Editor | null>(null)

	// Register editor with CanvasAgentProvider if available
	const canvasAgent = useCanvasAgentOptional()
	useEffect(() => {
		console.log("[TldrawCanvas] Editor/canvasAgent effect:", {
			hasEditor: !!editor,
			hasCanvasAgent: !!canvasAgent,
		})
		if (canvasAgent) {
			canvasAgent.setEditor(editor)
		}
	}, [editor, canvasAgent])

	// Database persistence state
	const [initialSnapshot, setInitialSnapshot] = useState<TLEditorSnapshot | undefined>(undefined)
	const [isDbLoading, setIsDbLoading] = useState(true)
	const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
	const lastSavedRef = useRef<string>("")

	// Load canvas state from database
	useEffect(() => {
		const loadFromDb = async () => {
			const projectId = selectedProject || "default"
			try {
				const response = await $fetch(`@get/canvas/${projectId}`, {
					disableValidation: true,
				})
				if (response.data?.state) {
					setInitialSnapshot(response.data.state as TLEditorSnapshot)
				}
			} catch (error) {
				console.error("Failed to load canvas state:", error)
			} finally {
				setIsDbLoading(false)
			}
		}
		loadFromDb()
	}, [selectedProject])

	// Save canvas state to database with debounce
	const saveToDb = useCallback(async (snapshot: TLEditorSnapshot) => {
		const projectId = selectedProject || "default"
		const snapshotStr = JSON.stringify(snapshot)

		// Skip if nothing changed
		if (snapshotStr === lastSavedRef.current) return
		lastSavedRef.current = snapshotStr

		try {
			await $fetch(`@post/canvas/${projectId}`, {
				body: { state: snapshot },
				disableValidation: true,
			})
		} catch (error) {
			console.error("Failed to save canvas state:", error)
		}
	}, [selectedProject])

	// Listen to editor changes and save with debounce
	useEffect(() => {
		if (!editor) return

		const handleChange = () => {
			// Clear existing timer
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current)
			}

			// Set new debounced save
			saveTimerRef.current = setTimeout(() => {
				const snapshot = editor.getSnapshot()
				saveToDb(snapshot)
			}, 1000) // Save after 1 second of inactivity
		}

		const cleanup = editor.store.listen(handleChange, {
			source: "user",
			scope: "document",
		})

		return () => {
			cleanup()
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current)
			}
		}
	}, [editor, saveToDb])

	// Palette state
	const [paletteDocs, setPaletteDocs] = useState<DocumentWithMemories[]>([])
	const [paletteLoading, setPaletteLoading] = useState(false)
	const [paletteError, setPaletteError] = useState<string | null>(null)
	const [palettePage, setPalettePage] = useState(1)
	const [paletteHasMore, setPaletteHasMore] = useState(true)

	// Load documents
	const fetchDocuments = useCallback(async () => {
		if (placedDocumentIds.length === 0) {
			setDocuments([])
			return
		}

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
				setDocuments((prev) => {
					const byIdFetched = new Map(fetched.map((d) => [d.id, d]))
					const byIdPrev = new Map(prev.map((d) => [d.id, d]))
					const ordered: DocumentWithMemories[] = []
					for (const id of placedDocumentIds) {
						const doc = byIdFetched.get(id) || byIdPrev.get(id)
						if (doc) ordered.push(doc)
					}
					return ordered
				})
				setScopedDocumentIds(placedDocumentIds)
			}
		} catch (error) {
			console.error("Error fetching canvas documents:", error)
		} finally {
			if (isInitialLoad) {
				setIsLoading(false)
			}
		}
	}, [placedDocumentIds, selectedProject, setScopedDocumentIds, documents.length])

	useEffect(() => {
		fetchDocuments()
	}, [fetchDocuments])

	// Clear canvas when project changes
	useEffect(() => {
		clearCanvas()
		if (editor) {
			editor.selectAll().deleteShapes(editor.getSelectedShapeIds())
		}
	}, [selectedProject, clearCanvas, editor])

	// Sync documents to tldraw native shapes
	useEffect(() => {
		if (!editor) return

		const currentShapes = editor.getCurrentPageShapes()

		// Get existing document shape IDs (stored in meta)
		const existingDocIds = new Set(
			currentShapes
				.filter((s) => s.meta?.supermemoryDocId)
				.map((s) => s.meta.supermemoryDocId as string)
		)

		// Add new documents as native tldraw shapes
		const GRID_COLS = 3
		const GAP = 40
		let addedCount = 0

		documents.forEach((doc, index) => {
			if (existingDocIds.has(doc.id)) return

			const col = (index + addedCount) % GRID_COLS
			const row = Math.floor((index + addedCount) / GRID_COLS)
			const x = col * (400 + GAP)
			const y = row * (300 + GAP)

			const url = getDocumentUrl(doc)
			const shapeId = createShapeId()

			if (url && isYouTubeUrl(url)) {
				// Create embed shape for YouTube
				editor.createShape({
					id: shapeId,
					type: "embed",
					x,
					y,
					props: {
						url,
						w: 400,
						h: 225,
					},
					meta: {
						supermemoryDocId: doc.id,
						supermemoryTitle: doc.title,
					},
				})
			} else if (url) {
				// Create bookmark shape for URLs
				editor.createShape({
					id: shapeId,
					type: "bookmark",
					x,
					y,
					props: {
						url,
						assetId: null,
					},
					meta: {
						supermemoryDocId: doc.id,
						supermemoryTitle: doc.title,
					},
				})
			} else {
				// Create note shape for text documents
				const content = doc.title || doc.content?.slice(0, 500) || "Untitled"
				editor.createShape({
					id: shapeId,
					type: "note",
					x,
					y,
					props: {
						text: content,
						size: "m",
						color: "yellow",
					},
					meta: {
						supermemoryDocId: doc.id,
					},
				})
			}

			addedCount++
		})

		// Remove shapes for documents no longer in the list
		const docIds = new Set(documents.map((d) => d.id))
		const shapesToDelete = currentShapes
			.filter((s) => s.meta?.supermemoryDocId && !docIds.has(s.meta.supermemoryDocId as string))
			.map((s) => s.id)

		if (shapesToDelete.length > 0) {
			editor.deleteShapes(shapesToDelete)
		}
	}, [editor, documents])

	// Sync tldraw state back to our store
	useEffect(() => {
		if (!editor) return

		const handleChange = () => {
			const shapes = editor.getCurrentPageShapes()
			const docIds = shapes
				.filter((s) => s.meta?.supermemoryDocId)
				.map((s) => s.meta.supermemoryDocId as string)

			// Update scoped documents for chat
			setScopedDocumentIds(docIds)
		}

		const cleanup = editor.store.listen(handleChange, {
			source: "user",
			scope: "document",
		})

		return cleanup
	}, [editor, setScopedDocumentIds])

	// Note: Persistence is handled automatically by tldraw's persistenceKey prop

	// Load palette documents
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
							response.data.pagination.totalPages
					)
				}
			} catch (err) {
				setPaletteError(
					err instanceof Error ? err.message : "Failed to load documents"
				)
			} finally {
				setPaletteLoading(false)
			}
		},
		[selectedProject]
	)

	useEffect(() => {
		if (isPaletteOpen) {
			setPalettePage(1)
			loadPalette(1, false)
		}
	}, [isPaletteOpen, loadPalette])

	// Add document to canvas
	const handleAddDocument = useCallback(
		(doc: DocumentWithMemories) => {
			if (!placedDocumentIds.includes(doc.id)) {
				addPlacedDocuments([doc.id])
				if (!documents.find((d) => d.id === doc.id)) {
					setDocuments((prev) => [...prev, doc])
				}
				toast({ title: `Added "${doc.title || 'Document'}" to canvas` })
			}
		},
		[placedDocumentIds, documents, addPlacedDocuments, toast]
	)

	// Show loading while fetching from database
	if (isDbLoading) {
		return (
			<div className="h-full w-full flex items-center justify-center bg-background">
				<div className="text-muted-foreground">Loading canvas...</div>
			</div>
		)
	}

	return (
		<div className="h-full w-full relative overflow-hidden bg-background">
			{/* Side controls */}
			<div
				className="absolute left-4 z-[100] flex flex-col gap-2"
				style={{ top: 60 }}
			>
				<Tooltip content="Add documents to canvas" side="right">
					<Button
						className="bg-background/80 backdrop-blur-md hover:bg-blue-500/20 border-2 border-border hover:border-blue-500/50 rounded-xl px-3 py-2 text-foreground/80 hover:text-blue-400 transition-all duration-200 text-sm font-semibold shadow-lg hover:shadow-xl group"
						onClick={() => setIsSelectorOpen(true)}
						size="sm"
						variant="outline"
					>
						<Plus className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
						Add Docs
					</Button>
				</Tooltip>
				<Tooltip content="Toggle document palette" side="right">
					<Button
						className={`bg-background/80 backdrop-blur-md border-2 rounded-xl px-3 py-2 transition-all duration-200 text-sm font-semibold shadow-lg hover:shadow-xl group ${
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
			</div>

			{/* Style panel toggle button - positioned in top right */}
			<div className="absolute right-4 z-[100]" style={{ top: 60 }}>
				<Tooltip content={isStylePanelOpen ? "Hide style panel" : "Show style panel"} side="left">
					<Button
						className={`bg-background/80 backdrop-blur-md border-2 rounded-xl p-2 transition-all duration-200 shadow-lg hover:shadow-xl ${
							isStylePanelOpen
								? "bg-blue-500/20 border-blue-500 text-blue-400"
								: "border-border hover:border-blue-500/50 text-foreground/80 hover:text-blue-400"
						}`}
						onClick={() => setIsStylePanelOpen((v) => !v)}
						size="sm"
						variant="outline"
					>
						{isStylePanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
					</Button>
				</Tooltip>
			</div>

			{/* Tldraw Canvas - Full UI enabled */}
			<div className="absolute inset-0 tldraw-dark-theme">
				{/* Dynamic CSS for style panel visibility */}
				<style>{`
					.tlui-style-panel {
						opacity: ${isStylePanelOpen ? '1' : '0'} !important;
						pointer-events: ${isStylePanelOpen ? 'auto' : 'none'} !important;
						transition: opacity 0.2s ease-in-out !important;
					}
				`}</style>
				<Tldraw
					onMount={setEditor}
					inferDarkMode
					snapshot={initialSnapshot}
					tools={[TargetShapeTool, TargetAreaTool]}
				/>
			</div>

			{/* Palette panel */}
			{isPaletteOpen && (
				<div className="absolute top-16 right-4 bottom-4 w-[320px] z-[100] border border-border rounded-lg overflow-hidden backdrop-blur-md bg-background/95">
					<div className="p-3 border-b border-border flex items-center justify-between">
						<p className="text-sm font-medium" style={{ color: colors.text.primary }}>
							Documents
						</p>
						<Button
							onClick={() => setIsPaletteOpen(false)}
							size="sm"
							variant="ghost"
						>
							×
						</Button>
					</div>
					<div className="h-[calc(100%-60px)] overflow-y-auto p-2 space-y-2">
						{paletteError && (
							<div className="text-xs text-red-500 p-2">
								{paletteError}
							</div>
						)}
						{paletteLoading && paletteDocs.length === 0 && (
							<div className="text-xs text-muted-foreground p-2">
								Loading...
							</div>
						)}
						{paletteDocs
							.filter((d) => !placedDocumentIds.includes(d.id))
							.map((doc) => {
								const url = getDocumentUrl(doc)
								return (
									<div
										key={doc.id}
										className="rounded-md border border-border bg-card p-3 hover:bg-accent/50 cursor-pointer transition-colors"
										onClick={() => handleAddDocument(doc)}
									>
										<p className="text-sm font-medium truncate">
											{doc.title || "Untitled"}
										</p>
										{url && (
											<p className="text-xs text-muted-foreground truncate mt-1">
												{new URL(url).hostname}
											</p>
										)}
										<p className="text-xs text-muted-foreground mt-1">
											{doc.type} • Click to add
										</p>
									</div>
								)
							})}
						{paletteDocs.filter((d) => !placedDocumentIds.includes(d.id)).length === 0 &&
							!paletteLoading && (
								<div className="text-xs text-muted-foreground p-2">
									All documents are already on the canvas
								</div>
							)}
						{paletteHasMore && (
							<Button
								className="w-full mt-2"
								disabled={paletteLoading}
								onClick={() => {
									const next = palettePage + 1
									setPalettePage(next)
									loadPalette(next, true)
								}}
								size="sm"
								variant="outline"
							>
								{paletteLoading ? "Loading..." : "Load more"}
							</Button>
						)}
					</div>
				</div>
			)}

			<DocumentSelectorModal
				onOpenChange={setIsSelectorOpen}
				open={isSelectorOpen}
			/>
		</div>
	)
}
