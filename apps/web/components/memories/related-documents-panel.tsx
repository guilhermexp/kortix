/**
 * Related Documents Panel
 *
 * Displays documents related to the current document based on
 * semantic similarity and manual connections.
 */

import { getColors } from "@repo/ui/memory-graph/constants"
import type { DocumentWithMemories } from "@ui/memory-graph/types"
import { FileText, Link2, Sparkles, User } from "lucide-react"
import { memo, useCallback, useMemo, useState } from "react"

// Type definitions matching backend validation schemas
type ConnectionType = "automatic" | "manual"

type RelatedDocument = {
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

const asRecord = (obj: unknown): Record<string, unknown> | undefined => {
	return obj && typeof obj === "object" && !Array.isArray(obj)
		? (obj as Record<string, unknown>)
		: undefined
}

const extractRelatedDocuments = (
	document: DocumentWithMemories,
): RelatedDocument[] => {
	const raw = asRecord(document.raw)
	if (!raw) return []

	const relatedDocs = raw.relatedDocuments
	if (!Array.isArray(relatedDocs)) return []

	return relatedDocs.filter(
		(doc): doc is RelatedDocument =>
			doc &&
			typeof doc === "object" &&
			typeof doc.documentId === "string" &&
			typeof doc.similarityScore === "number",
	)
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

	const relatedDocs = useMemo(
		() => extractRelatedDocuments(document),
		[document],
	)

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

	if (relatedDocs.length === 0) {
		return null
	}

	return (
		<div className="mt-6">
			<div
				className="text-sm font-medium mb-3 flex items-center gap-2 py-2"
				style={{ color: colors.text.secondary }}
			>
				<Link2 className="w-4 h-4" />
				Documentos Relacionados ({relatedDocs.length})
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
