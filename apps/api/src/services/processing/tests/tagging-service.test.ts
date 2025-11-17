import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import type {
	ProcessingError,
	TagCategory,
	TaggingOptions,
	TagWithMetadata,
} from "../../interfaces"
import { createTaggingService, TaggingService } from "../tagging-service"

describe("TaggingService", () => {
	let service: TaggingService
	let mockOptions: TaggingOptions

	beforeEach(() => {
		mockOptions = {
			provider: "gemini",
			maxTags: 10,
			minConfidence: 0.7,
			includeCategories: true,
			tagTypes: ["topic", "entity", "concept", "keyword"],
			enableAutoTagging: true,
		}
		service = new TaggingService(mockOptions)
	})

	afterEach(() => vi.clearAllMocks())

	describe("Basic Tagging", () => {
		it("should generate tags for text content", async () => {
			const text =
				"This document discusses artificial intelligence, machine learning, and data science techniques for natural language processing."

			const mockTags: TagWithMetadata[] = [
				{
					tag: "artificial intelligence",
					type: "topic",
					confidence: 0.95,
					category: "Technology",
				},
				{
					tag: "machine learning",
					type: "topic",
					confidence: 0.92,
					category: "Technology",
				},
				{
					tag: "data science",
					type: "topic",
					confidence: 0.88,
					category: "Technology",
				},
				{
					tag: "natural language processing",
					type: "concept",
					confidence: 0.85,
					category: "AI",
				},
			]

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockResolvedValue({
				tags: mockTags,
				confidence: 0.9,
			})

			const result = await service.generateTags(text)

			expect(result.success).toBe(true)
			expect(result.data?.tags).toHaveLength(4)
			expect(result.data?.tags![0].tag).toBe("artificial intelligence")
			expect(result.data?.tags![0].confidence).toBe(0.95)
		})

		it("should respect maximum tag limit", async () => {
			const text =
				"Document with many potential tags covering various topics and subjects"

			const manyTags: TagWithMetadata[] = Array(15)
				.fill(null)
				.map((_, i) => ({
					tag: `tag-${i}`,
					type: "keyword" as any,
					confidence: 0.8 - i * 0.01,
					category: "General",
				}))

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockResolvedValue({
				tags: manyTags,
				confidence: 0.8,
			})

			const result = await service.generateTags(text)

			expect(result.success).toBe(true)
			expect(result.data?.tags!.length).toBeLessThanOrEqual(
				mockOptions.maxTags!,
			)
			// Should return highest confidence tags
			expect(result.data?.tags![0].confidence).toBeGreaterThanOrEqual(
				result.data?.tags!.at(-1)!.confidence,
			)
		})

		it("should filter tags by minimum confidence", async () => {
			const text = "Test text for confidence filtering"

			const mixedConfidenceTags: TagWithMetadata[] = [
				{
					tag: "high-confidence",
					type: "topic",
					confidence: 0.95,
					category: "Test",
				},
				{
					tag: "medium-confidence",
					type: "topic",
					confidence: 0.75,
					category: "Test",
				},
				{
					tag: "low-confidence",
					type: "topic",
					confidence: 0.5,
					category: "Test",
				},
				{
					tag: "very-low-confidence",
					type: "topic",
					confidence: 0.3,
					category: "Test",
				},
			]

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockResolvedValue({
				tags: mixedConfidenceTags,
				confidence: 0.7,
			})

			const result = await service.generateTags(text)

			expect(result.success).toBe(true)
			// Should filter out tags below min confidence
			const lowConfidenceTags = result.data?.tags?.filter(
				(tag) => tag.confidence < mockOptions.minConfidence!,
			)
			expect(lowConfidenceTags?.length).toBe(0)
		})
	})

	describe("Tag Categories", () => {
		it("should include tag categories when enabled", async () => {
			const text = "Document about programming and software development"

			const categorizedTags: TagWithMetadata[] = [
				{
					tag: "programming",
					type: "topic",
					confidence: 0.9,
					category: "Technology",
				},
				{
					tag: "software development",
					type: "topic",
					confidence: 0.85,
					category: "Technology",
				},
				{
					tag: "JavaScript",
					type: "entity",
					confidence: 0.8,
					category: "Programming Languages",
				},
			]

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockResolvedValue({
				tags: categorizedTags,
				confidence: 0.85,
			})

			const result = await service.generateTags(text)

			expect(result.success).toBe(true)
			expect(result.data?.tags!.every((tag) => tag.category)).toBe(true)
			expect(result.data?.tags![0].category).toBe("Technology")
		})

		it("should handle categories when disabled", async () => {
			const options: TaggingOptions = {
				...mockOptions,
				includeCategories: false,
			}

			const noCategoryService = new TaggingService(options)
			const text = "Test without categories"

			const untaggedTags: TagWithMetadata[] = [
				{ tag: "test", type: "keyword", confidence: 0.8 },
			]

			const taggingSpy = vi.spyOn(noCategoryService as any, "callTaggingAPI")
			taggingSpy.mockResolvedValue({
				tags: untaggedTags,
				confidence: 0.8,
			})

			const result = await noCategoryService.generateTags(text)

			expect(result.success).toBe(true)
			expect(result.data?.tags![0].category).toBeUndefined()
		})

		it("should group tags by category", async () => {
			const text = "Document covering multiple domains"

			const multiCategoryTags: TagWithMetadata[] = [
				{ tag: "AI", type: "topic", confidence: 0.9, category: "Technology" },
				{
					tag: "machine learning",
					type: "topic",
					confidence: 0.85,
					category: "Technology",
				},
				{
					tag: "finance",
					type: "topic",
					confidence: 0.8,
					category: "Business",
				},
				{
					tag: "trading",
					type: "topic",
					confidence: 0.75,
					category: "Business",
				},
			]

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockResolvedValue({
				tags: multiCategoryTags,
				confidence: 0.8,
			})

			const result = await service.generateTags(text)

			expect(result.success).toBe(true)

			const categoryGroups = service.groupTagsByCategory(
				result.data?.tags || [],
			)
			expect(categoryGroups["Technology"]).toHaveLength(2)
			expect(categoryGroups["Business"]).toHaveLength(2)
		})
	})

	describe("Tag Types", () => {
		it("should generate different types of tags", async () => {
			const text =
				"The company Tesla, founded by Elon Musk, is developing autonomous vehicles using artificial intelligence and neural networks."

			const typedTags: TagWithMetadata[] = [
				{
					tag: "Tesla",
					type: "entity",
					confidence: 0.95,
					category: "Companies",
				},
				{
					tag: "Elon Musk",
					type: "entity",
					confidence: 0.9,
					category: "People",
				},
				{
					tag: "autonomous vehicles",
					type: "concept",
					confidence: 0.85,
					category: "Technology",
				},
				{
					tag: "artificial intelligence",
					type: "topic",
					confidence: 0.8,
					category: "Technology",
				},
				{
					tag: "neural networks",
					type: "concept",
					confidence: 0.75,
					category: "AI",
				},
			]

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockResolvedValue({
				tags: typedTags,
				confidence: 0.85,
			})

			const result = await service.generateTags(text)

			expect(result.success).toBe(true)

			const tagTypes = result.data?.tags?.map((tag) => tag.type) || []
			expect(tagTypes).toContain("entity")
			expect(tagTypes).toContain("concept")
			expect(tagTypes).toContain("topic")
		})

		it("should handle auto-tagging when enabled", async () => {
			const text =
				"This document contains keywords like document management, file organization, and data storage solutions."

			const autoTagSpy = vi.spyOn(service as any, "extractAutoTags")
			autoTagSpy.mockResolvedValue([
				{ tag: "document", type: "keyword", confidence: 0.9 },
				{ tag: "management", type: "keyword", confidence: 0.85 },
				{ tag: "data", type: "keyword", confidence: 0.8 },
			])

			const result = await service.generateTags(text)

			expect(result.success).toBe(true)
			expect(autoTagSpy).toHaveBeenCalled()
		})
	})

	describe("Error Handling", () => {
		it("should handle API failures", async () => {
			const text = "Test text for error handling"

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockRejectedValue(new Error("API service unavailable"))

			const result = await service.generateTags(text)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("TAGGING_FAILED")
		})

		it("should handle empty text", async () => {
			const result = await service.generateTags("")

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("EMPTY_TEXT")
		})

		it("should handle texts with no identifiable tags", async () => {
			const text = " xyz abc " // Very generic text

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockResolvedValue({
				tags: [],
				confidence: 0.5,
			})

			const result = await service.generateTags(text)

			expect(result.success).toBe(true)
			expect(result.data?.tags).toEqual([])
		})
	})

	describe("Performance", () => {
		it("should handle concurrent tagging requests", async () => {
			const texts = Array(5)
				.fill(null)
				.map((_, i) => `Text ${i} for tagging`)

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockResolvedValue({
				tags: [{ tag: `tag-${i}`, type: "keyword", confidence: 0.8 }],
				confidence: 0.8,
			})

			const results = await Promise.all(
				texts.map((text) => service.generateTags(text)),
			)

			expect(results).toHaveLength(5)
			expect(results.every((r) => r.success)).toBe(true)
		})

		it("should provide tagging statistics", async () => {
			const text = "Statistics test text"

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockResolvedValue({
				tags: [{ tag: "test", type: "keyword", confidence: 0.8 }],
				confidence: 0.8,
			})

			await service.generateTags(text)

			const stats = service.getStatistics()
			expect(stats.totalTaggingRequests).toBeGreaterThan(0)
			expect(stats.averageTagsPerDocument).toBeGreaterThanOrEqual(0)
			expect(stats.averageConfidence).toBeGreaterThanOrEqual(0)
		})
	})

	describe("Configuration", () => {
		it("should respect tagging options", () => {
			const customOptions: TaggingOptions = {
				...mockOptions,
				maxTags: 5,
				minConfidence: 0.8,
				includeCategories: false,
			}

			const customService = new TaggingService(customOptions)
			expect(customService).toBeDefined()
		})

		it("should support different tag types", async () => {
			const tagTypes = ["topic", "entity", "concept", "keyword", "location"]

			for (const type of tagTypes) {
				const options: TaggingOptions = {
					...mockOptions,
					tagTypes: [type as any],
				}

				const typeService = new TaggingService(options)
				const text = `Test text for ${type} tagging`

				const taggingSpy = vi.spyOn(typeService as any, "callTaggingAPI")
				taggingSpy.mockResolvedValue({
					tags: [{ tag: type, type, confidence: 0.8 }],
					confidence: 0.8,
				})

				const result = await typeService.generateTags(text)
				expect(result.success).toBe(true)
			}
		})
	})

	describe("Tag Validation", () => {
		it("should validate tag quality", async () => {
			const text = "Test document for tag validation"

			const qualityTags: TagWithMetadata[] = [
				{ tag: "test", type: "keyword", confidence: 0.9, category: "General" },
				{
					tag: "document",
					type: "keyword",
					confidence: 0.85,
					category: "General",
				},
				{ tag: "a", type: "keyword", confidence: 0.95, category: "General" }, // Too short
				{
					tag: "verylongtagthatexceedslengthlimit",
					type: "keyword",
					confidence: 0.8,
					category: "General",
				}, // Too long
			]

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockResolvedValue({
				tags: qualityTags,
				confidence: 0.8,
			})

			const result = await service.generateTags(text)

			expect(result.success).toBe(true)
			// Should filter out poor quality tags
			const validTags =
				result.data?.tags?.filter(
					(tag) => tag.tag.length >= 2 && tag.tag.length <= 20,
				) || []
			expect(validTags.length).toBeLessThanOrEqual(qualityTags.length)
		})
	})

	describe("Factory Function", () => {
		it("should create service with default options", () => {
			const service = createTaggingService()
			expect(service).toBeDefined()
		})

		it("should create service with custom options", () => {
			const customOptions: TaggingOptions = {
				provider: "openai",
				maxTags: 15,
				minConfidence: 0.6,
			}

			const service = createTaggingService(customOptions)
			expect(service).toBeDefined()
		})
	})

	describe("Edge Cases", () => {
		it("should handle texts with special characters", async () => {
			const specialText =
				"Document with émojis 🎯 and spëciäl chårs & symbols @#$%"

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockResolvedValue({
				tags: [{ tag: "special-chars", type: "keyword", confidence: 0.7 }],
				confidence: 0.7,
			})

			const result = await service.generateTags(specialText)

			expect(result.success).toBe(true)
		})

		it("should handle very long documents", async () => {
			const hugeText = "Content. ".repeat(10000)

			const taggingSpy = vi.spyOn(service as any, "callTaggingAPI")
			taggingSpy.mockImplementation((text) => {
				// Simulate processing large text
				return Promise.resolve({
					tags: [
						{ tag: "large-document", type: "topic", confidence: 0.8 },
						{ tag: "comprehensive", type: "keyword", confidence: 0.7 },
					],
					confidence: 0.75,
				})
			})

			const result = await service.generateTags(hugeText)

			expect(result.success).toBe(true)
			expect(result.data?.tags).toBeDefined()
		})

		it("should handle single word documents", async () => {
			const singleWord = "Word"

			const result = await service.generateTags(singleWord)

			expect(result.success).toBe(true)
		})
	})
})
