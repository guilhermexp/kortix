import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import type {
	Chunk,
	EmbeddingOptions,
	EmbeddingProviderInfo,
	HybridEmbeddingStrategy,
	ProcessingError,
} from "../../interfaces"
import { createEmbeddingService, EmbeddingService } from "../embedding-service"

/**
 * Unit tests for EmbeddingService
 *
 * Tests embedding generation functionality including:
 * - Hybrid embedding strategy (Gemini + deterministic)
 * - Multiple provider support and fallback
 * - Performance optimization and caching
 * - Batch processing for efficiency
 * - Error handling and retry logic
 * - Content type-specific embedding strategies
 */

describe("EmbeddingService", () => {
	let service: EmbeddingService
	let mockOptions: EmbeddingOptions

	beforeEach(() => {
		mockOptions = {
			provider: "gemini",
			dimension: 1536,
			enableHybridStrategy: true,
			hybridStrategy: {
				primaryProvider: "gemini",
				fallbackProvider: "deterministic",
				enableAutoFallback: true,
				cacheResults: true,
				batchSize: 10,
			},
			cacheOptions: {
				enabled: true,
				maxSize: 1000,
				ttlSeconds: 3600,
			},
			performanceOptions: {
				enableBatchProcessing: true,
				maxConcurrent: 5,
				retryAttempts: 3,
			},
		}

		service = new EmbeddingService(mockOptions)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Service Interface", () => {
		it("should implement EmbeddingService interface", () => {
			expect(service).toHaveProperty("generateEmbeddings")
			expect(service).toHaveProperty("generateSingleEmbedding")
			expect(service).toHaveProperty("getProviderInfo")
			expect(service).toHaveProperty("getStatistics")
		})

		it("should have proper service metadata", () => {
			expect(service.getName()).toBe("EmbeddingService")
		})
	})

	describe("Single Embedding Generation", () => {
		it("should generate embedding for text content", async () => {
			const text = "This is a sample text for embedding generation."

			const mockEmbedding = [0.1, 0.2, 0.3, -0.1, 0.05, 0.8] // Sample 6D embedding
			const embeddingSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			embeddingSpy.mockResolvedValue(mockEmbedding)

			const result = await service.generateSingleEmbedding(text)

			expect(result.success).toBe(true)
			expect(result.data?.embedding).toEqual(mockEmbedding)
			expect(result.data?.dimension).toBe(mockEmbedding.length)
			expect(result.data?.provider).toBe("gemini")
		})

		it("should handle different text lengths", async () => {
			const testCases = [
				"Short text",
				"This is a medium length text with multiple sentences. It contains more content than a simple phrase but is still relatively concise.",
				"Very long text that goes on and on describing various topics and concepts. ".repeat(
					50,
				),
			]

			const embeddingSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			embeddingSpy.mockResolvedValue([0.1, 0.2, 0.3])

			for (const text of testCases) {
				const result = await service.generateSingleEmbedding(text)
				expect(result.success).toBe(true)
				expect(result.data?.embedding).toHaveLength(3)
			}
		})

		it("should handle empty text", async () => {
			const result = await service.generateSingleEmbedding("")

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("EMPTY_TEXT")
		})

		it("should handle very long text", async () => {
			const longText = "A".repeat(10000) // Very long text

			const result = await service.generateSingleEmbedding(longText)
			expect(result.success).toBe(true) // Should handle or truncate appropriately
		})
	})

	describe("Batch Embedding Generation", () => {
		it("should process chunks in batches", async () => {
			const chunks: Chunk[] = [
				{
					id: "chunk-1",
					content: "First chunk content",
					embeddings: [],
					metadata: { tokenCount: 10 },
				},
				{
					id: "chunk-2",
					content: "Second chunk content",
					embeddings: [],
					metadata: { tokenCount: 12 },
				},
				{
					id: "chunk-3",
					content: "Third chunk content",
					embeddings: [],
					metadata: { tokenCount: 8 },
				},
			]

			const mockEmbeddings = chunks.map(() => [0.1, 0.2, 0.3])
			const batchSpy = vi.spyOn(service as any, "processBatch")
			batchSpy.mockResolvedValue(mockEmbeddings)

			const result = await service.generateEmbeddings(chunks)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toHaveLength(3)
			expect(result.data?.chunks![0].embeddings).toEqual([0.1, 0.2, 0.3])
			expect(result.data?.chunks![1].embeddings).toEqual([0.1, 0.2, 0.3])
		})

		it("should respect batch size limits", async () => {
			const largeChunkArray: Chunk[] = Array(50)
				.fill(null)
				.map((_, i) => ({
					id: `chunk-${i}`,
					content: `Chunk ${i} content`,
					embeddings: [],
					metadata: { tokenCount: 10 },
				}))

			const batchSpy = vi.spyOn(service as any, "processBatch")
			batchSpy.mockImplementation((batch) => {
				return Promise.resolve(batch.map(() => [0.1, 0.2, 0.3]))
			})

			const result = await service.generateEmbeddings(largeChunkArray)

			expect(result.success).toBe(true)
			expect(batchSpy).toHaveBeenCalled()

			// Should be called multiple times for large batches
			const callCount = batchSpy.mock.calls.length
			expect(callCount).toBeGreaterThan(1) // Multiple batches
		})

		it("should handle partial batch failures", async () => {
			const chunks: Chunk[] = [
				{
					id: "chunk-1",
					content: "Valid chunk",
					embeddings: [],
					metadata: { tokenCount: 10 },
				},
				{
					id: "chunk-2",
					content: "Invalid chunk",
					embeddings: [],
					metadata: { tokenCount: 10 },
				},
				{
					id: "chunk-3",
					content: "Another valid chunk",
					embeddings: [],
					metadata: { tokenCount: 10 },
				},
			]

			const batchSpy = vi.spyOn(service as any, "processBatch")
			batchSpy
				.mockResolvedValueOnce([0.1, 0.2, 0.3]) // Success
				.mockRejectedValueOnce(new Error("Batch processing failed")) // Failure
				.mockResolvedValueOnce([0.4, 0.5, 0.6]) // Success

			const result = await service.generateEmbeddings(chunks)

			expect(result.success).toBe(true) // Should handle partial failures
			expect(result.data?.chunks).toBeDefined()
		})
	})

	describe("Hybrid Embedding Strategy", () => {
		it("should use primary provider (Gemini) when available", async () => {
			const options: EmbeddingOptions = {
				...mockOptions,
				enableHybridStrategy: true,
				hybridStrategy: {
					...mockOptions.hybridStrategy!,
					primaryProvider: "gemini",
				},
			}

			const hybridService = new EmbeddingService(options)
			const text = "Test text for hybrid embedding"

			const geminiSpy = vi.spyOn(hybridService as any, "callGeminiAPI")
			geminiSpy.mockResolvedValue([0.1, 0.2, 0.3])

			const result = await hybridService.generateSingleEmbedding(text)

			expect(result.success).toBe(true)
			expect(geminiSpy).toHaveBeenCalledWith(text)
			expect(result.data?.provider).toBe("gemini")
		})

		it("should fallback to deterministic provider when primary fails", async () => {
			const options: EmbeddingOptions = {
				...mockOptions,
				enableHybridStrategy: true,
				hybridStrategy: {
					...mockOptions.hybridStrategy!,
					enableAutoFallback: true,
				},
			}

			const hybridService = new EmbeddingService(options)
			const text = "Test text for fallback embedding"

			const geminiSpy = vi.spyOn(hybridService as any, "callGeminiAPI")
			geminiSpy.mockRejectedValue(new Error("Gemini API failed"))

			const deterministicSpy = vi.spyOn(
				hybridService as any,
				"generateDeterministicEmbedding",
			)
			deterministicSpy.mockResolvedValue([0.5, 0.6, 0.7])

			const result = await hybridService.generateSingleEmbedding(text)

			expect(result.success).toBe(true)
			expect(geminiSpy).toHaveBeenCalled()
			expect(deterministicSpy).toHaveBeenCalledWith(text)
			expect(result.data?.provider).toBe("deterministic")
		})

		it("should not fallback when auto-fallback is disabled", async () => {
			const options: EmbeddingOptions = {
				...mockOptions,
				enableHybridStrategy: true,
				hybridStrategy: {
					...mockOptions.hybridStrategy!,
					enableAutoFallback: false,
				},
			}

			const hybridService = new EmbeddingService(options)
			const text = "Test text without fallback"

			const geminiSpy = vi.spyOn(hybridService as any, "callGeminiAPI")
			geminiSpy.mockRejectedValue(new Error("Gemini API failed"))

			const result = await hybridService.generateSingleEmbedding(text)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("PRIMARY_PROVIDER_FAILED")
		})

		it("should cache hybrid results", async () => {
			const options: EmbeddingOptions = {
				...mockOptions,
				enableHybridStrategy: true,
				hybridStrategy: {
					...mockOptions.hybridStrategy!,
					cacheResults: true,
				},
			}

			const hybridService = new EmbeddingService(options)
			const text = "Cached test text"

			const geminiSpy = vi.spyOn(hybridService as any, "callGeminiAPI")
			geminiSpy.mockResolvedValue([0.1, 0.2, 0.3])

			// First call
			const result1 = await hybridService.generateSingleEmbedding(text)
			// Second call (should use cache)
			const result2 = await hybridService.generateSingleEmbedding(text)

			expect(result1.success).toBe(true)
			expect(result2.success).toBe(true)
			expect(geminiSpy).toHaveBeenCalledTimes(1) // Only called once
		})
	})

	describe("Provider Management", () => {
		it("should support multiple embedding providers", async () => {
			const providers = ["gemini", "openai", "cohere", "huggingface"]

			for (const provider of providers) {
				const options: EmbeddingOptions = {
					...mockOptions,
					provider,
				}

				const providerService = new EmbeddingService(options)
				const providerInfo = providerService.getProviderInfo()

				expect(providerInfo.provider).toBe(provider)
			}
		})

		it("should switch between providers dynamically", async () => {
			const text = "Test text for provider switching"

			// Mock successful responses from different providers
			const providerSpies = {
				gemini: vi.spyOn(service as any, "callGeminiAPI"),
				openai: vi.spyOn(service as any, "callOpenAIAPI"),
				cohere: vi.spyOn(service as any, "callCohereAPI"),
			}

			providerSpies.gemini.mockResolvedValue([0.1, 0.2, 0.3])
			providerSpies.openai.mockResolvedValue([0.4, 0.5, 0.6])
			providerSpies.cohere.mockResolvedValue([0.7, 0.8, 0.9])

			// Test each provider
			for (const [provider, spy] of Object.entries(providerSpies)) {
				const options: EmbeddingOptions = {
					...mockOptions,
					provider: provider as any,
				}
				const providerService = new EmbeddingService(options)
				const result = await providerService.generateSingleEmbedding(text)

				expect(result.success).toBe(true)
				expect(spy).toHaveBeenCalled()
			}
		})

		it("should validate provider configuration", () => {
			const invalidOptions: EmbeddingOptions = {
				...mockOptions,
				provider: "invalid-provider",
			}

			expect(() => new EmbeddingService(invalidOptions)).toThrow()
		})
	})

	describe("Performance Optimization", () => {
		it("should implement caching for repeated embeddings", async () => {
			const text = "Repeated text for caching test"
			const mockEmbedding = [0.1, 0.2, 0.3]

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockResolvedValue(mockEmbedding)

			// First call
			const result1 = await service.generateSingleEmbedding(text)
			// Second call (should use cache)
			const result2 = await service.generateSingleEmbedding(text)

			expect(result1.success).toBe(true)
			expect(result2.success).toBe(true)
			expect(providerSpy).toHaveBeenCalledTimes(1) // Only called once due to caching
			expect(result1.data?.embedding).toEqual(result2.data?.embedding)
		})

		it("should respect concurrent processing limits", async () => {
			const texts = Array(10)
				.fill(null)
				.map((_, i) => `Text ${i}`)
			const embeddings = texts.map(() => [0.1, 0.2, 0.3])

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockImplementation((text) => {
				return new Promise((resolve) =>
					setTimeout(() => resolve([0.1, 0.2, 0.3]), 10),
				)
			})

			const startTime = Date.now()
			const results = await Promise.all(
				texts.map((text) => service.generateSingleEmbedding(text)),
			)
			const endTime = Date.now()

			expect(results.every((r) => r.success)).toBe(true)
			expect(endTime - startTime).toBeLessThan(100) // Should be fast with concurrency
		})

		it("should handle memory-efficient processing for large batches", async () => {
			const largeChunkArray: Chunk[] = Array(1000)
				.fill(null)
				.map((_, i) => ({
					id: `chunk-${i}`,
					content: `Large batch chunk ${i}`,
					embeddings: [],
					metadata: { tokenCount: 10 },
				}))

			const batchSpy = vi.spyOn(service as any, "processBatch")
			batchSpy.mockResolvedValue(
				Array(1000)
					.fill(null)
					.map(() => [0.1, 0.2, 0.3]),
			)

			const result = await service.generateEmbeddings(largeChunkArray)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toHaveLength(1000)
		})
	})

	describe("Error Handling", () => {
		it("should handle provider API failures", async () => {
			const text = "Test text for error handling"

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockRejectedValue(new Error("API rate limit exceeded"))

			const result = await service.generateSingleEmbedding(text)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("PROVIDER_API_ERROR")
		})

		it("should handle network timeouts", async () => {
			const text = "Test text for timeout handling"

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockImplementation(
				() =>
					new Promise((_, reject) =>
						setTimeout(() => reject(new Error("Request timeout")), 5000),
					),
			)

			const result = await service.generateSingleEmbedding(text)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("TIMEOUT")
		})

		it("should handle invalid response formats", async () => {
			const text = "Test text for invalid response"

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockResolvedValue("invalid-response-format")

			const result = await service.generateSingleEmbedding(text)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("INVALID_RESPONSE_FORMAT")
		})

		it("should handle quota exceeded errors", async () => {
			const text = "Test text for quota handling"

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockRejectedValue(new Error("Quota exceeded"))

			const result = await service.generateSingleEmbedding(text)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("QUOTA_EXCEEDED")
		})

		it("should implement retry logic for transient failures", async () => {
			const text = "Test text for retry logic"

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			// Fail twice, succeed on third attempt
			providerSpy
				.mockRejectedValueOnce(new Error("Temporary error"))
				.mockRejectedValueOnce(new Error("Temporary error"))
				.mockResolvedValue([0.1, 0.2, 0.3])

			const result = await service.generateSingleEmbedding(text)

			expect(result.success).toBe(true)
			expect(providerSpy).toHaveBeenCalledTimes(3)
		})

		it("should not retry for non-transient errors", async () => {
			const text = "Test text for no retry"

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockRejectedValue(new Error("Authentication failed"))

			const result = await service.generateSingleEmbedding(text)

			expect(result.success).toBe(false)
			expect(providerSpy).toHaveBeenCalledTimes(1) // No retries for auth errors
		})
	})

	describe("Deterministic Embeddings", () => {
		it("should generate consistent deterministic embeddings", async () => {
			const text = "Deterministic embedding test text"

			const deterministicSpy = vi.spyOn(
				service as any,
				"generateDeterministicEmbedding",
			)
			deterministicSpy.mockImplementation((input: string) => {
				// Simple hash-based deterministic embedding
				const hash = input.split("").reduce((a, b) => {
					a = (a << 5) - a + b.charCodeAt(0)
					return a & a
				}, 0)
				return [
					(hash % 1000) / 1000,
					(Math.abs(hash) % 1000) / 1000,
					((hash * 2) % 1000) / 1000,
				]
			})

			const result1 = await service.generateSingleEmbedding(text)
			const result2 = await service.generateSingleEmbedding(text)

			expect(result1.success).toBe(true)
			expect(result2.success).toBe(true)
			expect(result1.data?.embedding).toEqual(result2.data?.embedding)
		})

		it("should use deterministic embeddings as fallback", async () => {
			const options: EmbeddingOptions = {
				...mockOptions,
				enableHybridStrategy: true,
			}

			const hybridService = new EmbeddingService(options)
			const text = "Fallback test text"

			const geminiSpy = vi.spyOn(hybridService as any, "callGeminiAPI")
			geminiSpy.mockRejectedValue(new Error("API unavailable"))

			const deterministicSpy = vi.spyOn(
				hybridService as any,
				"generateDeterministicEmbedding",
			)
			deterministicSpy.mockResolvedValue([0.5, 0.6, 0.7])

			const result = await hybridService.generateSingleEmbedding(text)

			expect(result.success).toBe(true)
			expect(result.data?.embedding).toEqual([0.5, 0.6, 0.7])
			expect(result.data?.provider).toBe("deterministic")
		})
	})

	describe("Content Type Handling", () => {
		it("should handle different content types appropriately", async () => {
			const contentTypes = [
				"Plain text content for embedding",
				"# Markdown content\n\nThis is **bold** and *italic*",
				"```javascript\nconst code = 'example';\n```",
				"| Column 1 | Column 2 |\n|----------|----------|\n| Data 1   | Data 2   |",
			]

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockResolvedValue([0.1, 0.2, 0.3])

			for (const content of contentTypes) {
				const result = await service.generateSingleEmbedding(content)
				expect(result.success).toBe(true)
				expect(result.data?.embedding).toHaveLength(3)
			}
		})

		it("should preprocess content before embedding", async () => {
			const text = "  Text with extra whitespace and \n newlines  "

			const preprocessSpy = vi.spyOn(service as any, "preprocessText")
			preprocessSpy.mockReturnValue("Text with extra whitespace and newlines")

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockResolvedValue([0.1, 0.2, 0.3])

			const result = await service.generateSingleEmbedding(text)

			expect(preprocessSpy).toHaveBeenCalledWith(text)
			expect(result.success).toBe(true)
		})
	})

	describe("Provider Information", () => {
		it("should provide detailed provider information", () => {
			const info = service.getProviderInfo()

			expect(info).toBeDefined()
			expect(info.provider).toBe("gemini")
			expect(info.dimension).toBe(1536)
			expect(info.maxTokens).toBeGreaterThan(0)
			expect(info.supportedFeatures).toContain("batch-processing")
		})

		it("should report provider status", () => {
			const info = service.getProviderInfo()

			expect(info).toHaveProperty("status")
			expect(info).toHaveProperty("lastHealthCheck")
			expect(info).toHaveProperty("errorRate")
		})
	})

	describe("Statistics and Metrics", () => {
		it("should track embedding generation statistics", async () => {
			const text = "Statistics test text"

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockResolvedValue([0.1, 0.2, 0.3])

			await service.generateSingleEmbedding(text)

			const stats = service.getStatistics()

			expect(stats.totalEmbeddings).toBeGreaterThan(0)
			expect(stats.averageLatency).toBeGreaterThan(0)
			expect(stats.successRate).toBeGreaterThanOrEqual(0)
		})

		it("should track cache hit rates", async () => {
			const text = "Cache test text"

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockResolvedValue([0.1, 0.2, 0.3])

			// First call
			await service.generateSingleEmbedding(text)
			// Second call (cache hit)
			await service.generateSingleEmbedding(text)

			const stats = service.getStatistics()

			expect(stats.cacheHitRate).toBeGreaterThan(0)
		})
	})

	describe("Configuration Management", () => {
		it("should update configuration dynamically", () => {
			const newOptions: EmbeddingOptions = {
				...mockOptions,
				provider: "openai",
				dimension: 512,
			}

			service.updateConfiguration(newOptions)

			// Verify configuration was updated
			const info = service.getProviderInfo()
			expect(info.provider).toBe("openai")
			expect(info.dimension).toBe(512)
		})

		it("should handle partial configuration updates", () => {
			const partialOptions = {
				cacheOptions: {
					enabled: false,
				},
			}

			service.updateConfiguration(partialOptions)

			// Should merge with existing configuration
		})
	})

	describe("Factory Function", () => {
		it("should create service with default options", () => {
			const service = createEmbeddingService()
			expect(service).toBeDefined()
			expect(service.getName()).toBe("EmbeddingService")
		})

		it("should create service with custom options", () => {
			const customOptions: EmbeddingOptions = {
				provider: "cohere",
				dimension: 1024,
				enableHybridStrategy: false,
			}

			const service = createEmbeddingService(customOptions)
			expect(service).toBeDefined()
		})
	})

	describe("Edge Cases", () => {
		it("should handle texts with only special characters", async () => {
			const specialText = "!@#$%^&*()_+-=[]{}|;':\",./<>?"

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockResolvedValue([0.1, 0.2, 0.3])

			const result = await service.generateSingleEmbedding(specialText)

			expect(result.success).toBe(true)
		})

		it("should handle texts with emojis and unicode", async () => {
			const unicodeText = "Text with émojis 🎯🔍 and spëciäl chårs ünïcödé"

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockResolvedValue([0.1, 0.2, 0.3])

			const result = await service.generateSingleEmbedding(unicodeText)

			expect(result.success).toBe(true)
			expect(result.data?.embedding).toHaveLength(3)
		})

		it("should handle very short texts", async () => {
			const shortTexts = ["a", "1", "!", " "]

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockResolvedValue([0.1, 0.2, 0.3])

			for (const text of shortTexts) {
				const result = await service.generateSingleEmbedding(text)
				expect(result.success).toBe(true)
			}
		})

		it("should handle texts with HTML entities", async () => {
			const htmlText = "Text with &lt;HTML&gt; entities &amp; special chars"

			const providerSpy = vi.spyOn(service as any, "callEmbeddingProvider")
			providerSpy.mockResolvedValue([0.1, 0.2, 0.3])

			const result = await service.generateSingleEmbedding(htmlText)

			expect(result.success).toBe(true)
		})
	})
})
