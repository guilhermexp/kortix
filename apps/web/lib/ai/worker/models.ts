// ============================================================
// TLDraw AI Worker Models
// ============================================================

import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import type { Environment } from "./types"

export type ModelId =
	| "gemini-2.5-pro"
	| "gemini-2.5-flash"
	| "gemini-2.0-flash"
	| "gpt-4o"
	| "gpt-4o-mini"
	| "gpt-4.1"
	| "gpt-4.1-mini"
	| "gpt-5.1"
	| "o1"
	| "o1-mini"
	| "claude-sonnet-4-20250514"
	| "claude-3-7-sonnet-20250219"
	// OpenRouter models
	| "openrouter/gemini-3-flash-preview"
	| "openrouter/gpt-5.1"
	| "openrouter/claude-sonnet-4.5"

export function getModel(modelId: ModelId, env: Environment) {
	switch (modelId) {
		case "gemini-2.5-pro":
		case "gemini-2.5-flash":
		case "gemini-2.0-flash": {
			const google = createGoogleGenerativeAI({
				apiKey: env.GOOGLE_API_KEY,
			})
			return google(modelId)
		}
		case "gpt-4o":
		case "gpt-4o-mini":
		case "gpt-4.1":
		case "gpt-4.1-mini":
		case "gpt-5.1":
		case "o1":
		case "o1-mini": {
			const openai = createOpenAI({
				apiKey: env.OPENAI_API_KEY,
			})
			return openai(modelId)
		}
		case "claude-sonnet-4-20250514":
		case "claude-3-7-sonnet-20250219": {
			const anthropic = createAnthropic({
				apiKey: env.ANTHROPIC_API_KEY,
			})
			return anthropic(modelId)
		}
		// OpenRouter models
		case "openrouter/gemini-3-flash-preview": {
			const openrouter = createOpenAI({
				apiKey: env.OPENROUTER_API_KEY,
				baseURL: "https://openrouter.ai/api/v1",
				compatibility: "strict", // Prevents automatic tool calling
				headers: {
					"HTTP-Referer": "https://kortix.ai",
					"X-Title": "Kortix",
				},
			})
			return openrouter("google/gemini-3-flash-preview")
		}
		case "openrouter/gpt-5.1": {
			const openrouter = createOpenAI({
				apiKey: env.OPENROUTER_API_KEY,
				baseURL: "https://openrouter.ai/api/v1",
				compatibility: "strict", // Prevents automatic tool calling
				headers: {
					"HTTP-Referer": "https://kortix.ai",
					"X-Title": "Kortix",
				},
			})
			return openrouter("openai/gpt-5.1")
		}
		case "openrouter/claude-sonnet-4.5": {
			const openrouter = createOpenAI({
				apiKey: env.OPENROUTER_API_KEY,
				baseURL: "https://openrouter.ai/api/v1",
				compatibility: "strict", // Prevents automatic tool calling
				headers: {
					"HTTP-Referer": "https://kortix.ai",
					"X-Title": "Kortix",
				},
			})
			return openrouter("anthropic/claude-sonnet-4.5")
		}
		default:
			throw new Error(`Unknown model: ${modelId}`)
	}
}
