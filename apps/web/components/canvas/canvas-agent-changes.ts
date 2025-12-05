"use client"

import type { BoxModel, TLShapeId } from "tldraw"
import { Box, type Editor, createShapeId, toRichText } from "tldraw"

// Minimal change format that Claude (via MCP) can produce
// and the canvas can apply locally.

export type CanvasAgentChange =
	| {
			type: "createShape"
			shape: Record<string, any>
	  }
	| {
			type: "updateShape"
			shape: Record<string, any>
	  }
	| {
			type: "deleteShape"
			id: string
	  }
	| {
			type: "selectShapes"
			ids: string[]
	  }
	| {
			type: "zoomToFit"
	  }
	| {
			type: "zoomToArea"
			bounds: BoxModel
	  }
	| {
			type: "focusOnShape"
			id: string
	  }

/**
 * Ensure the shape has a valid TLDraw ID format.
 * If id is missing or not in the correct format, generate one.
 */
function ensureShapeId(shape: Record<string, any>): TLShapeId {
	if (shape.id && typeof shape.id === "string") {
		// Check if it's already a valid TLDraw shape ID
		if (shape.id.startsWith("shape:")) {
			return shape.id as TLShapeId
		}
		// Convert simple ID to TLDraw format
		return createShapeId(shape.id)
	}
	// Generate a new ID
	return createShapeId()
}

/**
 * Prepare shape for TLDraw createShape API.
 * Ensures proper ID format and sets defaults.
 */
function prepareShapeForCreate(shape: Record<string, any>): Record<string, any> {
	const id = ensureShapeId(shape)
	const type = shape.type || "note"

	// Build the shape object with required fields
	const prepared: Record<string, any> = {
		id,
		type,
		x: shape.x ?? 0,
		y: shape.y ?? 0,
	}

	// Copy props if provided
	const props =
		shape.props && typeof shape.props === "object"
			? { ...(shape.props as Record<string, any>) }
			: ({} as Record<string, any>)

	// Provide safe defaults per shape type so TLDraw accepts the payload
	// TLDraw has strict validation - only include properties that are valid for each shape type
	// Note: TLDraw v3+ uses different property names than earlier versions
	switch (type) {
		case "geo": {
			if (typeof props.w !== "number") props.w = 200
			if (typeof props.h !== "number") props.h = 120
			if (typeof props.geo !== "string") props.geo = "rectangle"
			// TLDraw v4+ uses richText instead of text for labels
			if (typeof props.text === "string") {
				props.richText = toRichText(props.text)
				delete props.text
			}
			break
		}
		case "note": {
			// TLDraw v4+ note shapes use 'richText' for content
			if (typeof props.text === "string") {
				props.richText = toRichText(props.text)
				delete props.text
			} else if (!props.richText) {
				props.richText = toRichText("")
			}
			if (typeof props.color !== "string") props.color = "yellow"
			if (typeof props.size !== "string") props.size = "m"
			break
		}
		case "text": {
			// TLDraw v4+ text shapes use 'richText' instead of 'text'
			if (typeof props.text === "string") {
				props.richText = toRichText(props.text)
				delete props.text
			} else if (!props.richText) {
				props.richText = toRichText("")
			}
			if (typeof props.color !== "string") props.color = "black"
			if (typeof props.size !== "string") props.size = "m"
			if (typeof props.w !== "number") props.w = 200
			if (props.autoSize === undefined) props.autoSize = true
			break
		}
		case "arrow": {
			// TLDraw arrows expect start/end to be {x: number, y: number}
			// If AI sends binding format {type: "binding", boundShapeId: ...}, convert to point
			// If AI sends point format {type: "point", x, y}, extract x and y
			const normalizeArrowEndpoint = (
				endpoint: any,
				defaultX: number,
				defaultY: number
			): { x: number; y: number } => {
				if (!endpoint) {
					return { x: defaultX, y: defaultY }
				}
				// If it's already a simple {x, y} format
				if (
					typeof endpoint.x === "number" &&
					typeof endpoint.y === "number" &&
					!endpoint.type
				) {
					return { x: endpoint.x, y: endpoint.y }
				}
				// If it's point format {type: "point", x, y}
				if (endpoint.type === "point" && typeof endpoint.x === "number") {
					return { x: endpoint.x, y: endpoint.y }
				}
				// If it's binding format {type: "binding", boundShapeId: ...}
				// We can't resolve bindings here, so use default position
				// The arrow will be placed at default and user can reconnect manually
				if (endpoint.type === "binding") {
					console.warn(
						"[prepareShapeForCreate] Arrow binding not supported, using default position"
					)
					return { x: defaultX, y: defaultY }
				}
				// Unknown format, use default
				return { x: defaultX, y: defaultY }
			}

			props.start = normalizeArrowEndpoint(props.start, 0, 0)
			props.end = normalizeArrowEndpoint(props.end, 120, 0)
			break
		}
		default: {
			// For unknown types, try to remove common invalid props
			// TLDraw is very strict about props validation
			break
		}
	}

	if (Object.keys(props).length > 0) {
		prepared.props = props
	}

	// Copy rotation if provided
	if (typeof shape.rotation === "number") {
		prepared.rotation = shape.rotation
	}

	// Copy meta if provided
	if (shape.meta && typeof shape.meta === "object") {
		prepared.meta = { ...shape.meta }
	}

	return prepared
}

