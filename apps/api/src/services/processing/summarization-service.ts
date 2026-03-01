/**
 * Summarization Service
 *
 * AI-powered document summarization service.
 * Features:
 * - Grok (X-AI) integration as primary provider
 * - Configurable summary length and style
 * - Context-aware summarization (title, URL, source type)
 * - Support for different document types (web, PDF, video, code)
 * - Fallback strategies for failed AI summaries
 * - Multi-language support (EN, PT)
 */

import type {
	ExtractionResult,
	SummarizationService as ISummarizationService,
	SummarizationOptions,
	SummarizationResult,
} from "../interfaces"
import { generateSummary as generateSummaryProvider } from "../summarizer"

// ============================================================================
// Constants
// ============================================================================

const MAX_INPUT_LENGTH = 100000 // characters
const DEFAULT_MAX_LENGTH = 500 // words
const DEFAULT_STYLE = "concise" as const

// ============================================================================
// Summarization Service Implementation
// ============================================================================

/**
 * Service for AI-powered document summarization
 */
export class SummarizationService implements ISummarizationService {
	private initialized = false
	private readonly provider: "grok" | "gemini" | "claude"
	private readonly maxLength: number
	private readonly style: "concise" | "detailed" | "technical"

	constructor(options?: SummarizationOptions) {
		this.provider = options?.provider ?? "grok"
		this.maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH
		this.style = options?.style ?? DEFAULT_STYLE
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
	 * Generate summary for document
	 */
	async summarize(
		content: string,
		options?: SummarizationOptions,
	): Promise<SummarizationResult> {
		try {
			const config = {
				provider: options?.provider ?? this.provider,
				maxLength: options?.maxLength ?? this.maxLength,
				style: options?.style ?? this.style,
				context: options?.context,
			}

			console.info("Generating summary", {
				contentLength: content.length,
				provider: config.provider,
				style: config.style,
			})

			// Validate input
			this.validateInput(content)

			// Truncate if too long
			const safeContent = this.truncateContent(content, MAX_INPUT_LENGTH)

			// Generate summary
			const summary = await this.generateSummaryWithFallback(
				safeContent,
				config,
			)

			// Validate summary quality
			const quality = this.assessSummaryQuality(summary, safeContent)

			console.info("Summary generated", {
				summaryLength: summary.length,
				quality,
			})

			return {
				summary,
				provider: config.provider,
				quality,
				wordCount: this.countWords(summary),
				metadata: {
					originalLength: content.length,
					truncated: content.length > MAX_INPUT_LENGTH,
					style: config.style,
				},
			}
		} catch (error) {
			throw error instanceof Error ? error : new Error(String(error))
		}
	}

	/**
	 * Generate summary from extraction result
	 */
	async summarizeExtraction(
		extraction: ExtractionResult,
	): Promise<SummarizationResult> {
		const context = {
			title: extraction.title,
			url: extraction.url,
			source: extraction.source,
			contentType: extraction.contentType,
		}

		// Handle short content gracefully - use title/description as summary
		const textLength = extraction.text?.length || 0
		if (textLength < 100) {
			console.info("Content too short for AI summarization, using fallback", {
				textLength,
				hasTitle: !!extraction.title,
			})

			// Build a simple summary from available metadata
			const fallbackSummary = extraction.title
				? `${extraction.title}${extraction.description ? `. ${extraction.description}` : ""}`
				: extraction.text || "No content available for summarization."

			return {
				summary: fallbackSummary.slice(0, 500),
				provider: "fallback",
				quality: "low" as const,
				wordCount: this.countWords(fallbackSummary),
				metadata: {
					originalLength: textLength,
					truncated: false,
					style: this.style,
					fallbackReason: "content_too_short",
				},
			}
		}

		return await this.summarize(extraction.text, { context })
	}

	// ========================================================================
	// Private Methods - Summary Generation
	// ========================================================================

	/**
	 * Generate summary with fallback strategies
	 */
	private async generateSummaryWithFallback(
		content: string,
		config: Required<SummarizationOptions>,
	): Promise<string> {
		// Try primary provider
		try {
			const summary = await this.generateWithProvider(content, config)
			if (summary && this.isValidSummary(summary)) {
				return summary
			}
		} catch (error) {
			console.warn("Primary summarization failed", {
				error: (error as Error).message,
			})
		}

		// Fallback to extractive summary
		console.info("Using extractive summary fallback")
		return this.generateExtractiveSummary(content, config)
	}

	/**
	 * Generate summary using AI provider
	 */
	private async generateWithProvider(
		content: string,
		config: Required<SummarizationOptions>,
	): Promise<string | null> {
		// Use existing summarizer with context
		const context = config.context || {}

		const summary = await generateSummaryProvider(content, {
			title: context.title,
			url: context.url,
		})

		return summary
	}

	/**
	 * Generate extractive summary (fallback)
	 */
	private generateExtractiveSummary(
		content: string,
		config: Required<SummarizationOptions>,
	): string {
		// Split into sentences
		const sentences = content
			.replace(/\s+/g, " ")
			.split(/[.!?]+/)
			.map((s) => s.trim())
			.filter((s) => s.length > 20) // Filter out very short sentences

		if (sentences.length === 0) {
			return "No content available for summarization."
		}

		// Calculate how many sentences to include based on max length
		const wordsPerSentence =
			sentences.reduce((sum, s) => sum + this.countWords(s), 0) /
			sentences.length
		const targetSentences = Math.ceil(config.maxLength / wordsPerSentence)

		// Take first sentences as executive summary
		const executiveSentences = Math.min(3, sentences.length)
		const executive = sentences.slice(0, executiveSentences).join(". ")

		// Take key points from remaining sentences
		const remaining = sentences.slice(executiveSentences)
		const keyPoints = remaining
			.slice(0, Math.min(targetSentences - executiveSentences, 5))
			.map((s) => `- ${s}`)
			.join("\n")

		// Format based on style
		if (config.style === "concise") {
			return `${executive}.`
		}

		if (config.style === "technical") {
			return `## Executive Summary\n\n${executive}.\n\n## Key Points\n\n${keyPoints}`
		}

		// Detailed style
		return `## Summary\n\n${executive}.\n\n## Details\n\n${keyPoints}`
	}

	// ========================================================================
	// Private Methods - Validation and Quality
	// ========================================================================

	/**
	 * Validate input content
	 */
	private validateInput(content: string): void {
		if (!content || content.trim().length === 0) {
			throw new Error("Content cannot be empty")
		}

		if (content.length < 100) {
			throw new Error("Content must be at least 100 characters")
		}
	}

	/**
	 * Check if summary is valid
	 */
	private isValidSummary(summary: string): boolean {
		// Must have minimum length
		if (summary.length < 50) return false

		// Must have some sentence structure
		if (!summary.match(/[.!?]/)) return false

		// Must not be just a title or single word
		const words = summary.trim().split(/\s+/)
		if (words.length < 10) return false

		return true
	}

	/**
	 * Assess summary quality
	 */
	private assessSummaryQuality(
		summary: string,
		originalContent: string,
	): "high" | "medium" | "low" {
		// Calculate compression ratio
		const compressionRatio = summary.length / originalContent.length

		// Check for key indicators
		const hasSections = summary.includes("##") || summary.includes("**")
		const hasBullets = summary.includes("-") || summary.includes("*")
		const wordCount = this.countWords(summary)

		// High quality: good compression, structure, appropriate length
		if (
			compressionRatio < 0.3 &&
			hasSections &&
			wordCount > 50 &&
			wordCount < 500
		) {
			return "high"
		}

		// Medium quality: decent compression, some structure
		if (
			compressionRatio < 0.5 &&
			(hasSections || hasBullets) &&
			wordCount > 30
		) {
			return "medium"
		}

		// Low quality: poor compression or structure
		return "low"
	}

	// ========================================================================
	// Private Methods - Utilities
	// ========================================================================

	/**
	 * Truncate content to maximum length
	 */
	private truncateContent(content: string, maxLength: number): string {
		if (content.length <= maxLength) {
			return content
		}

		console.warn("Content truncated for summarization", {
			originalLength: content.length,
			truncatedLength: maxLength,
		})

		// Try to truncate at sentence boundary
		const truncated = content.slice(0, maxLength)
		const lastPeriod = truncated.lastIndexOf(".")
		const lastQuestion = truncated.lastIndexOf("?")
		const lastExclamation = truncated.lastIndexOf("!")

		const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation)

		if (lastSentenceEnd > maxLength * 0.8) {
			// If we have a sentence boundary close to the end, use it
			return truncated.slice(0, lastSentenceEnd + 1)
		}

		// Otherwise just truncate at word boundary
		const lastSpace = truncated.lastIndexOf(" ")
		return `${truncated.slice(0, lastSpace)}...`
	}

	/**
	 * Count words in text
	 */
	private countWords(text: string): number {
		return text.trim().split(/\s+/).length
	}
}
