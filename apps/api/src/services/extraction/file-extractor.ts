/**
 * File Extractor
 *
 * Specialized extractor for various file formats.
 * Features:
 * - MarkItDown integration for Office documents (DOCX, XLSX, PPTX)
 * - Support for plain text files (TXT, JSON, XML, YAML)
 * - Fallback to direct parsing if MarkItDown fails
 * - Content type detection and appropriate handling
 * - File metadata extraction
 */

import { BaseService } from '../base/base-service'
import { convertWithMarkItDown } from '../markitdown'
import type {
	FileExtractor as IFileExtractor,
	ExtractionInput,
	ExtractionResult,
	FileOptions,
	FileMetadata,
} from '../interfaces'

// ============================================================================
// Supported File Types
// ============================================================================

const OFFICE_FORMATS = [
	'docx',
	'doc',
	'xlsx',
	'xls',
	'pptx',
	'ppt',
	'odt',
	'ods',
	'odp',
] as const

const TEXT_FORMATS = ['txt', 'md', 'markdown', 'json', 'xml', 'yaml', 'yml', 'csv'] as const

const SUPPORTED_FORMATS = [...OFFICE_FORMATS, ...TEXT_FORMATS] as const

// ============================================================================
// File Extractor Implementation
// ============================================================================

/**
 * Extractor for various file formats
 */
export class FileExtractor extends BaseService implements IFileExtractor {
	private readonly markitdownEnabled: boolean

	constructor(markitdownEnabled = true) {
		super('FileExtractor')
		this.markitdownEnabled = markitdownEnabled
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
			throw this.createError('MISSING_FILE', 'File buffer is required for file extraction')
		}

		const fileType = this.detectFileType(input)

