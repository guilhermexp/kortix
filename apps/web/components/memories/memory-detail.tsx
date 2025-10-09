import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from "@repo/ui/components/drawer"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@repo/ui/components/sheet"
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@repo/ui/components/tabs"
import { colors } from "@repo/ui/memory-graph/constants"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import { Badge } from "@ui/components/badge"
import { Label1Regular } from "@ui/text/label/label-1-regular"
import {
	Brain,
	Calendar,
	CircleUserRound,
	ExternalLink,
	List,
	Sparkles,
} from "lucide-react"
import { memo, useEffect, useState } from "react"
import type { z } from "zod"
import { getDocumentIcon } from "@/lib/document-icon"
import { MarkdownContent } from "../markdown-content"
import { ImageGallery } from "./image-gallery"
import { formatDate, getSourceUrl } from "."

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type DocumentWithMemories = DocumentsResponse["documents"][0]
type MemoryEntry = DocumentWithMemories["memoryEntries"][0]

const formatDocumentType = (type: string) => {
	// Special case for PDF
	if (type.toLowerCase() === "pdf") return "PDF"

	// Replace underscores with spaces and capitalize each word
	return type
		.split("_")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
		.join(" ")
}

const MemoryDetailItem = memo(({ memory }: { memory: MemoryEntry }) => {
	return (
		<button
			className="p-4 rounded-lg transition-all relative overflow-hidden cursor-pointer"
			style={{
				backgroundColor: memory.isLatest
					? colors.memory.primary
					: "rgba(255, 255, 255, 0.02)",
			}}
			tabIndex={0}
			type="button"
		>
			<div className="flex items-start gap-2 relative z-10">
				<div
					className="p-1 rounded"
					style={{
						backgroundColor: memory.isLatest
							? colors.memory.secondary
							: "transparent",
					}}
				>
					<Brain
						className={`w-4 h-4 flex-shrink-0 transition-all ${
							memory.isLatest ? "text-blue-400" : "text-blue-400/50"
						}`}
					/>
				</div>
				<div className="flex-1 space-y-2">
					<Label1Regular
						className="text-sm leading-relaxed text-left"
						style={{ color: colors.text.primary }}
					>
						{memory.memory}
					</Label1Regular>
					<div className="flex gap-2 justify-between">
						<div
							className="flex items-center gap-4 text-xs"
							style={{ color: colors.text.muted }}
						>
							<span className="flex items-center gap-1">
								<Calendar className="w-3 h-3" />
								{formatDate(memory.createdAt)}
							</span>
							<span className="font-mono">v{memory.version}</span>
							{memory.sourceRelevanceScore && (
								<span
									className="flex items-center gap-1"
									style={{
										color:
											memory.sourceRelevanceScore > 70
												? colors.accent.emerald
												: colors.text.muted,
									}}
								>
									<Sparkles className="w-3 h-3" />
									{memory.sourceRelevanceScore}%
								</span>
							)}
						</div>
						<div className="flex items-center gap-2 flex-wrap">
							{memory.isForgotten && (
								<Badge
									className="text-xs border-red-500/30 backdrop-blur-sm"
									style={{
										backgroundColor: colors.status.forgotten,
										color: "#dc2626",
										backdropFilter: "blur(4px)",
										WebkitBackdropFilter: "blur(4px)",
									}}
									variant="destructive"
								>
									Forgotten
								</Badge>
							)}
							{memory.isLatest && (
								<Badge
									className="text-xs"
									style={{
										backgroundColor: colors.memory.secondary,
										color: colors.text.primary,
										backdropFilter: "blur(4px)",
										WebkitBackdropFilter: "blur(4px)",
									}}
									variant="default"
								>
									Latest
								</Badge>
							)}
							{memory.forgetAfter && (
								<Badge
									className="text-xs backdrop-blur-sm"
									style={{
										color: colors.status.expiring,
										backgroundColor: "rgba(251, 165, 36, 0.1)",
										backdropFilter: "blur(4px)",
										WebkitBackdropFilter: "blur(4px)",
									}}
									variant="outline"
								>
									Expires: {formatDate(memory.forgetAfter)}
								</Badge>
							)}
						</div>
					</div>
				</div>
			</div>
		</button>
	)
})

