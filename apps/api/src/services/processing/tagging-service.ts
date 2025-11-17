/**
 * Tagging Service
 *
 * Automatic tag generation service for content categorization.
 * Features:
 * - AI-powered tag extraction using OpenRouter
 * - Fallback keyword extraction from content
 * - Configurable tag categories and limits
 * - Multi-language support (EN, PT)
 * - Tag validation and deduplication
 * - Domain-specific tagging support
 */

import { BaseService } from "../base/base-service"
import type {
	ExtractionResult,
	TaggingService as ITaggingService,
	TaggingOptions,
	TaggingResult,
} from "../interfaces"
import { generateCategoryTags as generateCategoryTagsProvider } from "../summarizer"

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_TAGS = 6
const MIN_TAGS = 3
const MAX_TAGS = 12
const MAX_TAG_LENGTH = 28
const MIN_TAG_LENGTH = 3

// Common stop words to exclude
const STOP_WORDS = new Set([
	// English
	"the",
	"and",
	"for",
	"with",
	"from",
	"this",
	"that",
	"have",
	"been",
	"were",
	"about",
	"http",
	"https",
	"www",
	// Portuguese
	"para",
	"como",
	"onde",
	"quando",
	"porque",
	"sobre",
	"entre",
	"mais",
	"menos",
	"uma",
	"dos",
	"das",
	"nos",
	"nas",
	"com",
	"não",
	// Generic
	"document",
	"summary",
	"resumo",
	"overview",
	"introduction",
	"video",
	"image",
	"file",
	"page",
	"website",
])

// ============================================================================
// Tagging Service Implementation
// ============================================================================

/**
 * Service for automatic tag generation
 */
export class TaggingService extends BaseService implements ITaggingService {
	private readonly maxTags: number
	private readonly locale: "pt-BR" | "en-US"
	private readonly provider: "openrouter" | "heuristic"

