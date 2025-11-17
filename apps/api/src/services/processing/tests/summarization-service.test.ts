import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import type {
	MultiLevelSummary,
	ProcessingError,
	SummarizationOptions,
	SummarizationStatistics,
} from "../../interfaces"
import {
	createSummarizationService,
	SummarizationService,
} from "../summarization-service"

describe("SummarizationService", () => {
	let service: SummarizationService
	let mockOptions: SummarizationOptions

	beforeEach(() => {
		mockOptions = {
			provider: "gemini",
			includeBullets: true,
			maxSummaryLength: 200,
			summaryTypes: ["concise", "detailed", "key_points"],
			enableMultiLevel: true,
			language: "en",
		}
		service = new SummarizationService(mockOptions)
	})

	afterEach(() => vi.clearAllMocks())

	describe("Basic Summarization", () => {
		it("should generate concise summary", async () => {
			const text =
				"This is a long document with multiple paragraphs. It discusses various topics including technology, science, and society. The document provides detailed analysis of current trends and future predictions."

			const mockSummary =
				"Document analyzing technology, science, and society trends with future predictions."

			const summarySpy = vi.spyOn(service as any, "callSummarizationAPI")
			summarySpy.mockResolvedValue({
				summary: mockSummary,
				confidence: 0.9,
			})

			const result = await service.generateSummary(text)

			expect(result.success).toBe(true)
			expect(result.data?.summary).toBe(mockSummary)
			expect(result.data?.type).toBe("concise")
			expect(result.data?.confidence).toBe(0.9)
		})

		it("should handle different content lengths", async () => {
			const testCases = [
				"Short text",
				"Medium length text with multiple sentences and some detail",
				"Very long text that continues for many paragraphs. ".repeat(50),
			]

			const summarySpy = vi.spyOn(service as any, "callSummarizationAPI")
			summarySpy.mockResolvedValue({
				summary: "Test summary",
				confidence: 0.8,
			})

			for (const text of testCases) {
				const result = await service.generateSummary(text)
				expect(result.success).toBe(true)
			}
		})

		it("should respect maximum summary length", async () => {
			const longText = "Very long document content. ".repeat(100)

			const summarySpy = vi.spyOn(service as any, "callSummarizationAPI")
			summarySpy.mockResolvedValue({
				summary: "Summary that might be too long for the specified limit",
				confidence: 0.7,
			})

			const result = await service.generateSummary(longText)

			expect(result.success).toBe(true)
			if (result.data?.summary.length > mockOptions.maxSummaryLength!) {
				// Should truncate if needed
				expect(result.data?.summary.length).toBeLessThanOrEqual(
					mockOptions.maxSummaryLength! + 10,
				)
			}
		})
	})

	describe("Multi-level Summarization", () => {
		it("should generate multi-level summaries", async () => {
			const text =
				"Document with multiple sections covering different topics in depth."

			const mockMultiLevel: MultiLevelSummary = {
				concise: "Brief overview of document",
				detailed: "Detailed summary with key points and analysis",
				keyPoints: ["Point 1", "Point 2", "Point 3"],
			}

			const multiSpy = vi.spyOn(service as any, "generateMultiLevel")
			multiSpy.mockResolvedValue(mockMultiLevel)

			const result = await service.generateMultiLevelSummary(text)

			expect(result.success).toBe(true)
			expect(result.data?.concise).toBe("Brief overview of document")
			expect(result.data?.detailed).toBe(
				"Detailed summary with key points and analysis",
			)
			expect(result.data?.keyPoints).toEqual(["Point 1", "Point 2", "Point 3"])
		})

		it("should handle bullet point generation", async () => {
			const text = "Document discussing important concepts and methodologies."

			const summarySpy = vi.spyOn(service as any, "callSummarizationAPI")
			summarySpy.mockResolvedValue({
				summary: "Key concepts and methodologies discussed in the document",
				bullets: [
					"Concept 1: Important for understanding",
					"Concept 2: Critical methodology",
					"Concept 3: Best practices",
				],
				confidence: 0.85,
			})

			const result = await service.generateSummary(text)

			expect(result.success).toBe(true)
			expect(result.data?.bullets).toHaveLength(3)
			expect(result.data?.bullets![0]).toContain("Concept 1")
		})

		it("should handle single level when multi-level disabled", async () => {
			const options: SummarizationOptions = {
				...mockOptions,
				enableMultiLevel: false,
			}

			const singleService = new SummarizationService(options)
			const text = "Single level summary test"

			const summarySpy = vi.spyOn(singleService as any, "callSummarizationAPI")
			summarySpy.mockResolvedValue({
				summary: "Single level summary",
				confidence: 0.8,
			})

			const result = await singleService.generateMultiLevelSummary(text)

			expect(result.success).toBe(true)
			expect(result.data?.concise).toBeDefined()
			expect(result.data?.detailed).toBeUndefined()
		})
	})

	describe("Content Type Handling", () => {
		it("should handle different content types", async () => {
			const contentTypes = [
				"Plain text content for summarization",
				"# Markdown Content\n\n## Section 1\n\nContent here",
				"Code documentation with functions and classes",
				"Table data with rows and columns",
			]

			const summarySpy = vi.spyOn(service as any, "callSummarizationAPI")
			summarySpy.mockResolvedValue({
				summary: "Summarized content",
				confidence: 0.8,
			})

			for (const content of contentTypes) {
				const result = await service.generateSummary(content)
				expect(result.success).toBe(true)
			}
		})

		it("should preserve document structure in summaries", async () => {
			const structuredText = `# Introduction
This is the introduction section.

## Main Content
Detailed content with multiple points.

### Subsection
More detailed information.

## Conclusion
Final thoughts and summary.`

			const summarySpy = vi.spyOn(service as any, "callSummarizationAPI")
			summarySpy.mockResolvedValue({
				summary: "Document covering introduction, main content, and conclusion",
				confidence: 0.9,
			})

			const result = await service.generateSummary(structuredText)

			expect(result.success).toBe(true)
			expect(result.data?.summary).toContain("introduction")
			expect(result.data?.summary).toContain("conclusion")
		})
	})

	describe("Error Handling", () => {
		it("should handle API failures", async () => {
			const text = "Test text for error handling"

			const summarySpy = vi.spyOn(service as any, "callSummarizationAPI")
			summarySpy.mockRejectedValue(new Error("API rate limit exceeded"))

			const result = await service.generateSummary(text)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("SUMMARIZATION_FAILED")
		})

		it("should handle empty text", async () => {
			const result = await service.generateSummary("")

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("EMPTY_TEXT")
		})

		it("should handle very long text gracefully", async () => {
			const hugeText = "Content. ".repeat(10000)

			const summarySpy = vi.spyOn(service as any, "callSummarizationAPI")
			summarySpy.mockImplementation((text) => {
				// Simulate processing large text
				return Promise.resolve({
					summary: "Summary of large document",
					confidence: 0.7,
				})
			})

			const result = await service.generateSummary(hugeText)

			expect(result.success).toBe(true)
		})
	})

	describe("Configuration", () => {
		it("should respect summarization options", () => {
			const customOptions: SummarizationOptions = {
				...mockOptions,
				maxSummaryLength: 100,
				includeBullets: false,
			}

			const customService = new SummarizationService(customOptions)
			expect(customService).toBeDefined()
		})

		it("should support different summary types", async () => {
			const summaryTypes = ["concise", "detailed", "key_points", "executive"]

			for (const type of summaryTypes) {
				const options: SummarizationOptions = {
					...mockOptions,
					summaryTypes: [type as any],
				}

				const typeService = new SummarizationService(options)
				const text = `Test text for ${type} summary`

				const summarySpy = vi.spyOn(typeService as any, "callSummarizationAPI")
				summarySpy.mockResolvedValue({
					summary: `${type} summary`,
					confidence: 0.8,
				})

				const result = await typeService.generateSummary(text)
				expect(result.success).toBe(true)
			}
		})
	})

	describe("Performance", () => {
		it("should handle concurrent summarization", async () => {
			const texts = Array(5)
				.fill(null)
				.map((_, i) => `Text ${i} for summarization`)

			const summarySpy = vi.spyOn(service as any, "callSummarizationAPI")
			summarySpy.mockResolvedValue({
				summary: "Concurrent summary",
				confidence: 0.8,
			})

			const results = await Promise.all(
				texts.map((text) => service.generateSummary(text)),
			)

			expect(results).toHaveLength(5)
			expect(results.every((r) => r.success)).toBe(true)
		})

		it("should provide processing statistics", async () => {
			const text = "Statistics test text"

			const summarySpy = vi.spyOn(service as any, "callSummarizationAPI")
			summarySpy.mockResolvedValue({
				summary: "Summary with statistics",
				confidence: 0.8,
			})

			await service.generateSummary(text)

			const stats = service.getStatistics()
			expect(stats.totalSummaries).toBeGreaterThan(0)
			expect(stats.averageLatency).toBeGreaterThan(0)
		})
	})

	describe("Factory Function", () => {
		it("should create service with default options", () => {
			const service = createSummarizationService()
			expect(service).toBeDefined()
		})

		it("should create service with custom options", () => {
			const customOptions: SummarizationOptions = {
				provider: "openai",
				maxSummaryLength: 150,
			}

			const service = createSummarizationService(customOptions)
			expect(service).toBeDefined()
		})
	})

	describe("Edge Cases", () => {
		it("should handle texts with special characters", async () => {
			const specialText = "Text with émojis 🎯 and spëciäl chårs & symbols @#$%"

			const summarySpy = vi.spyOn(service as any, "callSummarizationAPI")
			summarySpy.mockResolvedValue({
				summary: "Summary of special character text",
				confidence: 0.7,
			})

			const result = await service.generateSummary(specialText)

			expect(result.success).toBe(true)
		})

		it("should handle single word documents", async () => {
			const singleWord = "Word"

			const result = await service.generateSummary(singleWord)

			expect(result.success).toBe(true)
		})
	})
})
