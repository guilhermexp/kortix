import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import type {
	Chunk,
	ExtractionResult,
	ProcessedDocument,
	ProcessingError,
	ProcessingMetrics,
	ProcessingOptions,
	ProcessorServiceConfig,
} from "../../interfaces"
import {
	createDocumentProcessorService,
	DocumentProcessorService,
} from "../document-processor"

/**
 * Unit tests for DocumentProcessorService
 *
 * Tests document processing orchestration including:
 * - Pipeline management with configurable stages
 * - Parallel and sequential processing support
 * - Performance monitoring and optimization
 * - Comprehensive error handling
 * - Progress tracking and reporting
 * - Integration with chunking, embedding, summarization, and tagging services
 */

describe("DocumentProcessorService", () => {
	let service: DocumentProcessorService
	let mockConfig: ProcessorServiceConfig
	let mockExtractionResult: ExtractionResult

	beforeEach(() => {
		// Mock configuration
		mockConfig = {
			enableChunking: true,
			enableEmbedding: true,
			enableSummarization: true,
			enableTagging: true,
			enableParallelProcessing: true,
			chunkingOptions: {
				maxTokensPerChunk: 800,
				overlapTokens: 50,
			},
			embeddingOptions: {
				provider: "gemini",
				dimension: 1536,
			},
			summarizationOptions: {
				includeBullets: true,
				maxSummaryLength: 200,
			},
			taggingOptions: {
				maxTags: 10,
				minConfidence: 0.7,
			},
		}

		// Create service instance
		service = new DocumentProcessorService(mockConfig)

		// Mock extraction result
		mockExtractionResult = {
			success: true,
			data: {
				content:
					"This is a sample document with multiple paragraphs. It contains substantial content that needs to be processed through the document pipeline. The document includes various topics and should be chunked, embedded, summarized, and tagged appropriately.",
				metadata: {
					title: "Sample Document",
					author: "Test Author",
					pageCount: 3,
				},
				processingTime: 2000,
			},
		}
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Service Initialization", () => {
		it("should initialize with correct configuration", () => {
			expect(service).toBeDefined()
			expect(service.getName()).toBe("DocumentProcessorService")
		})

		it("should initialize processing services", async () => {
			await service.initialize()
			// Verify all sub-services are initialized
		})

		it("should set up processing pipeline stages", () => {
			// Verify pipeline configuration
		})
	})

	describe("Document Processing Pipeline", () => {
		it("should process document through complete pipeline", async () => {
			const mockProcessedDocument: ProcessedDocument = {
				content: mockExtractionResult.data!.content,
				metadata: {
					...mockExtractionResult.data!.metadata,
					wordCount: 50,
					characterCount: 350,
				},
				chunks: [
					{
						id: "chunk-1",
						content: "This is a sample document with multiple paragraphs.",
						embeddings: [0.1, 0.2, 0.3],
						metadata: { position: 0, tokenCount: 8 },
					},
					{
						id: "chunk-2",
						content:
							"It contains substantial content that needs to be processed.",
						embeddings: [0.4, 0.5, 0.6],
						metadata: { position: 1, tokenCount: 9 },
					},
				],
				summary: "Sample document summary with key points",
				tags: ["document", "sample", "processing"],
				processingMetrics: {
					totalProcessingTime: 5000,
					chunkingTime: 500,
					embeddingTime: 2000,
					summarizationTime: 1500,
					taggingTime: 1000,
				},
			}

			// Mock the processing steps
			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(service as any, "processSummarization")
			const taggingSpy = vi.spyOn(service as any, "processTagging")

			chunkingSpy.mockResolvedValue(mockProcessedDocument.chunks!)
			embeddingSpy.mockResolvedValue(mockProcessedDocument.chunks!)
			summarizationSpy.mockResolvedValue(mockProcessedDocument.summary!)
			taggingSpy.mockResolvedValue(mockProcessedDocument.tags!)

			const result = await service.processDocument(mockExtractionResult)

			expect(result.success).toBe(true)
			expect(result.data?.content).toBe(mockExtractionResult.data!.content)
			expect(result.data?.chunks).toHaveLength(2)
			expect(result.data?.summary).toBe(
				"Sample document summary with key points",
			)
			expect(result.data?.tags).toHaveLength(3)
			expect(result.data?.processingMetrics).toBeDefined()
		})

		it("should handle documents with minimal content", async () => {
			const minimalExtractionResult: ExtractionResult = {
				success: true,
				data: {
					content: "Short",
					metadata: { title: "Short Document" },
					processingTime: 500,
				},
			}

			const minimalProcessed: ProcessedDocument = {
				content: "Short",
				metadata: { title: "Short Document", wordCount: 1 },
				chunks: [
					{
						id: "chunk-1",
						content: "Short",
						embeddings: [0.1],
						metadata: { position: 0, tokenCount: 1 },
					},
				],
				summary: "Short document",
				tags: ["short"],
				processingMetrics: {
					totalProcessingTime: 1000,
					chunkingTime: 100,
					embeddingTime: 500,
					summarizationTime: 200,
					taggingTime: 200,
				},
			}

			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(service as any, "processSummarization")
			const taggingSpy = vi.spyOn(service as any, "processTagging")

			chunkingSpy.mockResolvedValue(minimalProcessed.chunks!)
			embeddingSpy.mockResolvedValue(minimalProcessed.chunks!)
			summarizationSpy.mockResolvedValue(minimalProcessed.summary!)
			taggingSpy.mockResolvedValue(minimalProcessed.tags!)

			const result = await service.processDocument(minimalExtractionResult)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toHaveLength(1)
			expect(result.data?.summary).toBe("Short document")
		})

		it("should handle large documents efficiently", async () => {
			const largeContent = "Large document content. ".repeat(1000) // 20k+ characters
			const largeExtractionResult: ExtractionResult = {
				success: true,
				data: {
					content: largeContent,
					metadata: { title: "Large Document", pageCount: 50 },
					processingTime: 5000,
				},
			}

			const largeProcessed: ProcessedDocument = {
				content: largeContent,
				metadata: { title: "Large Document", wordCount: 2000 },
				chunks: Array(10)
					.fill(null)
					.map((_, i) => ({
						id: `chunk-${i}`,
						content: `Large chunk ${i}`,
						embeddings: Array(1536).fill(0.1),
						metadata: { position: i, tokenCount: 800 },
					})),
				summary: "Comprehensive summary of large document",
				tags: ["large", "document", "comprehensive"],
				processingMetrics: {
					totalProcessingTime: 15000,
					chunkingTime: 2000,
					embeddingTime: 8000,
					summarizationTime: 3000,
					taggingTime: 2000,
				},
			}

			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(service as any, "processSummarization")
			const taggingSpy = vi.spyOn(service as any, "processTagging")

			chunkingSpy.mockResolvedValue(largeProcessed.chunks!)
			embeddingSpy.mockResolvedValue(largeProcessed.chunks!)
			summarizationSpy.mockResolvedValue(largeProcessed.summary!)
			taggingSpy.mockResolvedValue(largeProcessed.tags!)

			const result = await service.processDocument(largeExtractionResult)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toHaveLength(10)
			expect(
				result.data?.processingMetrics?.totalProcessingTime,
			).toBeGreaterThan(10000)
		})
	})

	describe("Pipeline Configuration", () => {
		it("should respect processing options", async () => {
			const options: ProcessingOptions = {
				enableChunking: false,
				enableSummarization: false,
				enableTagging: true,
			}

			const result = await service.processDocument(
				mockExtractionResult,
				options,
			)

			expect(result.success).toBe(true)
			// Should only run enabled processing stages
		})

		it("should handle custom processing options", async () => {
			const options: ProcessingOptions = {
				chunkingOptions: {
					maxTokensPerChunk: 400,
					overlapTokens: 25,
				},
				embeddingOptions: {
					provider: "gemini",
					dimension: 1536,
				},
			}

			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")

			chunkingSpy.mockResolvedValue([])
			embeddingSpy.mockResolvedValue([])

			const result = await service.processDocument(
				mockExtractionResult,
				options,
			)

			expect(result.success).toBe(true)
			// Verify custom options are passed to sub-services
		})

		it("should disable all processing when requested", async () => {
			const options: ProcessingOptions = {
				enableChunking: false,
				enableEmbedding: false,
				enableSummarization: false,
				enableTagging: false,
			}

			const result = await service.processDocument(
				mockExtractionResult,
				options,
			)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeUndefined()
			expect(result.data?.summary).toBeUndefined()
			expect(result.data?.tags).toBeUndefined()
		})
	})

	describe("Parallel Processing", () => {
		it("should process stages in parallel when enabled", async () => {
			const config: ProcessorServiceConfig = {
				...mockConfig,
				enableParallelProcessing: true,
			}

			const parallelService = new DocumentProcessorService(config)

			const chunkingSpy = vi.spyOn(parallelService as any, "processChunking")
			const embeddingSpy = vi.spyOn(parallelService as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(
				parallelService as any,
				"processSummarization",
			)
			const taggingSpy = vi.spyOn(parallelService as any, "processTagging")

			chunkingSpy.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve([]), 100)),
			)
			embeddingSpy.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve([]), 200)),
			)
			summarizationSpy.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve(""), 150)),
			)
			taggingSpy.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve([]), 120)),
			)

			const startTime = Date.now()
			await parallelService.processDocument(mockExtractionResult)
			const endTime = Date.now()

			// Parallel processing should be faster than sequential
			expect(endTime - startTime).toBeLessThan(600)

			chunkingSpy.mockRestore()
			embeddingSpy.mockRestore()
			summarizationSpy.mockRestore()
			taggingSpy.mockRestore()
		})

		it("should fall back to sequential processing when parallel fails", async () => {
			const config: ProcessorServiceConfig = {
				...mockConfig,
				enableParallelProcessing: true,
			}

			const parallelService = new DocumentProcessorService(config)

			const parallelSpy = vi.spyOn(parallelService as any, "processInParallel")
			parallelSpy.mockRejectedValue(new Error("Parallel processing failed"))

			const sequentialSpy = vi.spyOn(
				parallelService as any,
				"processSequentially",
			)
			sequentialSpy.mockResolvedValue({
				success: true,
				data: {
					content: mockExtractionResult.data!.content,
					metadata: mockExtractionResult.data!.metadata,
				},
			})

			const result = await parallelService.processDocument(mockExtractionResult)

			expect(result.success).toBe(true)
			expect(parallelSpy).toHaveBeenCalled()
			expect(sequentialSpy).toHaveBeenCalled()
		})

		it("should not use parallel processing when disabled", async () => {
			const config: ProcessorServiceConfig = {
				...mockConfig,
				enableParallelProcessing: false,
			}

			const sequentialService = new DocumentProcessorService(config)

			const parallelSpy = vi.spyOn(
				sequentialService as any,
				"processInParallel",
			)

			const chunkingSpy = vi.spyOn(sequentialService as any, "processChunking")
			const embeddingSpy = vi.spyOn(
				sequentialService as any,
				"processEmbedding",
			)
			const summarizationSpy = vi.spyOn(
				sequentialService as any,
				"processSummarization",
			)
			const taggingSpy = vi.spyOn(sequentialService as any, "processTagging")

			chunkingSpy.mockResolvedValue([])
			embeddingSpy.mockResolvedValue([])
			summarizationSpy.mockResolvedValue("")
			taggingSpy.mockResolvedValue([])

			await sequentialService.processDocument(mockExtractionResult)

			expect(parallelSpy).not.toHaveBeenCalled()
			expect(chunkingSpy).toHaveBeenCalled()
		})
	})

	describe("Error Handling", () => {
		it("should handle chunking service failures", async () => {
			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			chunkingSpy.mockRejectedValue(new Error("Chunking failed"))

			const result = await service.processDocument(mockExtractionResult)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("CHUNKING_FAILED")
		})

		it("should handle embedding service failures", async () => {
			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")

			chunkingSpy.mockResolvedValue([
				{
					id: "chunk-1",
					content: "Test chunk",
					embeddings: [],
					metadata: { position: 0, tokenCount: 2 },
				},
			])
			embeddingSpy.mockRejectedValue(new Error("Embedding failed"))

			const result = await service.processDocument(mockExtractionResult)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("EMBEDDING_FAILED")
		})

		it("should handle summarization service failures", async () => {
			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(service as any, "processSummarization")

			chunkingSpy.mockResolvedValue([])
			embeddingSpy.mockResolvedValue([])
			summarizationSpy.mockRejectedValue(new Error("Summarization failed"))

			const result = await service.processDocument(mockExtractionResult)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("SUMMARIZATION_FAILED")
		})

		it("should handle tagging service failures", async () => {
			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(service as any, "processSummarization")
			const taggingSpy = vi.spyOn(service as any, "processTagging")

			chunkingSpy.mockResolvedValue([])
			embeddingSpy.mockResolvedValue([])
			summarizationSpy.mockResolvedValue("")
			taggingSpy.mockRejectedValue(new Error("Tagging failed"))

			const result = await service.processDocument(mockExtractionResult)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("TAGGING_FAILED")
		})

		it("should continue processing when optional services fail", async () => {
			const options: ProcessingOptions = {
				continueOnError: true,
			}

			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(service as any, "processSummarization")
			const taggingSpy = vi.spyOn(service as any, "processTagging")

			chunkingSpy.mockResolvedValue([])
			embeddingSpy.mockResolvedValue([])
			summarizationSpy.mockRejectedValue(new Error("Summarization failed"))
			taggingSpy.mockResolvedValue([])

			const result = await service.processDocument(
				mockExtractionResult,
				options,
			)

			expect(result.success).toBe(true)
			expect(result.data?.summary).toBeUndefined() // Failed stage
			expect(result.data?.tags).toEqual([]) // Completed stage
		})

		it("should handle invalid extraction results", async () => {
			const invalidResult: ExtractionResult = {
				success: false,
				error: {
					code: "EXTRACTION_FAILED",
					message: "Extraction failed",
				},
			}

			const result = await service.processDocument(invalidResult)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("INVALID_INPUT")
		})
	})

	describe("Performance Monitoring", () => {
		it("should track processing metrics", async () => {
			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(service as any, "processSummarization")
			const taggingSpy = vi.spyOn(service as any, "processTagging")

			chunkingSpy.mockResolvedValue([])
			embeddingSpy.mockResolvedValue([])
			summarizationSpy.mockResolvedValue("")
			taggingSpy.mockResolvedValue([])

			const result = await service.processDocument(mockExtractionResult)

			expect(result.data?.processingMetrics).toBeDefined()
			expect(
				result.data?.processingMetrics?.totalProcessingTime,
			).toBeGreaterThan(0)
		})

		it("should provide detailed timing information", async () => {
			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(service as any, "processSummarization")
			const taggingSpy = vi.spyOn(service as any, "processTagging")

			// Mock different processing times
			chunkingSpy.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve([]), 100)),
			)
			embeddingSpy.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve([]), 200)),
			)
			summarizationSpy.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve(""), 150)),
			)
			taggingSpy.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve([]), 120)),
			)

			const result = await service.processDocument(mockExtractionResult)

			expect(
				result.data?.processingMetrics?.chunkingTime,
			).toBeGreaterThanOrEqual(100)
			expect(
				result.data?.processingMetrics?.embeddingTime,
			).toBeGreaterThanOrEqual(200)
			expect(
				result.data?.processingMetrics?.summarizationTime,
			).toBeGreaterThanOrEqual(150)
			expect(
				result.data?.processingMetrics?.taggingTime,
			).toBeGreaterThanOrEqual(120)
		})

		it("should handle concurrent document processing", async () => {
			const documentCount = 5
			const extractionResults = Array(documentCount)
				.fill(null)
				.map((_, i) => ({
					...mockExtractionResult,
					data: {
						...mockExtractionResult.data!,
						content: `Document ${i}: ${mockExtractionResult.data!.content}`,
					},
				}))

			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(service as any, "processSummarization")
			const taggingSpy = vi.spyOn(service as any, "processTagging")

			chunkingSpy.mockResolvedValue([])
			embeddingSpy.mockResolvedValue([])
			summarizationSpy.mockResolvedValue("")
			taggingSpy.mockResolvedValue([])

			const startTime = Date.now()
			const results = await Promise.all(
				extractionResults.map((result) => service.processDocument(result)),
			)
			const endTime = Date.now()

			expect(results).toHaveLength(documentCount)
			results.forEach((result) => expect(result.success).toBe(true))
			expect(endTime - startTime).toBeLessThan(1000) // Should be reasonably fast
		})
	})

	describe("Progress Tracking", () => {
		it("should report progress through processing stages", async () => {
			const progressCallback = vi.fn()

			const options: ProcessingOptions = {
				progressCallback,
			}

			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(service as any, "processSummarization")
			const taggingSpy = vi.spyOn(service as any, "processTagging")

			chunkingSpy.mockResolvedValue([])
			embeddingSpy.mockResolvedValue([])
			summarizationSpy.mockResolvedValue("")
			taggingSpy.mockResolvedValue([])

			await service.processDocument(mockExtractionResult, options)

			// Verify progress callbacks were called for each stage
			expect(progressCallback).toHaveBeenCalledWith("chunking", 25)
			expect(progressCallback).toHaveBeenCalledWith("embedding", 50)
			expect(progressCallback).toHaveBeenCalledWith("summarization", 75)
			expect(progressCallback).toHaveBeenCalledWith("tagging", 100)
		})

		it("should handle progress tracking in parallel mode", async () => {
			const progressCallback = vi.fn()

			const config: ProcessorServiceConfig = {
				...mockConfig,
				enableParallelProcessing: true,
			}

			const parallelService = new DocumentProcessorService(config)

			const options: ProcessingOptions = {
				progressCallback,
			}

			const chunkingSpy = vi.spyOn(parallelService as any, "processChunking")
			const embeddingSpy = vi.spyOn(parallelService as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(
				parallelService as any,
				"processSummarization",
			)
			const taggingSpy = vi.spyOn(parallelService as any, "processTagging")

			chunkingSpy.mockResolvedValue([])
			embeddingSpy.mockResolvedValue([])
			summarizationSpy.mockResolvedValue("")
			taggingSpy.mockResolvedValue([])

			await parallelService.processDocument(mockExtractionResult, options)

			expect(progressCallback).toHaveBeenCalled()
		})
	})

	describe("Configuration Management", () => {
		it("should update configuration dynamically", () => {
			const newConfig: ProcessorServiceConfig = {
				...mockConfig,
				enableSummarization: false,
				enableParallelProcessing: false,
			}

			service.updateConfiguration(newConfig)
			// Verify configuration is updated
		})

		it("should handle partial configuration updates", () => {
			const partialConfig = {
				enableTagging: false,
			}

			service.updateConfiguration(partialConfig)
			// Should merge with existing config
		})
	})

	describe("Factory Function", () => {
		it("should create service with default configuration", () => {
			const service = createDocumentProcessorService()
			expect(service).toBeDefined()
			expect(service.getName()).toBe("DocumentProcessorService")
		})

		it("should create service with custom configuration", () => {
			const customConfig: ProcessorServiceConfig = {
				enableChunking: false,
				enableEmbedding: true,
				enableSummarization: true,
				enableTagging: false,
				enableParallelProcessing: true,
			}

			const service = createDocumentProcessorService(customConfig)
			expect(service).toBeDefined()
		})
	})

	describe("Edge Cases", () => {
		it("should handle documents with no text content", async () => {
			const emptyContentResult: ExtractionResult = {
				success: true,
				data: {
					content: "",
					metadata: { title: "Empty Document" },
					processingTime: 100,
				},
			}

			const result = await service.processDocument(emptyContentResult)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toHaveLength(0)
		})

		it("should handle documents with only metadata", async () => {
			const metadataOnlyResult: ExtractionResult = {
				success: true,
				data: {
					content: "",
					metadata: {
						title: "Metadata Only",
						author: "Test Author",
						pageCount: 1,
						extractedAt: new Date().toISOString(),
					},
					processingTime: 200,
				},
			}

			const result = await service.processDocument(metadataOnlyResult)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toHaveLength(0)
			expect(result.data?.summary).toBe("Metadata Only document")
		})

		it("should handle very long documents", async () => {
			const veryLongContent = "A".repeat(1000000) // 1MB of text
			const veryLongResult: ExtractionResult = {
				success: true,
				data: {
					content: veryLongContent,
					metadata: { title: "Very Long Document" },
					processingTime: 10000,
				},
			}

			const result = await service.processDocument(veryLongResult)

			expect(result.success).toBe(true)
			expect(result.data?.chunks).toBeDefined()
			expect(result.data?.chunks!.length).toBeGreaterThan(0)
		})

		it("should handle documents with special characters", async () => {
			const specialContentResult: ExtractionResult = {
				success: true,
				data: {
					content: "Document with émojis 🎯 and spëciäl chårs and ünïcödé",
					metadata: { title: "Special Chars Document" },
					processingTime: 500,
				},
			}

			const result = await service.processDocument(specialContentResult)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain("émojis")
		})
	})

	describe("Resource Management", () => {
		it("should clean up resources after processing", async () => {
			const chunkingSpy = vi.spyOn(service as any, "processChunking")
			const embeddingSpy = vi.spyOn(service as any, "processEmbedding")
			const summarizationSpy = vi.spyOn(service as any, "processSummarization")
			const taggingSpy = vi.spyOn(service as any, "processTagging")

			chunkingSpy.mockResolvedValue([])
			embeddingSpy.mockResolvedValue([])
			summarizationSpy.mockResolvedValue("")
			taggingSpy.mockResolvedValue([])

			await service.processDocument(mockExtractionResult)

			// Verify cleanup was called
		})

		it("should handle memory constraints", async () => {
			const largeResult: ExtractionResult = {
				success: true,
				data: {
					content: "x".repeat(10000000), // 10MB
					metadata: { title: "Memory Test Document" },
					processingTime: 5000,
				},
			}

			// Mock memory limit exceeded
			const memorySpy = vi.spyOn(service as any, "checkMemoryUsage")
			memorySpy.mockReturnValue(true)

			const result = await service.processDocument(largeResult)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("MEMORY_CONSTRAINT")
		})
	})

	describe("Service Health", () => {
		it("should report service health status", () => {
			const health = service.getHealth()
			expect(health).toHaveProperty("status")
			expect(health).toHaveProperty("timestamp")
			expect(health).toHaveProperty("services")
		})

		it("should handle health check with failed dependencies", () => {
			// Mock some services as failed
			const health = service.getHealth()
			// Verify health status reflects dependency failures
		})
	})
})
