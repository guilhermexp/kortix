import { beforeEach, describe, expect, it } from "bun:test"
import type { ExtractionResult } from "../interfaces"
import {
	createMetadataExtractor,
	MetadataExtractor,
} from "./metadata-extractor"

describe("MetadataExtractor", () => {
	let service: MetadataExtractor

	beforeEach(async () => {
		service = createMetadataExtractor()
		await service.initialize()
	})

	describe("Tag Extraction", () => {
		it("should extract tags from metadata", async () => {
			const content = "Sample content"
			const metadata = {
				tags: ["ai", "machine-learning", "nlp"],
			}

			const tags = await service.extractTags(content, metadata)

			expect(tags).toContain("ai")
			expect(tags).toContain("machine-learning")
			expect(tags).toContain("nlp")
		})

		it("should extract hashtags from content", async () => {
			const content = "This is about #AI and #MachineLearning"

			const tags = await service.extractTags(content)

			expect(tags).toContain("ai")
			expect(tags).toContain("machinelearning")
		})

		it("should extract tags from keywords field", async () => {
			const content = "Sample content"
			const metadata = {
				keywords: ["technology", "science"],
			}

			const tags = await service.extractTags(content, metadata)

			expect(tags).toContain("technology")
			expect(tags).toContain("science")
		})

		it("should handle string tags separated by commas", async () => {
			const content = "Sample content"
			const metadata = {
				tags: "tag1, tag2, tag3",
			}

			const tags = await service.extractTags(content, metadata)

			expect(tags).toContain("tag1")
			expect(tags).toContain("tag2")
			expect(tags).toContain("tag3")
		})

		it("should deduplicate tags", async () => {
			const content = "#test content"
			const metadata = {
				tags: ["test", "sample"],
			}

			const tags = await service.extractTags(content, metadata)

			const testCount = tags.filter((t) => t === "test").length
			expect(testCount).toBe(1)
		})
	})

	describe("Mention Extraction", () => {
		it("should extract @mentions from content", async () => {
			const content = "Hey @john and @mary, check this out!"

			const mentions = await service.extractMentions(content)

			expect(mentions).toContain("john")
			expect(mentions).toContain("mary")
		})

		it("should extract multi-word mentions", async () => {
			const content = "Mentioning @John Smith and @Jane Doe here"

			const mentions = await service.extractMentions(content)

			expect(mentions).toContain("john smith")
			expect(mentions).toContain("jane doe")
		})

		it("should normalize mentions to lowercase", async () => {
			const content = "@ADMIN @Admin @admin"

			const mentions = await service.extractMentions(content)

			const adminMentions = mentions.filter((m) => m === "admin")
			expect(adminMentions.length).toBe(1)
		})

		it("should handle mentions with hyphens and underscores", async () => {
			const content = "@user_name and @user-name-2"

			const mentions = await service.extractMentions(content)

			expect(mentions).toContain("user_name")
			expect(mentions).toContain("user-name-2")
		})

		it("should handle content with no mentions", async () => {
			const content = "This content has no mentions at all"

			const mentions = await service.extractMentions(content)

			expect(mentions).toHaveLength(0)
		})
	})

	describe("Property Extraction", () => {
		it("should extract common properties", async () => {
			const metadata = {
				status: "active",
				priority: "high",
				assignee: "john",
			}

			const properties = await service.extractProperties(metadata)

			expect(properties.status).toBe("active")
			expect(properties.priority).toBe("high")
			expect(properties.assignee).toBe("john")
		})

		it("should extract nested properties", async () => {
			const metadata = {
				properties: {
					customField1: "value1",
					customField2: "value2",
				},
			}

			const properties = await service.extractProperties(metadata)

			expect(properties.customField1).toBe("value1")
			expect(properties.customField2).toBe("value2")
		})

		it("should extract only specified property keys", async () => {
			const metadata = {
				status: "active",
				priority: "high",
				internalField: "should-not-extract",
			}

			const properties = await service.extractProperties(metadata, [
				"status",
				"priority",
			])

			expect(properties.status).toBe("active")
			expect(properties.priority).toBe("high")
			expect(properties.internalField).toBeUndefined()
		})

		it("should skip null and undefined values", async () => {
			const metadata = {
				status: "active",
				priority: null,
				assignee: undefined,
			}

			const properties = await service.extractProperties(metadata)

			expect(properties.status).toBe("active")
			expect(properties.priority).toBeUndefined()
			expect(properties.assignee).toBeUndefined()
		})

		it("should handle different property value types", async () => {
			const metadata = {
				count: 42,
				active: true,
				tags: ["tag1", "tag2"],
			}

			const properties = await service.extractProperties(metadata)

			expect(properties.count).toBe(42)
			expect(properties.active).toBe(true)
			expect(Array.isArray(properties.tags)).toBe(true)
		})
	})

	describe("Comment Extraction", () => {
		it("should extract comments from metadata", async () => {
			const metadata = {
				comments: ["First comment", "Second comment"],
			}

			const comments = await service.extractComments("content", metadata)

			expect(comments).toContain("First comment")
			expect(comments).toContain("Second comment")
		})

		it("should extract from annotations field", async () => {
			const metadata = {
				annotations: ["Annotation 1", "Annotation 2"],
			}

			const comments = await service.extractComments("content", metadata)

			expect(comments).toContain("Annotation 1")
			expect(comments).toContain("Annotation 2")
		})

		it("should extract from notes field", async () => {
			const metadata = {
				notes: "Important note here",
			}

			const comments = await service.extractComments("content", metadata)

			expect(comments).toContain("Important note here")
		})

		it("should handle comment objects with text field", async () => {
			const metadata = {
				comments: [
					{ text: "Comment with text field" },
					{ content: "Comment with content field" },
				],
			}

			const comments = await service.extractComments("content", metadata)

			expect(comments).toContain("Comment with text field")
			expect(comments).toContain("Comment with content field")
		})

		it("should handle missing comment metadata", async () => {
			const comments = await service.extractComments("content")

			expect(comments).toHaveLength(0)
		})
	})

	describe("Full Extraction", () => {
		it("should extract all metadata types", async () => {
			const extraction: ExtractionResult = {
				text: "Document about #AI and @researcher with important info",
				title: "Research Document",
				source: "test",
				url: "https://example.com",
				contentType: "text/plain",
				raw: {
					tags: ["research", "science"],
					status: "published",
					priority: "high",
					comments: ["Needs review"],
				},
				wordCount: 10,
			}

			const result = await service.extract(extraction)

			expect(result.tags.length).toBeGreaterThan(0)
			expect(result.mentions).toContain("researcher")
			expect(result.properties.status).toBe("published")
			expect(result.properties.priority).toBe("high")
			expect(result.comments).toContain("Needs review")
			expect(result.statistics.tagCount).toBeGreaterThan(0)
			expect(result.statistics.mentionCount).toBe(1)
			expect(result.statistics.propertyCount).toBeGreaterThan(0)
			expect(result.statistics.commentCount).toBe(1)
		})

		it("should include source when requested", async () => {
			const extraction: ExtractionResult = {
				text: "Sample content",
				title: "Test",
				source: "test",
				url: "https://example.com",
				contentType: "text/plain",
				raw: null,
				wordCount: 2,
			}

			const result = await service.extract(extraction, {
				includeSource: true,
			})

			expect(result.source).toBeDefined()
			expect(result.source?.url).toBe("https://example.com")
			expect(result.source?.title).toBe("Test")
			expect(result.source?.type).toBe("text/plain")
		})

		it("should respect extraction options", async () => {
			const extraction: ExtractionResult = {
				text: "Content with @mention and #tag",
				title: "Test",
				source: "test",
				url: null,
				contentType: null,
				raw: { status: "active" },
				wordCount: 5,
			}

			const result = await service.extract(extraction, {
				extractTags: false,
				extractMentions: true,
				extractProperties: false,
				extractComments: false,
			})

			expect(result.tags).toHaveLength(0)
			expect(result.mentions.length).toBeGreaterThan(0)
			expect(Object.keys(result.properties)).toHaveLength(0)
			expect(result.comments).toHaveLength(0)
		})
	})

	describe("extractFromContent", () => {
		it("should extract metadata from raw content", async () => {
			const content = "Content about #testing with @user"
			const metadata = {
				tags: ["sample"],
				status: "draft",
			}

			const result = await service.extractFromContent(content, metadata)

			expect(result.tags).toContain("testing")
			expect(result.tags).toContain("sample")
			expect(result.mentions).toContain("user")
			expect(result.properties.status).toBe("draft")
		})
	})

	describe("Validation", () => {
		it("should throw error for empty content", async () => {
			const extraction: ExtractionResult = {
				text: "",
				title: null,
				source: "test",
				url: null,
				contentType: null,
				raw: null,
				wordCount: 0,
			}

			await expect(service.extract(extraction)).rejects.toThrow()
		})

		it("should validate extraction options", () => {
			expect(() => {
				service.validateOptions({
					extractTags: false,
					extractMentions: false,
					extractProperties: false,
					extractComments: false,
				})
			}).toThrow("At least one extraction type must be enabled")
		})

		it("should validate property keys", () => {
			expect(() => {
				service.validateOptions({
					extractProperties: true,
					propertyKeys: ["valid", ""],
				})
			}).toThrow()
		})
	})

	describe("Health Check", () => {
		it("should pass health check", async () => {
			const health = await service.healthCheck()
			expect(health).toBe(true)
		})
	})
})
