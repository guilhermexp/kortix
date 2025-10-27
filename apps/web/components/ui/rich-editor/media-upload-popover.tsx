"use client"

import { Image as ImageIcon, ImagePlus, LayoutGrid, Video } from "lucide-react"
import React from "react"

import { Button } from "../button"
import { Popover, PopoverContent, PopoverTrigger } from "../popover"

interface MediaUploadPopoverProps {
	isUploading: boolean
	onImageUploadClick: () => void
	onMultipleImagesUploadClick: () => void
	onVideoUploadClick: () => void
}

export function MediaUploadPopover({
	isUploading,
	onImageUploadClick,
	onMultipleImagesUploadClick,
	onVideoUploadClick,
}: MediaUploadPopoverProps) {
	const [open, setOpen] = React.useState(false)

	const handleOptionClick = (action: () => void) => {
		action()
		setOpen(false)
	}

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					className="h-7 w-7 md:h-8 md:w-8"
					disabled={isUploading}
					size="icon"
					title="Add media"
					variant="ghost"
				>
					<ImageIcon className="size-3 md:size-3.5" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-56 p-2">
				<div className="flex flex-col gap-1">
					<Button
						className="h-9 w-full justify-start gap-3"
						disabled={isUploading}
						onClick={() => handleOptionClick(onImageUploadClick)}
						variant="ghost"
					>
						<ImagePlus className="size-4" />
						<div className="flex flex-col items-start">
							<span className="text-sm font-medium">Single Image</span>
							<span className="text-muted-foreground text-xs">
								Upload one image
							</span>
						</div>
					</Button>

					<Button
						className="h-9 w-full justify-start gap-3"
						disabled={isUploading}
						onClick={() => handleOptionClick(onMultipleImagesUploadClick)}
						variant="ghost"
					>
						<LayoutGrid className="size-4" />
						<div className="flex flex-col items-start">
							<span className="text-sm font-medium">Multiple Images</span>
							<span className="text-muted-foreground text-xs">
								Upload image grid
							</span>
						</div>
					</Button>

					<Button
						className="h-9 w-full justify-start gap-3"
						disabled={isUploading}
						onClick={() => handleOptionClick(onVideoUploadClick)}
						variant="ghost"
					>
						<Video className="size-4" />
						<div className="flex flex-col items-start">
							<span className="text-sm font-medium">Video</span>
							<span className="text-muted-foreground text-xs">
								Upload video file
							</span>
						</div>
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	)
}
