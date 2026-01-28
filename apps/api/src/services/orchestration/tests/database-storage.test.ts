import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import type { Logger } from "../../base/base-service"
import type { Chunk, PreviewResult, ProcessedDocument } from "../../interfaces"

/**
 * Integration tests for Database Storage Orchestration
 *
 * Tests database storage operations including:
 * - Document record storage
 * - Document chunks with embeddings
 * - Transaction-like behavior with rollback on error
 * - Status updates for documents and jobs
 * - Error handling and recovery mechanisms
 * - Large document processing
 * - Edge cases (empty chunks, missing data)
 */

// Mock Supabase admin client at module level
const mockSupabaseAdmin = {
	from: vi.fn().mockReturnThis(),
	update: vi.fn().mockReturnThis(),
	insert: vi.fn().mockReturnThis(),
	delete: vi.fn().mockReturnThis(),
	eq: vi.fn().mockReturnThis(),
}

// Mock the supabase module
vi.mock("../../supabase", () => ({
	supabaseAdmin: mockSupabaseAdmin,
}))

// Import after mocking
const {
	deleteDocumentChunks,
	storeChunks,
	storeCompleteDocument,
	storeDocument,
	updateDocumentStatus,
	updateJobStatus,
} = await import("../database-storage")

import type {
	StoreChunksParams,
	StoreDocumentParams,
} from "../database-storage"

