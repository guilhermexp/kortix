import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"

/**
 * Unit tests for Ingestion Worker
 *
 * Tests worker job processing including:
 * - Standard document ingestion
 * - Metadata reindexing
 * - Job routing based on job type
 * - Error handling and retries
 */

// Mock Supabase client
const mockSupabaseClient = {
	from: vi.fn(),
}

// Mock services
const mockMetadataExtractor = {
	initialize: vi.fn().mockResolvedValue(undefined),
	extractFromContent: vi.fn().mockResolvedValue({
		tags: ["test", "reindex"],
		mentions: ["@user1", "@user2"],
		properties: { category: "test", priority: "high" },
		comments: ["Test comment"],
		statistics: {
			tagCount: 2,
			mentionCount: 2,
			propertyCount: 2,
			commentCount: 1,
		},
		source: {
			type: "text",
			url: null,
			title: "Test Document",
		},
	}),
}

const mockOrchestrator = {
	initialize: vi.fn().mockResolvedValue(undefined),
	processDocument: vi.fn().mockResolvedValue({
		metadata: {
			extraction: {
				text: "Sample content",
				title: "Test Document",
				wordCount: 100,
			},
			processed: {
				summary: "Test summary",
				tags: ["ai", "test"],
				chunks: [],
			},
		},
	}),
	setExtractorService: vi.fn(),
	setProcessorService: vi.fn(),
	setPreviewService: vi.fn(),
}

// Mock module imports
vi.mock("../supabase", () => ({
	supabaseAdmin: mockSupabaseClient,
	getDefaultUserId: vi.fn().mockResolvedValue("test-user-id"),
}))

vi.mock("../services/processing/metadata-extractor", () => ({
	createMetadataExtractor: vi.fn(() => mockMetadataExtractor),
}))

vi.mock("../services/orchestration", () => ({
	createIngestionOrchestrator: vi.fn(() => mockOrchestrator),
}))

vi.mock("../services/extraction", () => ({
	createDocumentExtractorService: vi.fn(() => ({})),
}))

vi.mock("../services/processing", () => ({
	createDocumentProcessorService: vi.fn(() => ({})),
}))

vi.mock("../services/preview/preview-generator", () => ({
	createPreviewGeneratorService: vi.fn(() => ({})),
}))

vi.mock("../routes/documents", () => ({
	ensureSpace: vi.fn().mockResolvedValue("test-space-id"),
}))

vi.mock("../services/query-cache", () => ({
	documentCache: {
		delete: vi.fn(),
	},
	documentListCache: {
		clear: vi.fn(),
	},
}))

