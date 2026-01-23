"use client"

// ============================================================
// useCouncil Hook - SSE stream handler for LLM Council
// Matches the event format from https://github.com/karpathy/llm-council
// ============================================================

import { useCallback, useRef, useState } from "react"
import { createShapeId, type Editor, type TLShapeId } from "tldraw"
import {
	calculateCouncilLayout,
	COUNCIL_SHAPE_HEIGHT,
	COUNCIL_SHAPE_WIDTH,
	QUERY_SHAPE_HEIGHT,
	QUERY_SHAPE_WIDTH,
	VERDICT_SHAPE_HEIGHT,
	VERDICT_SHAPE_WIDTH,
} from "./council-layout"
import type {
	CouncilSession,
	CouncilSSEEvent,
	CouncilStage1CompleteEvent,
	CouncilStage3CompleteEvent,
} from "./council-types"
import { getShortModelName } from "./council-types"

// Parse SSE stream events
async function* parseSSEStream(
	response: Response
): AsyncGenerator<CouncilSSEEvent> {
	const reader = response.body?.getReader()
	if (!reader) {
		throw new Error("No response body")
	}

	const decoder = new TextDecoder()
	let buffer = ""

	while (true) {
		const { done, value } = await reader.read()
		if (done) break

		buffer += decoder.decode(value, { stream: true })
		const lines = buffer.split("\n")
		buffer = lines.pop() || ""

		for (const line of lines) {
			if (line.startsWith("data: ")) {
				const data = line.slice(6).trim()
				if (data === "[DONE]") continue
				if (!data) continue

				try {
					const event = JSON.parse(data) as CouncilSSEEvent
					yield event
				} catch (e) {
					console.error("[useCouncil] Failed to parse SSE event:", e, data)
				}
			}
		}
	}
}

interface UseCouncilOptions {
	onSessionStart?: (session: CouncilSession) => void
	onSessionComplete?: (session: CouncilSession) => void
	onError?: (error: Error) => void
}

