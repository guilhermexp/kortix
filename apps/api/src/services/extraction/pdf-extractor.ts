/**
 * PDF Extractor
 *
 * Specialized extractor for PDF documents.
 * Features:
 * - Replicate OCR integration as primary method (Deepseek OCR)
 * - Fallback to pdf-parse for text PDFs
 * - PDF metadata extraction (pages, title, author)
 * - Support for both scanned and text PDFs
 * - Gemini Vision as secondary OCR fallback
 */

import pdfParse from "pdf-parse/lib/pdf-parse.js"
import { BaseService } from "../base/base-service"
import { summarizeBinaryWithGemini } from "../gemini-files"
import type {
	ExtractionInput,
	ExtractionResult,
	PDFExtractor as IPDFExtractor,
	OCROptions,
	PDFMetadata,
	PDFOptions,
} from "../interfaces"
import { ReplicateService } from "../replicate"

// ============================================================================
// PDF Extractor Implementation
// ============================================================================

/**
 * Extractor for PDF documents
 */
export class PDFExtractor extends BaseService implements IPDFExtractor {
	private readonly ocrEnabled: boolean
	private readonly ocrProvider: "replicate" | "gemini"
	private readonly replicateService?: ReplicateService

	constructor(options?: {
		ocrEnabled?: boolean
		ocrProvider?: "replicate" | "gemini"
	}) {
		super("PDFExtractor")
		this.ocrEnabled = options?.ocrEnabled ?? true
		this.ocrProvider = options?.ocrProvider || "replicate"

		if (this.ocrEnabled && this.ocrProvider === "replicate") {
			this.replicateService = new ReplicateService()
		}
	}

	// ========================================================================
	// DocumentExtractor Interface
	// ========================================================================

	/**
	 * Extract content from the given input
	 */
	async extract(input: ExtractionInput): Promise<ExtractionResult> {
		this.assertInitialized()

		if (!input.fileBuffer) {
			throw this.createError(
				"MISSING_FILE",
				"File buffer is required for PDF extraction",
			)
		}

		return await this.extractFromPDF(input.fileBuffer, {
			useOCR: this.ocrEnabled,
			ocrProvider: this.ocrProvider,
		})
	}

	/**
	 * Check if this extractor can handle the given input
	 */
	canHandle(input: ExtractionInput): boolean {
		// Check if it's a PDF by extension or MIME type
		if (input.fileName?.toLowerCase().endsWith(".pdf")) return true
		if (input.mimeType?.toLowerCase().includes("pdf")) return true
		if (input.type?.toLowerCase() === "pdf") return true

		// Check URL extension
		if (input.url?.toLowerCase().endsWith(".pdf")) return true

		return false
	}

	/**
	 * Get extractor priority (higher = preferred)
	 */
	getPriority(): number {
		return this.ocrEnabled ? 12 : 8
	}

	/**
	 * Validate input before extraction
	 */
	async validateInput(input: ExtractionInput): Promise<void> {
		if (!input.fileBuffer && !input.url) {
			throw this.createError(
				"VALIDATION_ERROR",
				"File buffer or URL is required",
			)
		}

		// Validate file size if buffer provided
		if (input.fileBuffer) {
			const maxSize = 50 * 1024 * 1024 // 50MB
			if (input.fileBuffer.length > maxSize) {
				throw this.createError(
					"FILE_TOO_LARGE",
					"PDF file exceeds maximum size of 50MB",
				)
			}
		}
	}

	// ========================================================================
	// PDFExtractor Interface
	// ========================================================================

	/**
	 * Extract text from PDF using intelligent extraction strategy
	 *
	 * Automatically detects if PDF is scanned and chooses the appropriate extraction method:
	 * - For scanned PDFs: Uses Deepseek OCR (via Replicate) or Gemini Vision
	 * - For text PDFs: Uses pdf-parse for direct text extraction
	 *
	 * @param buffer - PDF file buffer
	 * @param options - Extraction options including OCR preferences
	 * @returns Extraction result with text, metadata, and extraction details
	 *
	 * @example
	 * ```typescript
	 * // Extract with OCR enabled
	 * const result = await pdfExtractor.extractFromPDF(pdfBuffer, {
	 *   useOCR: true,
	 *   ocrProvider: 'replicate'
	 * });
	 *
	 * // Extract with custom options
	 * const result = await pdfExtractor.extractFromPDF(pdfBuffer, {
	 *   useOCR: true,
	 *   ocrProvider: 'gemini'
	 * });
	 * ```
	 */
	async extractFromPDF(
		buffer: Buffer,
		options?: PDFOptions,
	): Promise<ExtractionResult> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("extractFromPDF")

