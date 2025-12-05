"use client"

// ============================================================
// Canvas Agent Context - tldraw Atoms (Reactive State)
// ============================================================

import { Box, type BoxModel, Vec, type VecModel, atom } from "tldraw"

// ============================================================
// TYPES
// ============================================================

export type CanvasContextItem = ShapeContextItem | AreaContextItem | PointContextItem

export interface ShapeContextItem {
	type: "shape"
	shapeId: string
	shapeType?: string
	bounds?: BoxModel
	content?: string
	source: "agent" | "user"
}

export interface AreaContextItem {
	type: "area"
	bounds: BoxModel
	source: "agent" | "user"
}

export interface PointContextItem {
	type: "point"
	point: VecModel
	source: "agent" | "user"
}

export interface ChatHistoryItem {
	id: string
	type: "user-message" | "assistant-message" | "canvas-change" | "thinking"
	content: string
	timestamp: number
	contextItems?: CanvasContextItem[]
	changes?: CanvasChange[]
}

export interface CanvasChange {
	type: "create" | "update" | "delete" | "move"
	shapeId?: string
	shapeIds?: string[]
	description?: string
}

export interface ScheduledAgentRequest {
	id: string
	message: string
	contextItems: CanvasContextItem[]
	bounds?: BoxModel
	review: boolean
	timestamp: number
}

// ============================================================
// ATOMS - Context Selection
// ============================================================

// Current context items selected by user
export const $canvasContextItems = atom<CanvasContextItem[]>("canvas context items", [])

// Context items being processed (moved from selection)
export const $pendingContextItems = atom<CanvasContextItem[]>("pending context items", [])

// ============================================================
// ATOMS - Chat State
// ============================================================

// Chat history for the current session
export const $chatHistoryItems = atom<ChatHistoryItem[]>("chat history items", [])

// Current assistant response being streamed
export const $streamingResponse = atom<string | null>("streaming response", null)

// Is the agent currently processing
export const $isAgentProcessing = atom<boolean>("is agent processing", false)

// ============================================================
// ATOMS - Request Queue
// ============================================================

// Queue of requests to be processed
export const $requestsSchedule = atom<ScheduledAgentRequest[]>("requests schedule", [])

// Current request being processed
export const $currentRequestId = atom<string | null>("current request id", null)

// ============================================================
// ATOMS - UI State
// ============================================================

// Is the chat panel expanded
export const $isChatExpanded = atom<boolean>("is chat expanded", true)

// Show context highlights on canvas
export const $showContextHighlights = atom<boolean>("show context highlights", true)

// ============================================================
// CONTEXT ACTIONS
// ============================================================

export function addCanvasContextItem(item: CanvasContextItem) {
	$canvasContextItems.update((items) => {
		const existingItem = items.find((v) => areContextItemsEquivalent(v, item))
		if (existingItem) return items
		return [...items, item]
	})
}

export function removeCanvasContextItem(index: number) {
	$canvasContextItems.update((items) => items.filter((_, i) => i !== index))
}

export function clearCanvasContext() {
	$canvasContextItems.set([])
}

export function moveToPendingContext() {
	const items = $canvasContextItems.get()
	$pendingContextItems.set(items)
	$canvasContextItems.set([])
}

export function clearPendingContext() {
	$pendingContextItems.set([])
}

// ============================================================
// CHAT ACTIONS
// ============================================================

export function addChatHistoryItem(item: Omit<ChatHistoryItem, "id" | "timestamp">) {
	const newItem: ChatHistoryItem = {
		...item,
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		timestamp: Date.now(),
	}
	$chatHistoryItems.update((items) => [...items, newItem])
	return newItem.id
}

export function updateChatHistoryItem(id: string, updates: Partial<ChatHistoryItem>) {
	$chatHistoryItems.update((items) =>
		items.map((item) => (item.id === id ? { ...item, ...updates } : item))
	)
}

export function clearChatHistory() {
	$chatHistoryItems.set([])
}

export function setStreamingResponse(response: string | null) {
	$streamingResponse.set(response)
}

export function setAgentProcessing(processing: boolean) {
	$isAgentProcessing.set(processing)
}

// ============================================================
// REQUEST QUEUE ACTIONS
// ============================================================

export function enqueueRequest(request: Omit<ScheduledAgentRequest, "id" | "timestamp">) {
	const newRequest: ScheduledAgentRequest = {
		...request,
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		timestamp: Date.now(),
	}
	$requestsSchedule.update((schedule) => [...schedule, newRequest])
	return newRequest.id
}

export function dequeueRequest(): ScheduledAgentRequest | null {
	const schedule = $requestsSchedule.get()
	if (schedule.length === 0) return null
	const [first, ...rest] = schedule
	$requestsSchedule.set(rest)
	return first ?? null
}

export function clearRequestQueue() {
	$requestsSchedule.set([])
}

export function setCurrentRequestId(id: string | null) {
	$currentRequestId.set(id)
}

// ============================================================
// HELPERS
// ============================================================

function areContextItemsEquivalent(a: CanvasContextItem, b: CanvasContextItem) {
	if (a.type !== b.type) return false
	if (a.type === "shape" && b.type === "shape") {
		return a.shapeId === b.shapeId
	}
	if (a.type === "area" && b.type === "area") {
		return Box.Equals(a.bounds, b.bounds)
	}
	if (a.type === "point" && b.type === "point") {
		return Vec.Equals(a.point, b.point)
	}
	return false
}

// ============================================================
// RESET ALL STATE
// ============================================================

export function resetAgentState() {
	$canvasContextItems.set([])
	$pendingContextItems.set([])
	$chatHistoryItems.set([])
	$streamingResponse.set(null)
	$isAgentProcessing.set(false)
	$requestsSchedule.set([])
	$currentRequestId.set(null)
}
