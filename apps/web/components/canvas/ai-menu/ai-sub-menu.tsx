"use client"

import { motion } from "framer-motion"
import { useCallback } from "react"

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
			animate={{ opacity: 1, x: 0 }}
			className="ai-sub-menu"
			exit={{ opacity: 0, x: -10 }}
			initial={{ opacity: 0, x: -10 }}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			style={{
				position: "fixed",
				left: position.x,
				top: position.y,
				zIndex: 10000,
			}}
			transition={{ duration: 0.1 }}
		>
			<div className="ai-sub-menu-container">
				{items.map((item) => (
					<div
						className="ai-sub-menu-item"
						key={item}
						onClick={() => handleClick(item)}
					>
						{item}
					</div>
				))}
			</div>
		</motion.div>
	)
}
