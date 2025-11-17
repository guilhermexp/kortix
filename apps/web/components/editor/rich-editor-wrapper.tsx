"use client"

import { cn } from "@lib/utils"
import { Button } from "@repo/ui/components/button"
import {
	AlertCircle,
	Check,
	Clock,
	Loader2,
	Save,
	Wifi,
	WifiOff,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
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
					onSave={handleManualSave}
					saveStatus={saveStatus}
				/>
			) : (
				<div className="flex items-center justify-between p-4 border-b border-border">
					<SaveStatusIndicator
						isOnline={isOnline}
						lastSaved={lastSaved}
						status={saveStatus}
					/>
					<Button
						disabled={isSaving}
						onClick={handleManualSave}
						size="sm"
						variant="outline"
					>
						<Save className="w-4 h-4 mr-2" />
						{isSaving ? "Saving..." : "Save now"}
					</Button>
				</div>
			)}
			<div className="flex-1 overflow-auto">
				<div className="min-h-full p-3 sm:p-4 md:p-6">
					<Editor onUploadImage={onUploadImage} readOnly={false} />
				</div>
			</div>
		</div>
	)
}
