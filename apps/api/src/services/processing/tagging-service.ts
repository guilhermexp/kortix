/**
 * Tagging Service
 *
 * Automatic tag generation service for content categorization.
 * Features:
 * - AI-powered tag extraction using Grok (X-AI)
 * - Fallback keyword extraction from content
 * - Configurable tag categories and limits
 * - Multi-language support (EN, PT)
 * - Tag validation and deduplication
 * - Domain-specific tagging support
 */

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
export class TaggingService implements ITaggingService {
	private initialized = false
	private readonly maxTags: number
	private readonly locale: "pt-BR" | "en-US"
	private readonly provider: "grok" | "gemini" | "heuristic"

	constructor(options?: TaggingOptions) {
		this.maxTags = Math.max(
			MIN_TAGS,
			Math.min(options?.maxTags ?? DEFAULT_MAX_TAGS, MAX_TAGS),
		)
		this.locale = options?.locale ?? "en-US"
		this.provider = options?.provider ?? "grok"
	}

	// ========================================================================
	// Initialization
	// ========================================================================

	async initialize(): Promise<void> {
		if (this.initialized) return
		this.initialized = true
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
		try {
			const config = {
				maxTags: options?.maxTags ?? this.maxTags,
				locale: options?.locale ?? this.locale,
				context: options?.context,
				categories: options?.categories,
				provider: options?.provider ?? this.provider,
			}

			console.info("Generating tags", {
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

			console.info("Tags generated", {
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
			throw error instanceof Error ? error : new Error(String(error))
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
		if (config.provider === "grok") {
			try {
				const tags = await this.generateWithAI(content, config)
				if (tags && tags.length >= MIN_TAGS) {
					return tags
				}
			} catch (error) {
				console.warn("AI tag generation failed", {
					error: (error as Error).message,
				})
			}
		}

		// Fallback to heuristic extraction
		console.info("Using heuristic tag extraction")
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

			// Skip tags that look like URL parts or repo namespaces
			if (
				cleanTag.startsWith("/") ||
				cleanTag.endsWith(":") ||
				cleanTag.endsWith("/")
			) {
				continue
			}

			// Skip common URL/path fragments
			if (
				/^(http|https|www|com|org|io|github|google|hugging|huggingface)$/i.test(
					cleanTag,
				)
			) {
				continue
			}

			// Skip tags containing URL patterns
			if (/^[a-z0-9-]+\.(com|org|io|net|co|ai)$/i.test(cleanTag)) {
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
			throw new Error("Content cannot be empty")
		}

		if (content.length < 50) {
			throw new Error("Content must be at least 50 characters")
		}
	}
}
