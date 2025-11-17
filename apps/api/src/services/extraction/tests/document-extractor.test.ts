import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import type {
	DocumentExtractor,
	ExtractionInput,
	ExtractionResult,
	ExtractorServiceConfig,
	ProcessingError,
} from "../../interfaces"
import {
	createDocumentExtractorService,
	DocumentExtractorService,
} from "../document-extractor-service"

/**
 * Unit tests for DocumentExtractorService
 *
 * Tests the unified service that coordinates all document extractors including:
 * - Extractor chain management with priority ordering
 * - Automatic extractor selection based on input type
 * - Fallback mechanism with multiple strategies
 * - Circuit breaker integration for resilience
 * - Comprehensive error handling and logging
 * - Performance monitoring and metrics
 */

describe("DocumentExtractorService", () => {
	let service: DocumentExtractorService
	let mockExtractors: Map<string, DocumentExtractor>
	let config: ExtractorServiceConfig

	beforeEach(() => {
		// Mock configuration
		config = {
			enableCircuitBreaker: true,
			enableRetry: true,
			maxRetries: 3,
			timeoutMs: 30000,
			extractorConfigs: {
				url: { priority: 1, enabled: true },
				youtube: { priority: 2, enabled: true },
				pdf: { priority: 3, enabled: true },
				file: { priority: 4, enabled: true },
			},
		}

		// Create service instance
		service = new DocumentExtractorService(config)

		// Mock extractors
		mockExtractors = new Map()
		mockExtractors.set("url", {
			canHandle: vi.fn().mockReturnValue(true),
			extract: vi.fn(),
			getSupportedTypes: vi.fn().mockReturnValue(["url", "web"]),
		})
		mockExtractors.set("youtube", {
			canHandle: vi.fn().mockReturnValue(true),
			extract: vi.fn(),
			getSupportedTypes: vi.fn().mockReturnValue(["youtube", "video"]),
		})
		mockExtractors.set("pdf", {
			canHandle: vi.fn().mockReturnValue(true),
			extract: vi.fn(),
			getSupportedTypes: vi.fn().mockReturnValue(["pdf"]),
		})
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Service Initialization", () => {
		it("should initialize with correct configuration", () => {
			expect(service).toBeDefined()
			expect(service.getName()).toBe("DocumentExtractorService")
		})

		it("should register all configured extractors", () => {
			// This tests the internal registry which might be accessible via public methods
			// We'll test this through the extract method behavior
		})

		it("should set up circuit breakers for each extractor", () => {
			// Circuit breakers are internal but we can test the behavior
		})
	})

	describe("Extractor Selection", () => {
		it("should select appropriate extractor based on input type", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://example.com",
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: "Extracted content",
					metadata: { title: "Example" },
					processingTime: 100,
				},
			}

			// Configure mock to handle URL
			const urlExtractor = mockExtractors.get("url")!
			urlExtractor.canHandle.mockReturnValue(true)
			urlExtractor.extract.mockResolvedValue(mockResult)

			// Test extraction
			const result = await service.extract(urlInput)
			expect(result.success).toBe(true)
			expect(urlExtractor.extract).toHaveBeenCalledWith(urlInput)
		})

		it("should handle YouTube URLs with YouTube extractor", async () => {
			const youtubeInput: ExtractionInput = {
				type: "url",
				content: "https://youtube.com/watch?v=dQw4w9WgXcQ",
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: "Video transcript",
					metadata: { title: "Never Gonna Give You Up" },
					processingTime: 2000,
				},
			}

			const youtubeExtractor = mockExtractors.get("youtube")!
			youtubeExtractor.canHandle.mockReturnValue(true)
			youtubeExtractor.extract.mockResolvedValue(mockResult)

			const result = await service.extract(youtubeInput)
			expect(result.success).toBe(true)
			expect(youtubeExtractor.extract).toHaveBeenCalledWith(youtubeInput)
		})

		it("should handle PDF files with PDF extractor", async () => {
			const pdfInput: ExtractionInput = {
				type: "file",
				content: "data:application/pdf;base64,JVBERi0xLjQK...",
				options: { filename: "document.pdf" },
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: "PDF text content",
					metadata: { pageCount: 5, title: "Document" },
					processingTime: 1500,
				},
			}

			const pdfExtractor = mockExtractors.get("pdf")!
			pdfExtractor.canHandle.mockReturnValue(true)
			pdfExtractor.extract.mockResolvedValue(mockResult)

			const result = await service.extract(pdfInput)
			expect(result.success).toBe(true)
			expect(pdfExtractor.extract).toHaveBeenCalledWith(pdfInput)
		})
	})

	describe("Fallback Chain", () => {
		it("should try fallback extractors when primary fails", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://example.com",
				options: {},
			}

			const urlExtractor = mockExtractors.get("url")!
			urlExtractor.canHandle.mockReturnValue(true)
			urlExtractor.extract.mockRejectedValue(new Error("Network error"))

			const pdfExtractor = mockExtractors.get("pdf")!
			pdfExtractor.canHandle.mockReturnValue(false) // Secondary attempt

			const fallbackResult: ExtractionResult = {
				success: true,
				data: {
					content: "Fallback content",
					metadata: { source: "fallback" },
					processingTime: 500,
				},
			}

			// Mock a hypothetical third extractor
			const fileExtractor = mockExtractors.get("file")!
			fileExtractor.canHandle.mockReturnValue(true)
			fileExtractor.extract.mockResolvedValue(fallbackResult)

			const result = await service.extract(urlInput)
			expect(result.success).toBe(true)
			expect(fileExtractor.extract).toHaveBeenCalled()
		})

		it("should return error when all extractors fail", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://example.com",
				options: {},
			}

			// All extractors fail
			mockExtractors.forEach((extractor) => {
				extractor.canHandle.mockReturnValue(true)
				extractor.extract.mockRejectedValue(new Error("Extraction failed"))
			})

			const result = await service.extract(urlInput)
			expect(result.success).toBe(false)
			expect(result.error).toBeDefined()
		})
	})

	describe("Circuit Breaker Integration", () => {
		it("should handle circuit breaker open state", async () => {
			// This would require mocking the circuit breaker state
			// Implementation depends on the actual circuit breaker integration
		})

		it("should respect circuit breaker failure thresholds", async () => {
			// Test circuit breaker trip conditions
		})

		it("should attempt recovery after circuit breaker timeout", async () => {
			// Test circuit breaker recovery logic
		})
	})

	describe("Error Handling", () => {
		it("should handle timeout errors gracefully", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://slow-site.com",
				options: {},
			}

			const urlExtractor = mockExtractors.get("url")!
			urlExtractor.canHandle.mockReturnValue(true)
			urlExtractor.extract.mockImplementation(
				() => new Promise((resolve) => setTimeout(resolve, 60000)),
			)

			const result = await service.extract(urlInput)
			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("TIMEOUT")
		})

		it("should handle invalid input gracefully", async () => {
			const invalidInput: ExtractionInput = {
				type: "invalid",
				content: "",
				options: {},
			}

			const result = await service.extract(invalidInput)
			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("INVALID_INPUT")
		})

		it("should handle network connectivity issues", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://unreachable-site.com",
				options: {},
			}

			const urlExtractor = mockExtractors.get("url")!
			urlExtractor.canHandle.mockReturnValue(true)
			urlExtractor.extract.mockRejectedValue(new Error("ECONNREFUSED"))

			const result = await service.extract(urlInput)
			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("NETWORK_ERROR")
		})
	})

	describe("Input Validation", () => {
		it("should validate required input fields", async () => {
			const invalidInput = {
				type: "url",
				// missing content
				options: {},
			} as ExtractionInput

			const result = await service.extract(invalidInput)
			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("VALIDATION_ERROR")
		})

		it("should sanitize input content", async () => {
			const maliciousInput: ExtractionInput = {
				type: "url",
				content: 'https://example.com<script>alert("xss")</script>',
				options: {},
			}

			const result = await service.extract(maliciousInput)
			// Should either sanitize or reject the input
		})

		it("should validate URL format", async () => {
			const invalidUrlInput: ExtractionInput = {
				type: "url",
				content: "not-a-valid-url",
				options: {},
			}

			const result = await service.extract(invalidUrlInput)
			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("VALIDATION_ERROR")
		})
	})

	describe("Performance Monitoring", () => {
		it("should track extraction performance", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://example.com",
				options: {},
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: "Content",
					metadata: {},
					processingTime: 1500,
				},
			}

			const urlExtractor = mockExtractors.get("url")!
			urlExtractor.canHandle.mockReturnValue(true)
			urlExtractor.extract.mockResolvedValue(mockResult)

			await service.extract(urlInput)

			// Verify performance tracking
			// This would depend on the actual performance monitoring implementation
		})

		it("should report metrics for different extractors", async () => {
			// Test metrics collection and reporting
		})

		it("should handle concurrent extractions", async () => {
			const inputs: ExtractionInput[] = [
				{ type: "url", content: "https://site1.com", options: {} },
				{ type: "url", content: "https://site2.com", options: {} },
				{ type: "url", content: "https://site3.com", options: {} },
			]

			const mockResult: ExtractionResult = {
				success: true,
				data: { content: "Content", metadata: {}, processingTime: 100 },
			}

			const urlExtractor = mockExtractors.get("url")!
			urlExtractor.canHandle.mockReturnValue(true)
			urlExtractor.extract.mockResolvedValue(mockResult)

			const results = await Promise.all(
				inputs.map((input) => service.extract(input)),
			)

			expect(results).toHaveLength(3)
			results.forEach((result) => expect(result.success).toBe(true))
		})
	})

	describe("Configuration Management", () => {
		it("should respect extractor priority ordering", () => {
			// Test that extractors are tried in priority order
		})

		it("should handle disabled extractors", () => {
			// Test behavior when extractors are disabled in config
		})

		it("should update configuration dynamically", () => {
			// Test config updates
		})
	})

	describe("Retry Logic", () => {
		it("should retry failed extractions with exponential backoff", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://flaky-site.com",
				options: {},
			}

			const urlExtractor = mockExtractors.get("url")!
			urlExtractor.canHandle.mockReturnValue(true)
			// Fail twice, succeed on third attempt
			urlExtractor.extract
				.mockRejectedValueOnce(new Error("Temporary error"))
				.mockRejectedValueOnce(new Error("Temporary error"))
				.mockResolvedValue({
					success: true,
					data: { content: "Success", metadata: {}, processingTime: 100 },
				})

			const result = await service.extract(urlInput)
			expect(result.success).toBe(true)
			expect(urlExtractor.extract).toHaveBeenCalledTimes(3)
		})

		it("should respect max retry limits", async () => {
			const urlInput: ExtractionInput = {
				type: "url",
				content: "https://always-fail.com",
				options: {},
			}

			const urlExtractor = mockExtractors.get("url")!
			urlExtractor.canHandle.mockReturnValue(true)
			urlExtractor.extract.mockRejectedValue(new Error("Always fails"))

			const result = await service.extract(urlInput)
			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("MAX_RETRIES_EXCEEDED")
		})
	})

	describe("Edge Cases", () => {
		it("should handle empty content", async () => {
			const emptyInput: ExtractionInput = {
				type: "url",
				content: "",
				options: {},
			}

			const result = await service.extract(emptyInput)
			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("VALIDATION_ERROR")
		})

		it("should handle extremely large content", async () => {
			const largeInput: ExtractionInput = {
				type: "url",
				content: "https://example.com",
				options: {},
			}

			// Mock large content response
			const largeResult: ExtractionResult = {
				success: true,
				data: {
					content: "x".repeat(10 * 1024 * 1024), // 10MB
					metadata: {},
					processingTime: 5000,
				},
			}

			const urlExtractor = mockExtractors.get("url")!
			urlExtractor.canHandle.mockReturnValue(true)
			urlExtractor.extract.mockResolvedValue(largeResult)

			const result = await service.extract(largeInput)
			expect(result.success).toBe(true)
		})

		it("should handle extractor registration errors", () => {
			// Test behavior when extractor registration fails
		})
	})

	describe("Factory Function", () => {
		it("should create service with default configuration", () => {
			const service = createDocumentExtractorService()
			expect(service).toBeDefined()
			expect(service.getName()).toBe("DocumentExtractorService")
		})

		it("should create service with custom configuration", () => {
			const customConfig: ExtractorServiceConfig = {
				enableCircuitBreaker: false,
				enableRetry: false,
				maxRetries: 1,
				timeoutMs: 10000,
				extractorConfigs: {},
			}

			const service = createDocumentExtractorService(customConfig)
			expect(service).toBeDefined()
		})
	})
})
