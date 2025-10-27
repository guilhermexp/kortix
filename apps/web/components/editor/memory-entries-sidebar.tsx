"use client"

import { cn } from "@lib/utils"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import {
	AlertCircle,
	CheckCircle2,
	Clock,
	Edit2,
	Loader2,
	Plus,
	Save,
	Trash2,
	X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
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

	// Get thumbnail from document
	const documentThumbnail = useMemo(() => {
		if (!document) return null

		// Helper to safely get string from unknown
		const safeString = (value: unknown): string | null => {
			return typeof value === "string" && value ? value : null
		}

		// Helper to get nested object property
		const getRecord = (obj: unknown): Record<string, unknown> | null => {
			return obj && typeof obj === "object"
				? (obj as Record<string, unknown>)
				: null
		}

		const metadata = getRecord(document.metadata)
		const raw = getRecord(document.raw)
		const extraction = getRecord(raw?.extraction)
		const youtube = getRecord(extraction?.youtube)
		const firecrawl =
			getRecord(raw?.firecrawl) || getRecord(extraction?.firecrawl)
		const firecrawlMetadata = getRecord(firecrawl?.metadata) || firecrawl

		// Try multiple locations for thumbnail
		return (
			safeString(youtube?.thumbnail) ||
			safeString(metadata?.thumbnail) ||
			safeString(metadata?.thumbnailUrl) ||
			safeString(metadata?.ogImage) ||
			safeString(metadata?.og_image) ||
			safeString(firecrawlMetadata?.ogImage) ||
			safeString(raw?.ogImage) ||
			null
		)
	}, [document])

	// Get status badge
	const getStatusBadge = (memory: MemoryEntry) => {
		if (memory.isForgotten) {
			return (
				<span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
					Forgotten
				</span>
			)
		}
		if (memory.isInference) {
			return (
				<span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
					Inference
				</span>
			)
		}
		if (memory.isLatest) {
			return (
				<span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
					Latest
				</span>
			)
		}
		return null
	}

    const containerClasses = cn(
        "w-full bg-[#0f1419] flex flex-col",
        variant === "sidebar"
            ? "h-full border-l border-white/10"
            : "border border-white/10 rounded-2xl shadow-xl backdrop-blur-sm",
    )

    const headerClasses =
        variant === "sidebar"
            ? "px-3 md:px-4 py-1.5 border-b border-white/10"
            : "px-5 py-4 border-b border-white/10"

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
						"font-semibold text-white mb-0.5",
						variant === "sidebar" ? "text-sm md:text-base" : "text-base",
					)}
				>
					Memory Entries
				</h2>
				<p className="text-xs text-gray-400">
					Associated memories and insights
				</p>
			</div>

			{/* Thumbnail/Preview */}
			{documentThumbnail && (
				<div className={thumbnailMargin}>
					<img
						alt={document?.title || "Document preview"}
						className="w-full rounded-lg object-cover border border-white/10"
						src={documentThumbnail}
						style={{ maxHeight: "200px" }}
					/>
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
							<Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
						</div>
					)}

					{/* Empty state */}
					{!loading && memories.length === 0 && !editingMemory && (
						<div className="text-center py-8">
							<div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-3">
								<Plus className="w-6 h-6 text-gray-400" />
							</div>
							<p className="text-sm text-gray-400 mb-4">
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
                        memories.map((memory) => (
                            <div
                                className="rounded-lg p-3"
                                key={memory.id}
                            >
								<div className="flex items-start justify-between gap-2 mb-2">
									<div className="flex items-center gap-2 flex-1 min-w-0">
										{getStatusBadge(memory)}
										<span className="text-xs text-gray-500">
											v{memory.version}
										</span>
									</div>
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
								</div>

								<div className="text-sm text-gray-200 mb-2 prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
									<ReactMarkdown remarkPlugins={[remarkGfm]}>
										{memory.memory}
									</ReactMarkdown>
								</div>

								<div className="flex items-center justify-between text-xs text-gray-500">
									<span>{formatDate(memory.createdAt.toString())}</span>
									{memory.sourceCount > 0 && (
										<span>{memory.sourceCount} sources</span>
									)}
								</div>
							</div>
						))}

					{/* Create/Edit form */}
					{editingMemory && (
						<div className="bg-white/5 rounded-lg p-3 border-2 border-blue-500/30">
							<div className="mb-3">
								<label className="text-xs text-gray-400 mb-2 block">
									Memory content
								</label>
								<Textarea
									autoFocus
									className="min-h-24 resize-none bg-black/20"
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
				<div className={cn(footerPadding, "border-t border-white/10")}>
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
