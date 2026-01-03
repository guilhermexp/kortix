// ============================================================
// Convert Simple AI Events to TLDraw Changes
// ============================================================

import type { TLShapeId } from "tldraw"
import type {
	TLAiChange,
	TLAiCreateShapeChange,
	TLAiDeleteShapeChange,
	TLAiUpdateShapeChange,
} from "@/lib/ai/tldraw-ai-types"
import {
	simpleAlignToTldrawAlign,
	simpleArrowheadToTldrawArrowhead,
	simpleColorToTldrawColor,
	simpleDashToTldrawDash,
	simpleFillToTldrawFill,
	simpleFontToTldrawFont,
	simpleGeoToTldrawGeo,
	simpleSizeToTldrawSize,
} from "./conversions"
import type { Shape, SimpleEvent } from "./schema"

// Helper to create a unique ID if not provided
function ensureId(id: string | undefined): TLShapeId {
	const rawId =
		id || `shape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
	return `shape:${rawId}` as TLShapeId
}

// Convert a simple shape to TLDraw createShape change
function convertShapeToTldrawChange(
	shape: Shape,
): TLAiCreateShapeChange | null {
	const id = ensureId(shape.id)
	const baseProps = {
		x: shape.x,
		y: shape.y,
	}

	// Handle geometric shapes (geo type in TLDraw)
	const geoTypes = [
		"rectangle",
		"ellipse",
		"triangle",
		"diamond",
		"pentagon",
		"hexagon",
		"octagon",
		"star",
		"rhombus",
		"heart",
		"oval",
		"trapezoid",
		"arrow-left",
		"arrow-right",
		"arrow-up",
		"arrow-down",
		"x-box",
		"check-box",
		"cloud",
	]

	if (geoTypes.includes(shape.type)) {
		const geoShape = shape as any
		return {
			type: "createShape",
			description: `Create ${shape.type} shape`,
			shape: {
				id,
				type: "geo",
				...baseProps,
				props: {
					geo: simpleGeoToTldrawGeo(shape.type) as any,
					w: geoShape.w || 100,
					h: geoShape.h || 100,
					color: simpleColorToTldrawColor(geoShape.color) as any,
					fill: simpleFillToTldrawFill(geoShape.fill),
					dash: simpleDashToTldrawDash(geoShape.dash) as any,
					size: simpleSizeToTldrawSize(geoShape.size) as any,
					text: geoShape.label || "",
					labelColor: simpleColorToTldrawColor(geoShape.labelColor) as any,
					font: simpleFontToTldrawFont(geoShape.font) as any,
				},
			},
		}
	}

	// Handle text shapes
	if (shape.type === "text") {
		const textShape = shape as any
		return {
			type: "createShape",
			description: "Create text shape",
			shape: {
				id,
				type: "text",
				...baseProps,
				props: {
					text: textShape.text || "",
					w: textShape.w || 200,
					color: simpleColorToTldrawColor(textShape.color) as any,
					size: simpleSizeToTldrawSize(textShape.size) as any,
					font: simpleFontToTldrawFont(textShape.font) as any,
					textAlign: simpleAlignToTldrawAlign(textShape.align) as any,
					autoSize: textShape.autoSize ?? true,
				},
			},
		}
	}

	// Handle note shapes
	if (shape.type === "note") {
		const noteShape = shape as any
		return {
			type: "createShape",
			description: "Create sticky note",
			shape: {
				id,
				type: "note",
				...baseProps,
				props: {
					text: noteShape.text || "",
					color: simpleColorToTldrawColor(noteShape.color) as any,
					size: simpleSizeToTldrawSize(noteShape.size) as any,
					font: simpleFontToTldrawFont(noteShape.font) as any,
					align: simpleAlignToTldrawAlign(noteShape.align) as any,
				},
			},
		}
	}

	// Handle frame shapes
	if (shape.type === "frame") {
		const frameShape = shape as any
		return {
			type: "createShape",
			description: "Create frame",
			shape: {
				id,
				type: "frame",
				...baseProps,
				props: {
					w: frameShape.w || 400,
					h: frameShape.h || 300,
					name: frameShape.name || "",
				},
			},
		}
	}

	// Handle arrow shapes
	if (shape.type === "arrow") {
		const arrowShape = shape as any
		const start = arrowShape.start
		const end = arrowShape.end

		// TLDraw expects arrow start/end to be simple {x, y} objects
		// Bindings are handled separately and not supported in direct shape creation
		const getPoint = (
			point: any,
			defaultX: number,
			defaultY: number,
		): { x: number; y: number } => {
			if (!point) return { x: defaultX, y: defaultY }
			// If it has x and y coordinates, use them
			if (typeof point.x === "number" && typeof point.y === "number") {
				return { x: point.x, y: point.y }
			}
			// If it's a binding reference (has id but no x/y), use default position
			// The user can manually connect the arrow later if needed
			if ("id" in point) {
				console.warn(
					"[getTldrawAiChanges] Arrow binding to shape not supported, using default position",
				)
				return { x: defaultX, y: defaultY }
			}
			return { x: defaultX, y: defaultY }
		}

		return {
			type: "createShape",
			description: "Create arrow",
			shape: {
				id,
				type: "arrow",
				...baseProps,
				props: {
					start: getPoint(start, 0, 0),
					end: getPoint(end, 100, 100),
					color: simpleColorToTldrawColor(arrowShape.color) as any,
					fill: simpleFillToTldrawFill(arrowShape.fill),
					dash: simpleDashToTldrawDash(arrowShape.dash) as any,
					size: simpleSizeToTldrawSize(arrowShape.size) as any,
					arrowheadStart: simpleArrowheadToTldrawArrowhead(
						arrowShape.arrowheadStart,
					) as any,
					arrowheadEnd: simpleArrowheadToTldrawArrowhead(
						arrowShape.arrowheadEnd || "arrow",
					) as any,
					text: arrowShape.label || "",
					labelColor: simpleColorToTldrawColor(arrowShape.labelColor) as any,
					font: simpleFontToTldrawFont(arrowShape.font) as any,
					bend: arrowShape.bend || 0,
				},
			},
		}
	}

	// Handle draw shapes
	if (shape.type === "draw") {
		const drawShape = shape as any
		return {
			type: "createShape",
			description: "Create freehand drawing",
			shape: {
				id,
				type: "draw",
				...baseProps,
				props: {
					segments: drawShape.segments || [],
					color: simpleColorToTldrawColor(drawShape.color) as any,
					fill: simpleFillToTldrawFill(drawShape.fill),
					dash: simpleDashToTldrawDash(drawShape.dash) as any,
					size: simpleSizeToTldrawSize(drawShape.size) as any,
					isComplete: drawShape.isComplete ?? true,
					isClosed: drawShape.isClosed ?? false,
				},
			},
		}
	}

	// Handle image shapes
	if (shape.type === "image") {
		const imageShape = shape as any
		return {
			type: "createShape",
			description: "Create image",
			shape: {
				id,
				type: "image",
				...baseProps,
				props: {
					w: imageShape.w || 200,
					h: imageShape.h || 200,
					assetId: imageShape.assetId,
					playing: imageShape.playing ?? true,
					crop: imageShape.crop,
				},
			},
		}
	}

	// Handle embed shapes
	if (shape.type === "embed") {
		const embedShape = shape as any
		return {
			type: "createShape",
			description: "Create embed",
			shape: {
				id,
				type: "embed",
				...baseProps,
				props: {
					w: embedShape.w || 400,
					h: embedShape.h || 300,
					url: embedShape.url,
				},
			},
		}
	}

	console.warn(`Unknown shape type: ${shape.type}`)
	return null
}

// Convert a single simple event to TLDraw change
function convertEventToChange(event: SimpleEvent): TLAiChange | null {
	switch (event.type) {
		case "create": {
			return convertShapeToTldrawChange(event.shape)
		}

		case "update": {
			// Convert simple property changes to TLDraw format
			const changes: Record<string, any> = {}

			for (const [key, value] of Object.entries(event.changes)) {
				const strValue = value as string | undefined
				switch (key) {
					case "x":
					case "y":
						changes[key] = value
						break
					case "w":
					case "h":
						if (!changes.props) changes.props = {}
						changes.props[key] = value
						break
					case "color":
						if (!changes.props) changes.props = {}
						changes.props.color = simpleColorToTldrawColor(strValue)
						break
					case "fill":
						if (!changes.props) changes.props = {}
						changes.props.fill = simpleFillToTldrawFill(strValue)
						break
					case "dash":
						if (!changes.props) changes.props = {}
						changes.props.dash = simpleDashToTldrawDash(strValue)
						break
					case "size":
						if (!changes.props) changes.props = {}
						changes.props.size = simpleSizeToTldrawSize(strValue)
						break
					case "font":
						if (!changes.props) changes.props = {}
						changes.props.font = simpleFontToTldrawFont(strValue)
						break
					case "align":
						if (!changes.props) changes.props = {}
						changes.props.align = simpleAlignToTldrawAlign(strValue)
						break
					case "label":
					case "text":
						if (!changes.props) changes.props = {}
						changes.props.text = value
						break
					case "name":
						if (!changes.props) changes.props = {}
						changes.props.name = value
						break
					default:
						if (!changes.props) changes.props = {}
						changes.props[key] = value
				}
			}

			return {
				type: "updateShape",
				description: `Update shape ${event.id}`,
				shape: {
					id: ensureId(event.id),
					...changes,
				},
			} as TLAiUpdateShapeChange
		}

		case "move": {
			return {
				type: "updateShape",
				description: `Move shape ${event.id}`,
				shape: {
					id: ensureId(event.id),
					x: event.x,
					y: event.y,
				},
			} as TLAiUpdateShapeChange
		}

		case "label": {
			return {
				type: "updateShape",
				description: `Update label of shape ${event.id}`,
				shape: {
					id: ensureId(event.id),
					props: {
						text: event.label,
					},
				},
			} as TLAiUpdateShapeChange
		}

		case "delete": {
			return {
				type: "deleteShape",
				description: `Delete shape ${event.id}`,
				shapeId: ensureId(event.id),
			} as TLAiDeleteShapeChange
		}

		case "think":
		case "message":
			// These are informational events - skip them as TLAiChange doesn't support messages
			return null

		default:
			console.warn(`Unknown event type: ${(event as any).type}`)
			return null
	}
}

// Main conversion function
export function getTldrawAiChangesFromSimpleEvents(
	events: SimpleEvent[],
): TLAiChange[] {
	const changes: TLAiChange[] = []

	for (const event of events) {
		const change = convertEventToChange(event)
		if (change) {
			changes.push(change)
		}
	}

	return changes
}

// Generator version for streaming
export function* getTldrawAiChangesFromSimpleEventsGenerator(
	events: SimpleEvent[],
): Generator<TLAiChange> {
	for (const event of events) {
		const change = convertEventToChange(event)
		if (change) {
			yield change
		}
	}
}