describe("Database Storage Integration Tests", () => {
	let mockLogger: Logger

	beforeEach(() => {
		// Mock logger
		mockLogger = {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		} as unknown as Logger

		// Reset mock call history but keep implementations
		mockSupabaseAdmin.from.mockClear().mockReturnThis()
		mockSupabaseAdmin.update.mockClear().mockReturnThis()
		mockSupabaseAdmin.insert.mockClear().mockReturnThis()
		mockSupabaseAdmin.delete.mockClear().mockReturnThis()
		mockSupabaseAdmin.eq.mockClear().mockReturnThis()
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("storeDocument", () => {
		it("should store document record successfully", async () => {
			const params: StoreDocumentParams = {
				documentId: "doc-123",
				organizationId: "org-456",
				userId: "user-789",
				url: "https://example.com/document",
				title: "Sample Document",
				content: "This is sample content",
				summary: "Sample summary",
				tags: ["test", "sample"],
				wordCount: 4,
				metadata: { source: "test" },
				raw: { rawData: true },
				previewUrl: "https://example.com/preview.png",
			}

			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			await storeDocument(params, mockLogger)

			expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("documents")
			expect(mockSupabaseAdmin.update).toHaveBeenCalled()
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"Storing document record",
				expect.any(Object),
			)
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"Document record stored successfully",
				expect.any(Object),
			)
		})

		it("should handle storage failure with proper error logging", async () => {
			const params: StoreDocumentParams = {
				documentId: "doc-123",
				organizationId: "org-456",
				userId: "user-789",
				content: "Test content",
			}

			const mockError = {
				message: "Database connection failed",
				code: "PGRST301",
				details: "Connection timeout",
			}

			mockSupabaseAdmin.eq.mockResolvedValue({ error: mockError })

			await expect(storeDocument(params, mockLogger)).rejects.toThrow(
				"Failed to update document doc-123",
			)

			expect(mockLogger.error).toHaveBeenCalledWith(
				"Failed to store document record",
				expect.any(Error),
				expect.objectContaining({
					documentId: "doc-123",
					organizationId: "org-456",
					errorCode: "PGRST301",
				}),
			)
		})

		it("should handle missing optional fields", async () => {
			const params: StoreDocumentParams = {
				documentId: "doc-123",
				organizationId: "org-456",
				userId: "user-789",
				content: "Minimal content",
			}

			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			await storeDocument(params, mockLogger)

			expect(mockSupabaseAdmin.update).toHaveBeenCalledWith(
				expect.objectContaining({
					content: "Minimal content",
					title: null,
					summary: null,
					tags: null,
					word_count: null,
					preview_image: null,
				}),
			)
		})
	})

	describe("storeChunks", () => {
		it("should store document chunks with embeddings", async () => {
			const chunks: Chunk[] = [
				{
					content: "First chunk content",
					position: 0,
					embedding: [0.1, 0.2, 0.3],
					metadata: { section: "intro" },
				},
				{
					content: "Second chunk content",
					position: 1,
					embedding: [0.4, 0.5, 0.6],
					metadata: { section: "body" },
				},
			]

			const params: StoreChunksParams = {
				documentId: "doc-123",
				organizationId: "org-456",
				chunks,
			}

			mockSupabaseAdmin.insert.mockResolvedValue({ error: null })

			const storedCount = await storeChunks(params, mockLogger)

			expect(storedCount).toBe(2)
			expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("document_chunks")
			expect(mockSupabaseAdmin.insert).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({
						document_id: "doc-123",
						org_id: "org-456",
						content: "First chunk content",
						embedding: [0.1, 0.2, 0.3],
						chunk_index: 0,
						embedding_model: "voyage-3-lite",
					}),
				]),
			)
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"Chunks stored successfully",
				expect.objectContaining({
					documentId: "doc-123",
					chunkCount: 2,
				}),
			)
		})

		it("should handle empty chunks array", async () => {
			const params: StoreChunksParams = {
				documentId: "doc-123",
				organizationId: "org-456",
				chunks: [],
			}

			const storedCount = await storeChunks(params, mockLogger)

			expect(storedCount).toBe(0)
			expect(mockSupabaseAdmin.insert).not.toHaveBeenCalled()
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"No chunks to store",
				expect.any(Object),
			)
		})

		it("should filter out chunks with empty content", async () => {
			const chunks: Chunk[] = [
				{
					content: "Valid chunk",
					position: 0,
					embedding: [0.1, 0.2],
					metadata: {},
				},
				{
					content: "",
					position: 1,
					embedding: [0.3, 0.4],
					metadata: {},
				},
				{
					content: "Another valid chunk",
					position: 2,
					embedding: [0.5, 0.6],
					metadata: {},
				},
			]

			const params: StoreChunksParams = {
				documentId: "doc-123",
				organizationId: "org-456",
				chunks,
			}

			mockSupabaseAdmin.insert.mockResolvedValue({ error: null })

			const storedCount = await storeChunks(params, mockLogger)

			expect(storedCount).toBe(2)
			expect(mockSupabaseAdmin.insert).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({ content: "Valid chunk" }),
					expect.objectContaining({ content: "Another valid chunk" }),
				]),
			)
		})

		it("should handle chunk insertion failure", async () => {
			const chunks: Chunk[] = [
				{
					content: "Test chunk",
					position: 0,
					embedding: [0.1],
					metadata: {},
				},
			]

			const params: StoreChunksParams = {
				documentId: "doc-123",
				organizationId: "org-456",
				chunks,
			}

			const mockError = {
				message: "Constraint violation",
				code: "23505",
				details: "Duplicate key",
			}

			mockSupabaseAdmin.insert.mockResolvedValue({ error: mockError })

			await expect(storeChunks(params, mockLogger)).rejects.toThrow(
				"Failed to insert chunks for document doc-123",
			)

			expect(mockLogger.error).toHaveBeenCalledWith(
				"Failed to store document chunks",
				expect.any(Error),
				expect.objectContaining({
					documentId: "doc-123",
					errorCode: "23505",
				}),
			)
		})

		it("should handle large number of chunks", async () => {
			const chunks: Chunk[] = Array.from({ length: 100 }, (_, i) => ({
				content: `Chunk ${i} with some content`,
				position: i,
				embedding: new Array(1536).fill(0.1),
				metadata: { index: i },
			}))

			const params: StoreChunksParams = {
				documentId: "doc-large",
				organizationId: "org-456",
				chunks,
			}

			mockSupabaseAdmin.insert.mockResolvedValue({ error: null })

			const storedCount = await storeChunks(params, mockLogger)

			expect(storedCount).toBe(100)
			expect(mockSupabaseAdmin.insert).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({ chunk_index: 0 }),
					expect.objectContaining({ chunk_index: 99 }),
				]),
			)
		})
	})

	describe("updateDocumentStatus", () => {
		it("should update document status successfully", async () => {
			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			await updateDocumentStatus("doc-123", "done", undefined, mockLogger)

			expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("documents")
			expect(mockSupabaseAdmin.update).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "done",
				}),
			)
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"Document status updated successfully",
				expect.objectContaining({
					documentId: "doc-123",
					status: "done",
				}),
			)
		})

		it("should update status with extra fields", async () => {
			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			await updateDocumentStatus(
				"doc-123",
				"failed",
				{ error: "Processing failed", chunk_count: 0 },
				mockLogger,
			)

			expect(mockSupabaseAdmin.update).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "failed",
					error: "Processing failed",
					chunk_count: 0,
				}),
			)
		})

		it("should handle status update failure", async () => {
			const mockError = {
				message: "Update failed",
				code: "PGRST116",
				details: "Row not found",
			}

			mockSupabaseAdmin.eq.mockResolvedValue({ error: mockError })

			await expect(
				updateDocumentStatus("doc-123", "done", undefined, mockLogger),
			).rejects.toThrow("Failed to update status for document doc-123")

			expect(mockLogger.error).toHaveBeenCalledWith(
				"Failed to update document status",
				expect.any(Error),
				expect.objectContaining({
					documentId: "doc-123",
					status: "done",
					errorCode: "PGRST116",
				}),
			)
		})
	})

	describe("updateJobStatus", () => {
		it("should update job status successfully", async () => {
			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			await updateJobStatus("job-123", "processing", undefined, mockLogger)

			expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("ingestion_jobs")
			expect(mockSupabaseAdmin.update).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "processing",
					error_message: null,
				}),
			)
		})

		it("should set completed_at when status is completed", async () => {
			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			await updateJobStatus("job-123", "completed", undefined, mockLogger)

			expect(mockSupabaseAdmin.update).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "completed",
					completed_at: expect.any(String),
				}),
			)
		})

		it("should include error message when provided", async () => {
			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			await updateJobStatus(
				"job-123",
				"failed",
				"Processing timeout",
				mockLogger,
			)

			expect(mockSupabaseAdmin.update).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "failed",
					error_message: "Processing timeout",
				}),
			)
		})
	})

	describe("deleteDocumentChunks", () => {
		it("should delete chunks successfully during rollback", async () => {
			mockSupabaseAdmin.eq.mockResolvedValue({ error: null, count: 5 })

			await deleteDocumentChunks("doc-123", mockLogger)

			expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("document_chunks")
			expect(mockSupabaseAdmin.delete).toHaveBeenCalledWith({ count: "exact" })
			expect(mockSupabaseAdmin.eq).toHaveBeenCalledWith(
				"document_id",
				"doc-123",
			)
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"Document chunks deleted successfully",
				expect.objectContaining({
					documentId: "doc-123",
					deletedCount: 5,
				}),
			)
		})

		it("should not throw error on deletion failure (already in error state)", async () => {
			const mockError = {
				message: "Delete failed",
				code: "PGRST116",
				details: "Connection lost",
			}

			mockSupabaseAdmin.eq.mockResolvedValue({ error: mockError })

			// Should not throw
			await deleteDocumentChunks("doc-123", mockLogger)

			expect(mockLogger.error).toHaveBeenCalledWith(
				"Failed to delete document chunks during rollback",
				expect.any(Error),
				expect.objectContaining({
					documentId: "doc-123",
					errorCode: "PGRST116",
				}),
			)
		})
	})

	describe("storeCompleteDocument", () => {
		let mockProcessedDocument: ProcessedDocument
		let mockPreviewResult: PreviewResult

		beforeEach(() => {
			mockProcessedDocument = {
				content: "Full document content with multiple paragraphs",
				summary: "Document summary",
				tags: ["test", "integration", "storage"],
				chunks: [
					{
						content: "First chunk",
						position: 0,
						embedding: [0.1, 0.2, 0.3],
						metadata: {},
					},
					{
						content: "Second chunk",
						position: 1,
						embedding: [0.4, 0.5, 0.6],
						metadata: {},
					},
				],
				metadata: {
					wordCount: 6,
					chunkCount: 2,
				},
			}

			mockPreviewResult = {
				url: "https://example.com/preview.png",
				source: "screenshot",
				type: "image",
				width: 1200,
				height: 630,
			}
		})

		it("should store complete document with transaction-like behavior", async () => {
			mockSupabaseAdmin.insert.mockResolvedValue({ error: null })
			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			await storeCompleteDocument(
				{
					documentId: "doc-123",
					organizationId: "org-456",
					userId: "user-789",
					url: "https://example.com",
					title: "Test Document",
					content: mockProcessedDocument.content,
					processed: mockProcessedDocument,
					preview: mockPreviewResult,
					metadata: { source: "api" },
				},
				mockLogger,
			)

			// Verify all three steps were called
			expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("document_chunks")
			expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("documents")
			expect(mockSupabaseAdmin.insert).toHaveBeenCalled() // Chunks
			expect(mockSupabaseAdmin.update).toHaveBeenCalled() // Document

			expect(mockLogger.info).toHaveBeenCalledWith(
				"Complete document storage successful",
				expect.objectContaining({
					documentId: "doc-123",
					chunkCount: 2,
				}),
			)
		})

		it("should rollback chunks if document update fails", async () => {
			// Chunks insert succeeds
			mockSupabaseAdmin.insert.mockResolvedValue({ error: null })

			// Document update fails (first call)
			// Delete chunks succeeds (second call)
			mockSupabaseAdmin.eq
				.mockResolvedValueOnce({
					error: {
						message: "Document update failed",
						code: "PGRST301",
					},
				})
				.mockResolvedValueOnce({ error: null, count: 2 }) // Delete succeeds
				.mockResolvedValueOnce({ error: null }) // Status update to 'failed' succeeds

			await expect(
				storeCompleteDocument(
					{
						documentId: "doc-123",
						organizationId: "org-456",
						userId: "user-789",
						content: mockProcessedDocument.content,
						processed: mockProcessedDocument,
					},
					mockLogger,
				),
			).rejects.toThrow()

			// Verify rollback was called
			expect(mockLogger.warn).toHaveBeenCalledWith(
				"Rolling back: Deleting stored chunks",
				expect.objectContaining({
					documentId: "doc-123",
					chunkCount: 2,
				}),
			)

			// Verify delete was attempted
			expect(mockSupabaseAdmin.delete).toHaveBeenCalled()

			// Verify status was updated to failed
			expect(mockLogger.debug).toHaveBeenCalledWith(
				"Updating document status to failed",
				expect.any(Object),
			)
		})

		it("should handle document with no chunks", async () => {
			const processedWithNoChunks: ProcessedDocument = {
				...mockProcessedDocument,
				chunks: [],
			}

			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			await storeCompleteDocument(
				{
					documentId: "doc-empty",
					organizationId: "org-456",
					userId: "user-789",
					content: "Short content",
					processed: processedWithNoChunks,
				},
				mockLogger,
			)

			// Chunks shouldn't be inserted
			expect(mockSupabaseAdmin.insert).not.toHaveBeenCalled()

			// Document should still be updated
			expect(mockSupabaseAdmin.update).toHaveBeenCalled()

			expect(mockLogger.info).toHaveBeenCalledWith(
				"Complete document storage successful",
				expect.objectContaining({
					documentId: "doc-empty",
					chunkCount: 0,
				}),
			)
		})

		it("should handle large document with many chunks", async () => {
			const largeProcessed: ProcessedDocument = {
				...mockProcessedDocument,
				chunks: Array.from({ length: 200 }, (_, i) => ({
					content: `Chunk ${i} content with substantial text`,
					position: i,
					embedding: new Array(1536).fill(0.1),
					metadata: { index: i },
				})),
			}

			mockSupabaseAdmin.insert.mockResolvedValue({ error: null })
			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			await storeCompleteDocument(
				{
					documentId: "doc-large",
					organizationId: "org-456",
					userId: "user-789",
					content: "Large document content",
					processed: largeProcessed,
				},
				mockLogger,
			)

			expect(mockSupabaseAdmin.insert).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({ chunk_index: 0 }),
					expect.objectContaining({ chunk_index: 199 }),
				]),
			)

			expect(mockLogger.info).toHaveBeenCalledWith(
				"Complete document storage successful",
				expect.objectContaining({
					documentId: "doc-large",
					chunkCount: 200,
				}),
			)
		})

		it("should handle status update failure during rollback gracefully", async () => {
			// Chunks succeed
			mockSupabaseAdmin.insert.mockResolvedValue({ error: null })

			// Document update fails, delete succeeds, status update also fails
			mockSupabaseAdmin.eq
				.mockResolvedValueOnce({
					error: { message: "Document update failed", code: "PGRST301" },
				})
				.mockResolvedValueOnce({ error: null, count: 2 }) // Delete succeeds
				.mockResolvedValueOnce({
					error: { message: "Status update failed", code: "PGRST116" },
				})

			await expect(
				storeCompleteDocument(
					{
						documentId: "doc-123",
						organizationId: "org-456",
						userId: "user-789",
						content: mockProcessedDocument.content,
						processed: mockProcessedDocument,
					},
					mockLogger,
				),
			).rejects.toThrow()

			// Should log the status update failure but not throw
			expect(mockLogger.error).toHaveBeenCalledWith(
				"Failed to update document status during rollback",
				expect.any(Error),
				expect.objectContaining({
					documentId: "doc-123",
					originalError: expect.any(String),
				}),
			)
		})

		it("should include preview data when provided", async () => {
			mockSupabaseAdmin.insert.mockResolvedValue({ error: null })
			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			await storeCompleteDocument(
				{
					documentId: "doc-123",
					organizationId: "org-456",
					userId: "user-789",
					content: mockProcessedDocument.content,
					processed: mockProcessedDocument,
					preview: mockPreviewResult,
				},
				mockLogger,
			)

			expect(mockSupabaseAdmin.update).toHaveBeenCalledWith(
				expect.objectContaining({
					preview_image: "https://example.com/preview.png",
				}),
			)
		})

		it("should handle null/undefined preview gracefully", async () => {
			mockSupabaseAdmin.insert.mockResolvedValue({ error: null })
			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			await storeCompleteDocument(
				{
					documentId: "doc-123",
					organizationId: "org-456",
					userId: "user-789",
					content: mockProcessedDocument.content,
					processed: mockProcessedDocument,
					preview: null,
				},
				mockLogger,
			)

			expect(mockSupabaseAdmin.update).toHaveBeenCalledWith(
				expect.objectContaining({
					preview_image: null,
				}),
			)
		})
	})

	describe("Error Recovery Scenarios", () => {
		it("should handle concurrent storage operations", async () => {
			mockSupabaseAdmin.insert.mockResolvedValue({ error: null })
			mockSupabaseAdmin.eq.mockResolvedValue({ error: null })

			const operations = Array.from({ length: 5 }, (_, i) => {
				const processed: ProcessedDocument = {
					content: `Document ${i}`,
					summary: `Summary ${i}`,
					tags: [`tag${i}`],
					chunks: [
						{
							content: `Chunk for doc ${i}`,
							position: 0,
							embedding: [0.1 * i],
							metadata: {},
						},
					],
					metadata: {},
				}

				return storeCompleteDocument(
					{
						documentId: `doc-${i}`,
						organizationId: "org-456",
						userId: "user-789",
						content: processed.content,
						processed,
					},
					mockLogger,
				)
			})

			await expect(Promise.all(operations)).resolves.toBeDefined()
		})

		it("should preserve original error during rollback", async () => {
			mockSupabaseAdmin.insert.mockResolvedValue({ error: null })

			const originalError = new Error("Original processing error")
			mockSupabaseAdmin.eq.mockRejectedValue(originalError)

			await expect(
				storeCompleteDocument(
					{
						documentId: "doc-123",
						organizationId: "org-456",
						userId: "user-789",
						content: "Test",
						processed: {
							content: "Test",
							summary: "Summary",
							tags: [],
							chunks: [
								{
									content: "Chunk",
									position: 0,
									embedding: [0.1],
									metadata: {},
								},
							],
							metadata: {},
						},
					},
					mockLogger,
				),
			).rejects.toThrow("Original processing error")
		})
	})
})
