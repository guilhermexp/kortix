/**
 * Summarization Service
 *
 * AI-powered document summarization service.
 * Features:
 * - OpenRouter integration as primary provider
 * - Configurable summary length and style
 * - Context-aware summarization (title, URL, source type)
 * - Support for different document types (web, PDF, video, code)
 * - Fallback strategies for failed AI summaries
 * - Multi-language support (EN, PT)
 */

import { BaseService } from '../base/base-service'
import { generateSummary as generateSummaryProvider } from '../summarizer'
import type {
	SummarizationService as ISummarizationService,
	SummarizationOptions,
	SummarizationResult,
	ExtractionResult,
} from '../interfaces'

// ============================================================================
// Constants
// ============================================================================

const MAX_INPUT_LENGTH = 100000 // characters
const DEFAULT_MAX_LENGTH = 500 // words
const DEFAULT_STYLE = 'concise' as const

// ============================================================================
// Summarization Service Implementation
// ============================================================================

/**
 * Service for AI-powered document summarization
 */
export class SummarizationService extends BaseService implements ISummarizationService {
	private readonly provider: 'openrouter' | 'gemini'
	private readonly maxLength: number
	private readonly style: 'concise' | 'detailed' | 'technical'

	constructor(options?: SummarizationOptions) {
		super('SummarizationService')

		this.provider = options?.provider ?? 'openrouter'
		this.maxLength = options?.maxLength ?? DEFAULT_MAX_LENGTH
		this.style = options?.style ?? DEFAULT_STYLE
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Generate summary for document
	 */
	async summarize(
		content: string,
		options?: SummarizationOptions
	): Promise<SummarizationResult> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation('summarize')

		try {
			const config = {
				provider: options?.provider ?? this.provider,
				maxLength: options?.maxLength ?? this.maxLength,
				style: options?.style ?? this.style,
				context: options?.context,
			}

			this.logger.info('Generating summary', {
				contentLength: content.length,
				provider: config.provider,
				style: config.style,
			})

			// Validate input
			this.validateInput(content)

			// Truncate if too long
			const safeContent = this.truncateContent(content, MAX_INPUT_LENGTH)

			// Generate summary
			const summary = await this.generateSummaryWithFallback(safeContent, config)

			// Validate summary quality
			const quality = this.assessSummaryQuality(summary, safeContent)

			tracker.end(true)

			this.logger.info('Summary generated', {
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
			tracker.end(false)
			throw this.handleError(error, 'summarize')
		}
	}

	/**
	 * Generate summary from extraction result
	 */
	async summarizeExtraction(extraction: ExtractionResult): Promise<SummarizationResult> {
		const context = {
			title: extraction.title,
			url: extraction.url,
			source: extraction.source,
			contentType: extraction.contentType,
		}

		return await this.summarize(extraction.text, { context })
	}

	/**
	 * Validate summarization options
	 */
	validateSummarizationOptions(options: SummarizationOptions): void {
		if (options.maxLength !== undefined) {
			if (options.maxLength < 50) {
				throw this.createError('INVALID_MAX_LENGTH', 'Max length must be at least 50 words')
			}
			if (options.maxLength > 2000) {
				throw this.createError(
					'INVALID_MAX_LENGTH',
					'Max length cannot exceed 2000 words'
				)
			}
		}

		if (options.style !== undefined) {
			const validStyles = ['concise', 'detailed', 'technical']
			if (!validStyles.includes(options.style)) {
				throw this.createError(
					'INVALID_STYLE',
					`Style must be one of: ${validStyles.join(', ')}`
				)
			}
		}
	}

	// ========================================================================
	// Private Methods - Summary Generation
	// ========================================================================

	/**
	 * Generate summary with fallback strategies
	 */
	private async generateSummaryWithFallback(
		content: string,
		config: Required<SummarizationOptions>
	): Promise<string> {
		// Try primary provider
		try {
			const summary = await this.generateWithProvider(content, config)
			if (summary && this.isValidSummary(summary)) {
				return summary
			}
		} catch (error) {
			this.logger.warn('Primary summarization failed', {
				error: (error as Error).message,
			})
		}

		// Fallback to extractive summary
		this.logger.info('Using extractive summary fallback')
		return this.generateExtractiveSummary(content, config)
	}

	/**
	 * Generate summary using AI provider
	 */
	private async generateWithProvider(
		content: string,
		config: Required<SummarizationOptions>
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
		config: Required<SummarizationOptions>
	): string {
		// Split into sentences
		const sentences = content
			.replace(/\s+/g, ' ')
			.split(/[.!?]+/)
			.map((s) => s.trim())
			.filter((s) => s.length > 20) // Filter out very short sentences

		if (sentences.length === 0) {
			return 'No content available for summarization.'
		}

		// Calculate how many sentences to include based on max length
		const wordsPerSentence = sentences.reduce((sum, s) => sum + this.countWords(s), 0) / sentences.length
		const targetSentences = Math.ceil(config.maxLength / wordsPerSentence)

		// Take first sentences as executive summary
		const executiveSentences = Math.min(3, sentences.length)
		const executive = sentences.slice(0, executiveSentences).join('. ')

		// Take key points from remaining sentences
		const remaining = sentences.slice(executiveSentences)
		const keyPoints = remaining
			.slice(0, Math.min(targetSentences - executiveSentences, 5))
			.map((s) => `- ${s}`)
			.join('\n')

		// Format based on style
		if (config.style === 'concise') {
			return `${executive}.`
		}

		if (config.style === 'technical') {
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
			throw this.createError('EMPTY_CONTENT', 'Content cannot be empty')
		}

		if (content.length < 100) {
			throw this.createError('CONTENT_TOO_SHORT', 'Content must be at least 100 characters')
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
	private assessSummaryQuality(summary: string, originalContent: string): 'high' | 'medium' | 'low' {
		// Calculate compression ratio
		const compressionRatio = summary.length / originalContent.length

		// Check for key indicators
		const hasSections = summary.includes('##') || summary.includes('**')
		const hasBullets = summary.includes('-') || summary.includes('*')
		const wordCount = this.countWords(summary)

		// High quality: good compression, structure, appropriate length
		if (compressionRatio < 0.3 && hasSections && wordCount > 50 && wordCount < 500) {
			return 'high'
		}

		// Medium quality: decent compression, some structure
		if (compressionRatio < 0.5 && (hasSections || hasBullets) && wordCount > 30) {
			return 'medium'
		}

		// Low quality: poor compression or structure
		return 'low'
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

		this.logger.warn('Content truncated for summarization', {
			originalLength: content.length,
			truncatedLength: maxLength,
		})

		// Try to truncate at sentence boundary
		const truncated = content.slice(0, maxLength)
		const lastPeriod = truncated.lastIndexOf('.')
		const lastQuestion = truncated.lastIndexOf('?')
		const lastExclamation = truncated.lastIndexOf('!')

		const lastSentenceEnd = Math.max(lastPeriod, lastQuestion, lastExclamation)

		if (lastSentenceEnd > maxLength * 0.8) {
			// If we have a sentence boundary close to the end, use it
			return truncated.slice(0, lastSentenceEnd + 1)
		}

		// Otherwise just truncate at word boundary
		const lastSpace = truncated.lastIndexOf(' ')
		return truncated.slice(0, lastSpace) + '...'
	}

	/**
	 * Count words in text
	 */
	private countWords(text: string): number {
		return text.trim().split(/\s+/).length
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Test summarization with sample text
		try {
			const sampleText = `
				This is a test document for health checking the summarization service.
				It contains multiple sentences to ensure the service can process text correctly.
				The service should be able to generate a concise summary of this content.
				This test helps verify that the AI provider is accessible and functioning properly.
			`
			const result = await this.summarize(sampleText, { maxLength: 50 })
			return result.summary.length > 0
		} catch {
			return false
		}
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create summarization service with optional configuration
 */
export function createSummarizationService(
	options?: SummarizationOptions
): SummarizationService {
	return new SummarizationService(options)
}
