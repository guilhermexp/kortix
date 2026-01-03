// ============================================================
// TLDraw AI Agent Service
// Main entry point for AI canvas manipulation
// ============================================================

import type {
	TLAiChange,
	TLAiResult,
	TLAiSerializedPrompt,
} from "@/lib/ai/tldraw-ai-types"
import { VercelAiService } from "./worker/do/vercel/VercelAiService"
import type { Environment } from "./worker/types"

// Get environment configuration at runtime (not module load time)
function getEnv(): Environment {
	return {
		OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
		ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
		GOOGLE_API_KEY: (process.env.API_KEY ||
			process.env.GOOGLE_API_KEY ||
			"") as string,
	}
}

// Singleton service instance
let serviceInstance: VercelAiService | null = null
let lastEnvHash: string | null = null

// Get or create the service instance
function getService(): VercelAiService {
	const env = getEnv()
	const envHash = JSON.stringify(env)

	// Recreate service if env changed
	if (!serviceInstance || lastEnvHash !== envHash) {
		console.log("[AgentService] Creating service with env:", {
			hasGoogleKey: !!env.GOOGLE_API_KEY,
			hasOpenAiKey: !!env.OPENAI_API_KEY,
			hasAnthropicKey: !!env.ANTHROPIC_API_KEY,
		})
		serviceInstance = new VercelAiService(env)
		lastEnvHash = envHash
	}
	return serviceInstance
}

/**
 * Generate a complete AI response for canvas manipulation
 * @param prompt The serialized prompt from TLDraw AI
 * @returns The AI result with changes to apply
 */
export async function generateAgent(
	prompt: TLAiSerializedPrompt,
): Promise<TLAiResult> {
	const service = getService()
	return service.generate(prompt)
}

/**
 * Stream AI changes as they are generated
 * @param prompt The serialized prompt from TLDraw AI
 * @yields TLAiChange objects to apply to the canvas
 */
export async function* streamAgent(
	prompt: TLAiSerializedPrompt,
): AsyncGenerator<TLAiChange> {
	const service = getService()
	for await (const change of service.stream(prompt)) {
		yield change
	}
}

/**
 * Reset the service instance (useful for testing or reconfiguration)
 */
export function resetAgentService(): void {
	serviceInstance = null
}

/**
 * Check if AI service is properly configured
 */
export function isAgentConfigured(): boolean {
	const env = getEnv()
	return Boolean(
		env.GOOGLE_API_KEY || env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY,
	)
}
