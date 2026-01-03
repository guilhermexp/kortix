"use client"

import { cn } from "@lib/utils"
import { useState } from "react"

interface TooltipProps {
	children: React.ReactNode
	content: string
	side?: "top" | "bottom" | "left" | "right"
	className?: string
}

export function Tooltip({
	children,
	content,
	side = "top",
	className,
}: TooltipProps) {
	const [isVisible, setIsVisible] = useState(false)

	const sideClasses = {
		top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
		bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
		left: "right-full top-1/2 -translate-y-1/2 mr-2",
		right: "left-full top-1/2 -translate-y-1/2 ml-2",
	}

	const arrowClasses = {
		top: "top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent",
		bottom:
			"bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent",
		left: "left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent",
		right:
			"right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent",
	}

	return (
		<div
			className="relative inline-block"
			onMouseEnter={() => setIsVisible(true)}
			onMouseLeave={() => setIsVisible(false)}
		>
			{children}
			{isVisible && content && (
				<div
					className={cn(
						"absolute z-50 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-lg whitespace-nowrap pointer-events-none",
						sideClasses[side],
						className,
					)}
					role="tooltip"
				>
					{content}
					<div
						className={cn(
							"absolute w-0 h-0 border-4 border-gray-900 dark:border-gray-700",
							arrowClasses[side],
						)}
					/>
				</div>
			)}
		</div>
	)
}
