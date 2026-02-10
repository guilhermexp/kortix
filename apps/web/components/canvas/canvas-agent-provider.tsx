"use client"

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useRef,
} from "react"
import type { Editor } from "tldraw"
import {
	$canvasContextItems,
	type CanvasContextItem,
	clearCanvasContext,
} from "./agent-context"
import {
	applyCanvasAgentChange,
	type CanvasAgentChange,
} from "./canvas-agent-changes"

const ENABLE_CANVAS_DEBUG_LOGS = process.env.NEXT_PUBLIC_CANVAS_DEBUG === "1"

const canvasDebugLog = (...args: unknown[]) => {
	if (ENABLE_CANVAS_DEBUG_LOGS) {
		console.log(...args)
	}
}

function parseCanvasToolPayload(rawText: string): CanvasChangesPayload | null {
	const text = typeof rawText === "string" ? rawText.trim() : ""
	if (!text) return null

	const candidates: string[] = [text]

	// Accept markdown fenced JSON outputs that some SDK/tool layers emit.
	const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
	if (fenceMatch?.[1]) {
		candidates.push(fenceMatch[1].trim())
	}

	for (const candidate of candidates) {
		try {
			const parsed = JSON.parse(candidate) as unknown
			if (
				parsed &&
				typeof parsed === "object" &&
				(parsed as { kind?: unknown }).kind === "canvasChanges" &&
				Array.isArray((parsed as { changes?: unknown }).changes)
			) {
				return parsed as CanvasChangesPayload
			}
		} catch {
			// try next candidate
		}
	}

	return null
}

export type CanvasChangesPayload = {
	kind: "canvasChanges"
	changes: CanvasAgentChange[]
}

type CanvasAgentContextValue = {
	setEditor: (editor: Editor | null) => void
	applyChanges: (payload: CanvasChangesPayload) => boolean
	processToolOutput: (toolName: string, outputText: string) => boolean
	getCanvasContext: () => CanvasContextItem[]
	getViewportBounds: () => { x: number; y: number; w: number; h: number } | null
	buildContextForAgent: () => Record<string, unknown> | null
}

const CanvasAgentContext = createContext<CanvasAgentContextValue | null>(null)

