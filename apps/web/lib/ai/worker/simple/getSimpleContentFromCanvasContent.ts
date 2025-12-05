// ============================================================
// Convert TLDraw Canvas Content to Simple Format for AI
// ============================================================

import type { TLAiContent } from "@/lib/ai/tldraw-ai-types"
import type { TLShape } from "tldraw"
import { tldrawFillToSimpleFill } from "./conversions"
import type { Shape } from "./schema"

interface SimpleCanvasContent {
	shapes: Shape[]
	viewport: {
		x: number
		y: number
		w: number
		h: number
	}
}

// Convert a TLDraw shape to simple format
function convertShape(shape: TLShape): Shape | null {
	const baseProps = {
		id: shape.id,
		x: shape.x,
		y: shape.y,
	}

	// Handle geo shapes (rectangle, ellipse, etc.)
	if (shape.type === "geo") {
		const geoType = (shape.props as any).geo || "rectangle"
		return {
			...baseProps,
			type: geoType,
			w: (shape.props as any).w,
			h: (shape.props as any).h,
			color: (shape.props as any).color,
			fill: tldrawFillToSimpleFill((shape.props as any).fill),
			dash: (shape.props as any).dash,
			size: (shape.props as any).size,
			label: (shape.props as any).text || undefined,
			labelColor: (shape.props as any).labelColor,
			font: (shape.props as any).font,
		} as Shape
	}

	// Handle text shapes
	if (shape.type === "text") {
		return {
			...baseProps,
			type: "text",
			text: (shape.props as any).text || "",
			w: (shape.props as any).w,
			color: (shape.props as any).color,
			size: (shape.props as any).size,
			font: (shape.props as any).font,
			align: (shape.props as any).align,
			autoSize: (shape.props as any).autoSize,
		} as Shape
	}

	// Handle note shapes
	if (shape.type === "note") {
		return {
			...baseProps,
			type: "note",
			text: (shape.props as any).text || "",
			w: (shape.props as any).w,
			h: (shape.props as any).h,
			color: (shape.props as any).color,
			size: (shape.props as any).size,
			font: (shape.props as any).font,
			align: (shape.props as any).align,
		} as Shape
	}

	// Handle frame shapes
	if (shape.type === "frame") {
		return {
			...baseProps,
			type: "frame",
			w: (shape.props as any).w,
			h: (shape.props as any).h,
			name: (shape.props as any).name,
		} as Shape
	}

	// Handle arrow shapes
	if (shape.type === "arrow") {
		const props = shape.props as any
		const start =
			props.start?.boundShapeId != null
				? { id: props.start.boundShapeId }
				: { x: props.start?.x || 0, y: props.start?.y || 0 }
		const end =
			props.end?.boundShapeId != null
				? { id: props.end.boundShapeId }
				: { x: props.end?.x || 0, y: props.end?.y || 0 }

		return {
			...baseProps,
			type: "arrow",
			start,
			end,
			color: props.color,
			fill: tldrawFillToSimpleFill(props.fill),
			dash: props.dash,
			size: props.size,
			arrowheadStart: props.arrowheadStart,
			arrowheadEnd: props.arrowheadEnd,
			label: props.text || undefined,
			labelColor: props.labelColor,
			font: props.font,
			bend: props.bend,
		} as Shape
	}

	// Handle line shapes
	if (shape.type === "line") {
		const props = shape.props as any
		const handles = props.handles || {}
		const points = Object.values(handles).map((h: any) => ({
			x: h.x || 0,
			y: h.y || 0,
		}))

		return {
			...baseProps,
			type: "line",
			points,
			color: props.color,
			dash: props.dash,
			size: props.size,
			spline: props.spline,
		} as Shape
	}

	// Handle draw shapes
	if (shape.type === "draw") {
		return {
			...baseProps,
			type: "draw",
			color: (shape.props as any).color,
			fill: tldrawFillToSimpleFill((shape.props as any).fill),
			dash: (shape.props as any).dash,
			size: (shape.props as any).size,
			segments: (shape.props as any).segments || [],
			isComplete: (shape.props as any).isComplete,
			isClosed: (shape.props as any).isClosed,
		} as Shape
	}

	// Handle highlight shapes
	if (shape.type === "highlight") {
		return {
			...baseProps,
			type: "highlight",
			color: (shape.props as any).color,
			size: (shape.props as any).size,
			segments: (shape.props as any).segments || [],
			isComplete: (shape.props as any).isComplete,
			isPen: (shape.props as any).isPen,
		} as Shape
	}

	// Handle image shapes
	if (shape.type === "image") {
		return {
			...baseProps,
			type: "image",
			w: (shape.props as any).w,
			h: (shape.props as any).h,
			assetId: (shape.props as any).assetId,
			playing: (shape.props as any).playing,
			crop: (shape.props as any).crop,
		} as Shape
	}

	// Handle video shapes
	if (shape.type === "video") {
		return {
			...baseProps,
			type: "video",
			w: (shape.props as any).w,
			h: (shape.props as any).h,
			assetId: (shape.props as any).assetId,
			playing: (shape.props as any).playing,
			time: (shape.props as any).time,
		} as Shape
	}

	// Handle embed shapes
	if (shape.type === "embed") {
		return {
			...baseProps,
			type: "embed",
			w: (shape.props as any).w,
			h: (shape.props as any).h,
			url: (shape.props as any).url,
		} as Shape
	}

	// Handle bookmark shapes
	if (shape.type === "bookmark") {
		return {
			...baseProps,
			type: "bookmark",
			w: (shape.props as any).w,
			h: (shape.props as any).h,
			url: (shape.props as any).url,
			assetId: (shape.props as any).assetId,
		} as Shape
	}

	// Unknown shape type - skip
	console.warn(`Unknown shape type: ${shape.type}`)
	return null
}

// Main conversion function
export function getSimpleContentFromCanvasContent(
	content: TLAiContent
): SimpleCanvasContent {
	const shapes: Shape[] = []

	for (const shape of content.shapes || []) {
		const converted = convertShape(shape)
		if (converted) {
			shapes.push(converted)
		}
	}

	return {
		shapes,
		viewport: { x: 0, y: 0, w: 1920, h: 1080 }, // Default viewport since TLAiContent doesn't include it
	}
}

// Format simple content for AI prompt
export function formatSimpleContentForPrompt(content: SimpleCanvasContent): string {
	if (content.shapes.length === 0) {
		return "The canvas is currently empty."
	}

	const shapesDesc = content.shapes.map((shape) => {
		const { id, type, x, y, ...rest } = shape
		const propsStr = Object.entries(rest)
			.filter(([_, v]) => v !== undefined)
			.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
			.join(", ")
		return `- ${type} (id: "${id}") at (${x}, ${y})${propsStr ? ` [${propsStr}]` : ""}`
	})

	return `Current canvas shapes:\n${shapesDesc.join("\n")}\n\nViewport: x=${content.viewport.x}, y=${content.viewport.y}, w=${content.viewport.w}, h=${content.viewport.h}`
}
