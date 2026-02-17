"use client"

import { cn } from "@lib/utils"
import { Button } from "@ui/components/button"
import { MessageSquare } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { MouseEvent as ReactMouseEvent } from "react"
import { ChatRewrite } from "@/components/views/chat"
import { CouncilChat } from "@/components/views/council"
import { useChatOpen } from "@/stores"

const PANEL_SIZE_STORAGE_KEY = "canvas-chat-panel-size-v2"
const PANEL_POSITION_STORAGE_KEY = "canvas-chat-panel-position-v2"
const PANEL_MODE_STORAGE_KEY = "canvas-chat-panel-mode-v1"
const DEFAULT_WIDTH = 390
const DEFAULT_HEIGHT = 560
const MIN_WIDTH = 360
const MIN_HEIGHT = 420
const MAX_WIDTH = 760
const MAX_HEIGHT = 860

type ResizeMode = "width" | "height" | "both"

export function CanvasChatPanel() {
	const { isOpen, setIsOpen } = useChatOpen()
	const [isMobile, setIsMobile] = useState(false)
	const [mode, setMode] = useState<"default" | "council">("default")
	const [panelSize, setPanelSize] = useState({
		width: DEFAULT_WIDTH,
		height: DEFAULT_HEIGHT,
	})
	const [panelPosition, setPanelPosition] = useState({ x: 16, y: 16 })
	const panelSizeRef = useRef(panelSize)
	const panelPositionRef = useRef(panelPosition)
	const resizeModeRef = useRef<ResizeMode | null>(null)
	const isDraggingRef = useRef(false)
	const startXRef = useRef(0)
	const startYRef = useRef(0)
	const startWidthRef = useRef(DEFAULT_WIDTH)
	const startHeightRef = useRef(DEFAULT_HEIGHT)
	const startLeftRef = useRef(16)
	const startTopRef = useRef(16)

	const clampSize = useCallback((width: number, height: number) => {
		const maxWidthFromViewport = Math.max(
			MIN_WIDTH,
			Math.min(MAX_WIDTH, window.innerWidth - 24),
		)
		const maxHeightFromViewport = Math.max(
			MIN_HEIGHT,
			Math.min(MAX_HEIGHT, window.innerHeight - 24),
		)
		return {
			width: Math.min(maxWidthFromViewport, Math.max(MIN_WIDTH, width)),
			height: Math.min(maxHeightFromViewport, Math.max(MIN_HEIGHT, height)),
		}
	}, [])

	const clampPosition = useCallback((x: number, y: number, width: number, height: number) => {
		const maxX = Math.max(8, window.innerWidth - width - 8)
		const maxY = Math.max(8, window.innerHeight - height - 8)
		return {
			x: Math.min(maxX, Math.max(8, x)),
			y: Math.min(maxY, Math.max(8, y)),
		}
	}, [])

	useEffect(() => {
		const mediaQuery = window.matchMedia("(max-width: 768px)")
		const updateIsMobile = () => setIsMobile(mediaQuery.matches)
		updateIsMobile()
		mediaQuery.addEventListener("change", updateIsMobile)
		return () => mediaQuery.removeEventListener("change", updateIsMobile)
	}, [])

	useEffect(() => {
		panelSizeRef.current = panelSize
	}, [panelSize])

	useEffect(() => {
		panelPositionRef.current = panelPosition
	}, [panelPosition])

	useEffect(() => {
		if (typeof window === "undefined") return
		try {
			const raw = localStorage.getItem(PANEL_SIZE_STORAGE_KEY)
			if (!raw) return
			const parsed = JSON.parse(raw) as { width?: number; height?: number }
			const size = clampSize(
				parsed.width ?? DEFAULT_WIDTH,
				parsed.height ?? DEFAULT_HEIGHT,
			)
			setPanelSize(size)
		} catch {}
	}, [clampSize])

	useEffect(() => {
		if (typeof window === "undefined") return
		try {
			const raw = localStorage.getItem(PANEL_MODE_STORAGE_KEY)
			if (raw === "default" || raw === "council") {
				setMode(raw)
			}
		} catch {}
	}, [])

	useEffect(() => {
		if (typeof window === "undefined") return
		try {
			localStorage.setItem(PANEL_MODE_STORAGE_KEY, mode)
		} catch {}
	}, [mode])

	useEffect(() => {
		if (typeof window === "undefined") return
		const defaultPos = clampPosition(
			window.innerWidth - panelSizeRef.current.width - 16,
			window.innerHeight - panelSizeRef.current.height - 16,
			panelSizeRef.current.width,
			panelSizeRef.current.height,
		)
		try {
			const raw = localStorage.getItem(PANEL_POSITION_STORAGE_KEY)
			if (!raw) {
				setPanelPosition(defaultPos)
				return
			}
			const parsed = JSON.parse(raw) as { x?: number; y?: number }
			setPanelPosition(
				clampPosition(
					parsed.x ?? defaultPos.x,
					parsed.y ?? defaultPos.y,
					panelSizeRef.current.width,
					panelSizeRef.current.height,
				),
			)
		} catch {
			setPanelPosition(defaultPos)
		}
	}, [clampPosition])

	useEffect(() => {
		if (isMobile || typeof window === "undefined") return
		const onResize = () => {
			setPanelSize((prev) => {
				const next = clampSize(prev.width, prev.height)
				setPanelPosition((current) =>
					clampPosition(current.x, current.y, next.width, next.height),
				)
				return next
			})
		}
		window.addEventListener("resize", onResize)
		return () => window.removeEventListener("resize", onResize)
	}, [isMobile, clampSize, clampPosition])

	const startResize = useCallback(
		(mode: ResizeMode, event: ReactMouseEvent) => {
			if (isMobile) return
			event.preventDefault()
			resizeModeRef.current = mode
			startXRef.current = event.clientX
			startYRef.current = event.clientY
			startWidthRef.current = panelSize.width
			startHeightRef.current = panelSize.height
			document.body.style.userSelect = "none"
			document.body.style.cursor =
				mode === "width"
					? "ew-resize"
					: mode === "height"
						? "ns-resize"
						: "nwse-resize"
		},
		[isMobile, panelSize.width, panelSize.height],
	)

	const startDrag = useCallback((event: ReactMouseEvent) => {
		if (isMobile) return
		event.preventDefault()
		isDraggingRef.current = true
		startXRef.current = event.clientX
		startYRef.current = event.clientY
		startLeftRef.current = panelPosition.x
		startTopRef.current = panelPosition.y
		document.body.style.userSelect = "none"
		document.body.style.cursor = "grabbing"
	}, [isMobile, panelPosition.x, panelPosition.y])

	useEffect(() => {
		const onMouseMove = (event: MouseEvent) => {
			const mode = resizeModeRef.current
			if (mode) {
				const deltaX = event.clientX - startXRef.current
				const deltaY = event.clientY - startYRef.current
				const width =
					mode === "height"
						? startWidthRef.current
						: startWidthRef.current + deltaX
				const height =
					mode === "width"
						? startHeightRef.current
						: startHeightRef.current + deltaY
				setPanelSize(clampSize(width, height))
				return
			}
			if (!isDraggingRef.current) return
			const deltaX = event.clientX - startXRef.current
			const deltaY = event.clientY - startYRef.current
			setPanelPosition(
				clampPosition(
					startLeftRef.current + deltaX,
					startTopRef.current + deltaY,
					panelSizeRef.current.width,
					panelSizeRef.current.height,
				),
			)
		}

		const onMouseUp = () => {
			const wasResizing = Boolean(resizeModeRef.current)
			const wasDragging = isDraggingRef.current
			if (!wasResizing && !wasDragging) return
			resizeModeRef.current = null
			isDraggingRef.current = false
			document.body.style.userSelect = ""
			document.body.style.cursor = ""
			try {
				localStorage.setItem(
					PANEL_SIZE_STORAGE_KEY,
					JSON.stringify(panelSizeRef.current),
				)
				localStorage.setItem(
					PANEL_POSITION_STORAGE_KEY,
					JSON.stringify(panelPositionRef.current),
				)
			} catch {}
		}

		window.addEventListener("mousemove", onMouseMove)
		window.addEventListener("mouseup", onMouseUp)
		return () => {
			window.removeEventListener("mousemove", onMouseMove)
			window.removeEventListener("mouseup", onMouseUp)
			document.body.style.userSelect = ""
			document.body.style.cursor = ""
		}
	}, [clampSize, clampPosition])

	return (
		<>
			{!isOpen && (
				<div className="fixed bottom-5 right-5 z-[80]">
					<Button
						className="h-11 w-11 rounded-full bg-zinc-900 text-zinc-100 border border-zinc-700/70 shadow-none hover:bg-zinc-800"
						onClick={() => setIsOpen(true)}
						size="icon"
						type="button"
					>
						<MessageSquare className="h-4 w-4" />
					</Button>
				</div>
			)}

			<div
				className={cn(
					"canvas-chat-shell fixed z-[90] transition-all duration-200 ease-out",
					isMobile
						? "inset-0"
						: "",
					isOpen
						? "opacity-100 translate-y-0 pointer-events-auto"
						: "opacity-0 translate-y-2 pointer-events-none",
				)}
				style={
					isMobile
						? undefined
						: {
								width: panelSize.width,
								height: panelSize.height,
								left: panelPosition.x,
								top: panelPosition.y,
							}
				}
			>
				<div className="h-full flex flex-col overflow-hidden rounded-[14px] border border-[rgba(255,255,255,0.05)] bg-[#08090a] shadow-none">
					{!isMobile && (
						<button
							aria-label="Move chat panel"
							className="absolute left-0 right-20 top-0 h-10 cursor-grab z-20"
							onMouseDown={startDrag}
							type="button"
						/>
					)}
					{!isMobile && (
						<button
							aria-label="Resize chat panel width"
							className="absolute right-0 top-0 h-full w-2 cursor-ew-resize z-20"
							onMouseDown={(event) => startResize("width", event)}
							type="button"
						/>
					)}
					{!isMobile && (
						<button
							aria-label="Resize chat panel height"
							className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize z-20"
							onMouseDown={(event) => startResize("height", event)}
							type="button"
						/>
					)}
					{isOpen &&
						(mode === "council" ? (
							<CouncilChat
								compact
								onClose={() => setIsOpen(false)}
								onSwitchToAgent={() => setMode("default")}
							/>
						) : (
							<ChatRewrite
								className="h-full bg-[#08090a]"
								compact
								embedded
								headerClassName="px-4 py-3 bg-[#0b0b0c] backdrop-blur-none border-b border-[rgba(255,255,255,0.05)]"
								onSwitchToCouncil={() => setMode("council")}
								showCloseButton
							/>
						))}
					{!isMobile && (
						<button
							aria-label="Resize chat panel"
							className="absolute right-2 bottom-2 z-30 h-4 w-4 cursor-nwse-resize rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]"
							onMouseDown={(event) => startResize("both", event)}
							type="button"
						/>
					)}
				</div>
			</div>
		</>
	)
}
