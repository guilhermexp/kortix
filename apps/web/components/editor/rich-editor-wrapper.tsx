"use client"

import { cn } from "@lib/utils"
import { Button } from "@repo/ui/components/button"
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@repo/ui/components/tabs"
import {
	AlertCircle,
	Check,
	ChevronDown,
	ChevronUp,
	Clock,
	Loader2,
	Save,
	Wifi,
	WifiOff,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
	type ContainerNode,
	createInitialState,
	EditorProvider,
	useEditorState,
} from "@/components/ui/rich-editor"
import { Editor } from "@/components/ui/rich-editor/editor"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { textToEditorContent } from "@/lib/editor/content-conversion"
import type { DocumentWithMemories } from "@/lib/types/document"
import { useAutoSave } from "./auto-save-service"
import { NavigationHeader } from "./navigation-header"

interface RichEditorWrapperProps {
	document: DocumentWithMemories
	readOnly?: boolean
	showNavigation?: boolean
	onDelete?: () => void
}

function SaveStatusIndicator({
	status,
	lastSaved,
	isOnline,
}: {
	status: string
	lastSaved: Date | null
	isOnline?: boolean
}) {
	const getStatusInfo = () => {
		// Show offline indicator if offline
		if (isOnline === false) {
			return {
				icon: WifiOff,
				text: "Offline",
				className: "text-orange-500",
			}
		}

		switch (status) {
			case "pending":
				return {
					icon: Clock,
					text: "Unsaved changes",
					className: "text-yellow-500",
				}
			case "saving":
				return {
					icon: Loader2,
					text: "Saving...",
					className: "text-blue-500 animate-spin",
				}
			case "saved":
				return {
					icon: Check,
					text: lastSaved ? `Saved ${formatTimeSince(lastSaved)}` : "Saved",
					className: "text-green-500",
				}
			case "offline":
				return {
					icon: WifiOff,
					text: "Saved offline",
					className: "text-orange-500",
				}
			case "error":
				return {
					icon: AlertCircle,
					text: "Save failed - saved offline",
					className: "text-red-500",
				}
			default:
				return {
					icon: Check,
					text: "All changes saved",
					className: "text-gray-500",
				}
		}
	}

	const { icon: Icon, text, className } = getStatusInfo()

	return (
		<div className="flex items-center gap-2 text-xs">
			<Icon className={cn("w-3.5 h-3.5", className)} />
			<span className="text-gray-400">{text}</span>
		</div>
	)
}

function formatTimeSince(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

	if (seconds < 10) return "just now"
	if (seconds < 60) return `${seconds}s ago`

	const minutes = Math.floor(seconds / 60)
	if (minutes < 60) return `${minutes}m ago`

	const hours = Math.floor(minutes / 60)
	return `${hours}h ago`
}

export function RichEditorWrapper({
	document,
	readOnly = false,
	showNavigation = false,
	onDelete,
}: RichEditorWrapperProps) {
	// Initialize editor state with document content
	const [initialContent] = useState<ContainerNode>(() => {
		return textToEditorContent(document.content || "")
	})

	const handleUploadImage = useCallback(async (file: File): Promise<string> => {
		try {
			const { uploadImage, validateImageFile } = await import(
				"@/lib/api/upload"
			)

			// Validate the file
			validateImageFile(file)

			// Upload to SuperMemory storage
			const url = await uploadImage(file)
			return url
		} catch (error) {
			console.error("Image upload failed:", error)
			// Fallback to local object URL for now
			return URL.createObjectURL(file)
		}
	}, [])

	return (
		<div className="h-full w-full">
			<EditorProvider initialState={createInitialState(initialContent)}>
				{readOnly ? (
					<div className="h-full overflow-auto p-4">
						<Editor readOnly={true} />
					</div>
				) : (
					<EditorContentWithUpload
						document={document}
						documentId={document.id}
						onDelete={onDelete}
						onUploadImage={handleUploadImage}
						showNavigation={showNavigation}
					/>
				)}
			</EditorProvider>
		</div>
	)
}

