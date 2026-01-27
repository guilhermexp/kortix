import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ExtractedMetadata } from "../../services/processing/metadata-extractor"
import type { ChangeDetectionResult } from "../../services/metadata-change-detector"

/**
 * Integration tests for metadata search flow
 *
 * Tests complete pipeline from document upload to metadata search including:
 * - Document upload with tags, mentions, and properties
 * - Metadata extraction and indexing
 * - Search by tags, mentions, and properties
 * - Metadata updates and reindexing
 * - Search result accuracy after metadata changes
 */

describe("Metadata Search Integration Tests", () => {
	let mockSupabase: Partial<SupabaseClient>
	let mockMetadataExtractor: any
	let mockChangeDetector: any
	let mockDatabase: any

	beforeEach(() => {
		// Setup test environment
		mockDatabase = {
			documents: new Map(),
			metadata: new Map(),
			chunks: new Map(),
			searchHistory: [] as any[],
		}

		mockMetadataExtractor = {
			extract: vi.fn(),
			extractTags: vi.fn(),
			extractMentions: vi.fn(),
			extractProperties: vi.fn(),
		}

		mockChangeDetector = {
			detectChanges: vi.fn(),
			triggerReindex: vi.fn(),
		}

		// Mock Supabase client
		mockSupabase = {
			from: vi.fn((table: string) => ({
				select: vi.fn(() => ({
					eq: vi.fn(() => ({
						eq: vi.fn(() => ({
							single: vi.fn(() => ({
								data: mockDatabase.documents.get("doc-1"),
								error: null,
							})),
							data: Array.from(mockDatabase.documents.values()),
							error: null,
						})),
						in: vi.fn(() => ({
							data: Array.from(mockDatabase.documents.values()),
							error: null,
						})),
						data: Array.from(mockDatabase.documents.values()),
						error: null,
					})),
					in: vi.fn(() => ({
						data: Array.from(mockDatabase.documents.values()),
						error: null,
					})),
					data: Array.from(mockDatabase.documents.values()),
					error: null,
				})),
				insert: vi.fn((data: any) => ({
					select: vi.fn(() => ({
						single: vi.fn(() => {
							const id = `doc-${mockDatabase.documents.size + 1}`
							const doc = { id, ...data, created_at: new Date().toISOString() }
							mockDatabase.documents.set(id, doc)
							return { data: doc, error: null }
						}),
					})),
				})),
				update: vi.fn((data: any) => ({
					eq: vi.fn(() => ({
						select: vi.fn(() => ({
							single: vi.fn(() => ({
								data: { ...data, updated_at: new Date().toISOString() },
								error: null,
							})),
						})),
					})),
				})),
			})),
			rpc: vi.fn((functionName: string, params: any) => {
				// Mock vector search
				if (functionName === "search_chunks_vector") {
					const results = mockDatabase.searchHistory
					return { data: results, error: null }
				}
				return { data: null, error: new Error("Unknown RPC function") }
			}),
		}
	})

	afterEach(() => {
		vi.clearAllMocks()
		mockDatabase.documents.clear()
		mockDatabase.metadata.clear()
		mockDatabase.chunks.clear()
		mockDatabase.searchHistory = []
	})

	describe("End-to-End Metadata Search Flow", () => {
		it("should process document with metadata through complete pipeline", async () => {
			const documentData = {
				type: "text",
				content:
					"This is a test document about #ai and #machinelearning. Contact @john-doe and @jane-smith for more info.",
				metadata: {
					title: "AI Research Document",
					status: "draft",
					priority: "high",
					project: "ml-research",
					tags: ["research", "ai"],
				},
			}

			// Step 1: Upload document with tags, mentions, properties
			const mockExtractedMetadata: ExtractedMetadata = {
				tags: ["ai", "machinelearning", "research"],
				mentions: ["john-doe", "jane-smith"],
				properties: {
					status: "draft",
					priority: "high",
					project: "ml-research",
				},
				comments: [],
				statistics: {
					tagCount: 3,
					mentionCount: 2,
					propertyCount: 3,
					commentCount: 0,
				},
			}

			mockMetadataExtractor.extract.mockResolvedValue(mockExtractedMetadata)

			// Simulate document upload and metadata extraction
			const uploadedDoc = await uploadDocumentWithMetadata(
				documentData,
				mockMetadataExtractor,
				mockDatabase,
			)

			// Step 2: Verify metadata extraction runs
			expect(mockMetadataExtractor.extract).toHaveBeenCalled()
			expect(uploadedDoc.id).toBeDefined()
			expect(uploadedDoc.metadata).toBeDefined()

			// Step 3: Verify metadata indexed in database
			const indexedMetadata = mockDatabase.metadata.get(uploadedDoc.id)
			expect(indexedMetadata).toBeDefined()
			expect(indexedMetadata.tags).toEqual(["ai", "machinelearning", "research"])
			expect(indexedMetadata.mentions).toEqual(["john-doe", "jane-smith"])
			expect(indexedMetadata.properties).toEqual({
				status: "draft",
				priority: "high",
				project: "ml-research",
			})

			// Step 4: Search by tag - verify results
			mockDatabase.searchHistory = [
				{
					id: "chunk-1",
					document_id: uploadedDoc.id,
					content: documentData.content,
					metadata: { tags: ["ai", "machinelearning", "research"] },
					similarity: 0.95,
				},
			]

			const tagSearchResults = await searchByMetadata(
				mockSupabase as SupabaseClient,
				"org-1",
				{
					q: "ai",
					filters: { tags: ["ai"] },
					limit: 10,
				},
				mockDatabase,
			)

			expect(tagSearchResults.results).toHaveLength(1)
			expect(tagSearchResults.results[0].documentId).toBe(uploadedDoc.id)
			expect(tagSearchResults.results[0].metadata?.tags).toContain("ai")

			// Step 5: Search by mention - verify results
			mockDatabase.searchHistory = [
				{
					id: "chunk-1",
					document_id: uploadedDoc.id,
					content: documentData.content,
					metadata: { mentions: ["john-doe", "jane-smith"] },
					similarity: 0.92,
				},
			]

			const mentionSearchResults = await searchByMetadata(
				mockSupabase as SupabaseClient,
				"org-1",
				{
					q: "john-doe",
					filters: { mentions: ["john-doe"] },
					limit: 10,
				},
				mockDatabase,
			)

			expect(mentionSearchResults.results).toHaveLength(1)
			expect(mentionSearchResults.results[0].metadata?.mentions).toContain(
				"john-doe",
			)

			// Step 6: Search by property - verify results
			mockDatabase.searchHistory = [
				{
					id: "chunk-1",
					document_id: uploadedDoc.id,
					content: documentData.content,
					metadata: { properties: { status: "draft", priority: "high" } },
					similarity: 0.90,
				},
			]

			const propertySearchResults = await searchByMetadata(
				mockSupabase as SupabaseClient,
				"org-1",
				{
					q: "high priority",
					filters: { properties: { priority: "high" } },
					limit: 10,
				},
				mockDatabase,
			)

			expect(propertySearchResults.results).toHaveLength(1)
			expect(propertySearchResults.results[0].metadata?.properties?.priority).toBe(
				"high",
			)
		})

		it("should trigger reindexing when document metadata changes", async () => {
			const initialDocument = {
				type: "text",
				content: "Initial content with #initial tag and @original-user",
				metadata: {
					title: "Test Document",
					status: "draft",
					tags: ["initial"],
				},
			}

			// Step 1: Upload initial document
			const initialMetadata: ExtractedMetadata = {
				tags: ["initial"],
				mentions: ["original-user"],
				properties: { status: "draft" },
				comments: [],
				statistics: {
					tagCount: 1,
					mentionCount: 1,
					propertyCount: 1,
					commentCount: 0,
				},
			}

			mockMetadataExtractor.extract.mockResolvedValue(initialMetadata)

			const uploadedDoc = await uploadDocumentWithMetadata(
				initialDocument,
				mockMetadataExtractor,
				mockDatabase,
			)

			expect(uploadedDoc.id).toBeDefined()

			// Step 2: Update document metadata
			const updatedDocument = {
				...initialDocument,
				content:
					"Updated content with #updated #new tags and @new-user @another-user",
				metadata: {
					...initialDocument.metadata,
					status: "published",
					tags: ["updated", "new"],
				},
			}

			const updatedMetadata: ExtractedMetadata = {
				tags: ["updated", "new"],
				mentions: ["new-user", "another-user"],
				properties: { status: "published" },
				comments: [],
				statistics: {
					tagCount: 2,
					mentionCount: 2,
					propertyCount: 1,
					commentCount: 0,
				},
			}

			mockMetadataExtractor.extract.mockResolvedValue(updatedMetadata)

			// Mock change detection
			const changeResult: ChangeDetectionResult = {
				hasChanges: true,
				requiresReindex: true,
				changes: {
					tagsChanged: true,
					mentionsChanged: true,
					propertiesChanged: true,
					commentsChanged: false,
				},
				severity: 0.75,
				description: "Tags: +2 -1; Mentions: +2 -1; Properties: ~1",
			}

			mockChangeDetector.detectChanges.mockResolvedValue(changeResult)
			mockChangeDetector.triggerReindex.mockResolvedValue("job-123")

			// Step 3: Verify reindexing triggered
			const reindexResult = await updateDocumentMetadata(
				uploadedDoc.id,
				updatedDocument,
				mockMetadataExtractor,
				mockChangeDetector,
				mockDatabase,
			)

			expect(mockChangeDetector.detectChanges).toHaveBeenCalled()
			expect(reindexResult.changeDetection.hasChanges).toBe(true)
			expect(reindexResult.changeDetection.requiresReindex).toBe(true)
			expect(mockChangeDetector.triggerReindex).toHaveBeenCalledWith(
				uploadedDoc.id,
				expect.any(String),
				expect.any(String),
			)

			// Step 4: Verify search reflects updated metadata
			mockDatabase.searchHistory = [
				{
					id: "chunk-1",
					document_id: uploadedDoc.id,
					content: updatedDocument.content,
					metadata: {
						tags: ["updated", "new"],
						mentions: ["new-user", "another-user"],
						properties: { status: "published" },
					},
					similarity: 0.94,
				},
			]

			const searchResults = await searchByMetadata(
				mockSupabase as SupabaseClient,
				"org-1",
				{
					q: "updated",
					filters: { tags: ["updated"] },
					limit: 10,
				},
				mockDatabase,
			)

			expect(searchResults.results).toHaveLength(1)
			expect(searchResults.results[0].metadata?.tags).toContain("updated")
			expect(searchResults.results[0].metadata?.tags).not.toContain("initial")
			expect(searchResults.results[0].metadata?.mentions).toContain("new-user")
			expect(searchResults.results[0].metadata?.properties?.status).toBe(
				"published",
			)
		})

		it("should handle complex metadata filters in search", async () => {
			// Create multiple documents with different metadata
			const documents = [
				{
					type: "text",
					content: "Document about #ai and @alice",
					metadata: {
						title: "AI Document 1",
						status: "draft",
						priority: "high",
						tags: ["ai", "ml"],
					},
				},
				{
					type: "text",
					content: "Document about #ml and @bob",
					metadata: {
						title: "ML Document 2",
						status: "published",
						priority: "medium",
						tags: ["ml", "data"],
					},
				},
				{
					type: "text",
					content: "Document about #data and @charlie",
					metadata: {
						title: "Data Document 3",
						status: "draft",
						priority: "low",
						tags: ["data", "analytics"],
					},
				},
			]

			const uploadedDocs: any[] = []

			for (const doc of documents) {
				const metadata: ExtractedMetadata = {
					tags: doc.metadata.tags,
					mentions: doc.content.match(/@(\w+)/)?.[1]
						? [doc.content.match(/@(\w+)/)?.[1] as string]
						: [],
					properties: {
						status: doc.metadata.status,
						priority: doc.metadata.priority,
					},
					comments: [],
					statistics: {
						tagCount: doc.metadata.tags.length,
						mentionCount: 1,
						propertyCount: 2,
						commentCount: 0,
					},
				}

				mockMetadataExtractor.extract.mockResolvedValue(metadata)
				const uploaded = await uploadDocumentWithMetadata(
					doc,
					mockMetadataExtractor,
					mockDatabase,
				)
				uploadedDocs.push(uploaded)
			}

			// Search with AND filter (tags: ai AND status: draft)
			mockDatabase.searchHistory = [
				{
					id: "chunk-1",
					document_id: uploadedDocs[0].id,
					content: documents[0].content,
					metadata: {
						tags: ["ai", "ml"],
						properties: { status: "draft", priority: "high" },
					},
					similarity: 0.93,
				},
			]

			const andSearchResults = await searchByMetadata(
				mockSupabase as SupabaseClient,
				"org-1",
				{
					q: "ai",
					filters: {
						AND: [{ tags: ["ai"] }, { properties: { status: "draft" } }],
					},
					limit: 10,
				},
				mockDatabase,
			)

			expect(andSearchResults.results).toHaveLength(1)
			expect(andSearchResults.results[0].documentId).toBe(uploadedDocs[0].id)

			// Search with OR filter (tags: ml OR tags: data)
			mockDatabase.searchHistory = [
				{
					id: "chunk-1",
					document_id: uploadedDocs[0].id,
					content: documents[0].content,
					metadata: { tags: ["ai", "ml"] },
					similarity: 0.91,
				},
				{
					id: "chunk-2",
					document_id: uploadedDocs[1].id,
					content: documents[1].content,
					metadata: { tags: ["ml", "data"] },
					similarity: 0.89,
				},
				{
					id: "chunk-3",
					document_id: uploadedDocs[2].id,
					content: documents[2].content,
					metadata: { tags: ["data", "analytics"] },
					similarity: 0.88,
				},
			]

			const orSearchResults = await searchByMetadata(
				mockSupabase as SupabaseClient,
				"org-1",
				{
					q: "machine learning",
					filters: {
						OR: [{ tags: ["ml"] }, { tags: ["data"] }],
					},
					limit: 10,
				},
				mockDatabase,
			)

			expect(orSearchResults.results.length).toBeGreaterThanOrEqual(2)
		})

		it("should maintain search accuracy during concurrent metadata updates", async () => {
			// Create initial documents
			const documents = Array(5)
				.fill(null)
				.map((_, i) => ({
					type: "text",
					content: `Document ${i} with #tag${i} and @user${i}`,
					metadata: {
						title: `Document ${i}`,
						status: "draft",
						index: i,
					},
				}))

			const uploadedDocs: any[] = []

			// Upload all documents
			for (const doc of documents) {
				const metadata: ExtractedMetadata = {
					tags: [`tag${doc.metadata.index}`],
					mentions: [`user${doc.metadata.index}`],
					properties: { status: "draft", index: doc.metadata.index },
					comments: [],
					statistics: {
						tagCount: 1,
						mentionCount: 1,
						propertyCount: 2,
						commentCount: 0,
					},
				}

				mockMetadataExtractor.extract.mockResolvedValue(metadata)
				const uploaded = await uploadDocumentWithMetadata(
					doc,
					mockMetadataExtractor,
					mockDatabase,
				)
				uploadedDocs.push(uploaded)
			}

			// Simulate concurrent metadata updates
			const updatePromises = uploadedDocs.map(async (doc, i) => {
				const updatedDocument = {
					type: "text",
					content: `Updated document ${i} with #newtag${i} and @newuser${i}`,
					metadata: {
						title: `Updated Document ${i}`,
						status: "published",
						index: i,
					},
				}

				const updatedMetadata: ExtractedMetadata = {
					tags: [`newtag${i}`],
					mentions: [`newuser${i}`],
					properties: { status: "published", index: i },
					comments: [],
					statistics: {
						tagCount: 1,
						mentionCount: 1,
						propertyCount: 2,
						commentCount: 0,
					},
				}

				mockMetadataExtractor.extract.mockResolvedValue(updatedMetadata)

				const changeResult: ChangeDetectionResult = {
					hasChanges: true,
					requiresReindex: true,
					changes: {
						tagsChanged: true,
						mentionsChanged: true,
						propertiesChanged: true,
						commentsChanged: false,
					},
					severity: 0.8,
					description: "Concurrent update",
				}

				mockChangeDetector.detectChanges.mockResolvedValue(changeResult)
				mockChangeDetector.triggerReindex.mockResolvedValue(`job-${i}`)

				return updateDocumentMetadata(
					doc.id,
					updatedDocument,
					mockMetadataExtractor,
					mockChangeDetector,
					mockDatabase,
				)
			})

			const updateResults = await Promise.all(updatePromises)

			// Verify all updates completed successfully
			expect(updateResults).toHaveLength(5)
			expect(updateResults.every((r) => r.success)).toBe(true)
			expect(updateResults.every((r) => r.changeDetection.hasChanges)).toBe(true)

			// Verify search reflects all updates
			for (let i = 0; i < uploadedDocs.length; i++) {
				const metadata = mockDatabase.metadata.get(uploadedDocs[i].id)
				expect(metadata.tags).toContain(`newtag${i}`)
				expect(metadata.mentions).toContain(`newuser${i}`)
				expect(metadata.properties.status).toBe("published")
			}
		})
	})

	// ========================================================================
	// Helper Functions
	// ========================================================================

	/**
	 * Upload document with metadata extraction
	 */
	async function uploadDocumentWithMetadata(
		documentData: any,
		metadataExtractor: any,
		database: any,
	): Promise<any> {
		const docId = `doc-${database.documents.size + 1}`
		const orgId = "org-1"

		// Create document
		const document = {
			id: docId,
			org_id: orgId,
			...documentData,
			status: "processing",
			created_at: new Date().toISOString(),
		}

		database.documents.set(docId, document)

		// Extract metadata
		const extraction = {
			text: documentData.content,
			title: documentData.metadata?.title || null,
			source: "test",
			url: null,
			contentType: documentData.type,
			raw: documentData.metadata || null,
			wordCount: documentData.content.split(/\s+/).length,
		}

		const extractedMetadata = await metadataExtractor.extract(extraction)

		// Index metadata
		database.metadata.set(docId, {
			documentId: docId,
			orgId,
			...extractedMetadata,
			indexed_at: new Date().toISOString(),
		})

		// Update document with metadata
		const updatedDocument = {
			...document,
			metadata: {
				...documentData.metadata,
				extracted: extractedMetadata,
			},
			status: "completed",
			updated_at: new Date().toISOString(),
		}

		database.documents.set(docId, updatedDocument)

		return updatedDocument
	}

	/**
	 * Update document metadata and trigger reindexing
	 */
	async function updateDocumentMetadata(
		documentId: string,
		updatedDocument: any,
		metadataExtractor: any,
		changeDetector: any,
		database: any,
	): Promise<any> {
		const existingDoc = database.documents.get(documentId)
		if (!existingDoc) {
			throw new Error(`Document ${documentId} not found`)
		}

		const orgId = existingDoc.org_id

		// Extract new metadata
		const extraction = {
			text: updatedDocument.content,
			title: updatedDocument.metadata?.title || null,
			source: "test",
			url: null,
			contentType: updatedDocument.type,
			raw: updatedDocument.metadata || null,
			wordCount: updatedDocument.content.split(/\s+/).length,
		}

		const newMetadata = await metadataExtractor.extract(extraction)

		// Detect changes
		const oldMetadata = database.metadata.get(documentId)
		const changeResult = await changeDetector.detectChanges(
			{
				documentId,
				orgId,
				...oldMetadata,
				timestamp: new Date(oldMetadata.indexed_at),
			},
			{
				documentId,
				orgId,
				...newMetadata,
				timestamp: new Date(),
			},
		)

		// Trigger reindexing if needed
		let jobId: string | null = null
		if (changeResult.requiresReindex) {
			jobId = await changeDetector.triggerReindex(
				documentId,
				orgId,
				changeResult.description,
			)
		}

		// Update metadata in database
		database.metadata.set(documentId, {
			documentId,
			orgId,
			...newMetadata,
			indexed_at: new Date().toISOString(),
		})

		// Update document
		const updated = {
			...existingDoc,
			...updatedDocument,
			metadata: {
				...updatedDocument.metadata,
				extracted: newMetadata,
			},
			updated_at: new Date().toISOString(),
		}

		database.documents.set(documentId, updated)

		return {
			success: true,
			documentId,
			changeDetection: changeResult,
			reindexJobId: jobId,
		}
	}

	/**
	 * Search by metadata filters
	 */
	async function searchByMetadata(
		_client: SupabaseClient,
		_orgId: string,
		params: any,
		database: any,
	): Promise<any> {
		const { q, filters, limit = 10 } = params

		// Get search results from mock
		const chunks = database.searchHistory

		// Apply filters
		const filteredChunks = chunks.filter((chunk: any) => {
			if (!filters) return true

			const metadata = chunk.metadata || {}

			// Handle AND filters
			if (filters.AND) {
				return filters.AND.every((filter: any) =>
					matchesFilter(metadata, filter),
				)
			}

			// Handle OR filters
			if (filters.OR) {
				return filters.OR.some((filter: any) => matchesFilter(metadata, filter))
			}

			// Handle simple filters
			return matchesFilter(metadata, filters)
		})

		// Group by document
		const grouped = new Map<string, any>()

		for (const chunk of filteredChunks) {
			const doc = database.documents.get(chunk.document_id)
			if (!doc) continue

			if (!grouped.has(chunk.document_id)) {
				grouped.set(chunk.document_id, {
					doc,
					chunks: [],
					bestScore: 0,
				})
			}

			const entry = grouped.get(chunk.document_id)
			entry.chunks.push({
				content: chunk.content,
				score: chunk.similarity || 0,
			})
			entry.bestScore = Math.max(entry.bestScore, chunk.similarity || 0)
		}

		// Convert to results
		const results = Array.from(grouped.values())
			.sort((a, b) => b.bestScore - a.bestScore)
			.slice(0, limit)
			.map((entry) => ({
				documentId: entry.doc.id,
				createdAt: entry.doc.created_at,
				updatedAt: entry.doc.updated_at,
				metadata: entry.doc.metadata,
				title: entry.doc.metadata?.title || null,
				type: entry.doc.type,
				score: entry.bestScore,
				summary: null,
				content: null,
				chunks: entry.chunks.map((c: any) => ({
					content: c.content,
					isRelevant: true,
					score: c.score,
				})),
			}))

		return {
			results,
			timing: 10,
			total: results.length,
		}
	}

	/**
	 * Check if metadata matches filter
	 */
	function matchesFilter(metadata: any, filter: any): boolean {
		for (const [key, value] of Object.entries(filter)) {
			if (key === "tags") {
				const tags = metadata.tags || []
				const filterTags = Array.isArray(value) ? value : [value]
				if (!filterTags.some((tag: string) => tags.includes(tag))) {
					return false
				}
			} else if (key === "mentions") {
				const mentions = metadata.mentions || []
				const filterMentions = Array.isArray(value) ? value : [value]
				if (!filterMentions.some((mention: string) => mentions.includes(mention))) {
					return false
				}
			} else if (key === "properties") {
				const properties = metadata.properties || {}
				const filterProps = value as Record<string, unknown>
				for (const [propKey, propValue] of Object.entries(filterProps)) {
					if (properties[propKey] !== propValue) {
						return false
					}
				}
			} else {
				if (metadata[key] !== value) {
					return false
				}
			}
		}
		return true
	}
})
