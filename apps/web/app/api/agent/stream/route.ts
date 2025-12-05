// ============================================================
// TLDraw AI Agent Stream API
// Streams AI changes for canvas manipulation
// ============================================================

import { NextRequest } from "next/server"
import type { TLAiSerializedPrompt, TLAiChange } from "@/lib/ai/tldraw-ai-types"
import { streamAgent } from "@/lib/ai/AgentService"

export const runtime = "nodejs"

// ============================================================
// STREAM EVENT TYPES (Frontend Format)
// ============================================================

interface StreamEvent {
	type: "create" | "update" | "move" | "delete" | "label" | "think" | "message"
	shapeId?: string
	shapeIds?: string[]
	shapeType?: string
	x?: number
	y?: number
	width?: number
	height?: number
	color?: string
	fill?: string
	text?: string
	content?: string
	updates?: Record<string, unknown>
}

// ============================================================
// TRANSFORM TLAiChange to StreamEvent
// ============================================================

function transformChangeToStreamEvent(change: TLAiChange): StreamEvent | null {
	// Handle custom think/message events from VercelAiService
	const customChange = change as unknown as Record<string, unknown>
	if (customChange.type === "think" || customChange.type === "message") {
		return {
			type: customChange.type as "think" | "message",
			content: String(customChange.text || customChange.message || ""),
		}
	}

	switch (change.type) {
		case "createShape": {
			const shape = change.shape as Record<string, unknown>
			const shapeId = typeof shape.id === "string" ? shape.id.replace("shape:", "") : String(shape.id)
			const props = (shape.props || {}) as Record<string, unknown>

			// Determine shape type from props.geo or shape.type
			let shapeType = shape.type as string
			if (shape.type === "geo" && props.geo) {
				shapeType = props.geo as string
			}

			return {
				type: "create",
				shapeId,
				shapeType,
				x: shape.x as number | undefined,
				y: shape.y as number | undefined,
				width: props.w as number | undefined,
				height: props.h as number | undefined,
				color: props.color as string | undefined,
				fill: props.fill as string | undefined,
				text: props.text as string | undefined,
			}
		}

		case "updateShape": {
			const shape = change.shape as Record<string, unknown>
			const shapeId = typeof shape.id === "string" ? shape.id.replace("shape:", "") : String(shape.id)
			const props = (shape.props || {}) as Record<string, unknown>

			// Check if this is primarily a move operation
			if (shape.x !== undefined && shape.y !== undefined && Object.keys(props).length === 0) {
				return {
					type: "move",
					shapeId,
					x: shape.x as number,
					y: shape.y as number,
				}
			}

			// Check if this is a label update
			if (props.text !== undefined && Object.keys(props).length === 1) {
				return {
					type: "label",
					shapeId,
					text: props.text as string,
				}
			}

			return {
				type: "update",
				shapeId,
				x: shape.x as number | undefined,
				y: shape.y as number | undefined,
				updates: props,
			}
		}

		case "deleteShape": {
			const shapeId = typeof change.shapeId === "string"
				? change.shapeId.replace("shape:", "")
				: String(change.shapeId)

			return {
				type: "delete",
				shapeId,
			}
		}

		default:
			console.warn("[API] Unknown change type:", (change as unknown as Record<string, unknown>).type)
			return null
	}
}

export async function POST(req: NextRequest) {
	try {
		const prompt = (await req.json()) as TLAiSerializedPrompt
		console.log("[API/stream] Received prompt:", JSON.stringify({
			message: prompt.message,
			hasCanvasContent: !!prompt.canvasContent,
			hasImage: !!prompt.image,
		}, null, 2))

		const encoder = new TextEncoder()
		const { readable, writable } = new TransformStream()
		const writer = writable.getWriter()

		// Start streaming in background
		;(async () => {
			let changeCount = 0
			try {
				for await (const change of streamAgent(prompt)) {
					changeCount++
					console.log(`[API/stream] Change ${changeCount}:`, JSON.stringify(change, null, 2))

					const event = transformChangeToStreamEvent(change)
					console.log(`[API/stream] Transformed event:`, JSON.stringify(event, null, 2))

					if (event) {
						const data = `data: ${JSON.stringify(event)}\n\n`
						await writer.write(encoder.encode(data))
					}
				}
				console.log(`[API/stream] Stream complete. Total changes: ${changeCount}`)
				// Send done signal
				await writer.write(encoder.encode("data: [DONE]\n\n"))
			} catch (error) {
				console.error("[API/stream] Stream error:", error)
				const errorData = `data: ${JSON.stringify({
					type: "message",
					content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
				})}\n\n`
				await writer.write(encoder.encode(errorData))
			} finally {
				await writer.close()
			}
		})()

		return new Response(readable, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
			},
		})
	} catch (error) {
		console.error("[API/stream] API error:", error)
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "Unknown error",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			}
		)
	}
}
