// ============================================================
// TLDraw AI Base Service
// Abstract base class for AI services
// ============================================================

import type {
	TLAiChange,
	TLAiResult,
	TLAiSerializedPrompt,
} from "@/lib/ai/tldraw-ai-types"
import type { Environment } from "./types"

export abstract class TldrawAiBaseService {
	protected env: Environment

	constructor(env: Environment) {
		this.env = env
	}

	// Generate a complete response (non-streaming)
	abstract generate(prompt: TLAiSerializedPrompt): Promise<TLAiResult>

	// Stream changes as they are generated
	abstract stream(prompt: TLAiSerializedPrompt): AsyncGenerator<TLAiChange>

	// Validate that required API keys are present
	protected validateEnv(): void {
		const hasGoogleKey = Boolean(this.env.GOOGLE_API_KEY)
		const hasOpenAiKey = Boolean(this.env.OPENAI_API_KEY)
		const hasAnthropicKey = Boolean(this.env.ANTHROPIC_API_KEY)
		const hasOpenRouterKey = Boolean(this.env.OPENROUTER_API_KEY)

		if (!hasGoogleKey && !hasOpenAiKey && !hasAnthropicKey && !hasOpenRouterKey) {
			throw new Error(
				"No AI provider API key found. Please set GOOGLE_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY.",
			)
		}
	}

	// Get the best available model based on environment
	protected getBestAvailableModel(): string {
		// Prioriza OpenRouter com GPT 5.1 (preferência do usuário como alternativa ao Gemini)
		if (this.env.OPENROUTER_API_KEY) {
			return "openrouter/gpt-5.1"
		}
		// Fallback para APIs diretas
		if (this.env.OPENAI_API_KEY) {
			return "gpt-5.1"
		}
		if (this.env.ANTHROPIC_API_KEY) {
			return "claude-sonnet-4-20250514"
		}
		if (this.env.GOOGLE_API_KEY) {
			return "gemini-2.0-flash"
		}
		throw new Error("No API key available")
	}
}
