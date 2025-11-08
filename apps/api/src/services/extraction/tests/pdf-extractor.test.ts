import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import { PDFExtractor, createPDFExtractor } from '../pdf-extractor'
import type {
	ExtractionInput,
	ExtractionResult,
	PDFOptions,
	PDFMetadata,
	ProcessingError,
} from '../../interfaces'

/**
 * Unit tests for PDFExtractor
 *
 * Tests PDF document processing including:
 * - PDF file validation and parsing
 * - Text extraction from digital PDFs
 * - OCR processing for scanned PDFs
 * - Metadata extraction (title, author, pages, etc.)
 * - Image and table extraction
 * - Error handling for various PDF issues
 * - Performance optimization for large documents
 */

describe("PDFExtractor", () => {
	let extractor: PDFExtractor
	let mockOptions: PDFOptions

	beforeEach(() => {
		mockOptions = {
			includeImages: true,
			includeTables: true,
			includeMetadata: true,
			enableOCR: true,
			ocrOptions: {
				language: 'eng',
				timeoutMs: 30000,
				maxRetries: 3,
			},
			pageRange: 'all',
			textExtractionOptions: {
				preserveFormatting: true,
				includeHeaders: true,
				includeFooters: false,
			},
		}

		extractor = new PDFExtractor(mockOptions)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("Extractor Interface", () => {
		it("should implement DocumentExtractor interface", () => {
			expect(extractor).toHaveProperty('canHandle')
			expect(extractor).toHaveProperty('extract')
			expect(extractor).toHaveProperty('getSupportedTypes')
		})

		it("should support PDF content type", () => {
			const supportedTypes = extractor.getSupportedTypes()
			expect(supportedTypes).toContain('pdf')
		})

		it("should be able to handle PDF file inputs", () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'document.pdf' },
			}

			const canHandle = extractor.canHandle(fileInput)
			expect(canHandle).toBe(true)
		})

		it("should not handle non-PDF inputs", () => {
			const nonPdfInputs = [
				{ type: 'file', content: 'data:text/plain;base64,SGVsbG8=', options: { filename: 'text.txt' } },
				{ type: 'url', content: 'https://example.com', options: {} },
			]

			nonPdfInputs.forEach((input) => {
				const canHandle = extractor.canHandle(input)
				expect(canHandle).toBe(false)
			})
		})
	})

	describe("PDF File Validation", () => {
		it("should validate PDF file signatures", () => {
			const validPdfBase64 = 'JVBERi0xLjQK' // PDF header
			const fileInput: ExtractionInput = {
				type: 'file',
				content: `data:application/pdf;base64,${validPdfBase64}`,
				options: { filename: 'document.pdf' },
			}

			const canHandle = extractor.canHandle(fileInput)
			expect(canHandle).toBe(true)
		})

		it("should reject files with invalid PDF signatures", () => {
			const invalidFileInput: ExtractionInput = {
				type: 'file',
				content: 'data:text/plain;base64,SGVsbG8gV29ybGQ=',
				options: { filename: 'document.txt' },
			}

			const canHandle = extractor.canHandle(invalidFileInput)
			expect(canHandle).toBe(false)
		})

		it("should detect PDF files by MIME type", () => {
			const mimeTypeInputs = [
				{ type: 'file', content: 'pdf content', options: { filename: 'doc.pdf', mimeType: 'application/pdf' } },
				{ type: 'file', content: 'pdf content', options: { filename: 'doc.pdf' } },
			]

			mimeTypeInputs.forEach((input) => {
				const canHandle = extractor.canHandle(input)
				expect(canHandle).toBe(true)
			})
		})

		it("should handle file inputs without explicit PDF extension", () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'PDF content here',
				options: { mimeType: 'application/pdf' },
			}

			const canHandle = extractor.canHandle(fileInput)
			expect(canHandle).toBe(true)
		})
	})

	describe("Text Extraction from Digital PDFs", () => {
		it("should extract text from standard digital PDF", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'digital.pdf' },
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'This is the extracted text from a digital PDF document.\n\nIt contains multiple paragraphs and properly formatted content.',
					metadata: {
						pageCount: 3,
						title: 'Digital PDF Document',
						author: 'John Doe',
					},
					processingTime: 1500,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractTextFromPDF')
			extractSpy.mockResolvedValue({
				text: mockResult.data!.content,
				metadata: mockResult.data!.metadata,
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('digital PDF document')
			expect(result.data?.metadata.pageCount).toBe(3)
		})

		it("should preserve paragraph structure", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'structured.pdf' },
			}

			const structuredText = 'First paragraph\n\nSecond paragraph\n\nThird paragraph with\nmultiple lines'
			
			const extractSpy = vi.spyOn(extractor as any, 'extractTextFromPDF')
			extractSpy.mockResolvedValue({
				text: structuredText,
				metadata: { pageCount: 1 },
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('First paragraph')
			expect(result.data?.content).toContain('Second paragraph')
		})

		it("should handle PDFs with text in multiple columns", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'columns.pdf' },
			}

			const multiColumnText = 'Left column text\nRight column text\n\nMore left column\nMore right column'
			
			const extractSpy = vi.spyOn(extractor as any, 'extractTextFromPDF')
			extractSpy.mockResolvedValue({
				text: multiColumnText,
				metadata: { pageCount: 1 },
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			// Should handle multi-column text appropriately
		})

		it("should extract text from password-protected PDFs", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'protected.pdf', password: 'secret123' },
			}

			const error: ProcessingError = {
				code: 'PDF_PASSWORD_PROTECTED',
				message: 'PDF is password protected',
				details: { requiresPassword: true },
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractTextFromPDF')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('PDF_PASSWORD_PROTECTED')
		})
	})

	describe("OCR Processing for Scanned PDFs", () => {
		it("should detect scanned PDFs that need OCR", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'scanned.pdf' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'isScannedPDF')
			extractSpy.mockReturnValue(true)

			const ocrSpy = vi.spyOn(extractor as any, 'performOCR')
			ocrSpy.mockResolvedValue({
				text: 'OCR extracted text from scanned PDF',
				confidence: 0.92,
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(ocrSpy).toHaveBeenCalled()
		})

		it("should perform OCR with specified language", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { 
					filename: 'spanish.pdf',
					ocrOptions: { language: 'spa' }
				},
			}

			const ocrSpy = vi.spyOn(extractor as any, 'performOCR')
			ocrSpy.mockResolvedValue({
				text: 'Texto extraído del PDF escaneado en español',
				confidence: 0.89,
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('español')
			expect(ocrSpy).toHaveBeenCalledWith(
				expect.objectContaining({ language: 'spa' })
			)
		})

		it("should handle OCR failures gracefully", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'ocr-fail.pdf' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'isScannedPDF')
			extractSpy.mockReturnValue(true)

			const ocrSpy = vi.spyOn(extractor as any, 'performOCR')
			ocrSpy.mockRejectedValue(new Error('OCR processing failed'))

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('OCR_FAILED')
		})

		it("should retry OCR on temporary failures", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'retry.pdf' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'isScannedPDF')
			extractSpy.mockReturnValue(true)

			const ocrSpy = vi.spyOn(extractor as any, 'performOCR')
			// Fail twice, succeed on third attempt
			ocrSpy
				.mockRejectedValueOnce(new Error('Temporary OCR error'))
				.mockRejectedValueOnce(new Error('Temporary OCR error'))
				.mockResolvedValue({
					text: 'OCR text after retries',
					confidence: 0.87,
				})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(ocrSpy).toHaveBeenCalledTimes(3)
		})
	})

	describe("Metadata Extraction", () => {
		it("should extract standard PDF metadata", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'metadata.pdf' },
			}

			const mockMetadata: PDFMetadata = {
				title: 'Sample Document Title',
				author: 'Jane Smith',
				subject: 'Sample Subject',
				keywords: 'keyword1, keyword2, keyword3',
				creator: 'Microsoft Word',
				producer: 'Acrobat PDFMaker',
				creationDate: '2023-01-15T10:30:00Z',
				modificationDate: '2023-01-16T14:22:00Z',
				pageCount: 15,
				pageCountPhysical: 15,
				pageSize: [612, 792], // 8.5x11 inches in points
				pageOrientation: 'portrait',
				language: 'en-US',
				bookmarks: [
					{ title: 'Chapter 1', page: 1, level: 1 },
					{ title: 'Section 1.1', page: 3, level: 2 },
				],
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractMetadata')
			extractSpy.mockResolvedValue(mockMetadata)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.title).toBe('Sample Document Title')
			expect(result.data?.metadata.author).toBe('Jane Smith')
			expect(result.data?.metadata.pageCount).toBe(15)
			expect(result.data?.metadata.creationDate).toBe('2023-01-15T10:30:00Z')
		})

		it("should handle PDFs with missing metadata", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'no-metadata.pdf' },
			}

			const minimalMetadata: Partial<PDFMetadata> = {
				pageCount: 1,
				pageSize: [612, 792],
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractMetadata')
			extractSpy.mockResolvedValue(minimalMetadata)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.title).toBeUndefined()
			expect(result.data?.metadata.author).toBeUndefined()
		})

		it("should extract page-level metadata", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'page-metadata.pdf' },
			}

			const mockMetadata: PDFMetadata = {
				pageCount: 3,
				pages: [
					{ number: 1, size: [612, 792], rotation: 0, text: 'Page 1 content' },
					{ number: 2, size: [612, 792], rotation: 0, text: 'Page 2 content' },
					{ number: 3, size: [612, 792], rotation: 0, text: 'Page 3 content' },
				],
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractMetadata')
			extractSpy.mockResolvedValue(mockMetadata)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.pages).toHaveLength(3)
		})
	})

	describe("Image Extraction", () => {
		it("should extract images from PDF", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'with-images.pdf' },
			}

			const mockImages = [
				{
					id: 'image1',
					page: 1,
					x: 100,
					y: 200,
					width: 300,
					height: 200,
					format: 'PNG',
					data: 'base64image1data',
				},
				{
					id: 'image2',
					page: 2,
					x: 50,
					y: 100,
					width: 400,
					height: 300,
					format: 'JPEG',
					data: 'base64image2data',
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'extractImages')
			extractSpy.mockResolvedValue(mockImages)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.images).toHaveLength(2)
			expect(result.data?.images![0].format).toBe('PNG')
			expect(result.data?.images![1].format).toBe('JPEG')
		})

		it("should handle PDFs with no images", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'text-only.pdf' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractImages')
			extractSpy.mockResolvedValue([])

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.images).toHaveLength(0)
		})

		it("should respect image extraction options", () => {
			const options: PDFOptions = {
				...mockOptions,
				includeImages: false,
			}

			const customExtractor = new PDFExtractor(options)
			// Should not extract images when disabled
		})
	})

	describe("Table Extraction", () => {
		it("should extract tables from PDF", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'with-tables.pdf' },
			}

			const mockTables = [
				{
					id: 'table1',
					page: 1,
					rows: 3,
					columns: 4,
					data: [
						['Header 1', 'Header 2', 'Header 3', 'Header 4'],
						['Cell 1', 'Cell 2', 'Cell 3', 'Cell 4'],
						['Data 1', 'Data 2', 'Data 3', 'Data 4'],
					],
					bbox: { x: 50, y: 100, width: 400, height: 200 },
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'extractTables')
			extractSpy.mockResolvedValue(mockTables)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.tables).toHaveLength(1)
			expect(result.data?.tables![0].rows).toBe(3)
			expect(result.data?.tables![0].columns).toBe(4)
		})

		it("should handle complex tables with merged cells", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'complex-tables.pdf' },
			}

			const complexTable = {
				id: 'complex1',
				page: 1,
				rows: 2,
				columns: 3,
				data: [
					['Spanning Cell', '', 'Normal Cell'],
					['Cell 1', 'Cell 2', 'Cell 3'],
				],
				mergedCells: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 1 }],
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractTables')
			extractSpy.mockResolvedValue([complexTable])

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.tables![0].mergedCells).toHaveLength(1)
		})
	})

	describe("Page Range Processing", () => {
		it("should process specific page ranges", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { 
					filename: 'multi-page.pdf',
					pageRange: '2-4'
				},
			}

			const pageRangeSpy = vi.spyOn(extractor as any, 'processPageRange')
			pageRangeSpy.mockResolvedValue({
				text: 'Content from pages 2-4',
				metadata: { pageCount: 3, processedPages: [2, 3, 4] },
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.pageCount).toBe(3)
			expect(pageRangeSpy).toHaveBeenCalledWith('2-4')
		})

		it("should handle single page extraction", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { 
					filename: 'single-page.pdf',
					pageRange: '1'
				},
			}

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
		})

		it("should handle invalid page ranges gracefully", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { 
					filename: 'invalid-range.pdf',
					pageRange: '10-5' // Invalid range
				},
			}

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('INVALID_PAGE_RANGE')
		})
	})

	describe("Error Handling", () => {
		it("should handle corrupted PDF files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,corrupted-data',
				options: { filename: 'corrupted.pdf' },
			}

			const error: ProcessingError = {
				code: 'PDF_CORRUPTED',
				message: 'PDF file is corrupted or invalid',
				details: { fileSize: 1024 },
			}

			const extractSpy = vi.spyOn(extractor as any, 'parsePDF')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('PDF_CORRUPTED')
		})

		it("should handle oversized PDF files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,' + 'x'.repeat(100 * 1024 * 1024), // 100MB
				options: { filename: 'huge.pdf' },
			}

			const error: ProcessingError = {
				code: 'PDF_TOO_LARGE',
				message: 'PDF file exceeds maximum size limit',
				details: { size: 100 * 1024 * 1024, maxSize: 50 * 1024 * 1024 },
			}

			const extractSpy = vi.spyOn(extractor as any, 'parsePDF')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('PDF_TOO_LARGE')
		})

		it("should handle encrypted PDFs without password", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'encrypted.pdf' },
			}

			const error: ProcessingError = {
				code: 'PDF_ENCRYPTED',
				message: 'PDF is encrypted and requires password',
				details: { encryptionType: 'user' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'parsePDF')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('PDF_ENCRYPTED')
		})

		it("should handle OCR timeouts", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { 
					filename: 'slow-ocr.pdf',
					ocrOptions: { timeoutMs: 1000 }
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'isScannedPDF')
			extractSpy.mockReturnValue(true)

			const ocrSpy = vi.spyOn(extractor as any, 'performOCR')
			ocrSpy.mockImplementation(
				() => new Promise((_, reject) => 
					setTimeout(() => reject(new Error('OCR timeout')), 2000)
				)
			)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('OCR_TIMEOUT')
		})
	})

	describe("Performance Optimization", () => {
		it("should process large PDFs efficiently", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'large.pdf' },
			}

			const largeText = 'x'.repeat(1000000) // 1MB of text
			
			const extractSpy = vi.spyOn(extractor as any, 'extractTextFromPDF')
			extractSpy.mockResolvedValue({
				text: largeText,
				metadata: { pageCount: 100 },
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content.length).toBe(1000000)
		})

		it("should implement streaming for very large files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'streaming.pdf', streaming: true },
			}

			const streamSpy = vi.spyOn(extractor as any, 'processWithStreaming')
			streamSpy.mockResolvedValue({
				text: 'Streaming extracted content',
				metadata: { pageCount: 500 },
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(streamSpy).toHaveBeenCalled()
		})

		it("should handle concurrent PDF processing", async () => {
			const pdfInputs = [
				{ type: 'file', content: 'data:application/pdf;base64,JVBERi0xLjQK1', options: { filename: 'pdf1.pdf' } },
				{ type: 'file', content: 'data:application/pdf;base64,JVBERi0xLjQK2', options: { filename: 'pdf2.pdf' } },
				{ type: 'file', content: 'data:application/pdf;base64,JVBERi0xLjQK3', options: { filename: 'pdf3.pdf' } },
			]

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'PDF content',
					metadata: { pageCount: 5 },
					processingTime: 2000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractTextFromPDF')
			extractSpy.mockResolvedValue({
				text: mockResult.data!.content,
				metadata: mockResult.data!.metadata,
			})

			const results = await Promise.all(
				pdfInputs.map((input) => extractor.extract(input))
			)

			expect(results).toHaveLength(3)
			results.forEach((result) => expect(result.success).toBe(true))
		})
	})

	describe("Configuration Options", () => {
		it("should respect text extraction options", () => {
			const options: PDFOptions = {
				...mockOptions,
				textExtractionOptions: {
					preserveFormatting: false,
					includeHeaders: false,
					includeFooters: true,
				},
			}

			const customExtractor = new PDFExtractor(options)
			expect(customExtractor).toBeDefined()
		})

		it("should handle custom OCR options", () => {
			const options: PDFOptions = {
				...mockOptions,
				ocrOptions: {
					language: 'fra',
					timeoutMs: 60000,
					maxRetries: 5,
				},
			}

			const customExtractor = new PDFExtractor(options)
			expect(customExtractor).toBeDefined()
		})

		it("should disable features when specified", () => {
			const options: PDFOptions = {
				...mockOptions,
				includeImages: false,
				includeTables: false,
				enableOCR: false,
			}

			const customExtractor = new PDFExtractor(options)
			expect(customExtractor).toBeDefined()
		})
	})

	describe("Factory Function", () => {
		it("should create extractor with default options", () => {
			const extractor = createPDFExtractor()
			expect(extractor).toBeDefined()
			expect(extractor.getSupportedTypes()).toContain('pdf')
		})

		it("should create extractor with custom options", () => {
			const customOptions: PDFOptions = {
				includeImages: false,
				enableOCR: false,
			}

			const extractor = createPDFExtractor(customOptions)
			expect(extractor).toBeDefined()
		})
	})

	describe("Edge Cases", () => {
		it("should handle empty PDF files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK', // Minimal PDF
				options: { filename: 'empty.pdf' },
			}

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toBe('')
			expect(result.data?.metadata.pageCount).toBe(0)
		})

		it("should handle PDFs with special characters", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'special.pdf' },
			}

			const specialText = 'Content with émojis 🎯 and spëciäl chårs'
			
			const extractSpy = vi.spyOn(extractor as any, 'extractTextFromPDF')
			extractSpy.mockResolvedValue({
				text: specialText,
				metadata: { pageCount: 1 },
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('émojis')
		})

		it("should handle PDFs with forms", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'form.pdf' },
			}

			const mockForms = [
				{
					id: 'form1',
					page: 1,
					fields: [
						{ name: 'text_field', type: 'text', value: 'Sample text' },
						{ name: 'checkbox', type: 'checkbox', value: true },
					],
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'extractForms')
			extractSpy.mockResolvedValue(mockForms)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.forms).toHaveLength(1)
			expect(result.data?.forms![0].fields).toHaveLength(2)
		})

		it("should handle PDFs with annotations", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'data:application/pdf;base64,JVBERi0xLjQK...',
				options: { filename: 'annotated.pdf' },
			}

			const mockAnnotations = [
				{
					id: 'ann1',
					page: 1,
					type: 'Text',
					content: 'This is a text annotation',
					rect: { x: 100, y: 200, width: 50, height: 20 },
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'extractAnnotations')
			extractSpy.mockResolvedValue(mockAnnotations)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.annotations).toHaveLength(1)
		})
	})
})