	constructor(options?: TaggingOptions) {
		super("TaggingService")

		this.maxTags = Math.max(
			MIN_TAGS,
			Math.min(options?.maxTags ?? DEFAULT_MAX_TAGS, MAX_TAGS),
		)
		this.locale = options?.locale ?? "en-US"
		this.provider = options?.provider ?? "openrouter"
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Generate tags for content
	 */
	async generateTags(
		content: string,
		options?: TaggingOptions,
	): Promise<TaggingResult> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("generateTags")

		try {
			const config = {
				maxTags: options?.maxTags ?? this.maxTags,
				locale: options?.locale ?? this.locale,
				context: options?.context,
				categories: options?.categories,
				provider: options?.provider ?? this.provider,
			}

			this.logger.info("Generating tags", {
				contentLength: content.length,
				maxTags: config.maxTags,
				locale: config.locale,
				provider: config.provider,
			})

			// Validate input
			this.validateInput(content)

			// Generate tags with fallback
			const tags = await this.generateTagsWithFallback(content, config)

			// Validate and clean tags
			const cleanedTags = this.validateAndCleanTags(tags, config.maxTags)

			// Categorize tags if categories provided
			const categorizedTags = config.categories
				? this.categorizeTags(cleanedTags, config.categories)
				: undefined

			tracker.end(true)

			this.logger.info("Tags generated", {
				tagCount: cleanedTags.length,
				tags: cleanedTags,
			})

			return {
				tags: cleanedTags,
				categorizedTags,
				provider: config.provider,
				confidence: this.calculateConfidence(cleanedTags, content),
				metadata: {
					locale: config.locale,
					maxTags: config.maxTags,
				},
			}
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "generateTags")
		}
	}

	/**
	 * Generate tags from extraction result
	 */
	async generateTagsFromExtraction(
		extraction: ExtractionResult,
	): Promise<TaggingResult> {
		const context = {
			title: extraction.title,
			url: extraction.url,
			source: extraction.source,
			contentType: extraction.contentType,
		}

		return await this.generateTags(extraction.text, { context })
	}

	/**
	 * Validate tagging options
	 */
	validateTaggingOptions(options: TaggingOptions): void {
		if (options.maxTags !== undefined) {
			if (options.maxTags < MIN_TAGS) {
				throw this.createError(
					"INVALID_MAX_TAGS",
					`Max tags must be at least ${MIN_TAGS}`,
				)
			}
			if (options.maxTags > MAX_TAGS) {
				throw this.createError(
					"INVALID_MAX_TAGS",
					`Max tags cannot exceed ${MAX_TAGS}`,
				)
			}
		}

		if (options.locale !== undefined) {
			const validLocales = ["pt-BR", "en-US"]
			if (!validLocales.includes(options.locale)) {
				throw this.createError(
					"INVALID_LOCALE",
					`Locale must be one of: ${validLocales.join(", ")}`,
				)
			}
		}
	}

	// ========================================================================
	// Private Methods - Tag Generation
	// ========================================================================

	/**
	 * Generate tags with fallback strategies
	 */
	private async generateTagsWithFallback(
		content: string,
		config: Required<TaggingOptions>,
	): Promise<string[]> {
		// Try AI provider first
		if (config.provider === "openrouter") {
			try {
				const tags = await this.generateWithAI(content, config)
				if (tags && tags.length >= MIN_TAGS) {
					return tags
				}
			} catch (error) {
				this.logger.warn("AI tag generation failed", {
					error: (error as Error).message,
				})
			}
		}

		// Fallback to heuristic extraction
		this.logger.info("Using heuristic tag extraction")
		return this.generateHeuristicTags(content, config)
	}

	/**
	 * Generate tags using AI provider
	 */
	private async generateWithAI(
		content: string,
		config: Required<TaggingOptions>,
	): Promise<string[]> {
		const context = config.context || {}

		const tags = await generateCategoryTagsProvider(
			content,
			{
				title: context.title,
				url: context.url,
			},
			{
				maxTags: config.maxTags,
				locale: config.locale,
			},
		)

		return tags
	}

	/**
	 * Generate tags using heuristic keyword extraction
	 */
	private generateHeuristicTags(
		content: string,
		config: Required<TaggingOptions>,
	): string[] {
		// Combine title and content
		const context = config.context || {}
		const source = (context.title ? `${context.title}. ` : "") + content

		// Extract words
		const words = source
			.toLowerCase()
			.replace(/[^a-zà-ú0-9\s_-]/gi, " ")
			.split(/\s+/)
			.filter((w) => w.length >= MIN_TAG_LENGTH && w.length <= MAX_TAG_LENGTH)
			.filter((w) => !STOP_WORDS.has(w))

		// Count word frequency
		const freq = new Map<string, number>()
		for (const word of words) {
			freq.set(word, (freq.get(word) || 0) + 1)
		}

		// Sort by frequency
		const sorted = Array.from(freq.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([word]) => word)

		// Take top tags
		const tags: string[] = []
		for (const word of sorted) {
			if (tags.includes(word)) continue
			tags.push(word)
			if (tags.length >= config.maxTags) break
		}

		return tags
	}

	// ========================================================================
	// Private Methods - Tag Processing
	// ========================================================================

	/**
	 * Validate and clean tags
	 */
	private validateAndCleanTags(tags: string[], maxTags: number): string[] {
		const cleaned: string[] = []

		for (const tag of tags) {
			// Clean tag
			const cleanTag = tag
				.toLowerCase()
				.trim()
				.replace(/^#+/, "") // Remove leading #
				.replace(/\s{2,}/g, " ") // Normalize spaces
				.replace(/[^a-zà-ú0-9\s_-]/gi, "") // Remove special chars

			// Skip if too short or too long
			if (
				cleanTag.length < MIN_TAG_LENGTH ||
				cleanTag.length > MAX_TAG_LENGTH
			) {
				continue
			}

			// Skip stop words
			if (STOP_WORDS.has(cleanTag)) {
				continue
			}

			// Skip duplicates
			if (cleaned.includes(cleanTag)) {
				continue
			}

			cleaned.push(cleanTag)

			// Stop if we have enough tags
			if (cleaned.length >= maxTags) {
				break
			}
		}

		return cleaned
	}

	/**
	 * Categorize tags into predefined categories
	 */
	private categorizeTags(
		tags: string[],
		categories: string[],
	): Record<string, string[]> {
		const categorized: Record<string, string[]> = {}

		// Initialize categories
		for (const category of categories) {
			categorized[category] = []
		}

		// Add uncategorized category
		categorized.other = []

		// Simple keyword matching for categorization
		// In a real implementation, this could use embeddings or ML
		for (const tag of tags) {
			let matched = false

			for (const category of categories) {
				// Check if tag contains category keyword
				if (
					tag.includes(category.toLowerCase()) ||
					category.toLowerCase().includes(tag)
				) {
					categorized[category].push(tag)
					matched = true
					break
				}
			}

			if (!matched) {
				categorized.other.push(tag)
			}
		}

		return categorized
	}

	/**
	 * Calculate confidence score for tags
	 */
	private calculateConfidence(tags: string[], content: string): number {
		if (tags.length === 0) return 0

		// Higher confidence if we have more tags
		let score = Math.min(tags.length / DEFAULT_MAX_TAGS, 1.0) * 0.3

		// Higher confidence if tags appear frequently in content
		const lowerContent = content.toLowerCase()
		let appearances = 0

		for (const tag of tags) {
			const regex = new RegExp(`\\b${tag}\\b`, "gi")
			const matches = lowerContent.match(regex)
			if (matches) {
				appearances += matches.length
			}
		}

		score += Math.min(appearances / (tags.length * 3), 1.0) * 0.7

		return Math.min(Math.max(score, 0), 1)
	}

	// ========================================================================
	// Private Methods - Validation
	// ========================================================================

	/**
	 * Validate input content
	 */
	private validateInput(content: string): void {
		if (!content || content.trim().length === 0) {
			throw this.createError("EMPTY_CONTENT", "Content cannot be empty")
		}

		if (content.length < 50) {
			throw this.createError(
				"CONTENT_TOO_SHORT",
				"Content must be at least 50 characters",
			)
		}
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Test tag generation with sample text
		try {
			const sampleText = `
				This is a sample document about artificial intelligence and machine learning.
				It discusses natural language processing, neural networks, and deep learning algorithms.
				The content covers various aspects of AI technology and its applications.
			`
			const result = await this.generateTags(sampleText, {
				maxTags: 5,
				context: { title: "AI and Machine Learning" },
			})
			return result.tags.length > 0
		} catch {
			return false
		}
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create tagging service with optional configuration
 */
export function createTaggingService(options?: TaggingOptions): TaggingService {
	return new TaggingService(options)
}
