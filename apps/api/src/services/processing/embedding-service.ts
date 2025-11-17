/**
 * Embedding Service
 *
 * Hybrid embedding generation service with multiple strategies.
 * Features:
 * - Gemini API integration for high-quality embeddings
 * - Deterministic fallback for reliability
 * - Batch processing for efficiency
 * - Token counting and rate limiting
 * - Caching layer for repeated content
 * - Comprehensive error handling and retry logic
 */

import { BaseService } from "../base/base-service"
import {
	ensureVectorSize,
	generateDeterministicEmbedding,
	VECTOR_SIZE,
} from "../embedding"
import { generateEmbedding as generateEmbeddingProvider } from "../embedding-provider"
import type {
	Chunk,
	EmbeddingOptions,
	EmbeddingProviderInfo,
	EmbeddingService as IEmbeddingService,
} from "../interfaces"

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BATCH_SIZE = 10
const DEFAULT_TIMEOUT = 30000 // 30 seconds
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000
const MAX_TEXT_LENGTH = 30000 // bytes (Gemini limit)
const CACHE_TTL_MS = 3600000 // 1 hour

// ============================================================================
// Embedding Cache
// ============================================================================

interface CacheEntry {
	embedding: number[]
	timestamp: number
}

// ============================================================================
// Embedding Service Implementation
// ============================================================================

/**
 * Service for generating vector embeddings
 */
export class EmbeddingService extends BaseService implements IEmbeddingService {
	private readonly provider: "gemini" | "openai" | "hybrid" | "deterministic"
	private readonly batchSize: number
	private readonly useCache: boolean
	private readonly embeddingCache: Map<string, CacheEntry> = new Map()

