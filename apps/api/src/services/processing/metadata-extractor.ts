/**
 * Metadata Extraction Service
 *
 * Service for extracting searchable metadata from documents.
 * Features:
 * - Tag extraction from content and existing metadata
 * - @mention detection using regex patterns
 * - Property extraction from metadata objects
 * - Comment/annotation extraction
 * - Structured metadata output for indexing
 * - Validation and normalization
 */

import { BaseService } from "../base/base-service"
import type { ExtractionResult } from "../interfaces"

// ============================================================================
// Constants
// ============================================================================

const MENTION_PATTERN = /@([a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)*)/g
const MAX_MENTION_LENGTH = 50
const MAX_PROPERTY_VALUE_LENGTH = 200

// ============================================================================
// Types
// ============================================================================

/**
 * Options for metadata extraction
 */
export interface MetadataExtractionOptions {
	/** Extract tags from content */
	extractTags?: boolean
	/** Extract @mentions */
	extractMentions?: boolean
	/** Extract properties from metadata */
	extractProperties?: boolean
	/** Extract comments/annotations */
	extractComments?: boolean
	/** Custom property keys to extract */
	propertyKeys?: string[]
	/** Include source metadata */
	includeSource?: boolean
}

/**
 * Extracted metadata result
 */
export interface ExtractedMetadata {
	/** Extracted tags */
	tags: string[]
	/** Extracted @mentions */
	mentions: string[]
	/** Extracted properties */
	properties: Record<string, unknown>
	/** Extracted comments/annotations */
	comments: string[]
	/** Source information */
	source?: {
		type: string | null
		url: string | null
		title: string | null
	}
	/** Extraction statistics */
	statistics: {
		tagCount: number
		mentionCount: number
		propertyCount: number
		commentCount: number
	}
}

/**
 * Metadata extraction service interface
 */
export interface MetadataExtractorService {
	/**
	 * Extract metadata from extraction result
	 */
	extract(
		extraction: ExtractionResult,
		options?: MetadataExtractionOptions,
	): Promise<ExtractedMetadata>

	/**
	 * Extract metadata from raw content
	 */
	extractFromContent(
		content: string,
		metadata?: Record<string, unknown>,
		options?: MetadataExtractionOptions,
	): Promise<ExtractedMetadata>

	/**
	 * Extract tags from content and metadata
	 */
	extractTags(
		content: string,
		metadata?: Record<string, unknown>,
	): Promise<string[]>

	/**
	 * Extract @mentions from content
	 */
	extractMentions(content: string): Promise<string[]>

	/**
	 * Extract properties from metadata object
	 */
	extractProperties(
		metadata: Record<string, unknown>,
		propertyKeys?: string[],
	): Promise<Record<string, unknown>>

	/**
	 * Extract comments/annotations
	 */
	extractComments(
		content: string,
		metadata?: Record<string, unknown>,
	): Promise<string[]>

	/**
	 * Validate extraction options
	 */
	validateOptions(options: MetadataExtractionOptions): void
}

// ============================================================================
// Metadata Extraction Service Implementation
// ============================================================================

/**
 * Service for extracting searchable metadata from documents
 */