export function useCouncil(editor: Editor | null, options?: UseCouncilOptions) {
	const [isRunning, setIsRunning] = useState(false)
	const [currentSession, setCurrentSession] = useState<CouncilSession | null>(
		null
	)
	const abortControllerRef = useRef<AbortController | null>(null)
	const modelShapeIdsRef = useRef<Map<string, TLShapeId>>(new Map())

	const startCouncil = useCallback(
		async (query: string) => {
			if (!editor || isRunning) return

			// Reset state
			modelShapeIdsRef.current = new Map()
			setIsRunning(true)

			// Create abort controller for cancellation
			abortControllerRef.current = new AbortController()

			// Initialize session
			const sessionId = `council-${Date.now()}`
			const session: CouncilSession = {
				id: sessionId,
				query,
				status: "pending",
				startedAt: Date.now(),
				modelShapeIds: new Map(),
			}
			setCurrentSession(session)
			options?.onSessionStart?.(session)

			try {
				// Get viewport center for layout
				const viewport = editor.getViewportPageBounds()
				const centerX = viewport.x + viewport.w / 2
				const centerY = viewport.y + viewport.h / 2

				// Create query node at center
				const queryShapeId = createShapeId()
				editor.createShape({
					id: queryShapeId,
					type: "council",
					x: centerX - QUERY_SHAPE_WIDTH / 2,
					y: centerY - QUERY_SHAPE_HEIGHT / 2,
					props: {
						w: QUERY_SHAPE_WIDTH,
						h: QUERY_SHAPE_HEIGHT,
						text: query,
						model: "Query",
						stage: 0,
						isVerdict: false,
						isStreaming: false,
					},
				})

				session.queryShapeId = queryShapeId
				setCurrentSession({ ...session, queryShapeId })

				// Start SSE stream to council proxy
				// Note: The llm-council API expects { content: string } not { message: string }
				const response = await fetch("/v3/council/stream", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ query }),
					signal: abortControllerRef.current.signal,
				})

				if (!response.ok) {
					throw new Error(`Council API error: ${response.status}`)
				}

				// Track if we've created model shapes yet (to calculate layout once)
				let layoutCalculated = false
				let layout = calculateCouncilLayout(centerX, centerY, 4) // Default 4 models

				// Process SSE events
				for await (const event of parseSSEStream(response)) {
					// Check if cancelled
					if (abortControllerRef.current?.signal.aborted) break

					switch (event.type) {
						case "stage1_start": {
							session.status = "stage1"
							setCurrentSession({ ...session })
							break
						}

						case "stage1_complete": {
							const stage1Event = event as CouncilStage1CompleteEvent
							const results = stage1Event.data

							// Calculate layout based on actual model count
							if (!layoutCalculated) {
								layout = calculateCouncilLayout(centerX, centerY, results.length)
								layoutCalculated = true
							}

							// Create shapes for each model response
							results.forEach((result, index) => {
								const pos = layout.modelPositions[index]
								if (!pos) return

								const shapeId = createShapeId()
								const shortName = getShortModelName(result.model)

								editor.createShape({
									id: shapeId,
									type: "council",
									x: pos.x,
									y: pos.y,
									props: {
										w: COUNCIL_SHAPE_WIDTH,
										h: COUNCIL_SHAPE_HEIGHT,
										text: result.response,
										model: shortName,
										stage: 1,
										isVerdict: false,
										isStreaming: false,
									},
								})

								modelShapeIdsRef.current.set(result.model, shapeId)
								session.modelShapeIds.set(result.model, shapeId)

								// Create arrow from query to this model
								const arrowId = createShapeId()
								editor.createShape({
									id: arrowId,
									type: "arrow",
									props: {
										color: "grey",
										size: "m",
										arrowheadEnd: "arrow",
										arrowheadStart: "none",
									},
								})

								// Bind arrow to query and model shapes
								editor.createBindings([
									{
										type: "arrow",
										fromId: arrowId,
										toId: queryShapeId,
										props: {
											terminal: "start",
											isExact: false,
											isPrecise: false,
											normalizedAnchor: { x: 0.5, y: 0.5 },
										},
									},
									{
										type: "arrow",
										fromId: arrowId,
										toId: shapeId,
										props: {
											terminal: "end",
											isExact: false,
											isPrecise: false,
											normalizedAnchor: { x: 0.5, y: 0.5 },
										},
									},
								])
							})

							setCurrentSession({ ...session })
							break
						}

						case "stage2_start": {
							session.status = "stage2"
							setCurrentSession({ ...session })
							// Stage 2 (peer review) nodes are not displayed per the plan
							break
						}

						case "stage2_complete": {
							// Stage 2 complete - peer reviews are not shown as nodes
							// But we could log the aggregate rankings if needed
							console.log("[useCouncil] Stage 2 complete:", event)
							break
						}

						case "stage3_start": {
							session.status = "stage3"
							setCurrentSession({ ...session })
							break
						}

						case "stage3_complete": {
							const stage3Event = event as CouncilStage3CompleteEvent
							const verdictPos = layout.verdictPosition
							const shortName = getShortModelName(stage3Event.data.model)

							// Create verdict shape
							const verdictShapeId = createShapeId()
							editor.createShape({
								id: verdictShapeId,
								type: "council",
								x: verdictPos.x,
								y: verdictPos.y,
								props: {
									w: VERDICT_SHAPE_WIDTH,
									h: VERDICT_SHAPE_HEIGHT,
									text: stage3Event.data.response,
									model: `Chairman (${shortName})`,
									stage: 3,
									isVerdict: true,
									isStreaming: false,
								},
							})

							session.verdictShapeId = verdictShapeId

							// Create dashed arrows from all model shapes to verdict
							for (const modelShapeId of modelShapeIdsRef.current.values()) {
								const arrowId = createShapeId()
								editor.createShape({
									id: arrowId,
									type: "arrow",
									props: {
										color: "grey",
										size: "s",
										arrowheadEnd: "arrow",
										arrowheadStart: "none",
										dash: "dashed",
									},
								})

								editor.createBindings([
									{
										type: "arrow",
										fromId: arrowId,
										toId: modelShapeId,
										props: {
											terminal: "start",
											isExact: false,
											isPrecise: false,
											normalizedAnchor: { x: 0.5, y: 1 },
										},
									},
									{
										type: "arrow",
										fromId: arrowId,
										toId: verdictShapeId,
										props: {
											terminal: "end",
											isExact: false,
											isPrecise: false,
											normalizedAnchor: { x: 0.5, y: 0 },
										},
									},
								])
							}

							setCurrentSession({ ...session })
							break
						}

						case "title_complete": {
							// Title generated - could be used for session naming
							console.log("[useCouncil] Title:", event.data.title)
							break
						}

						case "complete": {
							// Session completed
							session.status = "completed"
							session.completedAt = Date.now()
							setCurrentSession({ ...session })
							options?.onSessionComplete?.(session)
							break
						}

						case "error": {
							throw new Error(event.message)
						}
					}
				}

				// Zoom to fit all council shapes
				editor.zoomToFit({ animation: { duration: 500 } })
			} catch (error) {
				if (error instanceof Error && error.name === "AbortError") {
					console.log("[useCouncil] Session cancelled")
				} else {
					console.error("[useCouncil] Error:", error)
					session.status = "error"
					setCurrentSession({ ...session })
					options?.onError?.(
						error instanceof Error ? error : new Error("Unknown error")
					)
				}
			} finally {
				setIsRunning(false)
				abortControllerRef.current = null
			}
		},
		[editor, isRunning, options]
	)

	const cancelCouncil = useCallback(() => {
		abortControllerRef.current?.abort()
		setIsRunning(false)
	}, [])

	return {
		startCouncil,
		cancelCouncil,
		isRunning,
		currentSession,
	}
}