function EditorContentWithUpload({
	document,
	documentId,
	onUploadImage,
	showNavigation = false,
	onDelete,
}: {
	document: DocumentWithMemories
	documentId: string
	onUploadImage: (file: File) => Promise<string>
	showNavigation?: boolean
	onDelete?: () => void
}) {
	const state = useEditorState()
	const currentContent = useMemo(
		() => state.history[state.historyIndex],
		[state.history, state.historyIndex],
	)
	const hasMemories = Boolean(
		(document.summary && document.summary.trim().length > 0) ||
			(document.memoryEntries && document.memoryEntries.length > 0),
	)
	const [activeTab, setActiveTab] = useState<string>(
		hasMemories ? "memories" : "document",
	)
	const [rawExpanded, setRawExpanded] = useState(false)

	const rawContent = document.content ?? ""

	const { saveStatus, lastSaved, forceSave, isOnline } = useAutoSave({
		documentId,
		content: currentContent,
		enabled: true,
		delayMs: 2000,
	})

	// Detect unsaved changes
	const hasUnsavedChanges = saveStatus === "pending" || saveStatus === "saving"

	// Warn before leaving with unsaved changes
	useUnsavedChanges({
		hasUnsavedChanges,
		message:
			"You have unsaved changes in the editor. Are you sure you want to leave?",
	})

	const handleManualSave = useCallback(() => {
		forceSave()
	}, [forceSave])

	const isSaving = saveStatus === "saving"

	return (
		<div className="h-full w-full flex flex-col">
			{showNavigation ? (
				<NavigationHeader
					document={document}
					hasUnsavedChanges={hasUnsavedChanges}
					isOnline={isOnline}
					lastSaved={lastSaved}
					onDelete={onDelete}
					onSave={
						activeTab === "document" && rawExpanded
							? handleManualSave
							: undefined
					}
					saveStatus={saveStatus}
				/>
			) : (
				<div className="flex items-center justify-between p-4 border-b border-white/10">
					<SaveStatusIndicator
						isOnline={isOnline}
						lastSaved={lastSaved}
						status={saveStatus}
					/>
					<Button
						disabled={isSaving || activeTab !== "document" || !rawExpanded}
						onClick={handleManualSave}
						size="sm"
						variant="outline"
					>
						<Save className="w-4 h-4 mr-2" />
						{isSaving ? "Saving..." : "Save now"}
					</Button>
				</div>
			)}
			<Tabs
				className="flex-1 flex flex-col gap-0 overflow-hidden"
				onValueChange={setActiveTab}
				value={activeTab}
			>
				<div className="px-3 sm:px-4 py-2 border-b border-white/10 bg-white/5">
					<TabsList className="bg-white/10 text-gray-300">
						<TabsTrigger value="memories">Memórias</TabsTrigger>
						<TabsTrigger value="document">Conteúdo bruto</TabsTrigger>
					</TabsList>
				</div>
				<TabsContent
					className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
					value="memories"
				>
					<MemoryTabContent document={document} />
				</TabsContent>
				<TabsContent
					className="flex-1 flex flex-col overflow-hidden data-[state=inactive]:hidden"
					value="document"
				>
					{rawExpanded ? (
						<div className="flex-1 flex flex-col">
							<div className="px-4 sm:px-6 md:px-8 pt-4">
								<Button
									className="inline-flex items-center gap-1"
									onClick={() => setRawExpanded(false)}
									size="sm"
									variant="outline"
								>
									<ChevronUp className="w-4 h-4" />
									Recolher conteúdo
								</Button>
							</div>
							<div className="flex-1 overflow-auto">
								<div className="min-h-full p-4 sm:p-6 md:p-8">
									<Editor onUploadImage={onUploadImage} readOnly={false} />
								</div>
							</div>
						</div>
					) : (
						<DocumentPreview
							content={rawContent}
							onExpand={() => setRawExpanded(true)}
						/>
					)}
				</TabsContent>
			</Tabs>
		</div>
	)
}

type MemoryEntry = DocumentWithMemories["memoryEntries"][number]

function MemoryTabContent({ document }: { document: DocumentWithMemories }) {
	const summary = document.summary?.trim() ?? ""
	const hasSummary = summary.length > 0

	const normalizedSummary = hasSummary
		? summary.replace(/\s+/g, " ").trim()
		: null

	const memoryEntries =
		document.memoryEntries?.filter((entry) => {
			const memoryText = entry.memory?.trim()
			if (!memoryText) return false
			if (!normalizedSummary) return true
			return memoryText.replace(/\s+/g, " ").trim() !== normalizedSummary
		}) ?? []

	const hasAdditionalMemories = memoryEntries.length > 0

	return (
		<div className="h-full overflow-auto">
			<div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-10 py-6 space-y-6">
				{hasSummary ? (
					<section className="border border-white/10 rounded-xl p-5 sm:p-6 bg-transparent shadow-xl shadow-black/20">
						<h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-3">
							Resumo principal
						</h2>
						<div className="prose prose-invert prose-sm sm:prose-base max-w-none prose-p:my-2 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
							<ReactMarkdown remarkPlugins={[remarkGfm]}>
								{summary}
							</ReactMarkdown>
						</div>
					</section>
				) : null}

				{hasAdditionalMemories ? (
					<section className="space-y-4">
						<div className="flex items-center justify-between">
							<h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
								Memórias vinculadas
							</h2>
							<span className="text-xs text-gray-500">
								{memoryEntries.length}{" "}
								{memoryEntries.length === 1 ? "entrada" : "entradas"}
							</span>
						</div>
						<div className="space-y-4">
							{memoryEntries.map((memory) => (
								<ArticleMemoryCard key={memory.id} memory={memory} />
							))}
						</div>
					</section>
				) : null}

				{!hasSummary && !hasAdditionalMemories ? (
					<div className="border border-dashed border-white/20 rounded-xl p-6 text-center text-sm text-gray-400">
						Nenhuma memória processada ainda para este documento. Adicione
						memórias manualmente ou processe o conteúdo bruto para gerar um
						resumo.
					</div>
				) : null}
			</div>
		</div>
	)
}

