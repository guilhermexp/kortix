/**
 * Service Configuration Utilities
 *
 * Provides utilities for managing service configuration including:
 * - Configuration validation
 * - Environment variable loading
 * - Default configuration merging
 * - Configuration type guards
 */

import type {
	ExtractorServiceConfig,
	ProcessorServiceConfig,
	PreviewServiceConfig,
	OrchestratorServiceConfig,
	RetryOptions,
} from '../interfaces'

// ============================================================================
// Configuration Loading Utilities
// ============================================================================

/**
 * Load configuration from environment variables with defaults
 */
export class ConfigLoader {
	/**
	 * Get string from environment or default
	 */
	static getString(key: string, defaultValue: string): string {
		return process.env[key] || defaultValue
	}

	/**
	 * Get number from environment or default
	 */
	static getNumber(key: string, defaultValue: number): number {
		const value = process.env[key]
		if (!value) return defaultValue

		const parsed = Number.parseInt(value, 10)
		return Number.isNaN(parsed) ? defaultValue : parsed
	}

	/**
	 * Get boolean from environment or default
	 */
	static getBoolean(key: string, defaultValue: boolean): boolean {
		const value = process.env[key]
		if (!value) return defaultValue

		return value.toLowerCase() === 'true' || value === '1'
	}

	/**
	 * Get array from environment (comma-separated) or default
	 */
	static getArray(key: string, defaultValue: string[]): string[] {
		const value = process.env[key]
		if (!value) return defaultValue

		return value.split(',').map((item) => item.trim())
	}

