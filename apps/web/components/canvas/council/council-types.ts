// ============================================================
// LLM Council Types - Types for events/sessions matching llm-council repo
// https://github.com/karpathy/llm-council
// ============================================================

import type { TLShapeId } from "tldraw"

// Stage 1 result - individual model response
export interface Stage1Result {
	model: string
	response: string
}

// Stage 2 result - model ranking
export interface Stage2Result {
	model: string
	ranking: string
	parsed_ranking: string[]
}

// Stage 3 result - chairman verdict
export interface Stage3Result {
	model: string
	response: string
}

// Aggregate ranking entry
export interface AggregateRanking {
	model: string
	average_rank: number
	rankings_count: number
}

// SSE Events from llm-council backend
export interface CouncilStage1StartEvent {
	type: "stage1_start"
}

export interface CouncilStage1CompleteEvent {
	type: "stage1_complete"
	data: Stage1Result[]
}

export interface CouncilStage2StartEvent {
	type: "stage2_start"
}

export interface CouncilStage2CompleteEvent {
	type: "stage2_complete"
	data: Stage2Result[]
	metadata: {
		label_to_model: Record<string, string>
		aggregate_rankings: AggregateRanking[]
	}
}

export interface CouncilStage3StartEvent {
	type: "stage3_start"
}

export interface CouncilStage3CompleteEvent {
	type: "stage3_complete"
	data: Stage3Result
}

export interface CouncilTitleCompleteEvent {
	type: "title_complete"
	data: { title: string }
}

export interface CouncilCompleteEvent {
	type: "complete"
}

export interface CouncilErrorEvent {
	type: "error"
	message: string
}

export type CouncilSSEEvent =
	| CouncilStage1StartEvent
	| CouncilStage1CompleteEvent
	| CouncilStage2StartEvent
	| CouncilStage2CompleteEvent
	| CouncilStage3StartEvent
	| CouncilStage3CompleteEvent
	| CouncilTitleCompleteEvent
	| CouncilCompleteEvent
	| CouncilErrorEvent

// Council session state
export interface CouncilSession {
	id: string
	query: string
	status: "pending" | "stage1" | "stage2" | "stage3" | "completed" | "error"
	startedAt: number
	completedAt?: number
	// Shape IDs for each node created
	queryShapeId?: TLShapeId
	modelShapeIds: Map<string, TLShapeId>
	verdictShapeId?: TLShapeId
}

// Layout positions
export interface Point {
	x: number
	y: number
}

export interface CouncilLayout {
	queryPosition: Point
	modelPositions: Point[]
	verdictPosition: Point
}

// Model colors for visual differentiation (matching llm-council models)
export const MODEL_COLORS: Record<string, string> = {
	// OpenAI
	"openai/gpt-5.2": "#10B981",
	"openai/gpt-5.1": "#10B981",
	"openai/gpt-4o": "#10B981",
	"openai/gpt-4-turbo": "#10B981",
	"gpt-5": "#10B981",
	"gpt-4": "#10B981",
	// Anthropic
	"anthropic/claude-sonnet-4.5": "#8B5CF6",
	"anthropic/claude-3-opus": "#8B5CF6",
	"anthropic/claude-3-sonnet": "#8B5CF6",
	"claude": "#8B5CF6",
	// Google
	"google/gemini-3-pro-preview": "#3B82F6",
	"google/gemini-2.5-flash": "#3B82F6",
	"google/gemini-pro": "#3B82F6",
	"gemini": "#3B82F6",
	// xAI
	"x-ai/grok-4.1": "#EF4444",
	"x-ai/grok-4": "#EF4444",
	"x-ai/grok-2": "#EF4444",
	"grok": "#EF4444",
	// Default
	default: "#6B7280",
}

// Get color for a model name
export function getModelColor(model: string): string {
	// Check exact match first
	if (MODEL_COLORS[model]) {
		return MODEL_COLORS[model]
	}
	// Check partial match
	const normalizedModel = model.toLowerCase()
	for (const [key, color] of Object.entries(MODEL_COLORS)) {
		if (key !== "default" && normalizedModel.includes(key.toLowerCase())) {
			return color
		}
	}
	return MODEL_COLORS.default ?? "#6B7280"
}

// Extract short model name from full identifier
export function getShortModelName(model: string): string {
	// "openai/gpt-5.1" -> "GPT-5.1"
	// "anthropic/claude-sonnet-4.5" -> "Claude Sonnet 4.5"
	// "google/gemini-3-pro-preview" -> "Gemini 3 Pro"
	// "x-ai/grok-4" -> "Grok 4"
	const parts = model.split("/")
	const name = parts[parts.length - 1] || model

	return name
		.replace(/-preview$/, "")
		.replace(/-/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase())
}

// Council shape props
export interface CouncilShapeProps {
	w: number
	h: number
	text: string
	model: string
	stage: 0 | 1 | 2 | 3 // 0 = query, 1 = model response, 2 = peer review (not shown), 3 = verdict
	isVerdict: boolean
	isStreaming: boolean
	// For model selector feature
	fullModelId?: string // Full OpenRouter model ID (e.g., "openai/gpt-5.1")
	originalQuery?: string // Original query to re-run with different model
}

// Available model from OpenRouter
export interface AvailableModel {
	id: string
	name: string
	description: string
	context_length: number
	pricing: {
		prompt: string
		completion: string
	}
}
