"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeftRight, Images, Package, X } from "lucide-react"
import React from "react"

import { Button } from "../button"

interface GroupImagesButtonProps {
	selectedCount: number
	inSameFlex: boolean
	onGroup: () => void
	onReverse?: () => void
	onExtract?: () => void
	onClear: () => void
}

export function GroupImagesButton({
	selectedCount,
	inSameFlex,
	onGroup,
	onReverse,
	onExtract,
	onClear,
}: GroupImagesButtonProps) {
	if (selectedCount < 2) return null

	return (
		<AnimatePresence>
			<motion.div
				animate={{ opacity: 1, y: 0, scale: 1 }}
				className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2"
				exit={{ opacity: 0, y: 20, scale: 0.9 }}
				initial={{ opacity: 0, y: 20, scale: 0.9 }}
				transition={{ duration: 0.2 }}
			>
				<div className="bg-background border-border flex items-center gap-2 rounded-lg border p-2 shadow-2xl">
					{/* Selection count */}
					<div className="text-muted-foreground px-3 py-2 text-sm font-medium">
						{selectedCount} {selectedCount === 1 ? "image" : "images"} selected
					</div>

					{/* Show different actions based on whether in flex */}
					{inSameFlex ? (
						<>
							{/* Reverse button */}
							{onReverse && (
								<Button
									className="gap-2"
									onClick={onReverse}
									size="sm"
									variant="secondary"
								>
									<ArrowLeftRight className="h-4 w-4" />
									Reverse Order
								</Button>
							)}

							{/* Extract button */}
							{onExtract && (
								<Button
									className="gap-2"
									onClick={onExtract}
									size="sm"
									variant="secondary"
								>
									<Package className="h-4 w-4" />
									Extract from Flex
								</Button>
							)}
						</>
					) : (
						/* Group button */
						<Button className="gap-2" onClick={onGroup} size="sm">
							<Images className="h-4 w-4" />
							Group into Flex
						</Button>
					)}

					{/* Clear button */}
					<Button
						className="h-8 w-8"
						onClick={onClear}
						size="icon"
						variant="ghost"
					>
						<X className="h-4 w-4" />
					</Button>
				</div>
			</motion.div>
		</AnimatePresence>
	)
}
