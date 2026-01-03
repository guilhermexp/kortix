// ============================================================
// Canvas Agent Chat Store - Zustand (Session State)
// ============================================================

import type { TLShapeId } from "tldraw"
import { create } from "zustand"

// ============================================================
// TYPES
// ============================================================

export interface ChatMessage {
	id: string
	role: "user" | "assistant" | "system"
	content: string
	timestamp: number
	// Optional metadata
	contextItems?: ContextItem[]
	events?: CanvasEvent[]
}

export type ContextItem = ShapeContextItem | AreaContextItem | PointContextItem

export interface ShapeContextItem {
	type: "shape"
	shapeId: TLShapeId
	shapeType: string
	bounds: { x: number; y: number; w: number; h: number }
	content?: string
}

export interface AreaContextItem {
	type: "area"
	bounds: { x: number; y: number; w: number; h: number }
}

export interface PointContextItem {
	type: "point"
	point: { x: number; y: number }
}

export interface ScheduledRequest {
	id: string
	message: string
	contextItems: ContextItem[]
	bounds?: { x: number; y: number; w: number; h: number }
	review: boolean
	timestamp: number
}

export interface CanvasEvent {
	type: "create" | "update" | "move" | "delete" | "label" | "think" | "message"
	shapeId?: string
	shapeIds?: string[]
	[key: string]: unknown
}

// ============================================================
// STORE
// ============================================================

interface CanvasAgentChatState {
	// Chat state
	messages: ChatMessage[]
	isProcessing: boolean
	currentRequestId: string | null
	sessionId: string

	// Context selection
	contextItems: ContextItem[]
	pendingContextItems: ContextItem[]

	// Request queue
	requestQueue: ScheduledRequest[]

	// Actions - Messages
	addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => string
	updateMessage: (id: string, updates: Partial<ChatMessage>) => void
	clearMessages: () => void

	// Actions - Context
	addContextItem: (item: ContextItem) => void
	removeContextItem: (index: number) => void
	clearContext: () => void
	moveToPendingContext: () => void
	clearPendingContext: () => void

	// Actions - Queue
	enqueueRequest: (
		request: Omit<ScheduledRequest, "id" | "timestamp">,
	) => string
	dequeueRequest: () => ScheduledRequest | null
	setProcessing: (processing: boolean, requestId?: string | null) => void

	// Actions - Session
	resetSession: () => void
}

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

export const useCanvasAgentChatStore = create<CanvasAgentChatState>(
	(set, get) => ({
		// Initial state
		messages: [],
		isProcessing: false,
		currentRequestId: null,
		sessionId: generateId(),
		contextItems: [],
		pendingContextItems: [],
		requestQueue: [],

		// Message actions
		addMessage: (message) => {
			const id = generateId()
			const newMessage: ChatMessage = {
				...message,
				id,
				timestamp: Date.now(),
			}
			set((state) => ({
				messages: [...state.messages, newMessage],
			}))
			return id
		},

		updateMessage: (id, updates) => {
			set((state) => ({
				messages: state.messages.map((msg) =>
					msg.id === id ? { ...msg, ...updates } : msg,
				),
			}))
		},

		clearMessages: () => {
			set({ messages: [] })
		},

		// Context actions
		addContextItem: (item) => {
			set((state) => ({
				contextItems: [...state.contextItems, item],
			}))
		},

		removeContextItem: (index) => {
			set((state) => ({
				contextItems: state.contextItems.filter((_, i) => i !== index),
			}))
		},

		clearContext: () => {
			set({ contextItems: [] })
		},

		moveToPendingContext: () => {
			set((state) => ({
				pendingContextItems: [...state.contextItems],
				contextItems: [],
			}))
		},

		clearPendingContext: () => {
			set({ pendingContextItems: [] })
		},

		// Queue actions
		enqueueRequest: (request) => {
			const id = generateId()
			const newRequest: ScheduledRequest = {
				...request,
				id,
				timestamp: Date.now(),
			}
			set((state) => ({
				requestQueue: [...state.requestQueue, newRequest],
			}))
			return id
		},

		dequeueRequest: () => {
			const state = get()
			if (state.requestQueue.length === 0) return null
			const [first, ...rest] = state.requestQueue
			set({ requestQueue: rest })
			return first ?? null
		},

		setProcessing: (processing, requestId = null) => {
			set({
				isProcessing: processing,
				currentRequestId: requestId,
			})
		},

		// Session actions
		resetSession: () => {
			set({
				messages: [],
				isProcessing: false,
				currentRequestId: null,
				sessionId: generateId(),
				contextItems: [],
				pendingContextItems: [],
				requestQueue: [],
			})
		},
	}),
)

// ============================================================
// SELECTORS
// ============================================================

export const selectHasPendingRequests = (state: CanvasAgentChatState) =>
	state.requestQueue.length > 0

export const selectCanSubmit = (state: CanvasAgentChatState) =>
	!state.isProcessing

export const selectLastAssistantMessage = (state: CanvasAgentChatState) =>
	state.messages.filter((m) => m.role === "assistant").slice(-1)[0]