	/**
	 * Require string from environment (throw if missing)
	 */
	static requireString(key: string): string {
		const value = process.env[key]
		if (!value) {
			throw new Error(`Required environment variable ${key} is not set`)
		}
		return value
	}
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default extractor service configuration
 */
export function getDefaultExtractorConfig(): ExtractorServiceConfig {
	return {
		firecrawl: {
			enabled: ConfigLoader.getBoolean('FIRECRAWL_ENABLED', true),
			apiKey: process.env.FIRECRAWL_API_KEY,
			timeout: ConfigLoader.getNumber('FIRECRAWL_TIMEOUT', 30000),
		},
		youtube: {
			enabled: ConfigLoader.getBoolean('YOUTUBE_ENABLED', true),
			preferredLanguages: ConfigLoader.getArray('YOUTUBE_LANGUAGES', ['en', 'en-US']),
			timeout: ConfigLoader.getNumber('YOUTUBE_TIMEOUT', 30000),
		},
		pdf: {
			enabled: ConfigLoader.getBoolean('PDF_ENABLED', true),
			ocrEnabled: ConfigLoader.getBoolean('PDF_OCR_ENABLED', true),
			ocrProvider: (process.env.PDF_OCR_PROVIDER as 'replicate' | 'gemini') || 'replicate',
			timeout: ConfigLoader.getNumber('PDF_TIMEOUT', 60000),
		},
		repository: {
			enabled: ConfigLoader.getBoolean('REPOSITORY_ENABLED', true),
			maxFileSize: ConfigLoader.getNumber('REPOSITORY_MAX_FILE_SIZE', 1024 * 1024), // 1MB
			timeout: ConfigLoader.getNumber('REPOSITORY_TIMEOUT', 30000),
		},
		defaultTimeout: ConfigLoader.getNumber('EXTRACTOR_DEFAULT_TIMEOUT', 30000),
		userAgent: ConfigLoader.getString(
			'USER_AGENT',
			'SupermemorySelfHosted/1.0 (+self-hosted extractor)'
		),
	}
}

/**
 * Default processor service configuration
 */
export function getDefaultProcessorConfig(): ProcessorServiceConfig {
	return {
		chunking: {
			defaultChunkSize: ConfigLoader.getNumber('CHUNK_SIZE', 800),
			defaultOverlap: ConfigLoader.getNumber('CHUNK_OVERLAP', 200),
			minChunkSize: ConfigLoader.getNumber('CHUNK_MIN_SIZE', 100),
			maxChunkSize: ConfigLoader.getNumber('CHUNK_MAX_SIZE', 2000),
		},
		embedding: {
			provider: (process.env.EMBEDDING_PROVIDER as 'gemini' | 'openai' | 'hybrid') || 'gemini',
			model: process.env.EMBEDDING_MODEL || 'text-embedding-004',
			dimensions: ConfigLoader.getNumber('EMBEDDING_DIMENSIONS', 768),
			batchSize: ConfigLoader.getNumber('EMBEDDING_BATCH_SIZE', 100),
		},
		summarization: {
			enabled: ConfigLoader.getBoolean('SUMMARIZATION_ENABLED', true),
			provider:
				(process.env.SUMMARIZATION_PROVIDER as 'openrouter' | 'gemini' | 'claude') ||
				'openrouter',
			model: process.env.SUMMARIZATION_MODEL || 'grok-4-fast',
			maxLength: ConfigLoader.getNumber('SUMMARY_MAX_LENGTH', 500),
		},
		tagging: {
			enabled: ConfigLoader.getBoolean('TAGGING_ENABLED', true),
			provider: (process.env.TAGGING_PROVIDER as 'openrouter' | 'gemini') || 'openrouter',
			maxTags: ConfigLoader.getNumber('MAX_TAGS', 10),
		},
	}
}

/**
 * Default preview service configuration
 */
export function getDefaultPreviewConfig(): PreviewServiceConfig {
	return {
		imageExtractionEnabled: ConfigLoader.getBoolean('PREVIEW_IMAGE_EXTRACTION', true),
		svgGenerationEnabled: ConfigLoader.getBoolean('PREVIEW_SVG_GENERATION', true),
		faviconFallbackEnabled: ConfigLoader.getBoolean('PREVIEW_FAVICON_FALLBACK', true),
		cacheTTL: ConfigLoader.getNumber('PREVIEW_CACHE_TTL', 3600), // 1 hour
		maxPreviewSize: ConfigLoader.getNumber('PREVIEW_MAX_SIZE', 5 * 1024 * 1024), // 5MB
		preferredDimensions: {
			width: ConfigLoader.getNumber('PREVIEW_WIDTH', 1200),
			height: ConfigLoader.getNumber('PREVIEW_HEIGHT', 630),
		},
	}
}

/**
 * Default orchestrator service configuration
 */
export function getDefaultOrchestratorConfig(): OrchestratorServiceConfig {
	return {
		circuitBreaker: {
			enabled: ConfigLoader.getBoolean('CIRCUIT_BREAKER_ENABLED', true),
			failureThreshold: ConfigLoader.getNumber('CIRCUIT_BREAKER_THRESHOLD', 5),
			resetTimeout: ConfigLoader.getNumber('CIRCUIT_BREAKER_RESET_TIMEOUT', 60000), // 1 minute
			monitoringWindow: ConfigLoader.getNumber('CIRCUIT_BREAKER_WINDOW', 300000), // 5 minutes
		},
		retry: {
			maxAttempts: ConfigLoader.getNumber('RETRY_MAX_ATTEMPTS', 3),
			baseDelay: ConfigLoader.getNumber('RETRY_BASE_DELAY', 1000),
			maxDelay: ConfigLoader.getNumber('RETRY_MAX_DELAY', 30000),
			backoffMultiplier: ConfigLoader.getNumber('RETRY_BACKOFF_MULTIPLIER', 2),
			jitter: ConfigLoader.getBoolean('RETRY_JITTER', true),
			timeout: ConfigLoader.getNumber('RETRY_TIMEOUT', 120000), // 2 minutes
		},
		processingTimeout: ConfigLoader.getNumber('PROCESSING_TIMEOUT', 300000), // 5 minutes
		parallelProcessing: ConfigLoader.getBoolean('PARALLEL_PROCESSING', false),
		maxConcurrentJobs: ConfigLoader.getNumber('MAX_CONCURRENT_JOBS', 10),
	}
}

/**
 * Default retry options
 */
export function getDefaultRetryOptions(): RetryOptions {
	return {
		maxAttempts: 3,
		baseDelay: 1000,
		maxDelay: 30000,
		backoffMultiplier: 2,
		jitter: true,
		timeout: 120000,
	}
}

// ============================================================================
// Configuration Merging
// ============================================================================

/**
 * Deep merge two configuration objects
 */
export function mergeConfig<T extends Record<string, any>>(
	defaultConfig: T,
	userConfig?: Partial<T>
): T {
	if (!userConfig) return defaultConfig

	const result = { ...defaultConfig }

	for (const key in userConfig) {
		if (Object.prototype.hasOwnProperty.call(userConfig, key)) {
			const userValue = userConfig[key]
			const defaultValue = defaultConfig[key]

			if (
				userValue !== null &&
				userValue !== undefined &&
				typeof userValue === 'object' &&
				!Array.isArray(userValue) &&
				typeof defaultValue === 'object' &&
				!Array.isArray(defaultValue)
			) {
				// Recursively merge objects
				result[key] = mergeConfig(
					defaultValue as Record<string, any>,
					userValue as Record<string, any>
				) as T[Extract<keyof T, string>]
			} else if (userValue !== undefined) {
				// Use user value if defined
				result[key] = userValue as T[Extract<keyof T, string>]
			}
		}
	}

	return result
}

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Validate extractor configuration
 */
export function validateExtractorConfig(config: ExtractorServiceConfig): void {
	// Validate timeouts
	if (config.defaultTimeout !== undefined && config.defaultTimeout < 0) {
		throw new Error('defaultTimeout must be positive')
	}

	if (config.firecrawl?.timeout !== undefined && config.firecrawl.timeout < 0) {
		throw new Error('firecrawl.timeout must be positive')
	}

	if (config.youtube?.timeout !== undefined && config.youtube.timeout < 0) {
		throw new Error('youtube.timeout must be positive')
	}

	if (config.pdf?.timeout !== undefined && config.pdf.timeout < 0) {
		throw new Error('pdf.timeout must be positive')
	}

	if (config.repository?.timeout !== undefined && config.repository.timeout < 0) {
		throw new Error('repository.timeout must be positive')
	}

	// Validate file sizes
	if (
		config.repository?.maxFileSize !== undefined &&
		config.repository.maxFileSize < 0
	) {
		throw new Error('repository.maxFileSize must be positive')
	}

	// Validate OCR provider
	if (config.pdf?.ocrProvider) {
		const validProviders = ['replicate', 'gemini']
		if (!validProviders.includes(config.pdf.ocrProvider)) {
			throw new Error(`Invalid OCR provider: ${config.pdf.ocrProvider}`)
		}
	}
}

/**
 * Validate processor configuration
 */
export function validateProcessorConfig(config: ProcessorServiceConfig): void {
	// Validate chunking
	if (config.chunking) {
		const { defaultChunkSize, defaultOverlap, minChunkSize, maxChunkSize } = config.chunking

		if (defaultChunkSize !== undefined && defaultChunkSize < 1) {
			throw new Error('defaultChunkSize must be positive')
		}

		if (defaultOverlap !== undefined && defaultOverlap < 0) {
			throw new Error('defaultOverlap must be non-negative')
		}

		if (minChunkSize !== undefined && minChunkSize < 1) {
			throw new Error('minChunkSize must be positive')
		}

		if (maxChunkSize !== undefined && maxChunkSize < 1) {
			throw new Error('maxChunkSize must be positive')
		}

		if (
			minChunkSize !== undefined &&
			maxChunkSize !== undefined &&
			minChunkSize > maxChunkSize
		) {
			throw new Error('minChunkSize must be less than or equal to maxChunkSize')
		}

		if (
			defaultChunkSize !== undefined &&
			defaultOverlap !== undefined &&
			defaultOverlap >= defaultChunkSize
		) {
			throw new Error('defaultOverlap must be less than defaultChunkSize')
		}
	}

	// Validate embedding
	if (config.embedding) {
		const { provider, dimensions, batchSize } = config.embedding

		if (provider) {
			const validProviders = ['gemini', 'openai', 'hybrid']
			if (!validProviders.includes(provider)) {
				throw new Error(`Invalid embedding provider: ${provider}`)
			}
		}

		if (dimensions !== undefined && dimensions < 1) {
			throw new Error('embedding dimensions must be positive')
		}

		if (batchSize !== undefined && batchSize < 1) {
			throw new Error('embedding batchSize must be positive')
		}
	}

	// Validate summarization
	if (config.summarization) {
		const { provider, maxLength } = config.summarization

		if (provider) {
			const validProviders = ['openrouter', 'gemini', 'claude']
			if (!validProviders.includes(provider)) {
				throw new Error(`Invalid summarization provider: ${provider}`)
			}
		}

		if (maxLength !== undefined && maxLength < 1) {
			throw new Error('summarization maxLength must be positive')
		}
	}

	// Validate tagging
	if (config.tagging) {
		const { provider, maxTags } = config.tagging

		if (provider) {
			const validProviders = ['openrouter', 'gemini']
			if (!validProviders.includes(provider)) {
				throw new Error(`Invalid tagging provider: ${provider}`)
			}
		}

		if (maxTags !== undefined && maxTags < 1) {
			throw new Error('maxTags must be positive')
		}
	}
}

/**
 * Validate preview configuration
 */
export function validatePreviewConfig(config: PreviewServiceConfig): void {
	if (config.cacheTTL !== undefined && config.cacheTTL < 0) {
		throw new Error('cacheTTL must be non-negative')
	}

	if (config.maxPreviewSize !== undefined && config.maxPreviewSize < 0) {
		throw new Error('maxPreviewSize must be non-negative')
	}

	if (config.preferredDimensions) {
		const { width, height } = config.preferredDimensions

		if (width < 1) {
			throw new Error('preferredDimensions.width must be positive')
		}

		if (height < 1) {
			throw new Error('preferredDimensions.height must be positive')
		}
	}
}

/**
 * Validate orchestrator configuration
 */
export function validateOrchestratorConfig(config: OrchestratorServiceConfig): void {
	// Validate circuit breaker
	if (config.circuitBreaker) {
		const { failureThreshold, resetTimeout, monitoringWindow } = config.circuitBreaker

		if (failureThreshold < 1) {
			throw new Error('circuitBreaker.failureThreshold must be positive')
		}

		if (resetTimeout < 0) {
			throw new Error('circuitBreaker.resetTimeout must be non-negative')
		}

		if (monitoringWindow < 0) {
			throw new Error('circuitBreaker.monitoringWindow must be non-negative')
		}
	}

	// Validate retry
	if (config.retry) {
		validateRetryOptions(config.retry)
	}

	// Validate timeouts
	if (config.processingTimeout !== undefined && config.processingTimeout < 0) {
		throw new Error('processingTimeout must be non-negative')
	}

	// Validate concurrency
	if (config.maxConcurrentJobs !== undefined && config.maxConcurrentJobs < 1) {
		throw new Error('maxConcurrentJobs must be positive')
	}
}

/**
 * Validate retry options
 */
export function validateRetryOptions(options: RetryOptions): void {
	if (options.maxAttempts !== undefined && options.maxAttempts < 1) {
		throw new Error('maxAttempts must be positive')
	}

	if (options.baseDelay !== undefined && options.baseDelay < 0) {
		throw new Error('baseDelay must be non-negative')
	}

	if (options.maxDelay !== undefined && options.maxDelay < 0) {
		throw new Error('maxDelay must be non-negative')
	}

	if (options.backoffMultiplier !== undefined && options.backoffMultiplier < 1) {
		throw new Error('backoffMultiplier must be at least 1')
	}

	if (options.timeout !== undefined && options.timeout < 0) {
		throw new Error('timeout must be non-negative')
	}

	if (
		options.baseDelay !== undefined &&
		options.maxDelay !== undefined &&
		options.baseDelay > options.maxDelay
	) {
		throw new Error('baseDelay must be less than or equal to maxDelay')
	}
}

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Create validated extractor configuration
 */
export function createExtractorConfig(
	userConfig?: Partial<ExtractorServiceConfig>
): ExtractorServiceConfig {
	const config = mergeConfig(getDefaultExtractorConfig(), userConfig)
	validateExtractorConfig(config)
	return config
}

/**
 * Create validated processor configuration
 */
export function createProcessorConfig(
	userConfig?: Partial<ProcessorServiceConfig>
): ProcessorServiceConfig {
	const config = mergeConfig(getDefaultProcessorConfig(), userConfig)
	validateProcessorConfig(config)
	return config
}

/**
 * Create validated preview configuration
 */
export function createPreviewConfig(
	userConfig?: Partial<PreviewServiceConfig>
): PreviewServiceConfig {
	const config = mergeConfig(getDefaultPreviewConfig(), userConfig)
	validatePreviewConfig(config)
	return config
}

/**
 * Create validated orchestrator configuration
 */
export function createOrchestratorConfig(
	userConfig?: Partial<OrchestratorServiceConfig>
): OrchestratorServiceConfig {
	const config = mergeConfig(getDefaultOrchestratorConfig(), userConfig)
	validateOrchestratorConfig(config)
	return config
}