export function CanvasAgentProvider({ children }: { children: ReactNode }) {
	const editorRef = useRef<Editor | null>(null)
	const pendingChangesRef = useRef<CanvasChangesPayload[]>([])

	const applyChanges = useCallback((payload: CanvasChangesPayload) => {
		const currentEditor = editorRef.current
		if (!currentEditor) {
			console.warn(
				"[CanvasAgentProvider] No editor available to apply changes; queuing until editor is ready",
			)
			pendingChangesRef.current.push(payload)
			return false
		}

		if (!payload.changes || !Array.isArray(payload.changes)) {
			console.warn("[CanvasAgentProvider] Invalid changes payload:", payload)
			return false
		}

		canvasDebugLog(
			`[CanvasAgentProvider] Applying ${payload.changes.length} changes to canvas`,
		)

		try {
			// Apply all changes
			for (const change of payload.changes) {
				try {
					applyCanvasAgentChange(currentEditor, change)
					canvasDebugLog(
						`[CanvasAgentProvider] Applied change: ${change.type}`,
						change,
					)
				} catch (err) {
					console.error(
						"[CanvasAgentProvider] Failed to apply change:",
						change,
						err,
					)
				}
			}

			// Clear canvas context after applying changes
			clearCanvasContext()

			return true
		} catch (err) {
			console.error("[CanvasAgentProvider] Failed to apply changes:", err)
			return false
		}
	}, [])

	const setEditor = useCallback(
		(editor: Editor | null) => {
			editorRef.current = editor
			const pendingCount = pendingChangesRef.current.length
			canvasDebugLog(
				"[CanvasAgentProvider] Editor registered:",
				!!editor,
				"pending:",
				pendingCount,
			)

			// Apply any pending changes that arrived before the editor was ready
			if (editor && pendingCount > 0) {
				const queued = [...pendingChangesRef.current]
				pendingChangesRef.current = []
				for (const payload of queued) {
					try {
						applyChanges(payload)
						canvasDebugLog("[CanvasAgentProvider] Flushed pending changes")
					} catch (err) {
						console.error(
							"[CanvasAgentProvider] Failed to flush pending change:",
							err,
						)
					}
				}
			}
		},
		[applyChanges],
	)

	const processToolOutput = useCallback(
		(toolName: string, outputText: string): boolean => {
			canvasDebugLog("[CanvasAgentProvider] processToolOutput called:", {
				toolName,
				outputTextLength: outputText?.length || 0,
				hasEditor: !!editorRef.current,
			})

			// Check if this is a canvas changes tool
			if (!toolName.includes("canvasApplyChanges")) {
				canvasDebugLog(
					"[CanvasAgentProvider] Tool name doesn't match canvasApplyChanges",
				)
				return false
			}

			try {
				const parsed = parseCanvasToolPayload(outputText)
				canvasDebugLog("[CanvasAgentProvider] Parsed output:", {
					kind: parsed?.kind,
					changesCount: parsed?.changes?.length || 0,
				})
				if (parsed) return applyChanges(parsed)
				console.warn(
					"[CanvasAgentProvider] Invalid payload - kind is not 'canvasChanges':",
					outputText?.substring(0, 200),
				)
			} catch (err) {
				console.error(
					"[CanvasAgentProvider] Failed to parse canvas changes:",
					err,
					"outputText:",
					outputText?.substring(0, 200),
				)
			}

			return false
		},
		[applyChanges],
	)

	const getCanvasContext = useCallback((): CanvasContextItem[] => {
		return $canvasContextItems.get()
	}, [])

	const getViewportBounds = useCallback(() => {
		const currentEditor = editorRef.current
		if (!currentEditor) return null

		const viewportBounds = currentEditor.getViewportPageBounds()
		return {
			x: Math.round(viewportBounds.x),
			y: Math.round(viewportBounds.y),
			w: Math.round(viewportBounds.width),
			h: Math.round(viewportBounds.height),
		}
	}, [])

	const getShapesInViewport = useCallback(() => {
		const currentEditor = editorRef.current
		if (!currentEditor) return []

		const viewportBounds = currentEditor.getViewportPageBounds()
		const shapes = currentEditor.getCurrentPageShapes()

		return shapes
			.filter((shape) => {
				const bounds = currentEditor.getShapePageBounds(shape.id)
				if (!bounds) return false
				return (
					bounds.x < viewportBounds.maxX &&
					bounds.maxX > viewportBounds.x &&
					bounds.y < viewportBounds.maxY &&
					bounds.maxY > viewportBounds.y
				)
			})
			.map((shape) => {
				const bounds = currentEditor.getShapePageBounds(shape.id)
				const props = shape.props as Record<string, unknown>

				const baseInfo = {
					id: shape.id,
					type: shape.type,
					x: Math.round(shape.x),
					y: Math.round(shape.y),
					width: bounds ? Math.round(bounds.width) : 0,
					height: bounds ? Math.round(bounds.height) : 0,
				}

				// Include color if available
				const color = typeof props?.color === "string" ? props.color : undefined

				// Include text for various shape types
				const text = typeof props?.text === "string" ? props.text : undefined

				// Include geo type for geo shapes
				const geoType =
					shape.type === "geo" && typeof props?.geo === "string"
						? props.geo
						: undefined

				return {
					...baseInfo,
					...(color ? { color } : {}),
					...(text ? { text } : {}),
					...(geoType ? { geoType } : {}),
				}
			})
	}, [])

	const buildContextForAgent = useCallback(() => {
		const viewport = getViewportBounds()
		const shapes = getShapesInViewport()
		const contextItems = getCanvasContext()

		if (!viewport) return null

		const context: Record<string, unknown> = {
			viewport,
			shapesInViewport: shapes,
		}

		// Add user selections if any
		if (contextItems.length > 0) {
			context.userSelections = contextItems.map((item) => {
				if (item.type === "shape") {
					const shape = shapes.find((s) => s.id === item.shapeId)
					return {
						type: "selectedShape",
						shapeId: item.shapeId,
						shape: shape || null,
					}
				}
				if (item.type === "area") {
					return {
						type: "selectedArea",
						bounds: item.bounds,
					}
				}
				if (item.type === "point") {
					return {
						type: "selectedPoint",
						point: item.point,
					}
				}
				return item
			})
		}

		return context
	}, [getCanvasContext, getShapesInViewport, getViewportBounds])

	const value: CanvasAgentContextValue = {
		setEditor,
		applyChanges,
		processToolOutput,
		getCanvasContext,
		getViewportBounds,
		buildContextForAgent,
	}

	return (
		<CanvasAgentContext.Provider value={value}>
			{children}
		</CanvasAgentContext.Provider>
	)
}

export function useCanvasAgent() {
	const context = useContext(CanvasAgentContext)
	if (!context) {
		throw new Error("useCanvasAgent must be used within a CanvasAgentProvider")
	}
	return context
}

/**
 * Hook that can be used safely outside of the provider.
 * Returns null if not within a CanvasAgentProvider.
 */
export function useCanvasAgentOptional() {
	return useContext(CanvasAgentContext)
}
