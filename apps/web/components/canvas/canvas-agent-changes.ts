"use client"

import type { BoxModel, TLShapeId } from "tldraw"
import { Box, type Editor, createShapeId } from "tldraw"

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
			// geo shapes can have text labels via 'text' prop in some versions
			// but we'll be safe and remove it if TLDraw rejects it
			break
		}
		case "note": {
			// TLDraw note shapes do NOT accept "text" property in props
			// Only valid props: color, size, font, align, verticalAlign, fontSizeAdjustment, url
			delete props.text // Remove invalid property
			if (typeof props.color !== "string") props.color = "yellow"
			if (typeof props.size !== "string") props.size = "m"
			break
		}
		case "text": {
			// TLDraw v3+ text shapes do NOT use 'text' in props
			// Text is stored separately via richText or similar
			// For now, we'll create a text shape without the text content
			// The user can edit it manually in the canvas
			delete props.text // Remove invalid property
			if (typeof props.color !== "string") props.color = "black"
			if (typeof props.size !== "string") props.size = "m"
			break
		}
		case "arrow": {
			if (!props.start) props.start = { x: 0, y: 0 }
			if (!props.end) props.end = { x: 120, y: 0 }
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
				const prepared = prepareShapeForCreate(change.shape)
				// Ensure the shape has a parent page to avoid TLDraw rejecting the shape
				if (!prepared.parentId) {
					prepared.parentId = editor.getCurrentPageId()
				}
				console.log("[applyCanvasAgentChange] Creating shape:", prepared)
				editor.createShape(prepared as any)
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
