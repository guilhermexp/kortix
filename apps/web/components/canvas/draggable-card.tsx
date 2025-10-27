"use client"

import { useDraggable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import type { DocumentsWithMemoriesResponseSchema } from "@repo/validation/api"
import { memo, useEffect, useRef } from "react"
import type { z } from "zod"
import {
  useCanvasPositions,
  useCanvasSelection,
  useIsDocumentSelected,
} from "@/stores/canvas"
import { DocumentCard } from "./document-card"

type DocumentsResponse = z.infer<typeof DocumentsWithMemoriesResponseSchema>
type DocumentWithMemories = DocumentsResponse["documents"][0]

interface DraggableCardProps {
	document: DocumentWithMemories
	onRemove?: (document: DocumentWithMemories) => void
	onClick?: (document: DocumentWithMemories) => void
  zoom?: number
}

export const DraggableCard = memo(
    ({ document, onRemove, onClick, zoom = 1 }: DraggableCardProps) => {
		const { cardPositions, updateCardPosition, getCardPosition } =
			useCanvasPositions()
		const position = getCardPosition(document.id)
    const { toggleSelection } = useCanvasSelection()
    const isSelected = useIsDocumentSelected(document.id)

        const { attributes, listeners, setNodeRef, transform, isDragging } =
            useDraggable({
                id: document.id,
                data: {
                    document,
                    type: "canvas-document",
                },
            })

        // Track last non-null transform to ensure we persist movement on drag end
        const lastTransformRef = useRef<{ x: number; y: number } | null>(null)
        if (transform) {
            lastTransformRef.current = transform
        }

        // Update position in store when dragging ends
        useEffect(() => {
            if (!isDragging) {
                const t = transform ?? lastTransformRef.current
                if (t) {
                    const currentPos = position || { x: 0, y: 0 }
                    const worldDx = (t.x ?? 0) / (zoom || 1)
                    const worldDy = (t.y ?? 0) / (zoom || 1)
                    const newX = currentPos.x + worldDx
                    const newY = currentPos.y + worldDy
                    // Snap to grid on drop
                    const GRID = 20
                    const snappedX = Math.round(newX / GRID) * GRID
                    const snappedY = Math.round(newY / GRID) * GRID
                    updateCardPosition(document.id, snappedX, snappedY)
                }
                lastTransformRef.current = null
            }
        }, [isDragging, transform, position, document.id, updateCardPosition, zoom])

        // Visual snapping while dragging
        const GRID = 20
        const snappedTransform = (() => {
            if (!transform) return undefined
            const baseX = position ? position.x : 0
            const baseY = position ? position.y : 0
            const worldDx = (transform.x ?? 0) / (zoom || 1)
            const worldDy = (transform.y ?? 0) / (zoom || 1)
            const targetX = baseX + worldDx
            const targetY = baseY + worldDy
            const snappedTargetX = Math.round(targetX / GRID) * GRID
            const snappedTargetY = Math.round(targetY / GRID) * GRID
            const snappedDx = (snappedTargetX - baseX) * (zoom || 1)
            const snappedDy = (snappedTargetY - baseY) * (zoom || 1)
            return { x: snappedDx, y: snappedDy }
        })()

        const style = {
            position: "absolute" as const,
            left: position ? `${position.x}px` : "0px",
            top: position ? `${position.y}px` : "0px",
            width: "320px",
            transform: CSS.Translate.toString(snappedTransform ?? transform),
            zIndex: isDragging ? 1000 : 1,
            transition: isDragging ? "none" : "transform 200ms ease",
        }

		return (
			<div ref={setNodeRef} style={style}>
				<DocumentCard
					document={document}
					dragHandleProps={{ ...attributes, ...listeners }}
					isDragging={isDragging}
					onClick={() => toggleSelection(document.id)}
					onRemove={onRemove}
					showDragHandle={true}
					showRemoveButton={true}
					className={isSelected ? "ring-2 ring-blue-500" : undefined}
				/>
			</div>
		)
	},
	// Custom comparator to prevent unnecessary re-renders - only re-render when critical props change
	(prevProps, nextProps) => {
		// Return true if props are equal (should NOT re-render)
		// Return false if props changed (should re-render)
		if (prevProps.document.id !== nextProps.document.id) return false
		if (prevProps.zoom !== nextProps.zoom) return false
		// For callbacks (onRemove, onClick), we assume they're stable enough to skip comparison
		return true
	}
)

DraggableCard.displayName = "DraggableCard"