export function applyCanvasAgentChange(editor: Editor, change: CanvasAgentChange) {
	switch (change.type) {
		case "createShape": {
			if (change.shape && typeof change.shape === "object") {
				console.log("[applyCanvasAgentChange] Input shape:", JSON.stringify(change.shape, null, 2))
				const prepared = prepareShapeForCreate(change.shape)
				// Ensure the shape has a parent page to avoid TLDraw rejecting the shape
				if (!prepared.parentId) {
					prepared.parentId = editor.getCurrentPageId()
				}
				console.log("[applyCanvasAgentChange] Prepared shape:", JSON.stringify(prepared, null, 2))
				try {
					editor.createShape(prepared as any)
					console.log("[applyCanvasAgentChange] Shape created successfully")
				} catch (error) {
					console.error("[applyCanvasAgentChange] Error creating shape:", error)
				}
			}
			break
		}
		case "updateShape": {
			if (change.shape && typeof change.shape === "object") {
				editor.updateShape(change.shape as any)
			}
			break
		}
		case "deleteShape": {
			editor.deleteShape(change.id as any)
			break
		}
		case "selectShapes": {
			// Convert string IDs to TLShapeId format
			const shapeIds = change.ids.map((id) =>
				id.startsWith("shape:") ? id : createShapeId(id)
			) as TLShapeId[]
			editor.select(...shapeIds)
			break
		}
		case "zoomToFit": {
			editor.zoomToFit()
			break
		}
		case "zoomToArea": {
			const bounds = new Box(
				change.bounds.x,
				change.bounds.y,
				change.bounds.w,
				change.bounds.h,
			)
			editor.zoomToBounds(bounds, { animation: { duration: 320 } })
			break
		}
		case "focusOnShape": {
			// Convert string ID to TLShapeId format
			const shapeId = (change.id.startsWith("shape:")
				? change.id
				: createShapeId(change.id)) as TLShapeId
			const shape = editor.getShape(shapeId)
			if (!shape) break
			const shapeBounds = editor.getShapePageBounds(shape)
			if (!shapeBounds) break
			const bounds = new Box(
				shapeBounds.x,
				shapeBounds.y,
				shapeBounds.w,
				shapeBounds.h,
			)
			editor.zoomToBounds(bounds, { animation: { duration: 320 } })
			editor.select(shapeId)
			break
		}
	}
}
