/**
 * Local type definitions to replace @tldraw/ai
 * These types are compatible with tldraw 4.x
 */

import type { TLShapeId, TLShape, TLBinding } from "tldraw"

// ============================================================
// TLAiChange Types
// ============================================================

export interface TLAiCreateShapeChange {
	type: "createShape"
	description?: string
	shape: {
		id: TLShapeId
		type: string
		x?: number
		y?: number
		props?: Record<string, unknown>
	}
}

export interface TLAiUpdateShapeChange {
	type: "updateShape"
	description?: string
	shape: {
		id: TLShapeId
		x?: number
		y?: number
		props?: Record<string, unknown>
	}
}

export interface TLAiDeleteShapeChange {
	type: "deleteShape"
	description?: string
	shapeId: TLShapeId
}

export interface TLAiCreateBindingChange {
	type: "createBinding"
	description?: string
	binding: {
		id: string
		type: string
		fromId: TLShapeId
		toId: TLShapeId
		props?: Record<string, unknown>
	}
}

export interface TLAiUpdateBindingChange {
	type: "updateBinding"
	description?: string
	binding: {
		id: string
		props?: Record<string, unknown>
	}
}

export interface TLAiDeleteBindingChange {
	type: "deleteBinding"
	description?: string
	bindingId: string
}

export type TLAiChange =
	| TLAiCreateShapeChange
	| TLAiUpdateShapeChange
	| TLAiDeleteShapeChange
	| TLAiCreateBindingChange
	| TLAiUpdateBindingChange
	| TLAiDeleteBindingChange

// ============================================================
// TLAiContent Types
// ============================================================

export interface TLAiContent {
	shapes?: TLShape[]
	bindings?: TLBinding[]
}

// ============================================================
// TLAiMessage Types
// ============================================================

export interface TLAiMessage {
	role: "user" | "assistant" | "system"
	content: string | TLAiContent
}

// ============================================================
// TLAiSerializedPrompt Types
// ============================================================

export type TLAiMessagePart =
	| { type: "text"; text: string }
	| { type: "image"; src: string }

export interface TLAiSerializedPrompt {
	// Main message from user
	message?: string | TLAiMessagePart[]
	// Current canvas content
	canvasContent?: TLAiContent
	// Screenshot of the canvas
	image?: string
	// Legacy fields for compatibility
	systemPrompt?: string
	userMessage?: string
	content?: TLAiContent
	messages?: TLAiMessage[]
	context?: Record<string, unknown>
}

// ============================================================
// TLAiResult Types
// ============================================================

export interface TLAiResult {
	changes: TLAiChange[]
	message?: string
}