	constructor(options?: EmbeddingOptions) {
		super("EmbeddingService")

		this.provider = options?.provider ?? "hybrid"
		this.batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE
		this.useCache = options?.useCache ?? true

		// Start cache cleanup interval
		if (this.useCache) {
			this.startCacheCleanup()
		}
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Generate embeddings for chunks
	 */
	async generateEmbeddings(chunks: Chunk[]): Promise<Chunk[]> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("generateEmbeddings")

		try {
			this.logger.info("Generating embeddings for chunks", {
				chunkCount: chunks.length,
				batchSize: this.batchSize,
				provider: this.provider,
			})

			// Process in batches
			const result: Chunk[] = []

			for (let i = 0; i < chunks.length; i += this.batchSize) {
				const batch = chunks.slice(i, i + this.batchSize)
				const batchTexts = batch.map((c) => c.text)

				this.logger.debug("Processing batch", {
					batchIndex: Math.floor(i / this.batchSize),
					batchSize: batch.length,
				})

				// Generate embeddings for batch
				const embeddings = await this.generateBatchEmbeddings(batchTexts)

				// Assign embeddings to chunks
				for (let j = 0; j < batch.length; j++) {
					result.push({
						...batch[j],
						embedding: embeddings[j],
					})
				}

				// Rate limiting delay between batches
				if (i + this.batchSize < chunks.length) {
					await this.delay(100) // 100ms between batches
				}
			}

			tracker.end(true)

			this.logger.info("Embeddings generated successfully", {
				totalChunks: result.length,
			})

			return result
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "generateEmbeddings")
		}
	}

	/**
	 * Generate single embedding
	 */
	async generateEmbedding(text: string): Promise<number[]> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("generateEmbedding")

		try {
			// Check cache first
			if (this.useCache) {
				const cached = await this.getCachedEmbedding(text)
				if (cached) {
					this.logger.debug("Using cached embedding")
					tracker.end(true)
					return cached
				}
			}

			// Generate embedding based on provider strategy
			let embedding: number[]

			switch (this.provider) {
				case "gemini":
					embedding = await this.generateWithGemini(text)
					break

				case "deterministic":
					embedding = this.generateDeterministic(text)
					break

				case "hybrid":
				default:
					// Try Gemini first, fall back to deterministic
					try {
						embedding = await this.generateWithGemini(text)
					} catch (error) {
						this.logger.warn("Gemini failed, using deterministic fallback", {
							error: (error as Error).message,
						})
						embedding = this.generateDeterministic(text)
					}
					break
			}

			// Cache the result
			if (this.useCache) {
				await this.cacheEmbedding(text, embedding)
			}

			tracker.end(true)
			return embedding
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "generateEmbedding")
		}
	}

	/**
	 * Generate embeddings in batch
	 */
	async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
		this.assertInitialized()

		const embeddings: number[][] = []

		// Process each text individually (Gemini doesn't have batch API)
		for (const text of texts) {
			const embedding = await this.generateEmbedding(text)
			embeddings.push(embedding)
		}

		return embeddings
	}

	/**
	 * Get embedding dimensions
	 */
	getEmbeddingDimensions(): number {
		return VECTOR_SIZE
	}

	/**
	 * Get embedding provider info
	 */
	getProviderInfo(): EmbeddingProviderInfo {
		return {
			name: this.provider,
			model:
				this.provider === "gemini" ? "text-embedding-004" : "deterministic",
			dimensions: VECTOR_SIZE,
			maxInputLength: MAX_TEXT_LENGTH,
			rateLimits: {
				requestsPerMinute: 60,
				tokensPerMinute: 1000000,
			},
		}
	}

	/**
	 * Check embedding cache
	 */
	async getCachedEmbedding(text: string): Promise<number[] | null> {
		if (!this.useCache) return null

		const key = this.getCacheKey(text)
		const entry = this.embeddingCache.get(key)

		if (!entry) return null

		// Check if cache entry is still valid
		if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
			this.embeddingCache.delete(key)
			return null
		}

		return entry.embedding
	}

	/**
	 * Cache embedding
	 */
	async cacheEmbedding(text: string, embedding: number[]): Promise<void> {
		if (!this.useCache) return

		const key = this.getCacheKey(text)
		this.embeddingCache.set(key, {
			embedding,
			timestamp: Date.now(),
		})

		// Limit cache size
		if (this.embeddingCache.size > 10000) {
			this.cleanupCache()
		}
	}

	// ========================================================================
	// Private Methods - Embedding Generation
	// ========================================================================

	/**
	 * Generate embedding using Gemini
	 */
	private async generateWithGemini(text: string): Promise<number[]> {
		// Truncate text if too long
		const safeText = this.truncateText(text, MAX_TEXT_LENGTH)

		// Use existing provider with retry logic
		return await this.withRetry(() => generateEmbeddingProvider(safeText))
	}

	/**
	 * Generate deterministic embedding
	 */
	private generateDeterministic(text: string): number[] {
		const embedding = generateDeterministicEmbedding(text)
		return ensureVectorSize(embedding, VECTOR_SIZE)
	}

	/**
	 * Truncate text to byte limit
	 */
	private truncateText(text: string, maxBytes: number): string {
		const textBytes = Buffer.byteLength(text, "utf8")

		if (textBytes <= maxBytes) {
			return text
		}

		// Truncate to approximate character count
		const ratio = maxBytes / textBytes
		const truncateAt = Math.floor(text.length * ratio)
		const truncated = text.slice(0, truncateAt)

		this.logger.warn("Text truncated for embedding", {
			originalBytes: textBytes,
			truncatedBytes: Buffer.byteLength(truncated, "utf8"),
			ratio,
		})

		return truncated
	}

	// ========================================================================
	// Private Methods - Caching
	// ========================================================================

	/**
	 * Get cache key for text
	 */
	private getCacheKey(text: string): string {
		// Use first 100 chars + length as key (simple hash)
		const prefix = text.slice(0, 100)
		return `${prefix.length}:${text.length}:${prefix}`
	}

	/**
	 * Start cache cleanup interval
	 */
	private startCacheCleanup(): void {
		// Clean up cache every 15 minutes
		setInterval(() => {
			this.cleanupCache()
		}, 900000)
	}

	/**
	 * Clean up expired cache entries
	 */
	private cleanupCache(): void {
		const now = Date.now()
		let removed = 0

		for (const [key, entry] of this.embeddingCache.entries()) {
			if (now - entry.timestamp > CACHE_TTL_MS) {
				this.embeddingCache.delete(key)
				removed++
			}
		}

		if (removed > 0) {
			this.logger.debug("Cache cleanup completed", {
				removed,
				remaining: this.embeddingCache.size,
			})
		}
	}

	// ========================================================================
	// Private Methods - Utilities
	// ========================================================================

	/**
	 * Execute function with retry logic
	 */
	private async withRetry<T>(
		fn: () => Promise<T>,
		maxRetries = MAX_RETRIES,
	): Promise<T> {
		let lastError: Error | null = null

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			try {
				return await fn()
			} catch (error) {
				lastError = error as Error

				// Check if it's a rate limit error
				const isRateLimit =
					error instanceof Error &&
					(error.message.includes("rate") ||
						error.message.includes("quota") ||
						error.message.includes("429"))

				if (isRateLimit && attempt < maxRetries - 1) {
					// Exponential backoff
					const delayMs = RETRY_DELAY_MS * 2 ** attempt
					this.logger.warn("Rate limit hit, retrying", {
						attempt: attempt + 1,
						maxRetries,
						delayMs,
					})
					await this.delay(delayMs)
					continue
				}

				// Not a rate limit error or final attempt
				if (attempt === maxRetries - 1) {
					break
				}

				// Regular retry with shorter delay
				await this.delay(RETRY_DELAY_MS)
			}
		}

		throw lastError || new Error("Retry failed with unknown error")
	}

	/**
	 * Delay helper
	 */
	private async delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Test embedding generation
		try {
			const testText = "This is a health check test."
			const embedding = await this.generateEmbedding(testText)
			return embedding.length === VECTOR_SIZE
		} catch {
			return false
		}
	}

	protected async onCleanup(): Promise<void> {
		// Clear cache
		this.embeddingCache.clear()
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create embedding service with optional configuration
 */
export function createEmbeddingService(
	options?: EmbeddingOptions,
): EmbeddingService {
	return new EmbeddingService(options)
}
