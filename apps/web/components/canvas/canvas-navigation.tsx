"use client"

import { Button } from "@repo/ui/components/button"
import { Crosshair, Maximize2, Minus, Plus } from "lucide-react"
import { useCallback, useState } from "react"

// Simplified navigation hook for canvas (replacement for useGraphInteractions)
export function useCanvasNavigation() {
	const [panX, setPanX] = useState(0)
	const [panY, setPanY] = useState(0)
	const [zoom, setZoom] = useState(1)
	const [isPanning, setIsPanning] = useState(false)
	const [startPan, setStartPan] = useState({ x: 0, y: 0 })

	const handlePanStart = useCallback((e: React.MouseEvent) => {
		setIsPanning(true)
		setStartPan({ x: e.clientX - panX, y: e.clientY - panY })
	}, [panX, panY])

	const handlePanMove = useCallback((e: React.MouseEvent) => {
		if (!isPanning) return
		setPanX(e.clientX - startPan.x)
		setPanY(e.clientY - startPan.y)
	}, [isPanning, startPan])

	const handlePanEnd = useCallback(() => {
		setIsPanning(false)
	}, [])

	const handleWheel = useCallback((e: React.WheelEvent) => {
		const delta = e.deltaY
		const zoomFactor = delta > 0 ? 0.9 : 1.1
		setZoom((prev) => Math.max(0.1, Math.min(5, prev * zoomFactor)))
	}, [])

	const zoomIn = useCallback(() => {
		setZoom((prev) => Math.min(5, prev * 1.2))
	}, [])

	const zoomOut = useCallback(() => {
		setZoom((prev) => Math.max(0.1, prev / 1.2))
	}, [])

	const centerViewportOn = useCallback((x: number, y: number) => {
		setPanX(-x * zoom)
		setPanY(-y * zoom)
	}, [zoom])

	const autoFitToViewport = useCallback(() => {
		setPanX(0)
		setPanY(0)
		setZoom(1)
	}, [])

	// Touch event handlers (stubs for now)
	const handleTouchStart = useCallback((_e: React.TouchEvent) => {
		// Touch support not implemented yet
	}, [])

	const handleTouchMove = useCallback((_e: React.TouchEvent) => {
		// Touch support not implemented yet
	}, [])

	const handleTouchEnd = useCallback(() => {
		// Touch support not implemented yet
	}, [])

	const handleDoubleClick = useCallback((_e: React.MouseEvent) => {
		// Reset zoom on double click
		setZoom(1)
		setPanX(0)
		setPanY(0)
	}, [])

	const handleNodeClick = useCallback((_nodeId: string) => {
		// Node interaction not needed for canvas
	}, [])

	const handleNodeHover = useCallback((_nodeId: string | null) => {
		// Node hover not needed for canvas
	}, [])

	const handleNodeDragStart = useCallback((_nodeId: string, _e: React.MouseEvent) => {
		// Node dragging not needed for canvas
	}, [])

	const handleNodeDragMove = useCallback((_e: React.MouseEvent) => {
		// Node dragging not needed for canvas
	}, [])

	const handleNodeDragEnd = useCallback(() => {
		// Node dragging not needed for canvas
	}, [])

	return {
		panX,
		panY,
		zoom,
		hoveredNode: null,
		selectedNode: null,
		draggingNodeId: null,
		nodePositions: {},
		handlePanStart,
		handlePanMove,
		handlePanEnd,
		handleWheel,
		handleNodeHover,
		handleNodeClick,
		handleNodeDragStart,
		handleNodeDragMove,
		handleNodeDragEnd,
		handleDoubleClick,
		handleTouchStart,
		handleTouchMove,
		handleTouchEnd,
		setSelectedNode: (_id: string | null) => {},
		autoFitToViewport,
		centerViewportOn,
		zoomIn,
		zoomOut,
	}
}

// Simplified navigation controls component
export function NavigationControls({
	onCenter,
	onZoomIn,
	onZoomOut,
	onAutoFit,
	className = "",
}: {
	onCenter: () => void
	onZoomIn: () => void
	onZoomOut: () => void
	onAutoFit: () => void
	nodes?: unknown[]
	className?: string
}) {
	return (
		<div className={`flex flex-col gap-2 ${className}`}>
			<Button
				className="w-10 h-10 p-0 bg-background/80 backdrop-blur-sm border border-foreground/10 hover:bg-foreground/5"
				onClick={onZoomIn}
				size="sm"
				title="Zoom In"
				variant="ghost"
			>
				<Plus className="h-4 w-4" />
			</Button>
			<Button
				className="w-10 h-10 p-0 bg-background/80 backdrop-blur-sm border border-foreground/10 hover:bg-foreground/5"
				onClick={onZoomOut}
				size="sm"
				title="Zoom Out"
				variant="ghost"
			>
				<Minus className="h-4 w-4" />
			</Button>
			<Button
				className="w-10 h-10 p-0 bg-background/80 backdrop-blur-sm border border-foreground/10 hover:bg-foreground/5"
				onClick={onCenter}
				size="sm"
				title="Center"
				variant="ghost"
			>
				<Crosshair className="h-4 w-4" />
			</Button>
			<Button
				className="w-10 h-10 p-0 bg-background/80 backdrop-blur-sm border border-foreground/10 hover:bg-foreground/5"
				onClick={onAutoFit}
				size="sm"
				title="Fit to Screen"
				variant="ghost"
			>
				<Maximize2 className="h-4 w-4" />
			</Button>
		</div>
	)
}