function ArticleMemoryCard({ memory }: { memory: MemoryEntry }) {
	const statusBadge = getStatusBadge(memory)
	return (
		<article className="rounded-xl border border-white/10 bg-transparent p-4 sm:p-5 shadow-xl shadow-black/15 space-y-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 flex-wrap">
					{statusBadge}
					<span className="text-xs text-gray-500">v{memory.version}</span>
					{memory.sourceCount ? (
						<span className="text-xs text-gray-500">
							{memory.sourceCount}{" "}
							{memory.sourceCount === 1 ? "fonte" : "fontes"}
						</span>
					) : null}
				</div>
				<span className="text-xs text-gray-500">
					{formatRelativeTime(memory.createdAt.toString())}
				</span>
			</div>
			<div className="prose prose-invert prose-sm sm:prose-base max-w-none prose-p:my-2 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
				<ReactMarkdown remarkPlugins={[remarkGfm]}>
					{memory.memory ?? ""}
				</ReactMarkdown>
			</div>
		</article>
	)
}

function getStatusBadge(memory: MemoryEntry) {
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

function formatRelativeTime(dateString: string) {
	const date = new Date(dateString)
	const now = new Date()
	const diffMs = now.getTime() - date.getTime()
	const diffMins = Math.floor(diffMs / 60000)
	const diffHours = Math.floor(diffMs / 3600000)
	const diffDays = Math.floor(diffMs / 86400000)

	if (Number.isNaN(diffMs)) return ""
	if (diffMins < 1) return "agora"
	if (diffMins < 60) return `${diffMins}m atrás`
	if (diffHours < 24) return `${diffHours}h atrás`
	if (diffDays < 7) return `${diffDays}d atrás`
	return date.toLocaleDateString()
}

function DocumentPreview({
	content,
	onExpand,
}: {
	content: string
	onExpand: () => void
}) {
	const preview = useMemo(() => {
		const lines = content.split("\n")
		const nonEmpty = lines.filter((line) => line.trim().length > 0)
		const previewLines = nonEmpty.slice(0, 8)
		return {
			text: previewLines.join("\n"),
			hasMore: nonEmpty.length > previewLines.length,
			totalLines: nonEmpty.length,
		}
	}, [content])

	const emptyState = preview.totalLines === 0

	return (
		<div className="flex-1 overflow-auto">
			<div className="max-w-4xl mx-auto w-full px-4 sm:px-6 md:px-10 py-6">
				<section className="relative border border-dashed border-white/20 rounded-xl p-5 sm:p-6 bg-[#0f1419]/40 shadow-xl shadow-black/15">
					<div className="flex items-start justify-between gap-4">
						<h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
							Conteúdo bruto (pré-processado)
						</h2>
						<Button
							className="inline-flex items-center gap-1"
							onClick={onExpand}
							size="sm"
							variant="outline"
						>
							<ChevronDown className="w-4 h-4" />
							Ver conteúdo completo
						</Button>
					</div>

					<div className="mt-4">
						{emptyState ? (
							<p className="text-sm text-gray-400 italic">
								Sem conteúdo bruto disponível para este documento.
							</p>
						) : (
							<div className="relative">
								<div className="prose prose-invert prose-sm sm:prose-base max-w-none prose-p:my-2 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
									<ReactMarkdown remarkPlugins={[remarkGfm]}>
										{preview.text}
									</ReactMarkdown>
								</div>
								{preview.hasMore ? (
									<div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0f1419] via-[#0f1419]/80 to-transparent pointer-events-none rounded-b-xl" />
								) : null}
							</div>
						)}
					</div>
				</section>
			</div>
		</div>
	)
}
