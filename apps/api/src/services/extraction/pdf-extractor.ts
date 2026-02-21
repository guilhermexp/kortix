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
export class PDFExtractor implements IPDFExtractor {
	readonly serviceName = "PDFExtractor"
	private initialized = false
	private readonly ocrEnabled: boolean
	private readonly ocrProvider: "replicate" | "gemini"
	private readonly replicateService?: ReplicateService

	constructor(options?: {
		ocrEnabled?: boolean
		ocrProvider?: "replicate" | "gemini"
	}) {
		this.ocrEnabled = options?.ocrEnabled ?? true
		this.ocrProvider = options?.ocrProvider || "replicate"

		if (this.ocrEnabled && this.ocrProvider === "replicate") {
			this.replicateService = new ReplicateService()
		}
	}

	async initialize(): Promise<void> {
		if (this.initialized) return
		this.initialized = true
	}

	async healthCheck(): Promise<boolean> {
		return true
	}

	async cleanup(): Promise<void> {
		// No resources to clean up
	}

	// ========================================================================
	// DocumentExtractor Interface
	// ========================================================================

	/**
	 * Extract content from the given input
	 */
	async extract(input: ExtractionInput): Promise<ExtractionResult> {
		if (!input.fileBuffer) {
			throw new Error("File buffer is required for PDF extraction")
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
			throw new Error("File buffer or URL is required")
		}

		// Validate file size if buffer provided
		if (input.fileBuffer) {
			const maxSize = 50 * 1024 * 1024 // 50MB
			if (input.fileBuffer.length > maxSize) {
				throw new Error("PDF file exceeds maximum size of 50MB")
			}
		}
	}

	// ========================================================================
	// PDFExtractor Interface
	// ========================================================================

	/**
	 * Extract text from PDF using intelligent extraction strategy
	 */
	async extractFromPDF(
		buffer: Buffer,
		options?: PDFOptions,
	): Promise<ExtractionResult> {
		try {
			console.info("Extracting PDF content", `size=${buffer.length}`, `useOCR=${options?.useOCR}`)

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
					console.warn(
						"OCR extraction failed, falling back to text extraction",
						(error as Error).message,
					)
				}
			}

			// Fallback to regular text extraction
			if (!text) {
				text = await this.extractTextFromPDF(buffer)
				extractionMethod = "text-extraction"
			}

			const cleanedText = this.cleanContent(text)

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
			throw error instanceof Error ? error : new Error(String(error))
		}
	}

	/**
	 * Extract text using OCR (Optical Character Recognition)
	 */
	async extractWithOCR(buffer: Buffer, options?: OCROptions): Promise<string> {
		const provider = options?.provider || this.ocrProvider

		console.debug("Extracting with OCR", `provider=${provider}`)

		if (provider === "replicate" && this.replicateService) {
			// Use Deepseek OCR via Replicate
			return await this.replicateService.extractPdfWithDeepseek(buffer)
		}

		if (provider === "gemini") {
			// Use Gemini Vision API
			return await summarizeBinaryWithGemini(buffer, "application/pdf")
		}

		throw new Error(`Unknown OCR provider: ${provider}`)
	}

	/**
	 * Check if PDF is scanned (needs OCR)
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
				isEncrypted: false,
			}
		} catch (error) {
			console.warn("Failed to extract PDF metadata", (error as Error).message)

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
			console.error("PDF text extraction failed", error)
			throw new Error("Failed to extract text from PDF")
		}
	}

	/**
	 * Extract title from content
	 */
	private extractTitleFromContent(content: string): string | null {
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
		let cleaned = content.replace(/\0/g, "")
		cleaned = cleaned.replace(/\s+/g, " ")
		cleaned = cleaned.replace(/\n{3,}/g, "\n\n")
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
}
