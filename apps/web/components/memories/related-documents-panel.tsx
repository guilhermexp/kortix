/**
 * Related Documents Panel
 *
 * Displays documents related to the current document based on
 * semantic similarity and manual connections.
 */

import { $fetch } from "@lib/api"
import { getColors } from "@repo/ui/memory-graph/constants"
import {
	ChevronLeft,
	FileText,
	Link2,
	Loader2,
	Plus,
	Search,
	Sparkles,
	Trash2,
	User,
} from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import {
	createDocumentConnection,
	deleteDocumentConnection,
	listDocumentConnections,
} from "@lib/api"
import type { DocumentWithMemories } from "@/lib/types/document"
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

	// Project + document picker state
	type PickerProject = { id: string; name: string | null; containerTag: string | null }
	type PickerDoc = { id: string; title: string | null; type: string | null }
	const [projects, setProjects] = useState<PickerProject[]>([])
	const [projectDocs, setProjectDocs] = useState<PickerDoc[]>([])
	const [selectedProject, setSelectedProject] = useState<PickerProject | null>(null)
	const [docSearch, setDocSearch] = useState("")
	const [loadingProjects, setLoadingProjects] = useState(false)
	const [loadingDocs, setLoadingDocs] = useState(false)
	const [selectedDocForConnection, setSelectedDocForConnection] = useState<PickerDoc | null>(null)

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

	// Load projects when dialog opens
	useEffect(() => {
		if (!isAddDialogOpen) return
		let ignore = false
		async function loadProjects() {
			setLoadingProjects(true)
			try {
				const response = await $fetch("@get/projects")
				if (ignore) return
				setProjects(
					(response.data?.projects ?? []).map((p: any) => ({
						id: p.id,
						name: p.name ?? null,
						containerTag: p.containerTag ?? null,
					})),
				)
			} catch {
				// ignore
			} finally {
				if (!ignore) setLoadingProjects(false)
			}
		}
		loadProjects()
		return () => { ignore = true }
	}, [isAddDialogOpen])

	// Load docs when a project is selected
	useEffect(() => {
		if (!selectedProject) {
			setProjectDocs([])
			return
		}
		let ignore = false
		async function loadDocs() {
			setLoadingDocs(true)
			try {
				const res = await fetch("/v3/documents/documents", {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						limit: 200,
						page: 1,
						sort: "updatedAt",
						order: "desc",
						...(selectedProject!.containerTag
							? { containerTags: [selectedProject!.containerTag] }
							: {}),
					}),
				})
				if (!res.ok || ignore) return
				const data = await res.json()
				if (ignore) return
				const docs = Array.isArray(data?.documents) ? data.documents : []
				setProjectDocs(
					docs
						.filter((d: any) => d.id !== document.id)
						.map((d: any) => ({
							id: d.id,
							title: d.title ?? null,
							type: d.type ?? null,
						})),
				)
			} catch {
				// ignore
			} finally {
				if (!ignore) setLoadingDocs(false)
			}
		}
		loadDocs()
		return () => { ignore = true }
	}, [selectedProject, document.id])

	const filteredDocs = useMemo(() => {
		const q = docSearch.trim().toLowerCase()
		if (!q) return projectDocs
		return projectDocs.filter(
			(d) => (d.title || d.id).toLowerCase().includes(q),
		)
	}, [projectDocs, docSearch])

	const resetPickerState = useCallback(() => {
		setSelectedProject(null)
		setProjectDocs([])
		setDocSearch("")
		setSelectedDocForConnection(null)
		setSelectedDocumentId("")
		setConnectionReason("")
	}, [])

	const handleAddConnection = useCallback(async () => {
		const targetId = selectedDocumentId || selectedDocForConnection?.id
		if (!targetId) return

		try {
			setAddLoading(true)
			await createDocumentConnection(
				document.id,
				targetId,
				connectionReason || undefined,
			)

			setIsAddDialogOpen(false)
			resetPickerState()

			// Reload to show new connection
			window.location.reload()
		} catch (error) {
			console.error("Failed to create connection:", error)
			alert("Failed to create connection. Please try again.")
		} finally {
			setAddLoading(false)
		}
	}, [document.id, selectedDocumentId, selectedDocForConnection, connectionReason, resetPickerState])

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

				<Dialog
					open={isAddDialogOpen}
					onOpenChange={(open) => {
						setIsAddDialogOpen(open)
						if (!open) resetPickerState()
					}}
				>
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
					<DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
						<DialogHeader>
							<DialogTitle>Conectar documento</DialogTitle>
							<DialogDescription>
								Selecione um projeto e depois o documento que deseja conectar.
							</DialogDescription>
						</DialogHeader>

						{/* Step: confirm selected doc */}
						{selectedDocForConnection ? (
							<div className="py-3 space-y-4">
								<div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
									<FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
									<div className="flex-1 min-w-0">
										<p className="text-sm font-medium truncate" style={{ color: colors.text.primary }}>
											{selectedDocForConnection.title || "Sem título"}
										</p>
										<p className="text-[10px] text-muted-foreground font-mono truncate">
											{selectedDocForConnection.id}
										</p>
									</div>
									<button
										type="button"
										className="text-xs text-muted-foreground hover:text-foreground"
										onClick={() => {
											setSelectedDocForConnection(null)
											setSelectedDocumentId("")
										}}
									>
										Trocar
									</button>
								</div>
								<div>
									<label className="text-sm font-medium" style={{ color: colors.text.primary }}>
										Razão (opcional)
									</label>
									<textarea
										placeholder="Por que esses documentos estão conectados?"
										className="w-full mt-2 px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm"
										style={{ color: colors.text.primary }}
										rows={2}
										maxLength={500}
										value={connectionReason}
										onChange={(e) => setConnectionReason(e.target.value)}
									/>
								</div>
								<DialogFooter>
									<Button
										variant="outline"
										onClick={() => { setIsAddDialogOpen(false); resetPickerState() }}
										type="button"
										disabled={addLoading}
									>
										Cancelar
									</Button>
									<Button
										onClick={handleAddConnection}
										type="button"
										disabled={addLoading}
									>
										{addLoading ? "Conectando..." : "Conectar"}
									</Button>
								</DialogFooter>
							</div>
						) : !selectedProject ? (
							/* Step: pick project */
							<div className="py-2">
								{loadingProjects ? (
									<div className="flex items-center justify-center py-8 text-muted-foreground">
										<Loader2 className="w-4 h-4 animate-spin mr-2" />
										<span className="text-sm">Carregando projetos...</span>
									</div>
								) : projects.length === 0 ? (
									<p className="text-sm text-muted-foreground py-4 text-center">
										Nenhum projeto encontrado.
									</p>
								) : (
									<div className="space-y-1 max-h-[50vh] overflow-y-auto">
										{projects.map((proj) => (
											<button
												key={proj.id}
												type="button"
												className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-white/5"
												style={{ color: colors.text.primary }}
												onClick={() => setSelectedProject(proj)}
											>
												<span className="truncate">{proj.name || proj.containerTag || proj.id}</span>
											</button>
										))}
									</div>
								)}
							</div>
						) : (
							/* Step: pick document from project */
							<div className="py-2 space-y-2">
								<button
									type="button"
									className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
									onClick={() => {
										setSelectedProject(null)
										setProjectDocs([])
										setDocSearch("")
									}}
								>
									<ChevronLeft className="w-3.5 h-3.5" />
									<span>{selectedProject.name || "Projetos"}</span>
								</button>

								<div className="relative">
									<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
									<input
										type="text"
										placeholder="Buscar documento..."
										className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm"
										style={{ color: colors.text.primary }}
										value={docSearch}
										onChange={(e) => setDocSearch(e.target.value)}
										autoFocus
									/>
								</div>

								{loadingDocs ? (
									<div className="flex items-center justify-center py-8 text-muted-foreground">
										<Loader2 className="w-4 h-4 animate-spin mr-2" />
										<span className="text-sm">Carregando documentos...</span>
									</div>
								) : filteredDocs.length === 0 ? (
									<p className="text-sm text-muted-foreground py-4 text-center">
										{docSearch ? "Nenhum resultado." : "Nenhum documento neste projeto."}
									</p>
								) : (
									<div className="space-y-0.5 max-h-[50vh] overflow-y-auto">
										{filteredDocs.map((doc) => (
											<button
												key={doc.id}
												type="button"
												className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-white/5"
												style={{ color: colors.text.primary }}
												onClick={() => {
													setSelectedDocForConnection(doc)
													setSelectedDocumentId(doc.id)
												}}
											>
												<FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
												<span className="truncate flex-1">{doc.title || "Sem título"}</span>
												{doc.type && (
													<span className="text-[10px] text-muted-foreground/60 flex-shrink-0">
														{doc.type}
													</span>
												)}
											</button>
										))}
									</div>
								)}
							</div>
						)}
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
