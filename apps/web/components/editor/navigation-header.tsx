"use client"

import { cn } from "@lib/utils"
import { Button } from "@repo/ui/components/button"
import {
	AlertCircle,
	ArrowLeft,
	Check,
	Clock,
	Loader2,
	Save,
	Trash2,
	WifiOff,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"
import type { DocumentWithMemories } from "@/lib/types/document"
import type { SaveStatus } from "./auto-save-service"

interface NavigationHeaderProps {
	document: DocumentWithMemories
	saveStatus: SaveStatus
	lastSaved: Date | null
	onSave?: () => void
	hasUnsavedChanges?: boolean
	onDelete?: () => void
	isOnline?: boolean
}

function SaveStatusIndicator({
	status,
	lastSaved,
	className,
	isOnline,
}: {
	status: SaveStatus
	lastSaved: Date | null
	className?: string
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

	const { icon: Icon, text, className: statusClassName } = getStatusInfo()

	return (
		<div className={cn("flex items-center gap-2 text-xs", className)}>
			<Icon className={cn("w-3.5 h-3.5", statusClassName)} />
			<span className="text-gray-400 hidden sm:inline">{text}</span>
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

export function NavigationHeader({
	document,
	saveStatus,
	lastSaved,
	onSave,
	hasUnsavedChanges = false,
	onDelete,
	isOnline,
}: NavigationHeaderProps) {
	const router = useRouter()
	const [isNavigating, setIsNavigating] = useState(false)

	const handleBack = useCallback(() => {
		if (hasUnsavedChanges) {
			const confirmed = window.confirm(
				"You have unsaved changes. Are you sure you want to leave?",
			)
			if (!confirmed) {
				return
			}
		}

		setIsNavigating(true)
		router.push("/")
	}, [hasUnsavedChanges, router])

	const handleSave = useCallback(() => {
		if (onSave && saveStatus !== "saving") {
			onSave()
		}
	}, [onSave, saveStatus])

	const handleDelete = useCallback(() => {
		if (onDelete) {
			const confirmed = window.confirm(
				"Are you sure you want to delete this document? This action cannot be undone.",
			)
			if (confirmed) {
				onDelete()
			}
		}
	}, [onDelete])

	const isSaving = saveStatus === "saving"
	const canSave = saveStatus === "pending" || saveStatus === "error"

	// Truncate title for mobile
	const displayTitle =
		document.title && document.title.length > 40
			? `${document.title.substring(0, 40)}...`
			: document.title || "Untitled Document"

	return (
		<header className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-white/10 bg-[#0f1419]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0f1419]/80 sticky top-0 z-10">
			{/* Left section - Back button and document info */}
			<div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
				<Button
					className="shrink-0"
					disabled={isNavigating}
					onClick={handleBack}
					size="icon"
					title="Back to home"
					variant="ghost"
				>
					<ArrowLeft className="w-4 h-4" />
				</Button>

				<div className="flex flex-col min-w-0 flex-1">
					<h1 className="text-sm sm:text-base font-semibold text-white truncate">
						{displayTitle}
					</h1>
					<SaveStatusIndicator
						className="hidden xs:flex"
						isOnline={isOnline}
						lastSaved={lastSaved}
						status={saveStatus}
					/>
				</div>
			</div>

			{/* Right section - Actions */}
			<div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
				{/* Save status indicator on mobile (icon only) */}
				<SaveStatusIndicator
					className="flex xs:hidden"
					isOnline={isOnline}
					lastSaved={lastSaved}
					status={saveStatus}
				/>

				{/* Save button - visible when there are unsaved changes */}
				{canSave && onSave && (
					<Button
						className="hidden sm:flex"
						disabled={isSaving}
						onClick={handleSave}
						size="sm"
						variant="outline"
					>
						<Save className="w-4 h-4 sm:mr-2" />
						<span className="hidden sm:inline">
							{isSaving ? "Saving..." : "Save now"}
						</span>
					</Button>
				)}

				{/* Mobile save button (icon only) */}
				{canSave && onSave && (
					<Button
						className="flex sm:hidden"
						disabled={isSaving}
						onClick={handleSave}
						size="icon"
						title="Save now"
						variant="outline"
					>
						<Save className="w-4 h-4" />
					</Button>
				)}

				{/* Delete button (optional) */}
				{onDelete && (
					<Button
						className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
						onClick={handleDelete}
						size="icon"
						title="Delete document"
						variant="ghost"
					>
						<Trash2 className="w-4 h-4" />
					</Button>
				)}
			</div>
		</header>
	)
}
