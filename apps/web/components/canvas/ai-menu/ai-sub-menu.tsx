"use client"

import { useCallback } from "react"
import { motion } from "framer-motion"

interface AISubMenuProps {
	items: string[]
	position: { x: number; y: number }
	onSelect: (value: string) => void
	onMouseEnter: () => void
	onMouseLeave: () => void
}

export function AISubMenu({
	items,
	position,
	onSelect,
	onMouseEnter,
	onMouseLeave,
}: AISubMenuProps) {
	const handleClick = useCallback(
		(item: string) => {
			onSelect(item)
		},
		[onSelect],
	)

	return (
		<motion.div
			initial={{ opacity: 0, x: -10 }}
			animate={{ opacity: 1, x: 0 }}
			exit={{ opacity: 0, x: -10 }}
			transition={{ duration: 0.1 }}
			className="ai-sub-menu"
			style={{
				position: "fixed",
				left: position.x,
				top: position.y,
				zIndex: 10000,
			}}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<div className="ai-sub-menu-container">
				{items.map((item) => (
					<div
						key={item}
						className="ai-sub-menu-item"
						onClick={() => handleClick(item)}
					>
						{item}
					</div>
				))}
			</div>
		</motion.div>
	)
}