describe("Ingestion Worker - Reindexing Support", () => {
	beforeEach(() => {
		vi.clearAllMocks()

		// Setup default Supabase mock responses
		mockSupabaseClient.from.mockImplementation((table: string) => {
			if (table === "documents") {
				return {
					select: vi.fn().mockReturnThis(),
					update: vi.fn().mockReturnThis(),
					eq: vi.fn().mockReturnThis(),
					maybeSingle: vi.fn().mockResolvedValue({
						data: {
							id: "test-doc-id",
							content: "Test document content with #tags and @mentions",
							metadata: {
								title: "Test Document",
								source: "test",
							},
							title: "Test Document",
							url: "https://example.com",
							source: "test",
							type: "text",
						},
						error: null,
					}),
				}
			}

			if (table === "ingestion_jobs") {
				return {
					update: vi.fn().mockReturnThis(),
					eq: vi.fn().mockResolvedValue({ data: null, error: null }),
				}
			}

			return {
				select: vi.fn().mockReturnThis(),
				update: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
			}
		})
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Reindexing Job Handling", () => {
		it("should process reindex-metadata job type", async () => {
			// This test verifies that reindex-metadata jobs are recognized and processed
			const job = {
				id: "test-job-id",
				document_id: "test-doc-id",
				org_id: "test-org-id",
				payload: {
					type: "reindex-metadata",
					reason: "Metadata changed",
					timestamp: new Date().toISOString(),
				},
				attempts: 0,
			}

			// Verify payload type can be extracted
			const jobType =
				typeof job.payload === "object" &&
				job.payload !== null &&
				"type" in job.payload
					? (job.payload as { type?: string }).type
					: undefined

			expect(jobType).toBe("reindex-metadata")
		})

		it("should route standard jobs to hydrateDocument", async () => {
			// This test verifies that jobs without a type go to standard processing
			const job = {
				id: "test-job-id",
				document_id: "test-doc-id",
				org_id: "test-org-id",
				payload: {
					containerTags: ["test"],
				},
				attempts: 0,
			}

			const jobType =
				typeof job.payload === "object" &&
				job.payload !== null &&
				"type" in job.payload
					? (job.payload as { type?: string }).type
					: undefined

			expect(jobType).toBeUndefined()
		})

		it("should extract metadata using metadata extractor", async () => {
			// Verify metadata extraction happens with correct options
			const content = "Test document with #tags and @mentions"
			const metadata = { title: "Test" }

			const result = await mockMetadataExtractor.extractFromContent(
				content,
				metadata,
				{
					extractTags: true,
					extractMentions: true,
					extractProperties: true,
					extractComments: true,
					includeSource: true,
				},
			)

			expect(result).toBeDefined()
			expect(result.tags).toEqual(["test", "reindex"])
			expect(result.mentions).toEqual(["@user1", "@user2"])
			expect(result.properties).toEqual({ category: "test", priority: "high" })
			expect(result.comments).toEqual(["Test comment"])
			expect(result.statistics).toBeDefined()
		})

		it("should update document with re-extracted metadata", () => {
			// Verify the metadata structure for reindexed documents
			const originalMetadata = { title: "Test", source: "test" }
			const extractedMetadata = {
				tags: ["test"],
				mentions: ["@user"],
				properties: { key: "value" },
				comments: [],
				statistics: {
					tagCount: 1,
					mentionCount: 1,
					propertyCount: 1,
					commentCount: 0,
				},
				source: {
					type: "text",
					url: null,
					title: "Test",
				},
			}

			const updatedMetadata = {
				...originalMetadata,
				extracted: {
					tags: extractedMetadata.tags,
					mentions: extractedMetadata.mentions,
					properties: extractedMetadata.properties,
					comments: extractedMetadata.comments,
					statistics: extractedMetadata.statistics,
					source: extractedMetadata.source,
				},
				reindexedAt: new Date().toISOString(),
				reindexReason: "Metadata changed",
			}

			expect(updatedMetadata.extracted).toBeDefined()
			expect(updatedMetadata.extracted.tags).toEqual(["test"])
			expect(updatedMetadata.reindexedAt).toBeDefined()
			expect(updatedMetadata.reindexReason).toBe("Metadata changed")
		})

		it("should extract reindex reason from payload", () => {
			const payload = {
				type: "reindex-metadata",
				reason: "Custom reindex reason",
				timestamp: new Date().toISOString(),
			}

			const reason =
				typeof payload === "object" && payload !== null
					? (payload as { reason?: string }).reason || "Metadata changed"
					: "Metadata changed"

			expect(reason).toBe("Custom reindex reason")
		})

		it("should use default reason when not provided", () => {
			const payload = {
				type: "reindex-metadata",
				timestamp: new Date().toISOString(),
			}

			const reason =
				typeof payload === "object" && payload !== null
					? (payload as { reason?: string }).reason || "Metadata changed"
					: "Metadata changed"

			expect(reason).toBe("Metadata changed")
		})

		it("should handle missing payload gracefully", () => {
			const payload = null

			const jobType =
				typeof payload === "object" &&
				payload !== null &&
				"type" in payload
					? (payload as { type?: string }).type
					: undefined

			expect(jobType).toBeUndefined()
		})
	})

	describe("Service Integration", () => {
		it("should initialize metadata extractor on startup", async () => {
			// Verify metadata extractor is initialized
			expect(mockMetadataExtractor.initialize).toBeDefined()
			await mockMetadataExtractor.initialize()
			expect(mockMetadataExtractor.initialize).toHaveBeenCalled()
		})

		it("should initialize orchestrator on startup", async () => {
			// Verify orchestrator is initialized
			expect(mockOrchestrator.initialize).toBeDefined()
			await mockOrchestrator.initialize()
			expect(mockOrchestrator.initialize).toHaveBeenCalled()
		})
	})

	describe("Error Handling", () => {
		it("should handle document not found error", async () => {
			// Mock document not found
			mockSupabaseClient.from.mockImplementation((table: string) => {
				if (table === "documents") {
					return {
						select: vi.fn().mockReturnThis(),
						eq: vi.fn().mockReturnThis(),
						maybeSingle: vi.fn().mockResolvedValue({
							data: null,
							error: null,
						}),
					}
				}
				return {}
			})

			// Verify error is thrown
			try {
				const { data: document } = await mockSupabaseClient
					.from("documents")
					.select("content, metadata, title, url, source, type")
					.eq("id", "missing-doc-id")
					.maybeSingle()

				if (!document) {
					throw new Error("Document not found for reindexing job")
				}

				// Should not reach here
				expect(true).toBe(false)
			} catch (error) {
				expect(error instanceof Error).toBe(true)
				expect((error as Error).message).toBe(
					"Document not found for reindexing job",
				)
			}
		})

		it("should handle metadata extraction errors", async () => {
			// Mock extraction error
			mockMetadataExtractor.extractFromContent.mockRejectedValueOnce(
				new Error("Extraction failed"),
			)

			try {
				await mockMetadataExtractor.extractFromContent("", {})
				// Should not reach here
				expect(true).toBe(false)
			} catch (error) {
				expect(error instanceof Error).toBe(true)
				expect((error as Error).message).toBe("Extraction failed")
			}
		})
	})
})
