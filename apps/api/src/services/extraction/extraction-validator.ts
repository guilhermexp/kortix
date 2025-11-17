/**
 * Extraction Validator
 *
 * Provides input validation and output sanitization for extraction services.
 * Features:
 * - Input validation (URLs, file buffers, content)
 * - Content sanitization (XSS prevention, Unicode normalization)
 * - Security checks (malicious content detection)
 * - Size limit enforcement
 * - Format validation
 */

import { BaseService } from "../base/base-service"
import type { ExtractionInput, ExtractionResult } from "../interfaces"

// ============================================================================
// Validation Rules
// ============================================================================

const VALIDATION_RULES = {
	// Size limits
	MAX_BUFFER_SIZE: 100 * 1024 * 1024, // 100MB
	MAX_CONTENT_LENGTH: 50 * 1024 * 1024, // 50MB
	MAX_URL_LENGTH: 2048,
	MAX_FILENAME_LENGTH: 255,

	// Text content limits
	MAX_TEXT_LENGTH: 10 * 1024 * 1024, // 10MB
	MIN_TEXT_LENGTH: 10, // 10 characters minimum

	// Allowed protocols
	ALLOWED_PROTOCOLS: ["http:", "https:", "ftp:", "ftps:"],

	// Blocked domains (example - expand as needed)
	BLOCKED_DOMAINS: ["localhost", "127.0.0.1", "0.0.0.0", "::1"],

	// Dangerous patterns
	DANGEROUS_PATTERNS: [
		/<script[\s\S]*?>/gi,
		/<iframe[\s\S]*?>/gi,
		/javascript:/gi,
		/data:text\/html/gi,
		/on\w+\s*=/gi, // Event handlers
	],
} as const

// ============================================================================
// Extraction Validator Implementation
// ============================================================================

/**
 * Validator for extraction inputs and outputs
 */
export class ExtractionValidator extends BaseService {
	constructor() {
		super("ExtractionValidator")
	}

	// ========================================================================
	// Input Validation
	// ========================================================================

	/**
	 * Validate extraction input
	 */
	async validateInput(input: ExtractionInput): Promise<void> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("validateInput")

