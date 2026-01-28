import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import {
	type ChangeDetectionOptions,
	type ChangeDetectionResult,
	createMetadataChangeDetector,
	MetadataChangeDetector,
	type MetadataSnapshot,
} from "./metadata-change-detector"

// Mock document queue
vi.mock("./queue/document-queue", () => ({
	addDocumentJob: vi.fn(async () => "job-123"),
}))

describe("MetadataChangeDetector", () => {
	let service: MetadataChangeDetector

	beforeEach(async () => {
		service = createMetadataChangeDetector()
		await service.initialize()
	})

	afterEach(async () => {
		vi.clearAllMocks()
		await service.cleanup()
	})

	describe("Service Lifecycle", () => {
		it("should initialize successfully", async () => {
			const newService = createMetadataChangeDetector()
			await expect(newService.initialize()).resolves.not.toThrow()
			await newService.cleanup()
		})

		it("should pass health check", async () => {
			const healthy = await service.healthCheck()
			expect(healthy).toBe(true)
		})

		it("should handle cleanup", async () => {
			await expect(service.cleanup()).resolves.not.toThrow()
		})
	})

	describe("Tag Changes Detection", () => {
		it("should detect added tags", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml", "nlp", "research"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.tagsChanged).toBe(true)
			expect(result.description).toContain("Tags: +2 -0")
		})

		it("should detect removed tags", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml", "nlp", "research"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.tagsChanged).toBe(true)
			expect(result.description).toContain("Tags: +0 -2")
		})

		it("should detect mixed tag changes", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml", "old-tag"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml", "new-tag"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.tagsChanged).toBe(true)
		})

		it("should not detect changes when tags are identical", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(false)
			expect(result.changes.tagsChanged).toBe(false)
		})
	})

	describe("Mention Changes Detection", () => {
		it("should detect added mentions", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: ["user1"],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: ["user1", "user2", "user3"],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.mentionsChanged).toBe(true)
			expect(result.description).toContain("Mentions: +2 -0")
		})

		it("should detect removed mentions", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: ["user1", "user2", "user3"],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: ["user1"],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.mentionsChanged).toBe(true)
			expect(result.description).toContain("Mentions: +0 -2")
		})
	})

	describe("Property Changes Detection", () => {
		it("should detect added properties", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: { status: "draft" },
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: {
					status: "draft",
					priority: "high",
					assignee: "john",
				},
				comments: [],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.propertiesChanged).toBe(true)
			expect(result.description).toContain("Properties: +2 -0")
		})

		it("should detect removed properties", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: {
					status: "draft",
					priority: "high",
					assignee: "john",
				},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: { status: "draft" },
				comments: [],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.propertiesChanged).toBe(true)
			expect(result.description).toContain("Properties: +0 -2")
		})

		it("should detect modified property values", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: {
					status: "draft",
					priority: "low",
				},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: {
					status: "draft",
					priority: "high",
				},
				comments: [],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.propertiesChanged).toBe(true)
			expect(result.description).toContain("~1")
		})

		it("should handle nested property values", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: {
					metadata: { version: 1, author: "john" },
				},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: {
					metadata: { version: 2, author: "jane" },
				},
				comments: [],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.propertiesChanged).toBe(true)
		})
	})

	describe("Comment Changes Detection", () => {
		it("should detect added comments", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: {},
				comments: ["First comment"],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: {},
				comments: ["First comment", "Second comment", "Third comment"],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.commentsChanged).toBe(true)
			expect(result.description).toContain("Comments: +2 -0")
		})

		it("should detect removed comments", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: {},
				comments: ["First comment", "Second comment"],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: {},
				comments: ["First comment"],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.commentsChanged).toBe(true)
			expect(result.description).toContain("Comments: +0 -1")
		})
	})

	describe("Multiple Changes Detection", () => {
		it("should detect changes across all metadata types", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai"],
				mentions: ["user1"],
				properties: { status: "draft" },
				comments: ["Old comment"],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml"],
				mentions: ["user1", "user2"],
				properties: { status: "published", priority: "high" },
				comments: ["Old comment", "New comment"],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.tagsChanged).toBe(true)
			expect(result.changes.mentionsChanged).toBe(true)
			expect(result.changes.propertiesChanged).toBe(true)
			expect(result.changes.commentsChanged).toBe(true)
			expect(result.severity).toBe(1.0) // All 4 types changed
		})

		it("should calculate correct severity", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai"],
				mentions: ["user1"],
				properties: { status: "draft" },
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml"], // Changed
				mentions: ["user1"], // Not changed
				properties: { status: "draft" }, // Not changed
				comments: [], // Not changed
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.severity).toBe(0.25) // 1 out of 4 types changed
		})
	})

	describe("Reindexing Threshold", () => {
		it("should require reindex when threshold exceeded", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai"],
				mentions: ["user1"],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml"], // Changed
				mentions: ["user1", "user2"], // Changed
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			// 2 out of 4 = 0.5 severity, default threshold is 0.3
			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.requiresReindex).toBe(true)
			expect(result.severity).toBeGreaterThanOrEqual(0.3)
		})

		it("should not require reindex when below threshold", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml"], // Only 1 out of 4 changed = 0.25 severity
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const result = await service.detectChanges(oldSnapshot, newSnapshot)

			expect(result.hasChanges).toBe(true)
			expect(result.requiresReindex).toBe(false) // Below 0.3 threshold
			expect(result.severity).toBeLessThan(0.3)
		})

		it("should respect custom threshold", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const options: ChangeDetectionOptions = {
				reindexThreshold: 0.1, // Lower threshold
			}

			const result = await service.detectChanges(
				oldSnapshot,
				newSnapshot,
				options,
			)

			expect(result.requiresReindex).toBe(true)
			expect(result.severity).toBeGreaterThanOrEqual(0.1)
		})
	})

	describe("Selective Change Detection", () => {
		it("should only check tags when specified", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai"],
				mentions: ["user1"],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml"],
				mentions: ["user1", "user2"],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const options: ChangeDetectionOptions = {
				checkTags: true,
				checkMentions: false,
				checkProperties: false,
				checkComments: false,
			}

			const result = await service.detectChanges(
				oldSnapshot,
				newSnapshot,
				options,
			)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.tagsChanged).toBe(true)
			expect(result.changes.mentionsChanged).toBe(false)
			expect(result.severity).toBe(1.0) // 1 out of 1 checked types changed
		})
	})

	describe("Trigger Reindex", () => {
		it("should trigger reindex job", async () => {
			const { addDocumentJob } = await import("./queue/document-queue")
			const jobId = await service.triggerReindex(
				"doc-1",
				"org-1",
				"Test reason",
			)

			expect(jobId).toBe("job-123")
			expect(addDocumentJob).toHaveBeenCalledWith(
				"doc-1",
				"org-1",
				undefined,
				expect.objectContaining({
					type: "reindex-metadata",
					reason: "Test reason",
				}),
			)
		})

		it("should auto-trigger reindex when enabled", async () => {
			const { addDocumentJob } = await import("./queue/document-queue")

			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: ["ai", "ml", "nlp"],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const options: ChangeDetectionOptions = {
				autoReindex: true,
			}

			await service.detectChanges(oldSnapshot, newSnapshot, options)

			expect(addDocumentJob).toHaveBeenCalledWith(
				"doc-1",
				"org-1",
				undefined,
				expect.objectContaining({
					type: "reindex-metadata",
				}),
			)
		})

		it("should validate required fields", async () => {
			await expect(service.triggerReindex("", "org-1")).rejects.toThrow()

			await expect(service.triggerReindex("doc-1", "")).rejects.toThrow()
		})
	})

	describe("Compare Metadata", () => {
		it("should extract and compare metadata from objects", async () => {
			const oldMetadata = {
				documentId: "doc-1",
				orgId: "org-1",
				extracted: {
					tags: ["ai"],
					mentions: ["user1"],
					properties: {},
					comments: [],
				},
			}

			const newMetadata = {
				documentId: "doc-1",
				orgId: "org-1",
				extracted: {
					tags: ["ai", "ml"],
					mentions: ["user1"],
					properties: {},
					comments: [],
				},
			}

			const result = await service.compareMetadata(oldMetadata, newMetadata)

			expect(result.hasChanges).toBe(true)
			expect(result.changes.tagsChanged).toBe(true)
		})

		it("should handle missing extracted field", async () => {
			const oldMetadata = {
				documentId: "doc-1",
				orgId: "org-1",
			}

			const newMetadata = {
				documentId: "doc-1",
				orgId: "org-1",
				extracted: {
					tags: ["ai"],
				},
			}

			const result = await service.compareMetadata(oldMetadata, newMetadata)

			expect(result.hasChanges).toBe(true)
		})
	})

	describe("Should Reindex Helper", () => {
		it("should return true when threshold exceeded", () => {
			const result: ChangeDetectionResult = {
				hasChanges: true,
				requiresReindex: true,
				changes: {
					tagsChanged: true,
					mentionsChanged: false,
					propertiesChanged: false,
					commentsChanged: false,
				},
				severity: 0.5,
				description: "Tags changed",
			}

			expect(service.shouldReindex(result)).toBe(true)
		})

		it("should return false when no changes", () => {
			const result: ChangeDetectionResult = {
				hasChanges: false,
				requiresReindex: false,
				changes: {
					tagsChanged: false,
					mentionsChanged: false,
					propertiesChanged: false,
					commentsChanged: false,
				},
				severity: 0,
				description: "No changes",
			}

			expect(service.shouldReindex(result)).toBe(false)
		})

		it("should respect custom threshold", () => {
			const result: ChangeDetectionResult = {
				hasChanges: true,
				requiresReindex: false,
				changes: {
					tagsChanged: true,
					mentionsChanged: false,
					propertiesChanged: false,
					commentsChanged: false,
				},
				severity: 0.25,
				description: "Minor changes",
			}

			expect(service.shouldReindex(result, 0.2)).toBe(true)
			expect(service.shouldReindex(result, 0.5)).toBe(false)
		})
	})

	describe("Validation", () => {
		it("should reject snapshots for different documents", async () => {
			const oldSnapshot: MetadataSnapshot = {
				documentId: "doc-1",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			const newSnapshot: MetadataSnapshot = {
				documentId: "doc-2",
				orgId: "org-1",
				tags: [],
				mentions: [],
				properties: {},
				comments: [],
				timestamp: new Date(),
			}

			await expect(
				service.detectChanges(oldSnapshot, newSnapshot),
			).rejects.toThrow("Snapshots must be for the same document")
		})
	})

	describe("Factory Function", () => {
		it("should create service with default options", () => {
			const newService = createMetadataChangeDetector()
			expect(newService).toBeInstanceOf(MetadataChangeDetector)
		})

		it("should create service with custom options", () => {
			const options: ChangeDetectionOptions = {
				reindexThreshold: 0.5,
				checkTags: true,
				checkMentions: false,
			}
			const newService = createMetadataChangeDetector(options)
			expect(newService).toBeInstanceOf(MetadataChangeDetector)
		})
	})
})
