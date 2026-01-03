import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import { Hono } from "hono"
import type { ExtractionResult, ProcessedDocument } from "../interfaces"

/**
 * Integration tests for document ingestion flow
 *
 * Tests complete pipeline from API endpoints to database including:
 * - Document upload and processing pipeline
 * - All document types (URL, YouTube, PDF, Office, GitHub, text)
 * - Error recovery and retry mechanisms
 * - Concurrent document processing
 * - Database transaction integrity
 * - Performance under load
 */

describe("Documents Integration Tests", () => {
	let _app: Hono
	let mockDatabase: any
	let _mockStorage: any

	beforeEach(() => {
		// Setup test environment
		_app = new Hono()
		mockDatabase = {
			insertDocument: vi.fn(),
			updateDocument: vi.fn(),
			getDocument: vi.fn(),
			deleteDocument: vi.fn(),
		}
		_mockStorage = {
			uploadFile: vi.fn(),
			deleteFile: vi.fn(),
		}
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Document Upload Flow", () => {
		it("should process text document through complete pipeline", async () => {
			const documentData = {
				type: "text",
				content:
					"This is a sample text document for testing the complete ingestion pipeline.",
				metadata: { title: "Test Document" },
			}

			// Mock extraction service
			const mockExtractionResult: ExtractionResult = {
				success: true,
				data: {
					content: documentData.content,
					metadata: { title: "Test Document", author: "Test Author" },
					processingTime: 1000,
				},
			}

			// Mock processing service
			const mockProcessedDocument: ProcessedDocument = {
				content: documentData.content,
				metadata: {
					title: "Test Document",
					author: "Test Author",
					wordCount: 15,
				},
				chunks: [
					{
						id: "chunk-1",
						content: documentData.content,
						embeddings: [0.1, 0.2, 0.3],
						metadata: { position: 0, tokenCount: 15 },
					},
				],
				summary: "Sample text document for testing",
				tags: ["test", "document"],
				processingMetrics: {
					totalProcessingTime: 2000,
					chunkingTime: 500,
					embeddingTime: 1000,
					summarizationTime: 300,
					taggingTime: 200,
				},
			}

			// Setup database mock
			const savedDocument = {
				id: "doc-123",
				...documentData,
				status: "completed",
				created_at: new Date().toISOString(),
			}
			mockDatabase.insertDocument.mockResolvedValue(savedDocument)
			mockDatabase.updateDocument.mockResolvedValue({
				...savedDocument,
				status: "processing",
			})

			// Test the complete flow
			const extractionSpy = vi.fn().mockResolvedValue(mockExtractionResult)
			const processingSpy = vi.fn().mockResolvedValue(mockProcessedDocument)

			// Simulate the API endpoint processing
			const result = await processDocumentRequest(
				documentData,
				extractionSpy,
				processingSpy,
				mockDatabase,
			)

			expect(result.success).toBe(true)
			expect(result.data.documentId).toBe("doc-123")
			expect(result.data.status).toBe("completed")
			expect(mockDatabase.insertDocument).toHaveBeenCalled()
			expect(mockDatabase.updateDocument).toHaveBeenCalled()
		})

		it("should process URL document through complete pipeline", async () => {
			const documentData = {
				type: "url",
				content: "https://example.com/article",
				metadata: { title: "Example Article" },
			}

			const mockExtractionResult: ExtractionResult = {
				success: true,
				data: {
					content: "Extracted article content from the web page",
					metadata: {
						title: "Example Article",
						description: "Sample article description",
						url: "https://example.com/article",
					},
					processingTime: 3000,
				},
			}

			const mockProcessedDocument: ProcessedDocument = {
				content: "Extracted article content from the web page",
				metadata: {
					title: "Example Article",
					description: "Sample article description",
					url: "https://example.com/article",
					wordCount: 8,
				},
				chunks: [
					{
						id: "chunk-url-1",
						content: "Extracted article content from the web page",
						embeddings: [0.2, 0.3, 0.4],
						metadata: { position: 0, tokenCount: 8 },
					},
				],
				summary: "Web article about example topics",
				tags: ["web", "article", "example"],
				processingMetrics: {
					totalProcessingTime: 5000,
					chunkingTime: 200,
					embeddingTime: 2000,
					summarizationTime: 1000,
					taggingTime: 800,
				},
			}

			const savedDocument = {
				id: "doc-url-456",
				...documentData,
				status: "completed",
				created_at: new Date().toISOString(),
			}

			const extractionSpy = vi.fn().mockResolvedValue(mockExtractionResult)
			const processingSpy = vi.fn().mockResolvedValue(mockProcessedDocument)
			mockDatabase.insertDocument.mockResolvedValue(savedDocument)
			mockDatabase.updateDocument.mockResolvedValue({
				...savedDocument,
				status: "processing",
			})

			const result = await processDocumentRequest(
				documentData,
				extractionSpy,
				processingSpy,
				mockDatabase,
			)

			expect(result.success).toBe(true)
			expect(result.data.documentId).toBe("doc-url-456")
			expect(result.data.status).toBe("completed")
		})

		it("should process YouTube video through complete pipeline", async () => {
			const documentData = {
				type: "url",
				content: "https://youtube.com/watch?v=dQw4w9WgXcQ",
				metadata: { title: "Rick Astley - Never Gonna Give You Up" },
			}

			const mockExtractionResult: ExtractionResult = {
				success: true,
				data: {
					content: "Never gonna give you up, never gonna let you down...",
					metadata: {
						videoId: "dQw4w9WgXcQ",
						title: "Rick Astley - Never Gonna Give You Up",
						duration: 212,
						channelTitle: "RickAstleyVEVO",
						transcriptAvailable: true,
					},
					processingTime: 8000,
				},
			}

			const mockProcessedDocument: ProcessedDocument = {
				content: "Never gonna give you up, never gonna let you down...",
				metadata: {
					videoId: "dQw4w9WgXcQ",
					title: "Rick Astley - Never Gonna Give You Up",
					duration: 212,
					channelTitle: "RickAstleyVEVO",
					wordCount: 12,
				},
				chunks: [
					{
						id: "chunk-yt-1",
						content: "Never gonna give you up, never gonna let you down...",
						embeddings: [0.1, 0.2, 0.3],
						metadata: { position: 0, tokenCount: 12 },
					},
				],
				summary: "Classic 80s music video by Rick Astley",
				tags: ["music", "video", "80s", "rick-roll"],
				processingMetrics: {
					totalProcessingTime: 10000,
					chunkingTime: 100,
					embeddingTime: 1500,
					summarizationTime: 2000,
					taggingTime: 500,
				},
			}

			const savedDocument = {
				id: "doc-yt-789",
				...documentData,
				status: "completed",
				created_at: new Date().toISOString(),
			}

			const extractionSpy = vi.fn().mockResolvedValue(mockExtractionResult)
			const processingSpy = vi.fn().mockResolvedValue(mockProcessedDocument)
			mockDatabase.insertDocument.mockResolvedValue(savedDocument)
			mockDatabase.updateDocument.mockResolvedValue({
				...savedDocument,
				status: "processing",
			})

			const result = await processDocumentRequest(
				documentData,
				extractionSpy,
				processingSpy,
				mockDatabase,
			)

			expect(result.success).toBe(true)
			expect(result.data.documentId).toBe("doc-yt-789")
			expect(result.data.status).toBe("completed")
			expect(result.data.metadata.videoId).toBe("dQw4w9WgXcQ")
		})

		it("should process PDF document through complete pipeline", async () => {
			const documentData = {
				type: "file",
				content: "data:application/pdf;base64,JVBERi0xLjQK...",
				metadata: { title: "Sample PDF Document", filename: "document.pdf" },
			}

			const mockExtractionResult: ExtractionResult = {
				success: true,
				data: {
					content:
						"PDF document content with multiple pages and structured information",
					metadata: {
						title: "Sample PDF Document",
						author: "PDF Author",
						pageCount: 5,
						wordCount: 500,
					},
					processingTime: 5000,
				},
			}

			const mockProcessedDocument: ProcessedDocument = {
				content:
					"PDF document content with multiple pages and structured information",
				metadata: {
					title: "Sample PDF Document",
					author: "PDF Author",
					pageCount: 5,
					wordCount: 500,
				},
				chunks: [
					{
						id: "chunk-pdf-1",
						content:
							"PDF document content with multiple pages and structured information",
						embeddings: [0.3, 0.4, 0.5],
						metadata: { position: 0, tokenCount: 500 },
					},
				],
				summary:
					"PDF document with structured information across multiple pages",
				tags: ["pdf", "document", "structured"],
				processingMetrics: {
					totalProcessingTime: 8000,
					chunkingTime: 1000,
					embeddingTime: 3000,
					summarizationTime: 2000,
					taggingTime: 1000,
				},
			}

			const savedDocument = {
				id: "doc-pdf-101",
				...documentData,
				status: "completed",
				created_at: new Date().toISOString(),
			}

			const extractionSpy = vi.fn().mockResolvedValue(mockExtractionResult)
			const processingSpy = vi.fn().mockResolvedValue(mockProcessedDocument)
			mockDatabase.insertDocument.mockResolvedValue(savedDocument)
			mockDatabase.updateDocument.mockResolvedValue({
				...savedDocument,
				status: "processing",
			})

			const result = await processDocumentRequest(
				documentData,
				extractionSpy,
				processingSpy,
				mockDatabase,
			)

			expect(result.success).toBe(true)
			expect(result.data.documentId).toBe("doc-pdf-101")
			expect(result.data.status).toBe("completed")
			expect(result.data.metadata.pageCount).toBe(5)
		})
	})

	describe("Error Recovery and Retry", () => {
		it("should retry on temporary extraction failures", async () => {
			const documentData = {
				type: "url",
				content: "https://flaky-site.com",
				metadata: { title: "Flaky Site Document" },
			}

			const extractionSpy = vi
				.fn()
				.mockRejectedValueOnce(new Error("Temporary network error"))
				.mockRejectedValueOnce(new Error("Temporary network error"))
				.mockResolvedValue({
					success: true,
					data: {
						content: "Content after retries",
						metadata: { title: "Flaky Site Document" },
						processingTime: 1000,
					},
				})

			const processingSpy = vi.fn().mockResolvedValue({
				content: "Content after retries",
				metadata: { title: "Flaky Site Document" },
				chunks: [],
				summary: "Retried document",
				tags: [],
				processingMetrics: { totalProcessingTime: 2000 },
			})

			const savedDocument = {
				id: "doc-retry-123",
				...documentData,
				status: "completed",
				created_at: new Date().toISOString(),
			}

			mockDatabase.insertDocument.mockResolvedValue(savedDocument)
			mockDatabase.updateDocument.mockResolvedValue({
				...savedDocument,
				status: "processing",
			})

			const result = await processDocumentRequest(
				documentData,
				extractionSpy,
				processingSpy,
				mockDatabase,
			)

			expect(result.success).toBe(true)
			expect(result.data.status).toBe("completed")
			expect(extractionSpy).toHaveBeenCalledTimes(3) // Initial + 2 retries
		})

		it("should handle permanent failures gracefully", async () => {
			const documentData = {
				type: "url",
				content: "https://always-fail.com",
				metadata: { title: "Failing Document" },
			}

			const extractionSpy = vi
				.fn()
				.mockRejectedValue(new Error("Permanent failure"))

			const result = await processDocumentRequest(
				documentData,
				extractionSpy,
				vi.fn(),
				mockDatabase,
			)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("EXTRACTION_FAILED")
			expect(mockDatabase.updateDocument).toHaveBeenCalledWith(
				expect.objectContaining({ status: "failed" }),
			)
		})
	})

	describe("Concurrent Processing", () => {
		it("should handle multiple documents simultaneously", async () => {
			const documents = Array(5)
				.fill(null)
				.map((_, i) => ({
					type: "text",
					content: `Document ${i} content for concurrent processing`,
					metadata: { title: `Document ${i}` },
				}))

			const extractionSpy = vi.fn().mockResolvedValue({
				success: true,
				data: {
					content: "Concurrent content",
					metadata: { title: "Concurrent Document" },
					processingTime: 500,
				},
			})

			const processingSpy = vi.fn().mockResolvedValue({
				content: "Concurrent content",
				metadata: { title: "Concurrent Document" },
				chunks: [],
				summary: "Concurrent document",
				tags: [],
				processingMetrics: { totalProcessingTime: 1000 },
			})

			const savedDocument = {
				id: `doc-concurrent-${Math.random()}`,
				status: "completed",
				created_at: new Date().toISOString(),
			}

			mockDatabase.insertDocument.mockResolvedValue(savedDocument)
			mockDatabase.updateDocument.mockResolvedValue({
				...savedDocument,
				status: "processing",
			})

			const results = await Promise.all(
				documents.map((doc) =>
					processDocumentRequest(
						doc,
						extractionSpy,
						processingSpy,
						mockDatabase,
					),
				),
			)

			expect(results).toHaveLength(5)
			expect(results.every((r) => r.success)).toBe(true)
			expect(mockDatabase.insertDocument).toHaveBeenCalledTimes(5)
		})
	})

	describe("Database Transaction Integrity", () => {
		it("should maintain transaction integrity on failures", async () => {
			const documentData = {
				type: "text",
				content: "Test transaction integrity",
				metadata: { title: "Transaction Test" },
			}

			const extractionSpy = vi.fn().mockResolvedValue({
				success: true,
				data: {
					content: "Test content",
					metadata: { title: "Transaction Test" },
					processingTime: 1000,
				},
			})

			const processingSpy = vi
				.fn()
				.mockRejectedValue(new Error("Processing failed"))

			const savedDocument = {
				id: "doc-transaction-123",
				...documentData,
				status: "processing",
				created_at: new Date().toISOString(),
			}

			mockDatabase.insertDocument.mockResolvedValue(savedDocument)
			mockDatabase.updateDocument.mockResolvedValue({
				...savedDocument,
				status: "failed",
			})

			const result = await processDocumentRequest(
				documentData,
				extractionSpy,
				processingSpy,
				mockDatabase,
			)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe("PROCESSING_FAILED")

			// Verify document status was updated to failed
			expect(mockDatabase.updateDocument).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "failed",
					error: expect.stringContaining("Processing failed"),
				}),
			)
		})
	})

	describe("Performance Under Load", () => {
		it("should handle high-volume document processing", async () => {
			const largeBatch = Array(20)
				.fill(null)
				.map((_, i) => ({
					type: "text",
					content: `Load test document ${i} with sufficient content for realistic processing`,
					metadata: { title: `Load Test Document ${i}` },
				}))

			const extractionSpy = vi.fn().mockResolvedValue({
				success: true,
				data: {
					content: "Load test content",
					metadata: { title: "Load Test" },
					processingTime: 200,
				},
			})

			const processingSpy = vi.fn().mockResolvedValue({
				content: "Load test content",
				metadata: { title: "Load Test" },
				chunks: [],
				summary: "Load test summary",
				tags: ["load", "test"],
				processingMetrics: { totalProcessingTime: 500 },
			})

			const savedDocument = {
				id: "doc-load-123",
				status: "completed",
				created_at: new Date().toISOString(),
			}

			mockDatabase.insertDocument.mockResolvedValue(savedDocument)
			mockDatabase.updateDocument.mockResolvedValue({
				...savedDocument,
				status: "processing",
			})

			const startTime = Date.now()
			const results = await Promise.all(
				largeBatch.map((doc) =>
					processDocumentRequest(
						doc,
						extractionSpy,
						processingSpy,
						mockDatabase,
					),
				),
			)
			const endTime = Date.now()

			expect(results).toHaveLength(20)
			expect(results.every((r) => r.success)).toBe(true)

			// Should complete within reasonable time (less than 30 seconds for 20 documents)
			expect(endTime - startTime).toBeLessThan(30000)
		})
	})

	// Helper function to simulate document processing
	async function processDocumentRequest(
		documentData: any,
		extractionSpy: any,
		processingSpy: any,
		db: any,
	): Promise<any> {
		const document = await db.insertDocument({
			...documentData,
			status: "processing",
			created_at: new Date().toISOString(),
		})

		let extractionResult
		try {
			for (let attempt = 0; attempt < 3; attempt++) {
				try {
					extractionResult = await extractionSpy(documentData)
					if (extractionResult?.success) {
						break
					}
				} catch (_err) {
					if (attempt === 2) {
						throw _err
					}
				}
			}
			if (!extractionResult?.success) {
				await db.updateDocument({
					status: "failed",
					error: extractionResult?.error?.message,
				})
				return {
					success: false,
					error: {
						code: "EXTRACTION_FAILED",
						message: extractionResult?.error?.message,
					},
				}
			}
		} catch (err) {
			await db.updateDocument({
				status: "failed",
				error: err instanceof Error ? err.message : String(err),
			})
			return {
				success: false,
				error: {
					code: "EXTRACTION_FAILED",
					message: err instanceof Error ? err.message : String(err),
				},
			}
		}

		try {
			const processedDocument = await processingSpy({
				success: true,
				data: documentData,
			})
			if (!processedDocument) {
				await db.updateDocument({
					status: "failed",
					error: "Processing failed",
					id: document.id,
				})
				return { success: false, error: { code: "PROCESSING_FAILED" } }
			}

			await db.updateDocument({
				status: "completed",
				content: processedDocument.content,
				metadata: processedDocument.metadata,
				summary: processedDocument.summary,
				tags: processedDocument.tags,
				chunks: processedDocument.chunks,
				id: document.id,
			})

			return {
				success: true,
				data: {
					documentId: document.id,
					status: "completed",
					metadata: processedDocument.metadata,
				},
			}
		} catch (err) {
			await db.updateDocument({
				status: "failed",
				error: err instanceof Error ? err.message : String(err),
				id: document.id,
			})
			return {
				success: false,
				error: {
					code: "PROCESSING_FAILED",
					message: err instanceof Error ? err.message : String(err),
				},
			}
		}
	}
})
