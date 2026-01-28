import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import type { ExtractionResult } from "../../interfaces/document-processing"
import {
	createMetadataExtractor,
	MetadataExtractor,
	type ExtractedMetadata,
	type MetadataExtractionOptions,
} from "../metadata-extractor"

describe("MetadataExtractor", () => {
	let service: MetadataExtractor

	beforeEach(async () => {
		service = createMetadataExtractor()
		await service.initialize()
	})

	afterEach(async () => {
		await service.cleanup()
		vi.clearAllMocks()
	})

	describe("Basic Extraction", () => {
		it("should extract all metadata types from extraction result", async () => {
			const extraction: ExtractionResult = {
				text: "This is a document about @john-doe, @jane discussing #typescript and #nodejs development",
				title: "Development Discussion",
				source: "test-source",
				url: "https://example.com/doc",
				contentType: "text/markdown",
				raw: {
					tags: ["programming", "software"],
					status: "active",
					priority: "high",
				},
				wordCount: 15,
			}

			const options: MetadataExtractionOptions = {
				extractTags: true,
				extractMentions: true,
				extractProperties: true,
				extractComments: true,
				includeSource: true,
				propertyKeys: ["status", "priority"],
			}

			const result = await service.extract(extraction, options)

			expect(result.tags.length).toBeGreaterThan(0)
			expect(result.mentions.length).toBeGreaterThan(0)
			expect(Object.keys(result.properties).length).toBeGreaterThan(0)
			expect(result.source).toBeDefined()
			expect(result.source?.type).toBe("text/markdown")
			expect(result.source?.url).toBe("https://example.com/doc")
			expect(result.source?.title).toBe("Development Discussion")
			expect(result.statistics.tagCount).toBe(result.tags.length)
			expect(result.statistics.mentionCount).toBe(result.mentions.length)
			expect(result.statistics.propertyCount).toBe(
				Object.keys(result.properties).length,
			)
		})

		it("should extract from raw content", async () => {
			const content =
				"Sample content with @user, @another. Testing #hashtag extraction"
			const metadata = {
				tags: ["test", "sample"],
				status: "draft",
			}

			const options: MetadataExtractionOptions = {
				extractTags: true,
				extractMentions: true,
				extractProperties: true,
				extractComments: true,
				propertyKeys: ["status"],
			}

			const result = await service.extractFromContent(content, metadata, options)

			expect(result.tags).toContain("hashtag")
			expect(result.tags).toContain("test")
			expect(result.tags).toContain("sample")
			expect(result.mentions).toContain("user")
			expect(result.mentions).toContain("another")
			expect(result.properties.status).toBe("draft")
		})

		it("should handle empty content", async () => {
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

		it("should handle whitespace-only content", async () => {
			const extraction: ExtractionResult = {
				text: "   \n  \t  ",
				title: null,
				source: "test",
				url: null,
				contentType: null,
				raw: null,
				wordCount: 0,
			}

			await expect(service.extract(extraction)).rejects.toThrow()
		})
	})

	describe("Tag Extraction", () => {
		it("should extract tags from metadata tags field", async () => {
			const metadata = {
				tags: ["javascript", "programming", "web-development"],
			}

			const tags = await service.extractTags("Sample content", metadata)

			expect(tags).toContain("javascript")
			expect(tags).toContain("programming")
			expect(tags).toContain("web-development")
		})

		it("should extract tags from metadata keywords field", async () => {
			const metadata = {
				keywords: ["api", "rest", "backend"],
			}

			const tags = await service.extractTags("Sample content", metadata)

			expect(tags).toContain("api")
			expect(tags).toContain("rest")
			expect(tags).toContain("backend")
		})

		it("should extract tags from metadata categories field", async () => {
			const metadata = {
				categories: ["technology", "software", "engineering"],
			}

			const tags = await service.extractTags("Sample content", metadata)

			expect(tags).toContain("technology")
			expect(tags).toContain("software")
			expect(tags).toContain("engineering")
		})

		it("should extract hashtags from content", async () => {
			const content =
				"Discussion about #javascript #typescript #nodejs and #react frameworks"

			const tags = await service.extractTags(content)

			expect(tags).toContain("javascript")
			expect(tags).toContain("typescript")
			expect(tags).toContain("nodejs")
			expect(tags).toContain("react")
		})

		it("should handle string format tags with comma separator", async () => {
			const metadata = {
				tags: "frontend, backend, database",
			}

			const tags = await service.extractTags("Sample content", metadata)

			expect(tags).toContain("frontend")
			expect(tags).toContain("backend")
			expect(tags).toContain("database")
		})

		it("should handle string format tags with semicolon separator", async () => {
			const metadata = {
				tags: "design; development; testing",
			}

			const tags = await service.extractTags("Sample content", metadata)

			expect(tags).toContain("design")
			expect(tags).toContain("development")
			expect(tags).toContain("testing")
		})

		it("should filter out hashtags that are too short", async () => {
			const content = "Tags: #a #ab #abc #technology"

			const tags = await service.extractTags(content)

			expect(tags).not.toContain("a")
			expect(tags).toContain("ab")
			expect(tags).toContain("abc")
			expect(tags).toContain("technology")
		})

		it("should filter out hashtags that are too long", async () => {
			const longTag = "a".repeat(60)
			const content = `Tags: #${longTag} #validtag`

			const tags = await service.extractTags(content)

			expect(tags).not.toContain(longTag)
			expect(tags).toContain("validtag")
		})

		it("should normalize tags to lowercase", async () => {
			const content = "#JavaScript #TypeScript #NodeJS"

			const tags = await service.extractTags(content)

			expect(tags).toContain("javascript")
			expect(tags).toContain("typescript")
			expect(tags).toContain("nodejs")
		})

		it("should deduplicate tags", async () => {
			const content = "#javascript #JavaScript #JAVASCRIPT"
			const metadata = {
				tags: ["javascript", "JAVASCRIPT"],
			}

			const tags = await service.extractTags(content, metadata)

			const javascriptCount = tags.filter((t) => t === "javascript").length
			expect(javascriptCount).toBe(1)
		})

		it("should return sorted tags", async () => {
			const metadata = {
				tags: ["zebra", "apple", "banana", "mango"],
			}

			const tags = await service.extractTags("Sample content", metadata)

			expect(tags).toEqual([...tags].sort())
		})
	})

	describe("Mention Extraction", () => {
		it("should extract @mentions from content", async () => {
			const content = "Meeting with @john-doe, @jane-smith. About the project"

			const mentions = await service.extractMentions(content)

			expect(mentions).toContain("john-doe")
			expect(mentions).toContain("jane-smith")
		})

		it("should extract mentions with spaces", async () => {
			const content = "Thanks @John Doe, @Jane Smith. For your help"

			const mentions = await service.extractMentions(content)

			expect(mentions).toContain("john doe")
			expect(mentions).toContain("jane smith")
		})

		it("should normalize mentions to lowercase", async () => {
			const content = "@JOHN @John @john @JoHn"

			const mentions = await service.extractMentions(content)

			const johnCount = mentions.filter((m) => m === "john").length
			expect(johnCount).toBe(1)
		})

		it("should filter out mentions that are too long", async () => {
			const longMention = "a".repeat(60)
			const content = `@${longMention}, @validuser`

			const mentions = await service.extractMentions(content)

			expect(mentions).not.toContain(longMention.toLowerCase())
			expect(mentions).toContain("validuser")
		})

		it("should filter out empty mentions", async () => {
			const content = "@ @user, @another-user"

			const mentions = await service.extractMentions(content)

			expect(mentions).not.toContain("")
			expect(mentions).toContain("user")
			expect(mentions).toContain("another-user")
		})

		it("should handle mentions with underscores and hyphens", async () => {
			const content = "@john_doe, @jane-smith, @user_name-123"

			const mentions = await service.extractMentions(content)

			expect(mentions).toContain("john_doe")
			expect(mentions).toContain("jane-smith")
			expect(mentions).toContain("user_name-123")
		})

		it("should normalize extra spaces in mentions", async () => {
			const content = "@john    doe, @jane  smith"

			const mentions = await service.extractMentions(content)

			expect(mentions).toContain("john doe")
			expect(mentions).toContain("jane smith")
		})

		it("should return sorted mentions", async () => {
			const content = "@zebra, @apple, @banana, @mango"

			const mentions = await service.extractMentions(content)

			expect(mentions).toEqual([...mentions].sort())
		})
	})

	describe("Property Extraction", () => {
		it("should extract default properties from metadata", async () => {
			const metadata = {
				status: "active",
				priority: "high",
				assignee: "john-doe",
				project: "kortix",
				type: "task",
			}

			const properties = await service.extractProperties(metadata)

			expect(properties.status).toBe("active")
			expect(properties.priority).toBe("high")
			expect(properties.assignee).toBe("john-doe")
			expect(properties.project).toBe("kortix")
			expect(properties.type).toBe("task")
		})

		it("should extract custom property keys", async () => {
			const metadata = {
				customField1: "value1",
				customField2: "value2",
				irrelevantField: "ignored",
			}

			const properties = await service.extractProperties(metadata, [
				"customField1",
				"customField2",
			])

			expect(properties.customField1).toBe("value1")
			expect(properties.customField2).toBe("value2")
			expect(properties.irrelevantField).toBeUndefined()
		})

		it("should extract nested properties", async () => {
			const metadata = {
				properties: {
					nestedField1: "value1",
					nestedField2: "value2",
				},
			}

			const properties = await service.extractProperties(metadata)

			expect(properties.nestedField1).toBe("value1")
			expect(properties.nestedField2).toBe("value2")
		})

		it("should skip null and undefined values", async () => {
			const metadata = {
				status: "active",
				priority: null,
				assignee: undefined,
				project: "kortix",
			}

			const properties = await service.extractProperties(metadata)

			expect(properties.status).toBe("active")
			expect(properties.priority).toBeUndefined()
			expect(properties.assignee).toBeUndefined()
			expect(properties.project).toBe("kortix")
		})

		it("should handle string values", async () => {
			const metadata = {
				status: "  active  ",
				priority: "",
			}

			const properties = await service.extractProperties(metadata)

			expect(properties.status).toBe("active")
			expect(properties.priority).toBeUndefined()
		})

		it("should handle number values", async () => {
			const metadata = {
				version: 42,
				priority: 1,
			}

			const properties = await service.extractProperties(metadata)

			expect(properties.version).toBe(42)
			expect(properties.priority).toBe(1)
		})

		it("should handle boolean values", async () => {
			const metadata = {
				archived: true,
				published: false,
			}

			const properties = await service.extractProperties(metadata, [
				"archived",
				"published",
			])

			expect(properties.archived).toBe(true)
			expect(properties.published).toBe(false)
		})

		it("should handle date values", async () => {
			const date = new Date("2024-01-15T12:00:00Z")
			const metadata = {
				created: date,
			}

			const properties = await service.extractProperties(metadata)

			expect(properties.created).toBe(date.toISOString())
		})

		it("should handle array values", async () => {
			const metadata = {
				labels: ["label1", "label2", "label3"],
			}

			const properties = await service.extractProperties(metadata)

			expect(Array.isArray(properties.labels)).toBe(true)
			expect(properties.labels).toEqual(["label1", "label2", "label3"])
		})

		it("should handle object values", async () => {
			const metadata = {
				custom: {
					field1: "value1",
					field2: "value2",
				},
			}

			const properties = await service.extractProperties(metadata, ["custom"])

			expect(typeof properties.custom).toBe("string")
			const parsed = JSON.parse(properties.custom as string)
			expect(parsed.field1).toBe("value1")
			expect(parsed.field2).toBe("value2")
		})

		it("should truncate long string values", async () => {
			const longValue = "a".repeat(300)
			const metadata = {
				description: longValue,
			}

			const properties = await service.extractProperties(metadata, [
				"description",
			])

			expect((properties.description as string).length).toBe(200)
		})

		it("should truncate long JSON values", async () => {
			const largeObject = {
				field: "a".repeat(300),
			}
			const metadata = {
				custom: largeObject,
			}

			const properties = await service.extractProperties(metadata, ["custom"])

			expect((properties.custom as string).length).toBeLessThanOrEqual(200)
		})
	})

	describe("Comment Extraction", () => {
		it("should extract comments from metadata comments field", async () => {
			const metadata = {
				comments: ["First comment", "Second comment"],
			}

			const comments = await service.extractComments("Sample content", metadata)

			expect(comments).toContain("First comment")
			expect(comments).toContain("Second comment")
		})

		it("should extract comments from metadata annotations field", async () => {
			const metadata = {
				annotations: ["Annotation 1", "Annotation 2"],
			}

			const comments = await service.extractComments("Sample content", metadata)

			expect(comments).toContain("Annotation 1")
			expect(comments).toContain("Annotation 2")
		})

		it("should extract comments from metadata notes field", async () => {
			const metadata = {
				notes: ["Note 1", "Note 2"],
			}

			const comments = await service.extractComments("Sample content", metadata)

			expect(comments).toContain("Note 1")
			expect(comments).toContain("Note 2")
		})

		it("should handle string format comments", async () => {
			const metadata = {
				comments: "Single comment as string",
			}

			const comments = await service.extractComments("Sample content", metadata)

			expect(comments).toContain("Single comment as string")
		})

		it("should handle comment objects with text field", async () => {
			const metadata = {
				comments: [
					{ text: "Comment with text field" },
					{ content: "Comment with content field" },
					{ body: "Comment with body field" },
					{ comment: "Comment with comment field" },
				],
			}

			const comments = await service.extractComments("Sample content", metadata)

			expect(comments).toContain("Comment with text field")
			expect(comments).toContain("Comment with content field")
			expect(comments).toContain("Comment with body field")
			expect(comments).toContain("Comment with comment field")
		})

		it("should filter out empty comments", async () => {
			const metadata = {
				comments: ["Valid comment", "", "  ", "Another valid comment"],
			}

			const comments = await service.extractComments("Sample content", metadata)

			expect(comments).toContain("Valid comment")
			expect(comments).toContain("Another valid comment")
			expect(comments).not.toContain("")
			expect(comments.length).toBe(2)
		})

		it("should trim whitespace from comments", async () => {
			const metadata = {
				comments: ["  Comment with spaces  "],
			}

			const comments = await service.extractComments("Sample content", metadata)

			expect(comments).toContain("Comment with spaces")
		})
	})

	describe("Extraction Options", () => {
		it("should skip tag extraction when disabled", async () => {
			const extraction: ExtractionResult = {
				text: "Content with #hashtag",
				title: null,
				source: "test",
				url: null,
				contentType: null,
				raw: { tags: ["test"] },
				wordCount: 3,
			}

			const options: MetadataExtractionOptions = {
				extractTags: false,
				extractMentions: true,
				extractProperties: true,
				extractComments: true,
			}

			const result = await service.extract(extraction, options)

			expect(result.tags).toEqual([])
			expect(result.statistics.tagCount).toBe(0)
		})

		it("should skip mention extraction when disabled", async () => {
			const extraction: ExtractionResult = {
				text: "Content with @user mention",
				title: null,
				source: "test",
				url: null,
				contentType: null,
				raw: null,
				wordCount: 4,
			}

			const options: MetadataExtractionOptions = {
				extractTags: true,
				extractMentions: false,
				extractProperties: true,
				extractComments: true,
			}

			const result = await service.extract(extraction, options)

			expect(result.mentions).toEqual([])
			expect(result.statistics.mentionCount).toBe(0)
		})

		it("should skip property extraction when disabled", async () => {
			const extraction: ExtractionResult = {
				text: "Sample content",
				title: null,
				source: "test",
				url: null,
				contentType: null,
				raw: { status: "active" },
				wordCount: 2,
			}

			const options: MetadataExtractionOptions = {
				extractTags: true,
				extractMentions: true,
				extractProperties: false,
				extractComments: true,
			}

			const result = await service.extract(extraction, options)

			expect(result.properties).toEqual({})
			expect(result.statistics.propertyCount).toBe(0)
		})

		it("should skip comment extraction when disabled", async () => {
			const extraction: ExtractionResult = {
				text: "Sample content",
				title: null,
				source: "test",
				url: null,
				contentType: null,
				raw: { comments: ["Test comment"] },
				wordCount: 2,
			}

			const options: MetadataExtractionOptions = {
				extractTags: true,
				extractMentions: true,
				extractProperties: true,
				extractComments: false,
			}

			const result = await service.extract(extraction, options)

			expect(result.comments).toEqual([])
			expect(result.statistics.commentCount).toBe(0)
		})

		it("should not include source when disabled", async () => {
			const extraction: ExtractionResult = {
				text: "Sample content",
				title: "Test",
				source: "test",
				url: "https://example.com",
				contentType: "text/plain",
				raw: null,
				wordCount: 2,
			}

			const options: MetadataExtractionOptions = {
				extractTags: true,
				extractMentions: true,
				extractProperties: true,
				extractComments: true,
				includeSource: false,
			}

			const result = await service.extract(extraction, options)

			expect(result.source).toBeUndefined()
		})

		it("should use default options when not provided", async () => {
			const extraction: ExtractionResult = {
				text: "Content with @user, and #tag",
				title: null,
				source: "test",
				url: null,
				contentType: null,
				raw: { status: "active" },
				wordCount: 5,
			}

			const options: MetadataExtractionOptions = {
				extractTags: true,
				extractMentions: true,
				extractProperties: true,
				extractComments: true,
				propertyKeys: ["status"],
			}

			const result = await service.extract(extraction, options)

			expect(result.tags.length).toBeGreaterThan(0)
			expect(result.mentions.length).toBeGreaterThan(0)
			expect(Object.keys(result.properties).length).toBeGreaterThan(0)
		})
	})

	describe("Options Validation", () => {
		it("should throw error when no extraction type is enabled", () => {
			const options: MetadataExtractionOptions = {
				extractTags: false,
				extractMentions: false,
				extractProperties: false,
				extractComments: false,
			}

			expect(() => service.validateOptions(options)).toThrow(
				"At least one extraction type must be enabled",
			)
		})

		it("should throw error when propertyKeys is not an array", () => {
			const options = {
				extractProperties: true,
				propertyKeys: "not-an-array",
			} as any

			expect(() => service.validateOptions(options)).toThrow(
				"Property keys must be an array",
			)
		})

		it("should throw error when propertyKeys is empty array", () => {
			const options: MetadataExtractionOptions = {
				extractProperties: true,
				propertyKeys: [],
			}

			expect(() => service.validateOptions(options)).toThrow(
				"Property keys cannot be empty",
			)
		})

		it("should throw error when propertyKeys contains non-string values", () => {
			const options = {
				extractProperties: true,
				propertyKeys: ["valid", 123, "another"],
			} as any

			expect(() => service.validateOptions(options)).toThrow(
				"Property keys must be non-empty strings",
			)
		})

		it("should throw error when propertyKeys contains empty strings", () => {
			const options: MetadataExtractionOptions = {
				extractProperties: true,
				propertyKeys: ["valid", "", "another"],
			}

			expect(() => service.validateOptions(options)).toThrow(
				"Property keys must be non-empty strings",
			)
		})

		it("should accept valid options", () => {
			const options: MetadataExtractionOptions = {
				extractTags: true,
				extractMentions: false,
				extractProperties: true,
				extractComments: false,
				propertyKeys: ["status", "priority"],
			}

			expect(() => service.validateOptions(options)).not.toThrow()
		})
	})

	describe("Statistics", () => {
		it("should provide accurate statistics", async () => {
			const extraction: ExtractionResult = {
				text: "Document with @user1, @user2 mentions and #tag1 #tag2 hashtags",
				title: null,
				source: "test",
				url: null,
				contentType: null,
				raw: {
					tags: ["existing-tag"],
					status: "active",
					priority: "high",
					comments: ["Comment 1", "Comment 2"],
				},
				wordCount: 10,
			}

			const options: MetadataExtractionOptions = {
				extractTags: true,
				extractMentions: true,
				extractProperties: true,
				extractComments: true,
				propertyKeys: ["status", "priority"],
			}

			const result = await service.extract(extraction, options)

			expect(result.statistics.tagCount).toBe(result.tags.length)
			expect(result.statistics.mentionCount).toBe(result.mentions.length)
			expect(result.statistics.propertyCount).toBe(
				Object.keys(result.properties).length,
			)
			expect(result.statistics.commentCount).toBe(result.comments.length)
		})
	})

	describe("Health Check", () => {
		it("should pass health check with valid service", async () => {
			const healthy = await service.healthCheck()

			expect(healthy).toBe(true)
		})
	})
})
