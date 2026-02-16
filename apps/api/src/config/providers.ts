/**
 * Provider Configuration
 *
 * Defines the Kimi (K2.5) provider for AI chat
 *
 * API key configured via environment variable:
 * - KIMI_API_KEY
 */

import { env } from "../env"

export const PROVIDER_CONFIGS = {
	kimi: {
		id: "kimi" as const,
		name: "Kimi (K2.5)",
		displayName: "kimi-k2.5-coding",
		apiKey: env.KIMI_API_KEY,
		baseURL: "https://api.kimi.com/coding",
		models: {
			fast: "kimi-k2.5-coding",
			balanced: "kimi-k2.5-coding",
			advanced: "kimi-k2.5-coding",
		},
		settings: {
			timeout: 3000000, // 50 minutes (matching profile)
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
	return "kimi"
}
