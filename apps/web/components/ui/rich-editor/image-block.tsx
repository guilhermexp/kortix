"use client"

import { ImageIcon, Loader2, X } from "lucide-react"
import type React from "react"
import { useState } from "react"

import { Button } from "../button"
import { Card } from "../card"
import { Checkbox } from "../checkbox"
import { Skeleton } from "../skeleton"
import type { TextNode } from "./types"

interface ImageBlockProps {
	node: TextNode
	isActive: boolean
	onClick: () => void
	onDelete?: () => void
	onDragStart?: (nodeId: string) => void
	isSelected?: boolean
	onToggleSelection?: (nodeId: string) => void
	onClickWithModifier?: (e: React.MouseEvent, nodeId: string) => void
}

export function ImageBlock({
	node,
	isActive,
	onClick,
	onDelete,
	onDragStart,
	isSelected = false,
	onToggleSelection,
	onClickWithModifier,
}: ImageBlockProps) {
	const [imageError, setImageError] = useState(false)

	const handleClick = (e: React.MouseEvent) => {
		// Check for Ctrl/Cmd click first
		if (onClickWithModifier) {
			onClickWithModifier(e, node.id)
		}

		// Only call regular onClick if not a modifier click
		if (!e.ctrlKey && !e.metaKey) {
			onClick()
		}
	}

	const handleDragStart = (e: React.DragEvent) => {
		e.dataTransfer.effectAllowed = "move"
		e.dataTransfer.setData("text/plain", node.id)
		e.dataTransfer.setData(
			"application/json",
			JSON.stringify({
				nodeId: node.id,
				type: node.type,
				src: node.attributes?.src,
			}),
		)
		if (onDragStart) {
			onDragStart(node.id)
		}
	}

	const handleDragEnd = (e: React.DragEvent) => {}

	const imageUrl = node.attributes?.src as string | undefined
	const altText = node.attributes?.alt as string | undefined
	const caption = node.content || ""
	const isUploading =
		node.attributes?.loading === "true" || node.attributes?.loading === true
	const hasError =
		node.attributes?.error === "true" || node.attributes?.error === true

	const handleImageLoad = () => {
		setImageError(false)
	}

	const handleImageError = () => {
		setImageError(true)
	}

	return (
		<Card
			className={`group relative mb-4 cursor-move !border-0 p-4 transition-all duration-200 ${isActive ? "ring-primary/50 bg-accent/5 ring-2" : "hover:bg-accent/5"} ${isSelected ? "bg-blue-500/10 ring-2 ring-blue-500" : ""} `}
			draggable
			onClick={handleClick}
			onDragEnd={handleDragEnd}
			onDragStart={handleDragStart}
		>
			{/* Selection checkbox */}
			{onToggleSelection && (
				<div
					className={`absolute top-2 left-2 z-10 transition-opacity ${
						isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
					}`}
					onClick={(e: React.MouseEvent) => {
						e.stopPropagation()
					}}
				>
					<Checkbox
						checked={isSelected}
						className="bg-background h-5 w-5 border-2"
						onCheckedChange={() => onToggleSelection(node.id)}
					/>
				</div>
			)}

			{/* Delete button */}
			{onDelete && (
				<Button
					className="absolute top-2 right-2 z-10 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
					onClick={(e) => {
						e.stopPropagation()
						onDelete()
					}}
					size="icon"
					variant="destructive"
				>
					<X className="h-4 w-4" />
				</Button>
			)}

			{/* Image container */}
			<div className="relative w-full">
				{/* Uploading state - show spinner overlay */}
				{isUploading && (
					<div className="bg-muted/50 border-primary/50 flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
						<Loader2 className="text-primary mb-3 h-12 w-12 animate-spin" />
						<p className="text-foreground text-sm font-medium">
							Uploading image...
						</p>
						<p className="text-muted-foreground mt-1 text-xs">Please wait</p>
					</div>
				)}

				{/* Error state (from upload failure) */}
				{!isUploading && hasError && (
					<div className="bg-destructive/10 border-destructive/50 flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
						<X className="text-destructive mb-2 h-12 w-12" />
						<p className="text-destructive text-sm font-medium">
							Upload Failed
						</p>
						<p className="text-muted-foreground mt-1 text-xs">
							Please try again
						</p>
					</div>
				)}

				{/* Normal image loading/error states */}
				{!isUploading && !hasError && (
					<>
						{/* Error state */}
						{imageError && (
							<div className="bg-muted border-muted-foreground/25 flex h-64 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed">
								<ImageIcon className="text-muted-foreground/50 mb-2 h-12 w-12" />
								<p className="text-muted-foreground text-sm">
									Failed to load image
								</p>
								{imageUrl && (
									<p className="text-muted-foreground/70 mt-1 max-w-xs truncate text-xs">
										{imageUrl}
									</p>
								)}
							</div>
						)}

						{/* Actual image */}
						{imageUrl && (
							<img
								alt={altText || caption || "Uploaded image"}
								className="h-auto max-h-[600px] rounded-lg object-cover"
								onError={handleImageError}
								onLoad={handleImageLoad}
								src={imageUrl}
								style={{ width: "auto", margin: "auto" }}
							/>
						)}

						{/* Caption */}
						{caption && (
							<p className="text-muted-foreground mt-3 text-center text-sm italic">
								{caption}
							</p>
						)}
					</>
				)}
			</div>
		</Card>
	)
}
