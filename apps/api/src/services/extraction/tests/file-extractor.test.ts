import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test"
import { FileExtractor, createFileExtractor } from '../file-extractor'
import type {
	ExtractionInput,
	ExtractionResult,
	FileOptions,
	FileMetadata,
	ProcessingError,
} from '../../interfaces'

/**
 * Unit tests for FileExtractor
 *
 * Tests office document processing including:
 * - Document format detection and validation
 * - Text extraction from various office formats (DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, etc.)
 * - Metadata extraction for different file types
 * - Table and image extraction from spreadsheets and presentations
 * - Error handling for unsupported or corrupted files
 * - Performance optimization for large documents
 */

describe("FileExtractor", () => {
	let extractor: FileExtractor
	let mockOptions: FileOptions

	beforeEach(() => {
		mockOptions = {
			includeTables: true,
			includeImages: true,
			includeMetadata: true,
			preserveFormatting: true,
			supportedFormats: [
				'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
				'odt', 'ods', 'odp', 'rtf', 'txt', 'csv',
			],
			extractionOptions: {
				timeoutMs: 30000,
				maxRetries: 3,
			},
		}

		extractor = new FileExtractor(mockOptions)
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

		it("should support various file content types", () => {
			const supportedTypes = extractor.getSupportedTypes()
			expect(supportedTypes).toContain('file')
		})

		it("should be able to handle office document files", () => {
			const fileInputs = [
				{ type: 'file', content: 'doc content', options: { filename: 'document.docx' } },
				{ type: 'file', content: 'xls content', options: { filename: 'spreadsheet.xlsx' } },
				{ type: 'file', content: 'ppt content', options: { filename: 'presentation.pptx' } },
			]

			fileInputs.forEach((input) => {
				const canHandle = extractor.canHandle(input)
				expect(canHandle).toBe(true)
			})
		})

		it("should not handle non-supported files", () => {
			const unsupportedInputs = [
				{ type: 'file', content: 'pdf content', options: { filename: 'document.pdf' } },
				{ type: 'url', content: 'https://example.com', options: {} },
			]

			unsupportedInputs.forEach((input) => {
				const canHandle = extractor.canHandle(input)
				expect(canHandle).toBe(false)
			})
		})
	})

	describe("File Format Detection", () => {
		it("should detect Microsoft Word documents", () => {
			const wordFormats = ['.doc', '.docx', '.docm']
			
			wordFormats.forEach((format) => {
				const fileInput: ExtractionInput = {
					type: 'file',
					content: 'Word document content',
					options: { filename: `document${format}` },
				}

				const canHandle = extractor.canHandle(fileInput)
				expect(canHandle).toBe(true)
			})
		})

		it("should detect Microsoft Excel spreadsheets", () => {
			const excelFormats = ['.xls', '.xlsx', '.xlsm', '.xlsb']
			
			excelFormats.forEach((format) => {
				const fileInput: ExtractionInput = {
					type: 'file',
					content: 'Excel spreadsheet content',
					options: { filename: `spreadsheet${format}` },
				}

				const canHandle = extractor.canHandle(fileInput)
				expect(canHandle).toBe(true)
			})
		})

		it("should detect Microsoft PowerPoint presentations", () => {
			const powerpointFormats = ['.ppt', '.pptx', '.pptm', '.pps', '.ppsx']
			
			powerpointFormats.forEach((format) => {
				const fileInput: ExtractionInput = {
					type: 'file',
					content: 'PowerPoint content',
					options: { filename: `presentation${format}` },
				}

				const canHandle = extractor.canHandle(fileInput)
				expect(canHandle).toBe(true)
			})
		})

		it("should detect OpenDocument formats", () => {
			const odFormats = ['.odt', '.ods', '.odp', '.fodt', '.fods', '.fodp']
			
			odFormats.forEach((format) => {
				const fileInput: ExtractionInput = {
					type: 'file',
					content: 'OpenDocument content',
					options: { filename: `document${format}` },
				}

				const canHandle = extractor.canHandle(fileInput)
				expect(canHandle).toBe(true)
			})
		})

		it("should detect plain text and RTF files", () => {
			const textFormats = ['.txt', '.rtf', '.csv', '.tsv']
			
			textFormats.forEach((format) => {
				const fileInput: ExtractionInput = {
					type: 'file',
					content: 'Text content',
					options: { filename: `text${format}` },
				}

				const canHandle = extractor.canHandle(fileInput)
				expect(canHandle).toBe(true)
			})
		})

		it("should handle files with uppercase extensions", () => {
			const uppercaseFormats = ['.DOCX', '.XLSX', '.PPTX', '.ODT']
			
			uppercaseFormats.forEach((format) => {
				const fileInput: ExtractionInput = {
					type: 'file',
					content: 'Content',
					options: { filename: `document${format}` },
				}

				const canHandle = extractor.canHandle(fileInput)
				expect(canHandle).toBe(true)
			})
		})
	})

	describe("Microsoft Word Document Processing", () => {
		it("should extract text from DOCX files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-docx-content',
				options: { filename: 'document.docx' },
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'This is the extracted text from a Word document.\n\nIt includes multiple paragraphs and proper formatting.',
					metadata: {
						title: 'Sample Word Document',
						author: 'John Doe',
						wordCount: 25,
						pageCount: 1,
					},
					processingTime: 1200,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromWordDoc')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('Word document')
			expect(result.data?.metadata.wordCount).toBe(25)
		})

		it("should extract text from legacy DOC files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-doc-content',
				options: { filename: 'legacy.doc' },
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Text from legacy DOC format',
					metadata: {
						title: 'Legacy Document',
						format: 'DOC',
					},
					processingTime: 2000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromWordDoc')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.format).toBe('DOC')
		})

		it("should preserve formatting in Word documents", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-docx-content',
				options: { 
					filename: 'formatted.docx',
					preserveFormatting: true 
				},
			}

			const formattedText = 'This is **bold text** and *italic text* with [link](http://example.com)'
			
			const extractSpy = vi.spyOn(extractor as any, 'extractFromWordDoc')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: formattedText,
					metadata: { pageCount: 1 },
					processingTime: 1500,
				},
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('**bold text**')
		})

		it("should extract Word document metadata", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-docx-content',
				options: { filename: 'metadata.docx' },
			}

			const mockMetadata: FileMetadata = {
				title: 'Document Title',
				author: 'Jane Smith',
				subject: 'Document Subject',
				keywords: 'keyword1, keyword2, keyword3',
				creationDate: '2023-01-15T10:30:00Z',
				modificationDate: '2023-01-16T14:22:00Z',
				wordCount: 1500,
				pageCount: 5,
				characterCount: 8000,
				paragraphCount: 45,
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromWordDoc')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: 'Document content',
					metadata: mockMetadata,
					processingTime: 1800,
				},
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.title).toBe('Document Title')
			expect(result.data?.metadata.wordCount).toBe(1500)
			expect(result.data?.metadata.creationDate).toBe('2023-01-15T10:30:00Z')
		})
	})

	describe("Microsoft Excel Spreadsheet Processing", () => {
		it("should extract data from XLSX files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-xlsx-content',
				options: { filename: 'spreadsheet.xlsx' },
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Sheet1: John Doe\t25\tEngineer\nJane Smith\t30\tDesigner\nBob Johnson\t35\tManager',
					metadata: {
						sheetCount: 3,
						totalRows: 100,
						totalColumns: 10,
					},
					processingTime: 2000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromExcel')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('John Doe')
			expect(result.data?.metadata.sheetCount).toBe(3)
			expect(result.data?.metadata.totalRows).toBe(100)
		})

		it("should handle multiple worksheets", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-xlsx-content',
				options: { filename: 'multi-sheet.xlsx' },
			}

			const sheetData = [
				{
					name: 'Sales Data',
					headers: ['Product', 'Quantity', 'Price', 'Total'],
					rows: [
						['Product A', 100, 10.99, 1099.00],
						['Product B', 200, 15.50, 3100.00],
					],
				},
				{
					name: 'Summary',
					headers: ['Metric', 'Value'],
					rows: [
						['Total Sales', '4199.00'],
						['Average Order', 76.35],
					],
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'extractFromExcel')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: 'Multi-sheet spreadsheet content',
					metadata: { sheetCount: 2 },
					sheets: sheetData,
					processingTime: 2500,
				},
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.sheets).toHaveLength(2)
			expect(result.data?.sheets![0].name).toBe('Sales Data')
			expect(result.data?.sheets![1].name).toBe('Summary')
		})

		it("should extract Excel charts and images", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-xlsx-content',
				options: { filename: 'charts.xlsx', includeImages: true },
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Spreadsheet with embedded charts and images',
					metadata: {
						sheetCount: 2,
						charts: [
							{
								title: 'Sales Chart',
								type: 'column',
								sheet: 'Sales Data',
							},
						],
						images: [
							{
								id: 'img1',
								sheet: 'Summary',
								format: 'PNG',
								data: 'base64image1data',
							},
						],
					},
					processingTime: 3000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromExcel')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.charts).toHaveLength(1)
			expect(result.data?.metadata.images).toHaveLength(1)
		})

		it("should handle CSV files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'Name,Age,Department\nJohn Doe,25,Engineering\nJane Smith,30,Design',
				options: { filename: 'data.csv' },
			}

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('John Doe')
			expect(result.data?.content).toContain('Engineering')
		})
	})

	describe("Microsoft PowerPoint Presentation Processing", () => {
		it("should extract text from PPTX files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-pptx-content',
				options: { filename: 'presentation.pptx' },
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Slide 1: Title Slide\nThis is the presentation title\n\nSlide 2: Content Slide\n• Bullet point 1\n• Bullet point 2\n• Bullet point 3',
					metadata: {
						slideCount: 5,
						slideSize: [1920, 1080],
					},
					processingTime: 2200,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromPowerPoint')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('Title Slide')
			expect(result.data?.metadata.slideCount).toBe(5)
		})

		it("should handle speaker notes", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-pptx-content',
				options: { filename: 'presentation.pptx', includeNotes: true },
			}

			const slideData = [
				{
					number: 1,
					title: 'Introduction',
					content: 'Welcome to our presentation',
					notes: 'Introduce yourself and the topic',
				},
				{
					number: 2,
					title: 'Main Points',
					content: 'Point 1, Point 2, Point 3',
					notes: 'Expand on each point with examples',
				},
			]

			const extractSpy = vi.spyOn(extractor as any, 'extractFromPowerPoint')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: 'Presentation with speaker notes',
					metadata: { slideCount: 2 },
					slides: slideData,
					processingTime: 2000,
				},
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.slides).toHaveLength(2)
			expect(result.data?.slides![0].notes).toBe('Introduce yourself and the topic')
		})

		it("should extract images and shapes from slides", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-pptx-content',
				options: { filename: 'visual.pptx', includeImages: true },
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'Presentation with visual elements',
					metadata: {
						slideCount: 3,
						images: [
							{
								id: 'img1',
								slide: 1,
								format: 'PNG',
								data: 'base64image1data',
							},
							{
								id: 'img2',
								slide: 2,
								format: 'JPEG',
								data: 'base64image2data',
							},
						],
						shapes: [
							{
								type: 'rectangle',
								slide: 1,
								properties: { x: 100, y: 200, width: 300, height: 150 },
							},
						],
					},
					processingTime: 2800,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromPowerPoint')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.images).toHaveLength(2)
			expect(result.data?.metadata.shapes).toHaveLength(1)
		})
	})

	describe("OpenDocument Format Processing", () => {
		it("should extract text from ODT files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-odt-content',
				options: { filename: 'document.odt' },
			}

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'This is an OpenDocument Text file.\n\nIt contains structured content with proper formatting.',
					metadata: {
						title: 'OpenDocument Document',
						wordCount: 20,
					},
					processingTime: 1500,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromOpenDocument')
			extractSpy.mockResolvedValue(mockResult)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('OpenDocument')
			expect(result.data?.metadata.wordCount).toBe(20)
		})

		it("should handle ODS spreadsheet files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-ods-content',
				options: { filename: 'spreadsheet.ods' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromOpenDocument')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: 'ODS spreadsheet content',
					metadata: { sheetCount: 1, totalRows: 50 },
					processingTime: 1200,
				},
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.sheetCount).toBe(1)
		})

		it("should handle ODP presentation files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-odp-content',
				options: { filename: 'presentation.odp' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromOpenDocument')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: 'ODP presentation content',
					metadata: { slideCount: 10 },
					processingTime: 2000,
				},
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.metadata.slideCount).toBe(10)
		})
	})

	describe("Plain Text and RTF Processing", () => {
		it("should handle plain text files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'This is a plain text document.\n\nIt has multiple lines and paragraphs.',
				options: { filename: 'text.txt' },
			}

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toBe('This is a plain text document.\n\nIt has multiple lines and paragraphs.')
		})

		it("should handle RTF files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: '{\\rtf1\\ansi This is RTF content with {\\b bold} and {\\i italic} text.}',
				options: { filename: 'document.rtf' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromRTF')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: 'This is RTF content with bold and italic text.',
					metadata: { format: 'RTF' },
					processingTime: 800,
				},
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('bold and italic')
		})

		it("should handle TSV files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'Name\tAge\tCity\nJohn Doe\t25\tNew York\nJane Smith\t30\tLos Angeles',
				options: { filename: 'data.tsv' },
			}

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('John Doe')
			expect(result.data?.content).toContain('New York')
		})
	})

	describe("Error Handling", () => {
		it("should handle unsupported file formats", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'unknown format content',
				options: { filename: 'unknown.xyz' },
			}

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('UNSUPPORTED_FORMAT')
		})

		it("should handle corrupted office documents", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'corrupted data',
				options: { filename: 'corrupted.docx' },
			}

			const error: ProcessingError = {
				code: 'FILE_CORRUPTED',
				message: 'Office document is corrupted or invalid',
				details: { fileSize: 1024, format: 'DOCX' },
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromWordDoc')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('FILE_CORRUPTED')
		})

		it("should handle password-protected documents", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'encrypted content',
				options: { filename: 'protected.docx' },
			}

			const error: ProcessingError = {
				code: 'FILE_PASSWORD_PROTECTED',
				message: 'Document is password protected',
				details: { format: 'DOCX', requiresPassword: true },
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromWordDoc')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('FILE_PASSWORD_PROTECTED')
		})

		it("should handle oversized files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'x'.repeat(50 * 1024 * 1024), // 50MB
				options: { filename: 'large.xlsx' },
			}

			const error: ProcessingError = {
				code: 'FILE_TOO_LARGE',
				message: 'File exceeds maximum size limit',
				details: { size: 50 * 1024 * 1024, maxSize: 25 * 1024 * 1024 },
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromExcel')
			extractSpy.mockRejectedValue(error)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('FILE_TOO_LARGE')
		})

		it("should handle extraction timeouts", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'complex document content',
				options: { 
					filename: 'complex.pptx',
					extractionOptions: { timeoutMs: 1000 }
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromPowerPoint')
			extractSpy.mockImplementation(
				() => new Promise((_, reject) => 
					setTimeout(() => reject(new Error('Extraction timeout')), 2000)
				)
			)

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(false)
			expect(result.error?.code).toBe('EXTRACTION_TIMEOUT')
		})
	})

	describe("Performance Optimization", () => {
		it("should process large documents efficiently", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-large-docx',
				options: { filename: 'large.docx' },
			}

			const largeContent = 'x'.repeat(500000) // 500KB of content
			
			const extractSpy = vi.spyOn(extractor as any, 'extractFromWordDoc')
			extractSpy.mockResolvedValue({
				success: true,
				data: {
					content: largeContent,
					metadata: { wordCount: 100000, pageCount: 200 },
					processingTime: 8000,
				},
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content.length).toBe(500000)
		})

		it("should implement streaming for very large files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'base64-encoded-huge-xlsx',
				options: { filename: 'huge.xlsx', streaming: true },
			}

			const streamSpy = vi.spyOn(extractor as any, 'processWithStreaming')
			streamSpy.mockResolvedValue({
				success: true,
				data: {
					content: 'Streaming extracted content',
					metadata: { sheetCount: 10, streaming: true },
					processingTime: 15000,
				},
			})

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(streamSpy).toHaveBeenCalled()
		})

		it("should handle concurrent file processing", async () => {
			const fileInputs = [
				{ type: 'file', content: 'doc content 1', options: { filename: 'doc1.docx' } },
				{ type: 'file', content: 'xls content 2', options: { filename: 'xls2.xlsx' } },
				{ type: 'file', content: 'ppt content 3', options: { filename: 'ppt3.pptx' } },
			]

			const mockResult: ExtractionResult = {
				success: true,
				data: {
					content: 'File content',
					metadata: { pageCount: 1 },
					processingTime: 1000,
				},
			}

			const extractSpy = vi.spyOn(extractor as any, 'extractFromWordDoc')
			extractSpy.mockResolvedValue(mockResult)

			const results = await Promise.all(
				fileInputs.map((input) => extractor.extract(input))
			)

			expect(results).toHaveLength(3)
			results.forEach((result) => expect(result.success).toBe(true))
		})
	})

	describe("Configuration Options", () => {
		it("should respect supported formats configuration", () => {
			const customOptions: FileOptions = {
				...mockOptions,
				supportedFormats: ['docx', 'xlsx', 'pptx'],
			}

			const customExtractor = new FileExtractor(customOptions)
			expect(customExtractor).toBeDefined()
		})

		it("should handle custom extraction options", () => {
			const customOptions: FileOptions = {
				...mockOptions,
				extractionOptions: {
					timeoutMs: 60000,
					maxRetries: 5,
				},
			}

			const customExtractor = new FileExtractor(customOptions)
			expect(customExtractor).toBeDefined()
		})

		it("should disable features when specified", () => {
			const customOptions: FileOptions = {
				...mockOptions,
				includeTables: false,
				includeImages: false,
			}

			const customExtractor = new FileExtractor(customOptions)
			expect(customExtractor).toBeDefined()
		})
	})

	describe("Factory Function", () => {
		it("should create extractor with default options", () => {
			const extractor = createFileExtractor()
			expect(extractor).toBeDefined()
			expect(extractor.getSupportedTypes()).toContain('file')
		})

		it("should create extractor with custom options", () => {
			const customOptions: FileOptions = {
				supportedFormats: ['docx', 'txt'],
				includeTables: false,
			}

			const extractor = createFileExtractor(customOptions)
			expect(extractor).toBeDefined()
		})
	})

	describe("Edge Cases", ()	 => {
		it("should handle empty files", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: '',
				options: { filename: 'empty.txt' },
			}

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toBe('')
		})

		it("should handle files with unusual extensions", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'Content',
				options: { filename: 'document.doc.bak' },
			}

			const canHandle = extractor.canHandle(fileInput)
			// Should detect the actual format from content or handle gracefully
		})

		it("should handle files with special characters in names", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'Content',
				options: { filename: 'document with spaces & symbols!@#.docx' },
			}

			const canHandle = extractor.canHandle(fileInput)
			expect(canHandle).toBe(true)
		})

		it("should handle files with non-ASCII content", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'Content with émojis 🎯 and spëciäl chårs',
				options: { filename: 'unicode.txt' },
			}

			const result = await extractor.extract(fileInput)

			expect(result.success).toBe(true)
			expect(result.data?.content).toContain('émojis')
			expect(result.data?.content).toContain('spëciäl chårs')
		})

		it("should detect file types without extensions", async () => {
			const fileInput: ExtractionInput = {
				type: 'file',
				content: 'PK\x03\x04', // ZIP signature (DOCX is ZIP)
				options: { filename: 'noextension' },
			}

			const canHandle = extractor.canHandle(fileInput)
			// Should detect format from file signature
		})
	})
})
