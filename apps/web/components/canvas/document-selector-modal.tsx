"use client"

import { cn } from "@lib/utils"
import { $fetch } from "@repo/lib/api"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import { Checkbox } from "@repo/ui/components/checkbox"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@repo/ui/components/dialog"
import { Input } from "@repo/ui/components/input"
import { colors } from "@repo/ui/memory-graph/constants"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import { Brain, Search, Sparkles, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { z } from "zod"
import { getDocumentIcon } from "@/lib/document-icon"
import { useProject } from "@/stores"
import { useCanvasPositions, useCanvasSelection } from "@/stores/canvas"
import { formatDate } from "../memories"
import { getDocumentSnippet } from "../memories"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type DocumentWithMemories = DocumentsResponse["documents"][0]

interface DocumentSelectorModalProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function DocumentSelectorModal({
	open,
	onOpenChange,
}: DocumentSelectorModalProps) {
    const { selectedProject } = useProject()
    const { addPlacedDocuments, placedDocumentIds } = useCanvasSelection()
    const { cardPositions, updateCardPosition } = useCanvasPositions()

	const [documents, setDocuments] = useState<DocumentWithMemories[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const [searchQuery, setSearchQuery] = useState("")
	const [page, setPage] = useState(1)
	const [hasMore, setHasMore] = useState(true)
	const [totalCount, setTotalCount] = useState(0)

	const ITEMS_PER_PAGE = 20

	// Fetch documents from the current project
	const fetchDocuments = useCallback(
		async (pageNum: number, append = false) => {
			setIsLoading(true)
			setError(null)

			try {
				const containerTags =
					selectedProject && selectedProject !== "sm_project_default"
						? [selectedProject]
						: undefined

				const response = await $fetch("@post/documents/documents", {
					body: {
						containerTags,
						limit: ITEMS_PER_PAGE,
						page: pageNum,
						sort: "updatedAt",
						order: "desc",
					},
					disableValidation: true,
				})

				if (response.data) {
					const newDocs = response.data.documents
					setDocuments((prev) => (append ? [...prev, ...newDocs] : newDocs))
					setTotalCount(response.data.pagination.totalItems)
					setHasMore(
						response.data.pagination.currentPage <
							response.data.pagination.totalPages,
					)
				}
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to fetch documents",
				)
			} finally {
				setIsLoading(false)
			}
		},
		[selectedProject],
	)

	// Reset and fetch on open or project change
	useEffect(() => {
		if (open) {
			setPage(1)
			setSelectedIds(new Set())
			setSearchQuery("")
			fetchDocuments(1, false)
		}
	}, [open, fetchDocuments])

	// Filter documents based on search query
	const filteredDocuments = useMemo(() => {
		if (!searchQuery.trim()) return documents

		const query = searchQuery.toLowerCase()
		return documents.filter(
			(doc) =>
				doc.title?.toLowerCase().includes(query) ||
				doc.content?.toLowerCase().includes(query) ||
				doc.url?.toLowerCase().includes(query),
		)
	}, [documents, searchQuery])

	// Filter out already placed documents
	const availableDocuments = useMemo(() => {
		return filteredDocuments.filter(
			(doc) => !placedDocumentIds.includes(doc.id),
		)
	}, [filteredDocuments, placedDocumentIds])

	// Handle select/deselect individual document
	const toggleDocumentSelection = useCallback((docId: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev)
			if (next.has(docId)) {
				next.delete(docId)
			} else {
				next.add(docId)
			}
			return next
		})
	}, [])

	// Handle select all
	const handleSelectAll = useCallback(() => {
		if (selectedIds.size === availableDocuments.length) {
			setSelectedIds(new Set())
		} else {
			setSelectedIds(new Set(availableDocuments.map((doc) => doc.id)))
		}
	}, [availableDocuments, selectedIds.size])

	// Handle load more
	const handleLoadMore = useCallback(() => {
		if (!isLoading && hasMore) {
			const nextPage = page + 1
			setPage(nextPage)
			fetchDocuments(nextPage, true)
		}
	}, [isLoading, hasMore, page, fetchDocuments])

	// Handle confirm selection
    const handleConfirm = useCallback(() => {
        const ids = Array.from(selectedIds)
        if (ids.length === 0) return

        // Compute non-overlapping positions near the centroid of existing cards
        const existing = Object.values(cardPositions)
        const spacingX = 460
        const spacingY = 420
        const halfW = 160
        const halfH = 210

        const center = existing.length
            ? {
                  x:
                      existing.reduce((s, p) => s + p.x, 0) / existing.length,
                  y:
                      existing.reduce((s, p) => s + p.y, 0) / existing.length,
              }
            : { x: -halfW, y: -halfH }

        const occupied = new Set(
            existing.map((p) => `${Math.round(p.x / spacingX)}:${Math.round(p.y / spacingY)}`),
        )

        const usedCells = new Set<string>()
        const takeCell = (gx: number, gy: number) => {
            const key = `${gx}:${gy}`
            if (occupied.has(key) || usedCells.has(key)) return false
            usedCells.add(key)
            return true
        }

        const candidates: Array<{ gx: number; gy: number }> = []
        const rings = 8
        for (let r = 0; r <= rings; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
                    candidates.push({ gx: dx, gy: dy })
                }
            }
        }

        // Shuffle to avoid tight clustering
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
        }

        const baseGX = Math.round(center.x / spacingX)
        const baseGY = Math.round(center.y / spacingY)

        const placed: Record<string, { x: number; y: number }> = {}
        let idx = 0
        for (const id of ids) {
            let placedOne = false
            // try up to N candidates around base
            for (let k = idx; k < candidates.length; k++) {
                const c = candidates[k]
                const gx = baseGX + c.gx
                const gy = baseGY + c.gy
                if (takeCell(gx, gy)) {
                    const x = gx * spacingX
                    const y = gy * spacingY
                    placed[id] = { x, y }
                    placedOne = true
                    idx = k + 1
                    break
                }
            }
            if (!placedOne) {
                // fallback random nearby
                const gx = baseGX + Math.floor((Math.random() - 0.5) * 6)
                const gy = baseGY + Math.floor((Math.random() - 0.5) * 6)
                const x = gx * spacingX
                const y = gy * spacingY
                placed[id] = { x, y }
            }
        }

        // Optimistically add docs and apply positions immediately
        addPlacedDocuments(ids)
        for (const [id, pos] of Object.entries(placed)) {
            updateCardPosition(id, pos.x, pos.y)
        }

        onOpenChange(false)
    }, [selectedIds, addPlacedDocuments, onOpenChange, cardPositions, updateCardPosition])

	// Handle cancel
	const handleCancel = useCallback(() => {
		setSelectedIds(new Set())
		onOpenChange(false)
	}, [onOpenChange])

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent
				className="max-w-3xl max-h-[80vh] flex flex-col border border-white/10 backdrop-blur-sm"
				style={{ backgroundColor: "rgba(0,0,0,0.2)" }}
			>
				<DialogHeader>
					<DialogTitle style={{ color: colors.text.primary }}>
						Add Documents to Canvas
					</DialogTitle>
					<DialogDescription style={{ color: colors.text.muted }}>
						Select documents from your current project to add to the canvas. The
						chat will respond based only on selected documents.
					</DialogDescription>
				</DialogHeader>

				{/* Search and stats */}
				<div className="space-y-3">
					<div className="relative">
						<Search
							className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
							style={{ color: colors.text.muted }}
						/>
						<Input
							className="pl-9 border-white/10 backdrop-blur-sm"
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Search documents..."
							style={{
								backgroundColor: "rgba(0,0,0,0.2)",
								borderColor: "rgba(255, 255, 255, 0.1)",
								color: colors.text.primary,
							}}
							value={searchQuery}
						/>
					</div>

					<div className="flex items-center justify-between text-sm">
						<div style={{ color: colors.text.muted }}>
							{availableDocuments.length > 0 ? (
								<>
									{availableDocuments.length} document
									{availableDocuments.length !== 1 ? "s" : ""} available
									{placedDocumentIds.length > 0 && (
										<span className="ml-2">
											({placedDocumentIds.length} already on canvas)
										</span>
									)}
								</>
							) : (
								<>No documents available</>
							)}
						</div>
						{availableDocuments.length > 0 && (
							<Button
								onClick={handleSelectAll}
								size="sm"
								style={{ color: colors.text.secondary }}
								variant="ghost"
							>
								{selectedIds.size === availableDocuments.length
									? "Deselect All"
									: "Select All"}
							</Button>
						)}
					</div>
				</div>

				{/* Document list */}
				<div
					className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar"
					style={{ minHeight: "300px", maxHeight: "400px" }}
				>
					{error ? (
						<div
							className="flex items-center justify-center py-8"
							style={{ color: colors.text.error }}
						>
							{error}
						</div>
					) : isLoading && documents.length === 0 ? (
						<div className="flex items-center justify-center py-8">
							<Sparkles
								className="w-4 h-4 animate-spin mr-2"
								style={{ color: colors.text.secondary }}
							/>
							<span style={{ color: colors.text.muted }}>
								Loading documents...
							</span>
						</div>
					) : availableDocuments.length === 0 ? (
						<div
							className="flex flex-col items-center justify-center py-12"
							style={{ color: colors.text.muted }}
						>
							<Brain className="w-12 h-12 mb-3 opacity-30" />
							<p className="text-center">
								{searchQuery
									? "No documents match your search"
									: placedDocumentIds.length > 0
										? "All documents are already on the canvas"
										: "No documents available in this project"}
							</p>
						</div>
					) : (
						<>
							{availableDocuments.map((document) => {
								const isSelected = selectedIds.has(document.id)
								const activeMemories = document.memoryEntries.filter(
									(m) => !m.isForgotten,
								)

								return (
									<div
										className={cn(
											"flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer",
											isSelected
												? "border-blue-500/50 bg-blue-500/10"
												: "border-white/10 hover:border-white/20",
										)}
										key={document.id}
										onClick={() => toggleDocumentSelection(document.id)}
										style={{
											backgroundColor: isSelected
												? "rgba(59, 130, 246, 0.1)"
												: colors.background.primary,
										}}
									>
										<Checkbox
											checked={isSelected}
											onCheckedChange={() =>
												toggleDocumentSelection(document.id)
											}
											onClick={(e) => e.stopPropagation()}
										/>

										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 mb-1">
												{getDocumentIcon(
													document.type,
													"w-4 h-4 flex-shrink-0",
												)}
												<p
													className="text-sm font-medium line-clamp-1 flex-1"
													style={{ color: colors.text.primary }}
												>
													{document.title?.startsWith("data:")
														? "Untitled Document"
														: document.title || "Untitled Document"}
												</p>
												<span
													className="text-xs flex-shrink-0"
													style={{ color: colors.text.muted }}
												>
													{formatDate(document.createdAt)}
												</span>
											</div>

											{(() => {
												const snippet = getDocumentSnippet(document)
												return (
													snippet && !snippet.startsWith("data:") && (
													<p
														className="text-xs line-clamp-2 mb-2"
														style={{ color: colors.text.muted }}
													>
														{snippet}
													</p>
												)
												)
											})()}

											<div className="flex items-center gap-2">
												{activeMemories.length > 0 && (
													<Badge
														className="text-xs"
														style={{
															backgroundColor: colors.memory.secondary,
															color: colors.text.primary,
														}}
														variant="secondary"
													>
														<Brain className="w-3 h-3 mr-1" />
														{activeMemories.length}{" "}
														{activeMemories.length === 1
															? "memory"
															: "memories"}
													</Badge>
												)}
												{document.type && (
													<Badge
														className="text-xs"
														style={{
															borderColor: "rgba(255, 255, 255, 0.2)",
															color: colors.text.muted,
														}}
														variant="outline"
													>
														{document.type}
													</Badge>
												)}
											</div>
										</div>
									</div>
								)
							})}

							{hasMore && (
								<Button
									className="w-full"
									disabled={isLoading}
									onClick={handleLoadMore}
									style={{
										borderColor: "rgba(255, 255, 255, 0.1)",
										color: colors.text.secondary,
									}}
									variant="outline"
								>
									{isLoading ? (
										<>
											<Sparkles className="w-4 h-4 mr-2 animate-spin" />
											Loading more...
										</>
									) : (
										`Load More (${totalCount - documents.length} remaining)`
									)}
								</Button>
							)}
						</>
					)}
				</div>

				{/* Footer */}
				<DialogFooter>
					<Button onClick={handleCancel} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={selectedIds.size === 0}
						onClick={handleConfirm}
						style={{
							backgroundColor:
								selectedIds.size > 0 ? colors.primary : undefined,
						}}
					>
						Add {selectedIds.size > 0 && `(${selectedIds.size})`} to Canvas
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