		return await this.extractFromFile(input.fileBuffer, {
			fileName: input.fileName,
			mimeType: input.mimeType,
			fileType,
		})
	}

	/**
	 * Check if this extractor can handle the given input
	 */
	canHandle(input: ExtractionInput): boolean {
		// Must have file buffer
		if (!input.fileBuffer) return false

		// Check file extension
		if (input.fileName) {
			const ext = this.getFileExtension(input.fileName)
			if (ext && this.isSupportedFormat(ext)) return true
		}

		// Check MIME type
		if (input.mimeType) {
			if (this.isSupportedMimeType(input.mimeType)) return true
		}

		// Check explicit type
		if (input.type) {
			return this.isSupportedFormat(input.type)
		}

		return false
	}

	/**
	 * Get extractor priority (higher = preferred)
	 */
	getPriority(): number {
		return this.markitdownEnabled ? 10 : 8
	}

	/**
	 * Validate input before extraction
	 */
	async validateInput(input: ExtractionInput): Promise<void> {
		if (!input.fileBuffer) {
			throw this.createError('VALIDATION_ERROR', 'File buffer is required')
		}

		// Validate file size
		const maxSize = 50 * 1024 * 1024 // 50MB
		if (input.fileBuffer.length > maxSize) {
			throw this.createError('FILE_TOO_LARGE', `File exceeds maximum size of 50MB`)
		}

		// Validate file type
		const fileType = this.detectFileType(input)
		if (!fileType) {
			throw this.createError('UNKNOWN_FILE_TYPE', 'Unable to determine file type')
		}

		if (!this.isSupportedFormat(fileType)) {
			throw this.createError(
				'UNSUPPORTED_FILE_TYPE',
				`File type '${fileType}' is not supported`
			)
		}
	}

	// ========================================================================
	// FileExtractor Interface
	// ========================================================================

	/**
	 * Extract content from a file
	 */
	async extractFromFile(buffer: Buffer, options?: FileOptions): Promise<ExtractionResult> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation('extractFromFile')

		try {
			const fileType = options?.fileType || this.detectFileTypeFromBuffer(buffer)
			const fileName = options?.fileName || 'document'

			this.logger.info('Extracting file content', {
				fileType,
				fileName,
				size: buffer.length,
			})

			// Extract metadata
			const metadata = await this.extractMetadata(buffer, options)

			// Determine extraction strategy
			let text: string | null = null
			let extractionMethod = 'unknown'

			// Try MarkItDown for Office formats
			if (this.isOfficeFormat(fileType) && this.markitdownEnabled) {
				try {
					const result = await convertWithMarkItDown(buffer, fileName)
					text = result.markdown
					extractionMethod = 'markitdown'
					this.logger.debug('MarkItDown extraction successful', {
						length: text.length,
					})
				} catch (error) {
					this.logger.warn('MarkItDown extraction failed, trying fallback', {
						error: (error as Error).message,
					})
					// Fall through to fallback
				}
			}

			// Try direct text extraction for text formats
			if (!text && this.isTextFormat(fileType)) {
				try {
					text = await this.extractTextFromBuffer(buffer, fileType)
					extractionMethod = 'direct-text'
				} catch (error) {
					this.logger.warn('Direct text extraction failed', {
						error: (error as Error).message,
					})
				}
			}

			// Final fallback: try MarkItDown anyway
			if (!text && this.markitdownEnabled) {
				try {
					const result = await convertWithMarkItDown(buffer, fileName)
					text = result.markdown
					extractionMethod = 'markitdown-fallback'
				} catch (error) {
					this.logger.warn('MarkItDown fallback failed', {
						error: (error as Error).message,
					})
				}
			}

			// If still no text, throw error
			if (!text) {
				throw this.createError(
					'EXTRACTION_FAILED',
					`Failed to extract content from ${fileType} file`
				)
			}

			const cleanedText = this.cleanContent(text)

			tracker.end(true)

			return {
				text: cleanedText,
				title: metadata.title || this.extractTitleFromContent(cleanedText),
				source: 'file',
				url: null,
				contentType: options?.mimeType || this.getMimeTypeForExtension(fileType),
				raw: {
					metadata,
					fileType,
					extractionMethod,
				},
				wordCount: this.countWords(cleanedText),
				extractorUsed: 'FileExtractor',
				extractionMetadata: {
					fileName: metadata.fileName,
					fileSize: metadata.fileSize,
					author: metadata.author,
					creationDate: metadata.creationDate,
					modificationDate: metadata.modificationDate,
					extractionMethod,
				},
			}
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, 'extractFromFile')
		}
	}

	/**
	 * Extract metadata from file
	 */
	async extractMetadata(buffer: Buffer, options?: FileOptions): Promise<FileMetadata> {
		const fileName = options?.fileName || 'document'
		const mimeType = options?.mimeType || 'application/octet-stream'

		// Basic metadata that we can always provide
		const metadata: FileMetadata = {
			fileName,
			mimeType,
			fileSize: buffer.length,
		}

		// TODO: Extract more detailed metadata from Office documents
		// This would require parsing the document structure
		// For now, return basic metadata

		return metadata
	}

	/**
	 * Detect file type from input
	 */
	detectFileType(input: ExtractionInput): string | null {
		// Try file extension first
		if (input.fileName) {
			const ext = this.getFileExtension(input.fileName)
			if (ext && this.isSupportedFormat(ext)) return ext
		}

		// Try explicit type
		if (input.type && this.isSupportedFormat(input.type)) {
			return input.type
		}

		// Try MIME type
		if (input.mimeType) {
			const ext = this.getExtensionFromMimeType(input.mimeType)
			if (ext && this.isSupportedFormat(ext)) return ext
		}

		// Try buffer detection
		if (input.fileBuffer) {
			return this.detectFileTypeFromBuffer(input.fileBuffer)
		}

		return null
	}

	// ========================================================================
	// Private Methods
	// ========================================================================

	/**
	 * Extract text directly from buffer for text formats
	 */
	private async extractTextFromBuffer(buffer: Buffer, fileType: string): Promise<string> {
		try {
			// Decode buffer to string
			let text = buffer.toString('utf-8')

			// Format-specific processing
			switch (fileType) {
				case 'json':
					// Pretty-print JSON
					try {
						const json = JSON.parse(text)
						text = JSON.stringify(json, null, 2)
					} catch {
						// Keep original if not valid JSON
					}
					break

				case 'xml':
					// Add some formatting for readability
					text = text.replace(/></g, '>\n<')
					break

				case 'yaml':
				case 'yml':
					// YAML is already well-formatted
					break

				case 'csv':
					// Convert CSV to readable format
					text = this.formatCsv(text)
					break

				default:
					// Plain text - no special processing needed
					break
			}

			return text
		} catch (error) {
			throw this.createError(
				'TEXT_EXTRACTION_FAILED',
				`Failed to extract text from ${fileType}: ${(error as Error).message}`
			)
		}
	}

	/**
	 * Format CSV for better readability
	 */
	private formatCsv(csv: string): string {
		try {
			const lines = csv.split('\n').filter((line) => line.trim())
			if (lines.length === 0) return csv

			// Get headers
			const headers = lines[0].split(',').map((h) => h.trim())

			// Format as markdown table
			const formattedLines = [
				'| ' + headers.join(' | ') + ' |',
				'| ' + headers.map(() => '---').join(' | ') + ' |',
			]

			// Add data rows
			for (let i = 1; i < Math.min(lines.length, 100); i++) {
				// Limit to 100 rows
				const cells = lines[i].split(',').map((c) => c.trim())
				formattedLines.push('| ' + cells.join(' | ') + ' |')
			}

			if (lines.length > 100) {
				formattedLines.push(`\n... (${lines.length - 100} more rows)`)
			}

			return formattedLines.join('\n')
		} catch {
			// If formatting fails, return original
			return csv
		}
	}

	/**
	 * Detect file type from buffer (magic bytes)
	 */
	private detectFileTypeFromBuffer(buffer: Buffer): string | null {
		// Check magic bytes for common formats
		const magicBytes = buffer.slice(0, 8)

		// Office formats (ZIP-based)
		if (
			magicBytes[0] === 0x50 &&
			magicBytes[1] === 0x4b &&
			magicBytes[2] === 0x03 &&
			magicBytes[3] === 0x04
		) {
			// This is a ZIP file, could be Office document
			// Check for specific Office signatures in the ZIP
			const content = buffer.toString('utf-8', 0, Math.min(1000, buffer.length))

			if (content.includes('word/')) return 'docx'
			if (content.includes('xl/')) return 'xlsx'
			if (content.includes('ppt/')) return 'pptx'

			// Default to docx if Office-like
			if (content.includes('_rels/') || content.includes('[Content_Types].xml')) {
				return 'docx'
			}
		}

		// Check if it's valid UTF-8 text
		try {
			const text = buffer.toString('utf-8', 0, Math.min(1000, buffer.length))
			if (this.isValidUtf8Text(text)) {
				// Try to determine text format
				if (text.trim().startsWith('{') || text.trim().startsWith('[')) return 'json'
				if (text.trim().startsWith('<?xml') || text.includes('<') && text.includes('>')) return 'xml'
				if (/^[a-z_]+:\s/im.test(text)) return 'yaml'
				return 'txt'
			}
		} catch {
			// Not valid text
		}

		return null
	}

	/**
	 * Check if text is valid UTF-8
	 */
	private isValidUtf8Text(text: string): boolean {
		// Check for common non-printable characters that shouldn't be in text
		const nonPrintableCount = (text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g) || []).length
		const ratio = nonPrintableCount / text.length

		// If less than 5% non-printable, consider it text
		return ratio < 0.05
	}

	/**
	 * Get file extension from filename
	 */
	private getFileExtension(fileName: string): string | null {
		const match = fileName.match(/\.([^.]+)$/)
		return match ? match[1].toLowerCase() : null
	}

	/**
	 * Get extension from MIME type
	 */
	private getExtensionFromMimeType(mimeType: string): string | null {
		const mimeMap: Record<string, string> = {
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
			'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
			'application/msword': 'doc',
			'application/vnd.ms-excel': 'xls',
			'application/vnd.ms-powerpoint': 'ppt',
			'application/vnd.oasis.opendocument.text': 'odt',
			'application/vnd.oasis.opendocument.spreadsheet': 'ods',
			'application/vnd.oasis.opendocument.presentation': 'odp',
			'text/plain': 'txt',
			'text/markdown': 'md',
			'application/json': 'json',
			'application/xml': 'xml',
			'text/xml': 'xml',
			'application/x-yaml': 'yaml',
			'text/yaml': 'yaml',
			'text/csv': 'csv',
		}

		return mimeMap[mimeType.toLowerCase()] || null
	}

	/**
	 * Get MIME type for extension
	 */
	private getMimeTypeForExtension(extension: string): string {
		const extMap: Record<string, string> = {
			docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			doc: 'application/msword',
			xls: 'application/vnd.ms-excel',
			ppt: 'application/vnd.ms-powerpoint',
			odt: 'application/vnd.oasis.opendocument.text',
			ods: 'application/vnd.oasis.opendocument.spreadsheet',
			odp: 'application/vnd.oasis.opendocument.presentation',
			txt: 'text/plain',
			md: 'text/markdown',
			markdown: 'text/markdown',
			json: 'application/json',
			xml: 'application/xml',
			yaml: 'application/x-yaml',
			yml: 'application/x-yaml',
			csv: 'text/csv',
		}

		return extMap[extension.toLowerCase()] || 'application/octet-stream'
	}

	/**
	 * Check if format is supported
	 */
	private isSupportedFormat(format: string): boolean {
		return (SUPPORTED_FORMATS as readonly string[]).includes(format.toLowerCase())
	}

	/**
	 * Check if MIME type is supported
	 */
	private isSupportedMimeType(mimeType: string): boolean {
		const ext = this.getExtensionFromMimeType(mimeType)
		return ext !== null && this.isSupportedFormat(ext)
	}

	/**
	 * Check if format is Office format
	 */
	private isOfficeFormat(format: string): boolean {
		return (OFFICE_FORMATS as readonly string[]).includes(format.toLowerCase())
	}

	/**
	 * Check if format is text format
	 */
	private isTextFormat(format: string): boolean {
		return (TEXT_FORMATS as readonly string[]).includes(format.toLowerCase())
	}

	/**
	 * Extract title from content
	 */
	private extractTitleFromContent(content: string): string | null {
		// Get first line or first 100 characters
		const firstLine = content.split('\n')[0].trim()
		if (firstLine.length > 0 && firstLine.length <= 200) {
			return firstLine
		}

		const truncated = content.substring(0, 100).trim()
		return truncated.length > 0 ? truncated + '...' : null
	}

	/**
	 * Clean extracted content
	 */
	private cleanContent(content: string): string {
		// Remove null bytes
		let cleaned = content.replace(/\0/g, '')

		// Normalize whitespace (but preserve formatting for code/structured text)
		cleaned = cleaned.replace(/[ \t]+/g, ' ')

		// Remove excessive line breaks (more than 3)
		cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n')

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

	protected async onHealthCheck(): Promise<boolean> {
		// File extractor is always healthy if it can load
		return true
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create file extractor with optional MarkItDown support
 */
export function createFileExtractor(markitdownEnabled = true): FileExtractor {
	return new FileExtractor(markitdownEnabled)
}
