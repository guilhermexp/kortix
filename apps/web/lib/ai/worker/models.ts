// ============================================================
// TLDraw AI Worker Models
// ============================================================

import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
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
		default:
			throw new Error(`Unknown model: ${modelId}`)
	}
}