		try {
			this.logger.info("Extracting PDF content", {
				size: buffer.length,
				useOCR: options?.useOCR,
			})

			// Extract metadata first
			const metadata = await this.extractMetadata(buffer)

			// Check if PDF is scanned (needs OCR)
			const isScanned = await this.isScannedPDF(buffer)

			let text: string | null = null
			let extractionMethod = "unknown"

			// Try OCR if enabled and PDF is scanned
			if (options?.useOCR && (isScanned || this.ocrEnabled)) {
				try {
					text = await this.extractWithOCR(buffer, {
						provider: options.ocrProvider || this.ocrProvider,
					})
					extractionMethod = `ocr-${options?.ocrProvider || this.ocrProvider}`
				} catch (error) {
					this.logger.warn(
						"OCR extraction failed, falling back to text extraction",
						{
							error: (error as Error).message,
						},
					)
				}
			}

			// Fallback to regular text extraction
			if (!text) {
				text = await this.extractTextFromPDF(buffer)
				extractionMethod = "text-extraction"
			}

			const cleanedText = this.cleanContent(text)

			tracker.end(true)

			return {
				text: cleanedText,
				title: metadata.title || this.extractTitleFromContent(cleanedText),
				source: "pdf",
				url: null,
				contentType: "application/pdf",
				raw: {
					metadata,
					extractionMethod,
					isScanned,
				},
				wordCount: this.countWords(cleanedText),
				extractorUsed: "PDFExtractor",
				extractionMetadata: {
					pageCount: metadata.pageCount,
					author: metadata.author,
					creationDate: metadata.creationDate,
					isScanned,
					extractionMethod,
				},
			}
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "extractFromPDF")
		}
	}

	/**
	 * Extract text using OCR (Optical Character Recognition)
	 *
	 * Supports two OCR providers:
	 * - Replicate (Deepseek OCR): High-quality commercial OCR service
	 * - Gemini Vision: Google's multimodal AI for document understanding
	 *
	 * @param buffer - PDF file buffer
	 * @param options - OCR options including provider selection
	 * @returns Extracted text from OCR processing
	 * @throws {ProcessingError} If OCR provider is invalid or extraction fails
	 *
	 * @example
	 * ```typescript
	 * // Use Replicate OCR (recommended for production)
	 * const text = await pdfExtractor.extractWithOCR(buffer, {
	 *   provider: 'replicate'
	 * });
	 *
	 * // Use Gemini Vision (fallback)
	 * const text = await pdfExtractor.extractWithOCR(buffer, {
	 *   provider: 'gemini'
	 * });
	 * ```
	 */
	async extractWithOCR(buffer: Buffer, options?: OCROptions): Promise<string> {
		const provider = options?.provider || this.ocrProvider

		this.logger.debug("Extracting with OCR", { provider })

		if (provider === "replicate" && this.replicateService) {
			// Use Deepseek OCR via Replicate
			return await this.replicateService.extractPdfWithDeepseek(buffer)
		}

		if (provider === "gemini") {
			// Use Gemini Vision API
			return await summarizeBinaryWithGemini(buffer, "application/pdf")
		}

		throw this.createError(
			"INVALID_OCR_PROVIDER",
			`Unknown OCR provider: ${provider}`,
		)
	}

	/**
	 * Check if PDF is scanned (needs OCR)
	 *
	 * Uses a heuristic approach to determine if a PDF contains primarily images
	 * rather than extractable text. PDFs with less than 10 characters per KB are
	 * considered scanned.
	 *
	 * @param buffer - PDF file buffer
	 * @returns True if PDF appears to be scanned, false if it contains text
	 *
	 * @example
	 * ```typescript
	 * const isScanned = await pdfExtractor.isScannedPDF(pdfBuffer);
	 * if (isScanned) {
	 *   console.log('PDF requires OCR processing');
	 * } else {
	 *   console.log('PDF contains extractable text');
	 * }
	 * ```
	 */
	async isScannedPDF(buffer: Buffer): Promise<boolean> {
		try {
			// Try to extract text
			const text = await this.extractTextFromPDF(buffer)

			// If text is very short relative to file size, it's likely scanned
			const textPerKB = text.length / (buffer.length / 1024)

			// Heuristic: if less than 10 characters per KB, likely scanned
			return textPerKB < 10
		} catch {
			// If extraction fails, assume it's scanned
			return true
		}
	}

	/**
	 * Extract metadata from PDF
	 *
	 * Extracts PDF document properties including title, author, page count,
	 * creation date, and other metadata embedded in the PDF.
	 *
	 * @param buffer - PDF file buffer
	 * @returns PDF metadata including document properties
	 *
	 * @example
	 * ```typescript
	 * const metadata = await pdfExtractor.extractMetadata(pdfBuffer);
	 * console.log(`Title: ${metadata.title}`);
	 * console.log(`Pages: ${metadata.pageCount}`);
	 * console.log(`Author: ${metadata.author}`);
	 * ```
	 */
	async extractMetadata(buffer: Buffer): Promise<PDFMetadata> {
		try {
			const data = await pdfParse(buffer)

			return {
				title: data.info?.Title,
				author: data.info?.Author,
				subject: data.info?.Subject,
				keywords: data.info?.Keywords?.split(",").map((k: string) => k.trim()),
				creationDate: data.info?.CreationDate
					? new Date(data.info.CreationDate)
					: undefined,
				modificationDate: data.info?.ModDate
					? new Date(data.info.ModDate)
					: undefined,
				pageCount: data.numpages,
				fileSize: buffer.length,
				pdfVersion: data.version,
				isEncrypted: false, // pdf-parse handles encrypted PDFs
			}
		} catch (error) {
			this.logger.warn("Failed to extract PDF metadata", {
				error: (error as Error).message,
			})

			// Return minimal metadata
			return {
				pageCount: 0,
				fileSize: buffer.length,
				isEncrypted: false,
			}
		}
	}

	// ========================================================================
	// Private Methods
	// ========================================================================

	/**
	 * Extract text from PDF using pdf-parse
	 */
	private async extractTextFromPDF(buffer: Buffer): Promise<string> {
		try {
			const data = await pdfParse(buffer)
			return data.text
		} catch (error) {
			this.logger.error("PDF text extraction failed", error as Error)
			throw this.createError(
				"PDF_EXTRACTION_FAILED",
				"Failed to extract text from PDF",
			)
		}
	}

	/**
	 * Extract title from content
	 */
	private extractTitleFromContent(content: string): string | null {
		// Get first line or first 100 characters
		const firstLine = content.split("\n")[0].trim()
		if (firstLine.length > 0 && firstLine.length <= 200) {
			return firstLine
		}

		const truncated = content.substring(0, 100).trim()
		return truncated.length > 0 ? `${truncated}...` : null
	}

	/**
	 * Clean extracted content
	 */
	private cleanContent(content: string): string {
		// Remove null bytes
		let cleaned = content.replace(/\0/g, "")

		// Normalize whitespace
		cleaned = cleaned.replace(/\s+/g, " ")

		// Remove excessive line breaks
		cleaned = cleaned.replace(/\n{3,}/g, "\n\n")

		// Trim
		cleaned = cleaned.trim()

		return cleaned
	}

	/**
	 * Count words in text
	 */
	private countWords(text: string): number {
		const normalized = text.trim()
		if (!normalized) return 0
		return normalized.split(/\s+/).length
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onInitialize(): Promise<void> {
		if (this.replicateService) {
			// ReplicateService doesn't need initialization
		}
	}

	protected async onHealthCheck(): Promise<boolean> {
		// PDF extractor is always healthy if it can load
		return true
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create PDF extractor with OCR options
 */
export function createPDFExtractor(options?: {
	ocrEnabled?: boolean
	ocrProvider?: "replicate" | "gemini"
}): PDFExtractor {
	return new PDFExtractor(options)
}