export const MemoryDetail = memo(
	({
		document,
		isOpen,
		onClose,
		isMobile,
	}: {
		document: DocumentWithMemories | null
		isOpen: boolean
		onClose: () => void
		isMobile: boolean
	}) => {
		const [activeTab, setActiveTab] = useState(() => {
			if (!document) return "summary"
			const hasSummary = document.summary && document.summary.trim().length > 0
			const hasContent = document.content && document.content.trim().length > 0
			return hasSummary ? "summary" : hasContent ? "content" : "summary"
		})

		useEffect(() => {
			if (!document) return
			const hasSummary = document.summary && document.summary.trim().length > 0
			const hasContent = document.content && document.content.trim().length > 0
			setActiveTab(hasSummary ? "summary" : hasContent ? "content" : "summary")
		}, [document?.id])

		if (!document) return null

		const activeMemories = document.memoryEntries.filter((m) => !m.isForgotten)
		const forgottenMemories = document.memoryEntries.filter(
			(m) => m.isForgotten,
		)

		const HeaderContent = ({
			TitleComponent,
		}: {
			TitleComponent: typeof SheetTitle | typeof DrawerTitle
		}) => (
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-start gap-3 flex-1">
					<div
						className="p-2 rounded-lg bg-white/5 border border-white/10"
					>
						{getDocumentIcon(document.type, "w-5 h-5 text-white/70")}
					</div>
					<div className="flex-1">
						<TitleComponent className="text-white">
							{document.title || "Untitled Document"}
						</TitleComponent>
						<div
							className="flex items-center gap-2 mt-1 text-xs text-white/50"
						>
							<span>{formatDocumentType(document.type)}</span>
							<span>•</span>
							<span>{formatDate(document.createdAt)}</span>
							{document.url && (
								<>
									<span>•</span>
									<button
										className="flex items-center gap-1 transition-all hover:gap-2 text-blue-400 hover:text-blue-300"
										onClick={() => {
											const sourceUrl = getSourceUrl(document)
											window.open(sourceUrl ?? undefined, "_blank")
										}}
										type="button"
									>
										View source
										<ExternalLink className="w-3 h-3" />
									</button>
								</>
							)}
						</div>
					</div>
				</div>
			</div>
		)

		const ContentAndSummarySection = () => {
			const hasContent = document.content && document.content.trim().length > 0
			const hasSummary = document.summary && document.summary.trim().length > 0

			if (!hasContent && !hasSummary) return null

			return (
				<div className="mt-4">
					<Tabs className="w-full" value={activeTab} onValueChange={setActiveTab}>
						<TabsList
							className={`grid w-full bg-white/5 border border-white/10 rounded-md h-11 ${
								hasContent && hasSummary ? "grid-cols-2" : "grid-cols-1"
							}`}
						>
							{hasSummary && (
								<TabsTrigger
									className="text-xs flex items-center gap-2 bg-transparent h-8 text-white/70 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300"
									value="summary"
								>
									<List className="w-3 h-3" />
									Summary
								</TabsTrigger>
							)}
							{hasContent && (
								<TabsTrigger
									className="text-xs flex items-center gap-2 bg-transparent h-8 text-white/70 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300"
									value="content"
								>
									<CircleUserRound className="w-3 h-3" />
									Original Content
								</TabsTrigger>
							)}
						</TabsList>

					{hasSummary && (
						<TabsContent className="mt-3 flex-1 max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar" value="summary">
							<div className="space-y-4 pb-6">
								{/* Summary Text */}
								<div className="p-4 rounded-md bg-white/5 border border-white/10">
									<MarkdownContent
										className="text-sm leading-relaxed text-white/80"
										content={document.summary ?? ""}
									/>
								</div>
								{/* Images Gallery */}
								<ImageGallery document={document} />
							</div>
						</TabsContent>
					)}

						{hasContent && (
							<TabsContent className="mt-3" value="content">
								<div className="p-4 rounded-md max-h-48 overflow-y-auto custom-scrollbar bg-white/5 border border-white/10">
									<MarkdownContent
										className="text-sm leading-relaxed text-white"
										content={document.content ?? ""}
									/>
								</div>
							</TabsContent>
						)}
					</Tabs>
				</div>
			)
		}

		const MemoryContent = () => (
			<div className="space-y-6 px-6 bg-[#0f1419]">
				{activeMemories.length > 0 && (
					<div>
						<div
							className="text-sm font-medium mb-2 flex items-start gap-2 py-2 text-white/70"
						>
							Active Memories ({activeMemories.length})
						</div>
						<div className="space-y-3">
							{activeMemories.map((memory) => (
								<div key={memory.id}>
									<MemoryDetailItem memory={memory} />
								</div>
							))}
						</div>
					</div>
				)}

				{forgottenMemories.length > 0 && (
					<div>
						<div
							className="text-sm font-medium mb-4 px-3 py-2 rounded-md opacity-60 bg-white/5 border border-white/10 text-white/50"
						>
							Forgotten Memories ({forgottenMemories.length})
						</div>
						<div className="space-y-3 opacity-40">
							{forgottenMemories.map((memory) => (
								<MemoryDetailItem key={memory.id} memory={memory} />
							))}
						</div>
					</div>
				)}

				{activeMemories.length === 0 && forgottenMemories.length === 0 && (
					<div
						className="text-center py-12 rounded-md bg-white/5 border border-white/10"
					>
						<Brain
							className="w-12 h-12 mx-auto mb-4 opacity-30 text-white/50"
						/>
						<p className="text-white/50">
							No memories found for this document
						</p>
					</div>
				)}
			</div>
		)

		if (isMobile) {
			return (
				<Drawer onOpenChange={onClose} open={isOpen}>
					<DrawerContent
						className="border-0 p-0 overflow-hidden max-h-[90vh] bg-[#0f1419]"
						style={{
							borderTop: `1px solid rgba(255, 255, 255, 0.1)`,
							backdropFilter: "blur(20px)",
							WebkitBackdropFilter: "blur(20px)",
						}}
					>
						{/* Header section */}
						<div
							className="p-6 relative border-b bg-[#0f1419]"
							style={{
								borderBottom: `1px solid rgba(255, 255, 255, 0.1)`,
							}}
						>
							<DrawerHeader className="pb-0 px-0 text-left">
								<HeaderContent TitleComponent={DrawerTitle} />
							</DrawerHeader>

							<ContentAndSummarySection />
						</div>

						{activeTab === "content" && (
							<div className="flex-1 memory-drawer-scroll overflow-y-auto bg-[#0f1419]">
								<MemoryContent />
							</div>
						)}
					</DrawerContent>
				</Drawer>
			)
		}

		return (
			<Sheet onOpenChange={onClose} open={isOpen}>
				<SheetContent
					className="w-full sm:max-w-2xl border-0 p-0 overflow-hidden bg-[#0f1419] border-l border-white/10"
				>
					<div
						className="p-6 relative bg-[#0f1419] border-b border-white/10"
					>
						<SheetHeader className="pb-0">
							<HeaderContent TitleComponent={SheetTitle} />
						</SheetHeader>

						<ContentAndSummarySection />
					</div>

					{activeTab === "content" && (
						<div className="h-[calc(100vh-200px)] memory-sheet-scroll overflow-y-auto bg-[#0f1419]">
							<MemoryContent />
						</div>
					)}
				</SheetContent>
			</Sheet>
		)
	},
)
