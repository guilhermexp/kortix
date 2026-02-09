"use client"

import { useEffect, useCallback } from "react"
import type { Editor, TLShapeId } from "tldraw"
import { getShortModelName } from "./council-types"
import type { CouncilShapeProps } from "./council-types"

interface ModelChangeEvent {
	shapeId: TLShapeId
	newModel: string
	originalQuery: string
}

// Custom event name
const MODEL_CHANGE_EVENT = "council-model-change"

// Helper to dispatch model change event from shape component
export function dispatchModelChangeEvent(
	shapeId: TLShapeId,
	newModel: string,
	originalQuery: string
) {
	window.dispatchEvent(
		new CustomEvent<ModelChangeEvent>(MODEL_CHANGE_EVENT, {
			detail: { shapeId, newModel, originalQuery },
		})
	)
}

// Hook to handle model changes - should be used in tldraw-canvas.tsx
export function useCouncilModelChange(editor: Editor | null) {
	const handleModelChange = useCallback(
		async (event: CustomEvent<ModelChangeEvent>) => {
			if (!editor) return

			const { shapeId, newModel, originalQuery } = event.detail

			// Get the shape
			const shape = editor.getShape(shapeId) as
				| { props: CouncilShapeProps }
				| undefined
			if (!shape || !("props" in shape)) return

			const currentProps = shape.props

			// Set streaming state
			editor.updateShape({
				id: shapeId,
				type: "council",
				props: {
					...currentProps,
					isStreaming: true,
					text: "Generating new response...",
				},
			})

			try {
				// Call the single model query endpoint
				const response = await fetch("/v3/council/model/query", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						model: newModel,
						query: originalQuery,
					}),
				})

				if (!response.ok) {
					throw new Error("Failed to query model")
				}

				const result = await response.json()

				// Update the shape with new response
				editor.updateShape({
					id: shapeId,
					type: "council",
					props: {
						...currentProps,
						model: getShortModelName(newModel),
						fullModelId: newModel,
						text: result.response,
						isStreaming: false,
					},
				})
			} catch (error) {
				console.error("[useCouncilModelChange] Error changing model:", error)

				// Restore original state on error
				editor.updateShape({
					id: shapeId,
					type: "council",
					props: {
						...currentProps,
						isStreaming: false,
						text: `Error: Failed to get response from ${newModel}`,
					},
				})
			}
		},
		[editor]
	)

	useEffect(() => {
		const handler = (e: Event) =>
			handleModelChange(e as CustomEvent<ModelChangeEvent>)
		window.addEventListener(MODEL_CHANGE_EVENT, handler)
		return () => window.removeEventListener(MODEL_CHANGE_EVENT, handler)
	}, [handleModelChange])
}