		try {
			this.logger.debug("Validating extraction input")

			// Check that at least one source is provided
			if (!input.originalContent && !input.url && !input.fileBuffer) {
				throw this.createError(
					"INVALID_INPUT",
					"Input must have at least one of: originalContent, url, or fileBuffer",
				)
			}

			// Validate URL if provided
			if (input.url) {
				await this.validateUrl(input.url)
			}

			// Validate file buffer if provided
			if (input.fileBuffer) {
				await this.validateFileBuffer(input.fileBuffer, input.fileName)
			}

			// Validate content if provided
			if (input.originalContent) {
				await this.validateContent(input.originalContent)
			}

			// Validate metadata
			if (input.metadata) {
				await this.validateMetadata(input.metadata)
			}

			tracker.end(true)
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "validateInput")
		}
	}

	/**
	 * Validate URL
	 */
	async validateUrl(url: string): Promise<void> {
		// Check length
		if (url.length > VALIDATION_RULES.MAX_URL_LENGTH) {
			throw this.createError(
				"URL_TOO_LONG",
				`URL length ${url.length} exceeds maximum of ${VALIDATION_RULES.MAX_URL_LENGTH}`,
			)
		}

		// Parse URL
		let parsedUrl: URL
		try {
			parsedUrl = new URL(url)
		} catch (error) {
			throw this.createError("INVALID_URL", `Invalid URL format: ${url}`)
		}

		// Check protocol
		if (!VALIDATION_RULES.ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
			throw this.createError(
				"INVALID_PROTOCOL",
				`Protocol ${parsedUrl.protocol} is not allowed. Allowed: ${VALIDATION_RULES.ALLOWED_PROTOCOLS.join(", ")}`,
			)
		}

		// Check for blocked domains
		const hostname = parsedUrl.hostname.toLowerCase()
		for (const blocked of VALIDATION_RULES.BLOCKED_DOMAINS) {
			if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
				throw this.createError(
					"BLOCKED_DOMAIN",
					`Domain ${hostname} is blocked`,
				)
			}
		}

		// Check for private IP addresses (basic check)
		if (this.isPrivateIP(hostname)) {
			throw this.createError(
				"PRIVATE_IP",
				`Private IP addresses are not allowed: ${hostname}`,
			)
		}

		this.logger.debug("URL validation passed", { url })
	}

	/**
	 * Validate file buffer
	 */
	async validateFileBuffer(
		buffer: Buffer,
		fileName?: string | null,
	): Promise<void> {
		// Check size
		if (buffer.length === 0) {
			throw this.createError("EMPTY_BUFFER", "File buffer is empty")
		}

		if (buffer.length > VALIDATION_RULES.MAX_BUFFER_SIZE) {
			throw this.createError(
				"BUFFER_TOO_LARGE",
				`Buffer size ${buffer.length} exceeds maximum of ${VALIDATION_RULES.MAX_BUFFER_SIZE}`,
			)
		}

		// Validate filename if provided
		if (fileName) {
			if (fileName.length > VALIDATION_RULES.MAX_FILENAME_LENGTH) {
				throw this.createError(
					"FILENAME_TOO_LONG",
					`Filename length ${fileName.length} exceeds maximum of ${VALIDATION_RULES.MAX_FILENAME_LENGTH}`,
				)
			}

			// Check for directory traversal attempts
			if (
				fileName.includes("..") ||
				fileName.includes("/") ||
				fileName.includes("\\")
			) {
				throw this.createError(
					"INVALID_FILENAME",
					"Filename contains invalid characters (directory traversal attempt?)",
				)
			}

			// Check for null bytes
			if (fileName.includes("\0")) {
				throw this.createError(
					"INVALID_FILENAME",
					"Filename contains null bytes",
				)
			}
		}

		// Check for malicious file signatures (basic check)
		await this.checkMaliciousContent(buffer)

		this.logger.debug("File buffer validation passed", {
			size: buffer.length,
			fileName,
		})
	}

	/**
	 * Validate content string
	 */
	async validateContent(content: string): Promise<void> {
		// Check size
		if (content.length > VALIDATION_RULES.MAX_CONTENT_LENGTH) {
			throw this.createError(
				"CONTENT_TOO_LONG",
				`Content length ${content.length} exceeds maximum of ${VALIDATION_RULES.MAX_CONTENT_LENGTH}`,
			)
		}

		// Check for null bytes
		if (content.includes("\0")) {
			throw this.createError("INVALID_CONTENT", "Content contains null bytes")
		}

		this.logger.debug("Content validation passed", {
			length: content.length,
		})
	}

	/**
	 * Validate metadata
	 */
	async validateMetadata(metadata: Record<string, unknown>): Promise<void> {
		// Check size (prevent excessive metadata)
		const metadataStr = JSON.stringify(metadata)
		if (metadataStr.length > 1024 * 1024) {
			// 1MB
			throw this.createError("METADATA_TOO_LARGE", "Metadata exceeds 1MB")
		}

		// Check for dangerous patterns in metadata values
		for (const [key, value] of Object.entries(metadata)) {
			if (typeof value === "string") {
				// Check for XSS attempts
				for (const pattern of VALIDATION_RULES.DANGEROUS_PATTERNS) {
					if (pattern.test(value)) {
						throw this.createError(
							"DANGEROUS_METADATA",
							`Metadata field '${key}' contains dangerous content`,
						)
					}
				}
			}
		}

		this.logger.debug("Metadata validation passed")
	}

	// ========================================================================
	// Output Sanitization
	// ========================================================================

	/**
	 * Sanitize extraction result
	 */
	async sanitizeResult(result: ExtractionResult): Promise<ExtractionResult> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("sanitizeResult")

		try {
			this.logger.debug("Sanitizing extraction result")

			// Sanitize text content
			const sanitizedText = await this.sanitizeText(result.text)

			// Sanitize title
			const sanitizedTitle = result.title
				? await this.sanitizeText(result.title)
				: null

			// Validate text length
			if (sanitizedText.length < VALIDATION_RULES.MIN_TEXT_LENGTH) {
				throw this.createError(
					"TEXT_TOO_SHORT",
					`Extracted text is too short (${sanitizedText.length} chars, minimum ${VALIDATION_RULES.MIN_TEXT_LENGTH})`,
				)
			}

			if (sanitizedText.length > VALIDATION_RULES.MAX_TEXT_LENGTH) {
				throw this.createError(
					"TEXT_TOO_LONG",
					`Extracted text is too long (${sanitizedText.length} chars, maximum ${VALIDATION_RULES.MAX_TEXT_LENGTH})`,
				)
			}

			// Create sanitized result
			const sanitizedResult: ExtractionResult = {
				...result,
				text: sanitizedText,
				title: sanitizedTitle,
			}

			tracker.end(true)

			return sanitizedResult
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "sanitizeResult")
		}
	}

	/**
	 * Sanitize text content
	 */
	async sanitizeText(text: string): Promise<string> {
		let sanitized = text

		// Remove null bytes
		sanitized = sanitized.replace(/\0/g, "")

		// Normalize Unicode characters
		sanitized = this.normalizeUnicode(sanitized)

		// Remove dangerous HTML/JavaScript (if present)
		sanitized = this.removeDangerousContent(sanitized)

		// Normalize whitespace (but preserve structure)
		sanitized = this.normalizeWhitespace(sanitized)

		// Trim excessive line breaks
		sanitized = sanitized.replace(/\n{4,}/g, "\n\n\n")

		// Trim
		sanitized = sanitized.trim()

		return sanitized
	}

	// ========================================================================
	// Private Helper Methods
	// ========================================================================

	/**
	 * Check if hostname is a private IP address
	 */
	private isPrivateIP(hostname: string): boolean {
		// IPv4 private ranges
		const privateIPv4Patterns = [
			/^10\./,
			/^172\.(1[6-9]|2\d|3[01])\./,
			/^192\.168\./,
			/^127\./,
			/^169\.254\./, // Link-local
		]

		// IPv6 private ranges
		const privateIPv6Patterns = [
			/^fc00:/i, // Unique local
			/^fd00:/i, // Unique local
			/^fe80:/i, // Link-local
			/^::1$/i, // Loopback
		]

		for (const pattern of [...privateIPv4Patterns, ...privateIPv6Patterns]) {
			if (pattern.test(hostname)) {
				return true
			}
		}

		return false
	}

	/**
	 * Check for malicious file content (basic check)
	 */
	private async checkMaliciousContent(buffer: Buffer): Promise<void> {
		// Check for executable signatures
		const magicBytes = buffer.slice(0, 4)

		// Windows executables
		if (magicBytes[0] === 0x4d && magicBytes[1] === 0x5a) {
			// MZ header
			throw this.createError(
				"MALICIOUS_FILE",
				"Executable files are not allowed",
			)
		}

		// ELF executables
		if (
			magicBytes[0] === 0x7f &&
			magicBytes[1] === 0x45 &&
			magicBytes[2] === 0x4c &&
			magicBytes[3] === 0x46
		) {
			throw this.createError(
				"MALICIOUS_FILE",
				"Executable files are not allowed",
			)
		}

		// Check for script shebangs in text files
		const firstLine = buffer.toString("utf-8", 0, Math.min(100, buffer.length))
		if (firstLine.startsWith("#!")) {
			// This might be a script - allow it but log it
			this.logger.warn("File appears to be a script", {
				firstLine: firstLine.substring(0, 50),
			})
		}
	}

	/**
	 * Normalize Unicode characters
	 */
	private normalizeUnicode(text: string): string {
		try {
			// Normalize to NFC (Canonical Decomposition, followed by Canonical Composition)
			return text.normalize("NFC")
		} catch {
			// If normalization fails, return original
			return text
		}
	}

	/**
	 * Remove dangerous HTML/JavaScript content
	 */
	private removeDangerousContent(text: string): string {
		let cleaned = text

		// Remove script tags
		cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "")

		// Remove iframe tags
		cleaned = cleaned.replace(/<iframe[\s\S]*?<\/iframe>/gi, "")

		// Remove event handlers
		cleaned = cleaned.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, "")

		// Remove javascript: URLs
		cleaned = cleaned.replace(/javascript:\s*/gi, "")

		// Remove data URLs with HTML
		cleaned = cleaned.replace(/data:text\/html[^"'\s]*/gi, "")

		return cleaned
	}

	/**
	 * Normalize whitespace while preserving structure
	 */
	private normalizeWhitespace(text: string): string {
		let normalized = text

		// Normalize line breaks
		normalized = normalized.replace(/\r\n/g, "\n")
		normalized = normalized.replace(/\r/g, "\n")

		// Normalize spaces and tabs on each line
		const lines = normalized.split("\n")
		const normalizedLines = lines.map((line) => {
			// Preserve leading whitespace for code blocks
			const leadingWhitespace = line.match(/^[\s\t]*/)?.[0] || ""
			const content = line.substring(leadingWhitespace.length)

			// Normalize spaces in content
			const normalizedContent = content.replace(/[\s\t]+/g, " ")

			return leadingWhitespace + normalizedContent
		})

		normalized = normalizedLines.join("\n")

		return normalized
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Validator is always healthy if it can load
		return true
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create extraction validator
 */
export function createExtractionValidator(): ExtractionValidator {
	return new ExtractionValidator()
}
