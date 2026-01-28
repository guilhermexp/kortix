/**
 * Related Documents Panel
 *
 * Displays documents related to the current document based on
 * semantic similarity and manual connections.
 */

import { getColors } from "@repo/ui/memory-graph/constants"
import type { DocumentWithMemories } from "@ui/memory-graph/types"
import { FileText, Link2, Plus, Sparkles, Trash2, User } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
	createDocumentConnection,
	deleteDocumentConnection,
	listDocumentConnections,
} from "@lib/api"
import { Button } from "../ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog"

// Type definitions matching backend validation schemas
type ConnectionType = "automatic" | "manual"

type RelatedDocument = {
	connectionId: string // Connection ID for deletion
	documentId: string
	title: string | null | undefined
	summary: string | null | undefined
	similarityScore: number
	connectionType: ConnectionType
	reason?: string | null
	createdAt: string
}

interface RelatedDocumentsPanelProps {
	document: DocumentWithMemories
}

// Helper function to transform API response to RelatedDocument format
const transformConnectionToRelatedDoc = (conn: any): RelatedDocument => {
	return {
		connectionId: conn.id,
		documentId: conn.targetDocumentId,
		title: conn.targetDocument?.title,
		summary: conn.targetDocument?.summary,
		similarityScore: conn.similarityScore || 0,
		connectionType: conn.connectionType,
		reason: conn.reason,
		createdAt: conn.createdAt,
	}
}

const getConnectionIcon = (type: ConnectionType) => {
	switch (type) {
		case "automatic":
			return <Sparkles className="w-3 h-3" />
		case "manual":
			return <User className="w-3 h-3" />
		default:
			return <Link2 className="w-3 h-3" />
	}
}

const getConnectionLabel = (type: ConnectionType) => {
	switch (type) {
		case "automatic":
			return "Auto"
		case "manual":
			return "Manual"
		default:
			return "Link"
	}
}

const getStrengthColor = (score: number): string => {
	if (score >= 0.9) return "rgba(34, 197, 94, 0.9)" // green-500
	if (score >= 0.8) return "rgba(59, 130, 246, 0.9)" // blue-500
	if (score >= 0.7) return "rgba(168, 85, 247, 0.9)" // purple-500
	return "rgba(156, 163, 175, 0.9)" // gray-400
}

const getStrengthOpacity = (score: number): number => {
	// Map similarity score (0.7-1.0) to opacity (0.6-1.0)
	const minScore = 0.5
	const maxScore = 1.0
	const minOpacity = 0.6
	const maxOpacity = 1.0

	const normalizedScore = Math.max(
		0,
		Math.min(1, (score - minScore) / (maxScore - minScore)),
	)
	return minOpacity + normalizedScore * (maxOpacity - minOpacity)
}