export class MetadataExtractor
	extends BaseService
	implements MetadataExtractorService
{
	constructor() {
		super("MetadataExtractor")
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Extract metadata from extraction result
	 */
	async extract(
		extraction: ExtractionResult,
		options?: MetadataExtractionOptions,
	): Promise<ExtractedMetadata> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("extract")

		try {
			const config = this.getConfig(options)

			this.logger.info("Extracting metadata", {
				contentLength: extraction.text.length,
				hasMetadata: !!extraction.raw,
				options: config,
			})

			// Validate extraction
			this.validateExtraction(extraction)

			// Extract each metadata type
			const tags = config.extractTags
				? await this.extractTags(extraction.text, extraction.raw || undefined)
				: []

			const mentions = config.extractMentions
				? await this.extractMentions(extraction.text)
				: []

			const properties = config.extractProperties
				? await this.extractProperties(
						extraction.raw || {},
						config.propertyKeys,
					)
				: {}

			const comments = config.extractComments
				? await this.extractComments(
						extraction.text,
						extraction.raw || undefined,
					)
				: []

			// Build result
			const result: ExtractedMetadata = {
				tags,
				mentions,
				properties,
				comments,
				statistics: {
					tagCount: tags.length,
					mentionCount: mentions.length,
					propertyCount: Object.keys(properties).length,
					commentCount: comments.length,
				},
			}

			// Include source if requested
			if (config.includeSource) {
				result.source = {
					type: extraction.contentType,
					url: extraction.url,
					title: extraction.title,
				}
			}

			tracker.end(true)

			this.logger.info("Metadata extracted", {
				tagCount: result.statistics.tagCount,
				mentionCount: result.statistics.mentionCount,
				propertyCount: result.statistics.propertyCount,
				commentCount: result.statistics.commentCount,
			})

			return result
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "extract")
		}
	}

	/**
	 * Extract metadata from raw content
	 */
	async extractFromContent(
		content: string,
		metadata?: Record<string, unknown>,
		options?: MetadataExtractionOptions,
	): Promise<ExtractedMetadata> {
		const extraction: ExtractionResult = {
			text: content,
			title: null,
			source: "raw-content",
			url: null,
			contentType: null,
			raw: metadata || null,
			wordCount: content.split(/\s+/).length,
		}

		return await this.extract(extraction, options)
	}

	/**
	 * Extract tags from content and metadata
	 */
	async extractTags(
		content: string,
		metadata?: Record<string, unknown>,
	): Promise<string[]> {
		const tracker = this.performanceMonitor.startOperation("extractTags")

		try {
			const tags = new Set<string>()

			// Extract from metadata tags field
			if (metadata?.tags) {
				const metadataTags = this.normalizeTagsInput(metadata.tags)
				for (const tag of metadataTags) {
					tags.add(tag)
				}
			}

			// Extract from metadata keywords field
			if (metadata?.keywords) {
				const keywords = this.normalizeTagsInput(metadata.keywords)
				for (const keyword of keywords) {
					tags.add(keyword)
				}
			}

			// Extract from metadata categories field
			if (metadata?.categories) {
				const categories = this.normalizeTagsInput(metadata.categories)
				for (const category of categories) {
					tags.add(category)
				}
			}

			// Extract hashtags from content
			const hashtagMatches = content.match(/#([a-zA-Z0-9_-]+)/g)
			if (hashtagMatches) {
				for (const match of hashtagMatches) {
					const tag = match.slice(1).toLowerCase()
					if (tag.length >= 2 && tag.length <= 50) {
						tags.add(tag)
					}
				}
			}

			tracker.end(true)

			return Array.from(tags).sort()
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "extractTags")
		}
	}

	/**
	 * Extract @mentions from content
	 */
	async extractMentions(content: string): Promise<string[]> {
		const tracker = this.performanceMonitor.startOperation("extractMentions")

		try {
			const mentions = new Set<string>()
			const matches = content.matchAll(MENTION_PATTERN)

			for (const match of matches) {
				const mention = match[1].trim()

				// Validate mention length
				if (mention.length === 0 || mention.length > MAX_MENTION_LENGTH) {
					continue
				}

				// Normalize mention (lowercase, remove extra spaces)
				const normalized = mention.toLowerCase().replace(/\s+/g, " ")

				mentions.add(normalized)
			}

			tracker.end(true)

			return Array.from(mentions).sort()
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "extractMentions")
		}
	}

	/**
	 * Extract properties from metadata object
	 */
	async extractProperties(
		metadata: Record<string, unknown>,
		propertyKeys?: string[],
	): Promise<Record<string, unknown>> {
		const tracker = this.performanceMonitor.startOperation("extractProperties")

		try {
			const properties: Record<string, unknown> = {}

			// Default property keys if not provided
			const keysToExtract = propertyKeys || [
				"status",
				"priority",
				"assignee",
				"project",
				"type",
				"category",
				"department",
				"owner",
				"created",
				"modified",
				"author",
				"version",
				"stage",
				"phase",
				"label",
				"labels",
			]

			// Extract specified properties
			for (const key of keysToExtract) {
				if (key in metadata) {
					const value = metadata[key]

					// Skip null/undefined
					if (value === null || value === undefined) {
						continue
					}

					// Normalize property value
					const normalized = this.normalizePropertyValue(value)
					if (normalized !== null) {
						properties[key] = normalized
					}
				}
			}

			// Also check for nested properties
			if (metadata.properties && typeof metadata.properties === "object") {
				const nestedProps = metadata.properties as Record<string, unknown>
				for (const [key, value] of Object.entries(nestedProps)) {
					if (value !== null && value !== undefined) {
						const normalized = this.normalizePropertyValue(value)
						if (normalized !== null) {
							properties[key] = normalized
						}
					}
				}
			}

			tracker.end(true)

			return properties
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "extractProperties")
		}
	}

	/**
	 * Extract comments/annotations
	 */
	async extractComments(
		content: string,
		metadata?: Record<string, unknown>,
	): Promise<string[]> {
		const tracker = this.performanceMonitor.startOperation("extractComments")

		try {
			const comments: string[] = []

			// Extract from metadata comments field
			if (metadata?.comments) {
				const metadataComments = this.normalizeCommentsInput(metadata.comments)
				comments.push(...metadataComments)
			}

			// Extract from metadata annotations field
			if (metadata?.annotations) {
				const annotations = this.normalizeCommentsInput(metadata.annotations)
				comments.push(...annotations)
			}

			// Extract from metadata notes field
			if (metadata?.notes) {
				const notes = this.normalizeCommentsInput(metadata.notes)
				comments.push(...notes)
			}

			tracker.end(true)

			return comments
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "extractComments")
		}
	}

	/**
	 * Validate extraction options
	 */
	validateOptions(options: MetadataExtractionOptions): void {
		// At least one extraction type should be enabled
		const hasAnyEnabled =
			options.extractTags ||
			options.extractMentions ||
			options.extractProperties ||
			options.extractComments

		if (!hasAnyEnabled) {
			throw this.createError(
				"INVALID_OPTIONS",
				"At least one extraction type must be enabled",
			)
		}

		// Validate property keys if provided
		if (options.propertyKeys) {
			if (!Array.isArray(options.propertyKeys)) {
				throw this.createError(
					"INVALID_PROPERTY_KEYS",
					"Property keys must be an array",
				)
			}

			if (options.propertyKeys.length === 0) {
				throw this.createError(
					"INVALID_PROPERTY_KEYS",
					"Property keys cannot be empty",
				)
			}

			for (const key of options.propertyKeys) {
				if (typeof key !== "string" || key.trim().length === 0) {
					throw this.createError(
						"INVALID_PROPERTY_KEY",
						"Property keys must be non-empty strings",
					)
				}
			}
		}
	}

	// ========================================================================
	// Private Methods - Configuration
	// ========================================================================

	/**
	 * Get normalized configuration
	 */
	private getConfig(
		options?: MetadataExtractionOptions,
	): Required<MetadataExtractionOptions> {
		const defaults: Required<MetadataExtractionOptions> = {
			extractTags: true,
			extractMentions: true,
			extractProperties: true,
			extractComments: true,
			propertyKeys: [],
			includeSource: false,
		}

		if (!options) {
			return defaults
		}

		// Validate if provided
		this.validateOptions(options)

		return {
			extractTags: options.extractTags ?? defaults.extractTags,
			extractMentions: options.extractMentions ?? defaults.extractMentions,
			extractProperties:
				options.extractProperties ?? defaults.extractProperties,
			extractComments: options.extractComments ?? defaults.extractComments,
			propertyKeys: options.propertyKeys ?? defaults.propertyKeys,
			includeSource: options.includeSource ?? defaults.includeSource,
		}
	}

	// ========================================================================
	// Private Methods - Validation
	// ========================================================================

	/**
	 * Validate extraction input
	 */
	private validateExtraction(extraction: ExtractionResult): void {
		if (!extraction.text || extraction.text.trim().length === 0) {
			throw this.createError("EMPTY_CONTENT", "Content cannot be empty")
		}
	}

	// ========================================================================
	// Private Methods - Normalization
	// ========================================================================

	/**
	 * Normalize tags input (handle string, array, or other formats)
	 */
	private normalizeTagsInput(input: unknown): string[] {
		if (typeof input === "string") {
			// Split by common separators
			return input
				.split(/[,;|]/)
				.map((t) => t.trim().toLowerCase())
				.filter((t) => t.length >= 2 && t.length <= 50)
		}

		if (Array.isArray(input)) {
			return input
				.filter((t) => typeof t === "string")
				.map((t) => t.trim().toLowerCase())
				.filter((t) => t.length >= 2 && t.length <= 50)
		}

		return []
	}

	/**
	 * Normalize comments input
	 */
	private normalizeCommentsInput(input: unknown): string[] {
		if (typeof input === "string") {
			const trimmed = input.trim()
			return trimmed.length > 0 ? [trimmed] : []
		}

		if (Array.isArray(input)) {
			return input
				.filter((c) => typeof c === "string" || typeof c === "object")
				.map((c) => {
					if (typeof c === "string") {
						return c.trim()
					}
					// Handle comment objects with text/content field
					if (typeof c === "object" && c !== null) {
						const obj = c as Record<string, unknown>
						const text = obj.text || obj.content || obj.body || obj.comment
						if (typeof text === "string") {
							return text.trim()
						}
					}
					return ""
				})
				.filter((c) => c.length > 0)
		}

		return []
	}

	/**
	 * Normalize property value
	 */
	private normalizePropertyValue(value: unknown): unknown {
		// Handle null/undefined
		if (value === null || value === undefined) {
			return null
		}

		// Handle strings
		if (typeof value === "string") {
			const trimmed = value.trim()
			if (trimmed.length === 0) {
				return null
			}
			// Truncate if too long
			return trimmed.length > MAX_PROPERTY_VALUE_LENGTH
				? trimmed.slice(0, MAX_PROPERTY_VALUE_LENGTH)
				: trimmed
		}

		// Handle numbers and booleans
		if (typeof value === "number" || typeof value === "boolean") {
			return value
		}

		// Handle dates
		if (value instanceof Date) {
			return value.toISOString()
		}

		// Handle arrays
		if (Array.isArray(value)) {
			// Convert array to comma-separated string
			const normalized = value
				.map((v) => this.normalizePropertyValue(v))
				.filter((v) => v !== null)
			return normalized.length > 0 ? normalized : null
		}

		// Handle objects - convert to JSON string
		if (typeof value === "object") {
			try {
				const json = JSON.stringify(value)
				return json.length > MAX_PROPERTY_VALUE_LENGTH
					? json.slice(0, MAX_PROPERTY_VALUE_LENGTH)
					: json
			} catch {
				return null
			}
		}

		return null
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Test metadata extraction with sample data
		try {
			const sampleExtraction: ExtractionResult = {
				text: "Sample document about @testing with #metadata",
				title: "Test Document",
				source: "test",
				url: null,
				contentType: "text/plain",
				raw: {
					tags: ["test", "sample"],
					status: "active",
				},
				wordCount: 5,
			}

			const result = await this.extract(sampleExtraction)
			return (
				result.statistics.tagCount > 0 || result.statistics.mentionCount > 0
			)
		} catch {
			return false
		}
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create metadata extractor service
 */
export function createMetadataExtractor(): MetadataExtractor {
	return new MetadataExtractor()
}
