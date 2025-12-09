/**
 * Provider Configuration
 *
 * Defines the GLM/Z.AI provider for AI chat
 *
 * API key can be configured via environment variable:
 * - GLM_API_KEY
 *
 * If not provided, falls back to hardcoded value for backward compatibility.
 */

import { env } from "../env"

export const PROVIDER_CONFIGS = {
	glm: {
		id: "glm" as const,
		name: "Z.AI (GLM)",
		displayName: "GLM-4.6V",
		apiKey: env.GLM_API_KEY,
		baseURL: "https://api.z.ai/api/anthropic",
		models: {
			fast: "GLM-4.6V",
			balanced: "GLM-4.6V",
			advanced: "GLM-4.6V",
		},
		// Optional: provider-specific settings
		settings: {
			timeout: 300000, // 5 minutes
		},
	},
} as const

export type ProviderId = keyof typeof PROVIDER_CONFIGS
export type ProviderConfig = (typeof PROVIDER_CONFIGS)[ProviderId]

/**
 * Get provider configuration by ID
 */
export function getProviderConfig(providerId: ProviderId): ProviderConfig {
	const config = PROVIDER_CONFIGS[providerId]
	if (!config) {
		throw new Error(`Provider '${providerId}' not found`)
	}
	return config
}

/**
 * List all available providers
 */
export function listProviders(): ProviderConfig[] {
	return Object.values(PROVIDER_CONFIGS)
}

/**
 * Validate provider ID
 */
export function isValidProvider(providerId: string): providerId is ProviderId {
	return providerId in PROVIDER_CONFIGS
}

/**
 * Get default provider
 */
export function getDefaultProvider(): ProviderId {
	return "glm" // Default to GLM-4.6V
}