const RelatedDocumentsPanelImpl = ({
	document,
}: RelatedDocumentsPanelProps) => {
	const colors = getColors()
	const [expandedReasons, setExpandedReasons] = useState<Set<string>>(
		new Set(),
	)
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
	const [relatedDocs, setRelatedDocs] = useState<RelatedDocument[]>([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [selectedDocumentId, setSelectedDocumentId] = useState("")
	const [connectionReason, setConnectionReason] = useState("")
	const [addLoading, setAddLoading] = useState(false)

	// Fetch related documents on mount
	useEffect(() => {
		async function fetchRelatedDocs() {
			try {
				setLoading(true)
				const response = await listDocumentConnections(document.id, {
					limit: 10,
				})

				// Transform to expected format
				const connections = response?.data?.connections ?? []
				const docs: RelatedDocument[] = connections.map((conn: any) =>
					transformConnectionToRelatedDoc(conn),
				)

				setRelatedDocs(docs)
				setError(null)
			} catch (err) {
				console.error("Failed to fetch related documents:", err)
				setError("Failed to load related documents")
			} finally {
				setLoading(false)
			}
		}

		fetchRelatedDocs()
	}, [document.id])

	const toggleReason = useCallback((docId: string) => {
		setExpandedReasons((prev) => {
			const next = new Set(prev)
			if (next.has(docId)) {
				next.delete(docId)
			} else {
				next.add(docId)
			}
			return next
		})
	}, [])

	const navigateToDocument = useCallback((docId: string) => {
		window.location.href = `/memory/${docId}/edit`
	}, [])

	// Show loading state
	if (loading) {
		return (
			<div className="mt-6">
				<div
					className="text-sm font-medium mb-3 py-2"
					style={{ color: colors.text.secondary }}
				>
					<div className="flex items-center gap-2">
						<Link2 className="w-4 h-4" />
						Documentos Relacionados
					</div>
				</div>
				<div className="text-sm" style={{ color: colors.text.secondary }}>
					Carregando documentos relacionados...
				</div>
			</div>
		)
	}

	// Show error state
	if (error) {
		return (
			<div className="mt-6">
				<div
					className="text-sm font-medium mb-3 py-2"
					style={{ color: colors.text.secondary }}
				>
					<div className="flex items-center gap-2">
						<Link2 className="w-4 h-4" />
						Documentos Relacionados
					</div>
				</div>
				<div className="text-sm text-red-400">{error}</div>
			</div>
		)
	}

	const handleDeleteConnection = useCallback(
		async (connectionId: string, targetDocId: string) => {
			if (
				!window.confirm(
					"Are you sure you want to remove this connection? This action cannot be undone.",
				)
			) {
				return
			}

			try {
				await deleteDocumentConnection(connectionId)

				// Update local state to remove the deleted connection
				setRelatedDocs((prev) =>
					prev.filter((doc) => doc.documentId !== targetDocId),
				)
			} catch (error) {
				console.error("Failed to delete connection:", error)
				alert("Failed to remove connection. Please try again.")
			}
		},
		[],
	)

	const handleAddConnection = useCallback(async () => {
		if (!selectedDocumentId) {
			alert("Please enter a document ID")
			return
		}

		try {
			setAddLoading(true)
			await createDocumentConnection(
				document.id,
				selectedDocumentId,
				connectionReason || undefined,
			)

			setIsAddDialogOpen(false)
			setSelectedDocumentId("")
			setConnectionReason("")

			// Reload to show new connection
			window.location.reload()
		} catch (error) {
			console.error("Failed to create connection:", error)
			alert("Failed to create connection. Please try again.")
		} finally {
			setAddLoading(false)
		}
	}, [document.id, selectedDocumentId, connectionReason])

	return (
		<div className="mt-6">
			<div
				className="text-sm font-medium mb-3 flex items-center justify-between py-2"
				style={{ color: colors.text.secondary }}
			>
				<div className="flex items-center gap-2">
					<Link2 className="w-4 h-4" />
					Documentos Relacionados ({relatedDocs.length})
				</div>

				<Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
					<DialogTrigger asChild>
						<Button
							size="sm"
							variant="outline"
							className="h-7 px-2 text-xs"
							type="button"
						>
							<Plus className="w-3 h-3" />
							<span>Add Connection</span>
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Add Manual Connection</DialogTitle>
							<DialogDescription>
								Create a manual connection to another document. Manual
								connections help you organize related information that might not
								be automatically detected.
							</DialogDescription>
						</DialogHeader>

						<div className="py-4 space-y-4">
							<div>
								<label
									className="text-sm font-medium"
									style={{ color: colors.text.primary }}
								>
									Target Document ID
								</label>
								<input
									type="text"
									placeholder="Enter document ID"
									className="w-full mt-2 px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm"
									style={{ color: colors.text.primary }}
									value={selectedDocumentId}
									onChange={(e) => setSelectedDocumentId(e.target.value)}
								/>
								<p
									className="text-xs mt-1"
									style={{ color: colors.text.secondary }}
								>
									For now, paste the document ID. Document search will be added
									later.
								</p>
							</div>

							<div>
								<label
									className="text-sm font-medium"
									style={{ color: colors.text.primary }}
								>
									Reason (optional)
								</label>
								<textarea
									placeholder="Why are these documents connected?"
									className="w-full mt-2 px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm"
									style={{ color: colors.text.primary }}
									rows={3}
									maxLength={500}
									value={connectionReason}
									onChange={(e) => setConnectionReason(e.target.value)}
								/>
							</div>
						</div>

						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setIsAddDialogOpen(false)}
								type="button"
								disabled={addLoading}
							>
								Cancel
							</Button>
							<Button
								onClick={handleAddConnection}
								type="button"
								disabled={addLoading || !selectedDocumentId}
							>
								{addLoading ? "Adding..." : "Add Connection"}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<div className="grid grid-cols-1 gap-3">
				{relatedDocs.map((doc) => {
					const isReasonExpanded = expandedReasons.has(doc.documentId)
					const hasReason = doc.reason && doc.reason.trim().length > 0
					const strengthColor = getStrengthColor(doc.similarityScore)
					const opacity = getStrengthOpacity(doc.similarityScore)

					return (
						<div
							className="relative group rounded-lg overflow-hidden border transition-all hover:border-white/20"
							key={doc.documentId}
							style={{
								borderColor: "rgba(255, 255, 255, 0.08)",
								backgroundColor: "rgba(255, 255, 255, 0.03)",
								opacity,
							}}
						>
							{/* Strength indicator bar */}
							<div
								className="absolute left-0 top-0 bottom-0 w-1 transition-all"
								style={{
									backgroundColor: strengthColor,
								}}
							/>

							{/* Content */}
							<div className="pl-4 pr-3 py-3">
								<div className="flex items-start justify-between gap-2 mb-2">
									<div
										className="flex-1 cursor-pointer"
										onClick={() => navigateToDocument(doc.documentId)}
									>
										<div className="flex items-center gap-2 mb-1">
											<FileText className="w-4 h-4 flex-shrink-0" />
											<h4
												className="text-sm font-medium line-clamp-1"
												style={{ color: colors.text.primary }}
											>
												{doc.title || "Untitled Document"}
											</h4>
										</div>

										{doc.summary && (
											<p
												className="text-xs line-clamp-2 ml-6"
												style={{ color: colors.text.secondary }}
											>
												{doc.summary}
											</p>
										)}
									</div>

									<div className="flex items-center gap-1.5">
										{/* Connection type badge */}
										<div
											className="flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium flex-shrink-0"
											style={{
												backgroundColor: "rgba(12, 18, 30, 0.75)",
												color: "rgba(255, 255, 255, 0.92)",
												backdropFilter: "blur(12px)",
												WebkitBackdropFilter: "blur(12px)",
											}}
										>
											{getConnectionIcon(doc.connectionType)}
											<span>{getConnectionLabel(doc.connectionType)}</span>
										</div>

										{/* Delete button - only for manual connections */}
										{doc.connectionType === "manual" && (
											<Button
												size="icon-sm"
												variant="ghost"
												className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
												onClick={(e) => {
													e.stopPropagation()
													handleDeleteConnection(doc.connectionId, doc.documentId)
												}}
												type="button"
												title="Remove connection"
											>
												<Trash2 className="w-3 h-3 text-red-400" />
											</Button>
										)}
									</div>
								</div>

								{/* Similarity score */}
								<div className="flex items-center gap-2 ml-6 mb-2">
									<div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
										<div
											className="h-full rounded-full transition-all"
											style={{
												backgroundColor: strengthColor,
												width: `${doc.similarityScore * 100}%`,
											}}
										/>
									</div>
									<span
										className="text-[10px] font-mono tabular-nums"
										style={{ color: colors.text.secondary }}
									>
										{Math.round(doc.similarityScore * 100)}%
									</span>
								</div>

								{/* Connection reason */}
								{hasReason && (
									<div className="ml-6">
										<button
											className="text-xs underline decoration-dotted hover:decoration-solid transition-all"
											onClick={() => toggleReason(doc.documentId)}
											style={{ color: colors.text.secondary }}
											type="button"
										>
											{isReasonExpanded ? "Ocultar razão" : "Ver razão"}
										</button>

										{isReasonExpanded && (
											<p
												className="text-xs mt-2 p-2 rounded border"
												style={{
													color: colors.text.secondary,
													backgroundColor: "rgba(255, 255, 255, 0.02)",
													borderColor: "rgba(255, 255, 255, 0.08)",
												}}
											>
												{doc.reason}
											</p>
										)}
									</div>
								)}
							</div>
						</div>
					)
				})}
			</div>
		</div>
	)
}

export const RelatedDocumentsPanel = memo(RelatedDocumentsPanelImpl)
