/**
 * Provider Configuration
 *
 * Defines all available AI providers (GLM/Z.AI and MiniMax)
 * Each provider has its own API endpoint, authentication, and models
 */

export const PROVIDER_CONFIGS = {
	glm: {
		id: "glm" as const,
		name: "Z.AI (GLM)",
		displayName: "GLM-4.6",
		apiKey: "REMOVED_API_KEY",
		baseURL: "https://api.z.ai/api/anthropic",
		models: {
			fast: "GLM-4.5-Air",
			balanced: "GLM-4.6",
			advanced: "GLM-4.6",
		},
		// Optional: provider-specific settings
		settings: {
			timeout: 300000, // 5 minutes
		},
	},
	minimax: {
		id: "minimax" as const,
		name: "MiniMax",
		displayName: "MiniMax-M2",
		apiKey:
			"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJHcm91cE5hbWUiOiJHdWlsaGVybWUgVmFyZWxhIiwiVXNlck5hbWUiOiJHdWlsaGVybWUgVmFyZWxhIiwiQWNjb3VudCI6IiIsIlN1YmplY3RJRCI6IjE5NDA4ODAzNTc1MTU1OTYzNzQiLCJQaG9uZSI6IiIsIkdyb3VwSUQiOiIxOTQwODgwMzU3NTA3MjA3NzY2IiwiUGFnZU5hbWUiOiIiLCJNYWlsIjoiZ3VpbGhlcm1laGVucmlxdWV2YXJlbGFAZ21haWwuY29tIiwiQ3JlYXRlVGltZSI6IjIwMjUtMTAtMzAgMjI6MzA6MjciLCJUb2tlblR5cGUiOjEsImlzcyI6Im1pbmltYXgifQ.kZGHJubqSc8EfuBEo5FhIz1gcGBjt9Mt0Gc1CnUCZo4_WzTOc_z-6y_QXmI0Me6Wx_Wd_WyqDHyrXNHMwzIWzI7evOkrBs0103ZduosBN1T3oWPELYCURM8Sfr3hbX_6reig2zkIukig3lIXl9lgTF5tZmAsQ-mVeDqNKDroipAO-1mwkm3I1ykv4qvaqkR-xqLOmO5bqcbP_WCDUa6BcsumQ0zgXnJbA5onKEBpiTknpHWe4tAxssrLnLbQ1LdzrDESLclgWdFZfinjjTgsrukoRcv6VHdTwAu18bYo05v9T6A9qz-fFawePRnGcfoAUvqSBaX-zwlm2aVKR_6a7A",
		baseURL: "https://api.minimax.io/anthropic",
		models: {
			fast: "MiniMax-M2",
			balanced: "MiniMax-M2",
			advanced: "MiniMax-M2",
		},
		settings: {
			timeout: 300000,
			disableNonessentialTraffic: true, // MiniMax-specific optimization
		},
	},
	anthropic: {
		id: "anthropic" as const,
		name: "Anthropic",
		displayName: "Haiku 4.5",
		apiKey: "REMOVED_API_KEY",
		baseURL: "https://api.anthropic.com", // Official Anthropic API
		models: {
			fast: "claude-haiku-4-5-20251001",
			balanced: "claude-haiku-4-5-20251001",
			advanced: "claude-haiku-4-5-20251001",
		},
		settings: {
			timeout: 300000,
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
	return "glm" // Default to GLM
}
