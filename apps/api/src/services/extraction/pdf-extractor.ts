/**
 * PDF Extractor
 *
 * Specialized extractor for PDF documents.
 * Uses pdf-parse for text extraction and Gemini Vision as fallback for scanned PDFs.
 */

import pdfParse from "pdf-parse/lib/pdf-parse.js"
import { summarizeBinaryWithGemini } from "../gemini-files"
import type {
	ExtractionInput,
	ExtractionResult,
	PDFExtractor as IPDFExtractor,
	PDFMetadata,
	PDFOptions,
} from "../interfaces"

// ============================================================================
// PDF Extractor Implementation
// ============================================================================

export class PDFExtractor implements IPDFExtractor {
	readonly serviceName = "PDFExtractor"
	private initialized = false

	async initialize(): Promise<void> {
		if (this.initialized) return
		this.initialized = true
	}

	async healthCheck(): Promise<boolean> {
		return true
	}

	async cleanup(): Promise<void> {}

	// ========================================================================
	// DocumentExtractor Interface
	// ========================================================================

	async extract(input: ExtractionInput): Promise<ExtractionResult> {
		if (!input.fileBuffer) {
			throw new Error("File buffer is required for PDF extraction")
		}
		return await this.extractFromPDF(input.fileBuffer)
	}

	canHandle(input: ExtractionInput): boolean {
		if (input.fileName?.toLowerCase().endsWith(".pdf")) return true
		if (input.mimeType?.toLowerCase().includes("pdf")) return true
		if (input.type?.toLowerCase() === "pdf") return true
		if (input.url?.toLowerCase().endsWith(".pdf")) return true
		return false
	}

	getPriority(): number {
		return 8
	}

	async validateInput(input: ExtractionInput): Promise<void> {
		if (!input.fileBuffer && !input.url) {
			throw new Error("File buffer or URL is required")
		}
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

	async extractFromPDF(
		buffer: Buffer,
		_options?: PDFOptions,
	): Promise<ExtractionResult> {
		try {
			const metadata = await this.extractMetadata(buffer)

			let text: string | null = null
			let extractionMethod = "unknown"

			// Try text extraction first
			text = await this.extractTextFromPDF(buffer)
			extractionMethod = "text-extraction"

			// If text is too short (likely scanned), try Gemini Vision
			const isScanned = text.trim().length < (buffer.length / 1024) * 10
			if (isScanned && text.trim().length < 100) {
				try {
					text = await summarizeBinaryWithGemini(buffer, "application/pdf")
					extractionMethod = "gemini-vision"
				} catch (error) {
					console.warn(
						"Gemini Vision fallback failed",
						(error as Error).message,
					)
				}
			}

			const cleanedText = this.cleanContent(text)

			return {
				text: cleanedText,
				title: metadata.title || this.extractTitleFromContent(cleanedText),
				source: "pdf",
				url: null,
				contentType: "application/pdf",
				raw: { metadata, extractionMethod, isScanned },
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

	async extractWithOCR(buffer: Buffer): Promise<string> {
		return await summarizeBinaryWithGemini(buffer, "application/pdf")
	}

	async isScannedPDF(buffer: Buffer): Promise<boolean> {
		try {
			const text = await this.extractTextFromPDF(buffer)
			const textPerKB = text.length / (buffer.length / 1024)
			return textPerKB < 10
		} catch {
			return true
		}
	}

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
			return { pageCount: 0, fileSize: buffer.length, isEncrypted: false }
		}
	}

	// ========================================================================
	// Private Methods
	// ========================================================================

	private async extractTextFromPDF(buffer: Buffer): Promise<string> {
		try {
			const data = await pdfParse(buffer)
			return data.text
		} catch (error) {
			console.error("PDF text extraction failed", error)
			throw new Error("Failed to extract text from PDF")
		}
	}

	private extractTitleFromContent(content: string): string | null {
		const firstLine = content.split("\n")[0].trim()
		if (firstLine.length > 0 && firstLine.length <= 200) return firstLine
		const truncated = content.substring(0, 100).trim()
		return truncated.length > 0 ? `${truncated}...` : null
	}

	private cleanContent(content: string): string {
		let cleaned = content.replace(/\0/g, "")
		cleaned = cleaned.replace(/\s+/g, " ")
		cleaned = cleaned.replace(/\n{3,}/g, "\n\n")
		return cleaned.trim()
	}

	private countWords(text: string): number {
		const normalized = text.trim()
		if (!normalized) return 0
		return normalized.split(/\s+/).length
	}
}
