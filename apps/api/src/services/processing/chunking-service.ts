/**
 * Chunking Service
 *
 * Intelligent text chunking service for processing documents.
 * Features:
 * - Smart text segmentation with configurable chunk size
 * - Sentence and paragraph-aware splitting
 * - Overlap between chunks to preserve context
 * - Support for different content types (code, prose, lists)
 * - Token counting for accurate chunk sizing
 * - Boundary detection and validation
 */

import { BaseService } from "../base/base-service"
import type {
	Chunk,
	ChunkingOptions,
	ChunkingStatistics,
	ChunkingService as IChunkingService,
} from "../interfaces"

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CHUNK_SIZE = 800 // tokens
const DEFAULT_OVERLAP = 200 // tokens
const MIN_CHUNK_SIZE = 100 // tokens
const MAX_CHUNK_SIZE = 2000 // tokens
const TOKENS_PER_CHAR = 0.25 // Approximate ratio for English text

// Sentence boundary markers
const SENTENCE_ENDINGS = [".", "!", "?", "。", "！", "？"]
const _SENTENCE_REGEX = /[.!?。！？]+[\s\n]+/g

// Paragraph markers
const PARAGRAPH_REGEX = /\n\s*\n/g

// ============================================================================
// Chunking Service Implementation
// ============================================================================

/**
 * Service for intelligent text chunking
 */
export class ChunkingService extends BaseService implements IChunkingService {
	private readonly defaultOptions: Required<ChunkingOptions>

	constructor(options?: Partial<ChunkingOptions>) {
		super("ChunkingService")

		this.defaultOptions = {
			chunkSize: options?.chunkSize ?? DEFAULT_CHUNK_SIZE,
			chunkOverlap: options?.chunkOverlap ?? DEFAULT_OVERLAP,
			minChunkSize: options?.minChunkSize ?? MIN_CHUNK_SIZE,
			maxChunkSize: options?.maxChunkSize ?? MAX_CHUNK_SIZE,
			respectSentences: options?.respectSentences ?? true,
			respectParagraphs: options?.respectParagraphs ?? true,
			separator: options?.separator ?? "\n\n",
			includeMetadata: options?.includeMetadata ?? true,
		}
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Chunk text content
	 */
	async chunk(content: string, options?: ChunkingOptions): Promise<Chunk[]> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("chunk")

		try {
			const config = { ...this.defaultOptions, ...options }
			this.validateChunkConfig(config)

			this.logger.info("Chunking content", {
				contentLength: content.length,
				chunkSize: config.chunkSize,
				overlap: config.chunkOverlap,
			})

			// Detect content type
			const contentType = this.detectContentType(content)

			// Choose appropriate chunking strategy
			let chunks: Chunk[]
			if (config.respectSentences || config.respectParagraphs) {
				chunks = await this.chunkSemantic(content, config)
			} else {
				chunks = await this.chunkSimple(content, config)
			}

			// Add metadata if requested
			if (config.includeMetadata) {
				chunks = this.enrichChunksWithMetadata(chunks, content, contentType)
			}

			tracker.end(true)

			this.logger.info("Chunking completed", {
				chunkCount: chunks.length,
				avgSize:
					chunks.reduce((sum, c) => sum + c.tokenCount, 0) / chunks.length,
			})

			return chunks
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "chunk")
		}
	}

	/**
	 * Chunk with semantic boundaries (sentences, paragraphs)
	 */
	async chunkSemantic(
		content: string,
		options?: ChunkingOptions,
	): Promise<Chunk[]> {
		this.assertInitialized()

		const config = { ...this.defaultOptions, ...options }
		const chunks: Chunk[] = []

		// Split into semantic units (paragraphs or sentences)
		const units = config.respectParagraphs
			? this.splitIntoParagraphs(content)
			: this.splitIntoSentences(content)

		let currentChunk: string[] = []
		let currentTokens = 0
		let chunkIndex = 0

		for (let i = 0; i < units.length; i++) {
			const unit = units[i]
			const unitTokens = this.countTokens(unit)

			// Check if adding this unit would exceed chunk size
			if (
				currentTokens + unitTokens > config.chunkSize &&
				currentChunk.length > 0
			) {
				// Create chunk from accumulated units
				const chunkText = currentChunk.join(
					config.respectParagraphs ? "\n\n" : " ",
				)
				chunks.push(this.createChunk(chunkText, chunkIndex++))

				// Start new chunk with overlap
				const overlapUnits = this.getOverlapUnits(
					currentChunk,
					config.chunkOverlap,
					config.respectParagraphs ? "\n\n" : " ",
				)
				currentChunk = overlapUnits
				currentTokens = this.countTokens(
					currentChunk.join(config.respectParagraphs ? "\n\n" : " "),
				)
			}

			// Add current unit to chunk
			currentChunk.push(unit)
			currentTokens += unitTokens
		}

		// Add final chunk if not empty
		if (currentChunk.length > 0) {
			const chunkText = currentChunk.join(
				config.respectParagraphs ? "\n\n" : " ",
			)
			chunks.push(this.createChunk(chunkText, chunkIndex))
		}

		return chunks
	}

	/**
	 * Calculate optimal chunk size based on content
	 */
	calculateOptimalChunkSize(content: string): number {
		const totalTokens = this.countTokens(content)

		// If content is small, use minimum chunk size
		if (totalTokens < MIN_CHUNK_SIZE * 2) {
			return MIN_CHUNK_SIZE
		}

		// If content is very large, use maximum chunk size
		if (totalTokens > MAX_CHUNK_SIZE * 10) {
			return MAX_CHUNK_SIZE
		}

		// Calculate optimal size to minimize number of chunks while staying reasonable
		const targetChunks = Math.ceil(totalTokens / DEFAULT_CHUNK_SIZE)
		const optimalSize = Math.ceil(totalTokens / targetChunks)

		// Clamp to valid range
		return Math.max(MIN_CHUNK_SIZE, Math.min(MAX_CHUNK_SIZE, optimalSize))
	}

	/**
	 * Validate chunk configuration
	 */
	validateChunkConfig(options: ChunkingOptions): void {
		if (options.chunkSize !== undefined) {
			if (options.chunkSize < MIN_CHUNK_SIZE) {
				throw this.createError(
					"INVALID_CHUNK_SIZE",
					`Chunk size ${options.chunkSize} is below minimum ${MIN_CHUNK_SIZE}`,
				)
			}
			if (options.chunkSize > MAX_CHUNK_SIZE) {
				throw this.createError(
					"INVALID_CHUNK_SIZE",
					`Chunk size ${options.chunkSize} exceeds maximum ${MAX_CHUNK_SIZE}`,
				)
			}
		}

		if (options.chunkOverlap !== undefined && options.chunkSize !== undefined) {
			if (options.chunkOverlap >= options.chunkSize) {
				throw this.createError(
					"INVALID_OVERLAP",
					`Overlap ${options.chunkOverlap} must be less than chunk size ${options.chunkSize}`,
				)
			}
			if (options.chunkOverlap < 0) {
				throw this.createError("INVALID_OVERLAP", "Overlap cannot be negative")
			}
		}
	}

	/**
	 * Get chunking statistics
	 */
	getChunkingStats(chunks: Chunk[]): ChunkingStatistics {
		if (chunks.length === 0) {
			return {
				totalChunks: 0,
				averageChunkSize: 0,
				minChunkSize: 0,
				maxChunkSize: 0,
				totalTokens: 0,
				overlapPercentage: 0,
			}
		}

		const tokenCounts = chunks.map((c) => c.tokenCount)
		const totalTokens = tokenCounts.reduce((sum, count) => sum + count, 0)

		return {
			totalChunks: chunks.length,
			averageChunkSize: totalTokens / chunks.length,
			minChunkSize: Math.min(...tokenCounts),
			maxChunkSize: Math.max(...tokenCounts),
			totalTokens,
			overlapPercentage: this.calculateOverlapPercentage(chunks),
		}
	}

	// ========================================================================
	// Private Methods - Chunking Strategies
	// ========================================================================

	/**
	 * Simple chunking without semantic boundaries
	 */
	private async chunkSimple(
		content: string,
		config: Required<ChunkingOptions>,
	): Promise<Chunk[]> {
		const chunks: Chunk[] = []
		const words = content.split(/\s+/)

		let currentChunk: string[] = []
		let currentTokens = 0
		let chunkIndex = 0

		for (const word of words) {
			const wordTokens = this.countTokens(word)

			if (
				currentTokens + wordTokens > config.chunkSize &&
				currentChunk.length > 0
			) {
				// Create chunk
				chunks.push(this.createChunk(currentChunk.join(" "), chunkIndex++))

				// Start new chunk with overlap
				const overlapWords = this.getOverlapUnits(
					currentChunk,
					config.chunkOverlap,
					" ",
				)
				currentChunk = overlapWords
				currentTokens = this.countTokens(currentChunk.join(" "))
			}

			currentChunk.push(word)
			currentTokens += wordTokens
		}

		// Add final chunk
		if (currentChunk.length > 0) {
			chunks.push(this.createChunk(currentChunk.join(" "), chunkIndex))
		}

		return chunks
	}

	/**
	 * Split content into paragraphs
	 */
	private splitIntoParagraphs(content: string): string[] {
		// Split on double newlines
		const paragraphs = content.split(PARAGRAPH_REGEX)

		// Filter out empty paragraphs and trim
		return paragraphs.map((p) => p.trim()).filter((p) => p.length > 0)
	}

	/**
	 * Split content into sentences
	 */
	private splitIntoSentences(content: string): string[] {
		// Split on sentence boundaries
		const sentences: string[] = []
		let currentSentence = ""

		for (let i = 0; i < content.length; i++) {
			const char = content[i]
			currentSentence += char

			// Check if this is a sentence ending
			if (SENTENCE_ENDINGS.includes(char)) {
				// Look ahead to see if there's whitespace
				if (i + 1 < content.length && /\s/.test(content[i + 1])) {
					sentences.push(currentSentence.trim())
					currentSentence = ""
				}
			}
		}

		// Add any remaining content
		if (currentSentence.trim().length > 0) {
			sentences.push(currentSentence.trim())
		}

		return sentences.filter((s) => s.length > 0)
	}

	/**
	 * Get overlap units from previous chunk
	 */
	private getOverlapUnits(
		units: string[],
		overlapTokens: number,
		_separator: string,
	): string[] {
		const overlapUnits: string[] = []
		let tokenCount = 0

		// Start from the end and work backwards
		for (let i = units.length - 1; i >= 0; i--) {
			const unit = units[i]
			const unitTokens = this.countTokens(unit)

			if (tokenCount + unitTokens > overlapTokens) {
				break
			}

			overlapUnits.unshift(unit)
			tokenCount += unitTokens
		}

		return overlapUnits
	}

	// ========================================================================
	// Private Methods - Utilities
	// ========================================================================

	/**
	 * Create a chunk object
	 */
	private createChunk(text: string, index: number): Chunk {
		const tokenCount = this.countTokens(text)

		return {
			text,
			tokenCount,
			index,
			embedding: [], // Will be filled by embedding service
		}
	}

	/**
	 * Count tokens in text (approximate)
	 */
	private countTokens(text: string): number {
		// Simple approximation: ~4 characters per token for English
		// More accurate would be to use tiktoken or similar
		return Math.ceil(text.length * TOKENS_PER_CHAR)
	}

	/**
	 * Detect content type
	 */
	private detectContentType(
		content: string,
	): "code" | "prose" | "list" | "mixed" {
		// Check for code indicators
		const codeIndicators =
			/```|{|}|function|class|const|let|var|import|export/gi
		const codeMatches = content.match(codeIndicators)?.length || 0

		if (codeMatches > 10) {
			return "code"
		}

		// Check for list indicators
		const listIndicators = /^[\s]*[-*+]\s|^[\s]*\d+\.\s/gm
		const listMatches = content.match(listIndicators)?.length || 0

		if (listMatches > 5) {
			return "list"
		}

		// Check for mixed content
		if (codeMatches > 3 && listMatches > 3) {
			return "mixed"
		}

		return "prose"
	}

	/**
	 * Enrich chunks with metadata
	 */
	private enrichChunksWithMetadata(
		chunks: Chunk[],
		originalContent: string,
		contentType: string,
	): Chunk[] {
		return chunks.map((chunk, index) => ({
			...chunk,
			metadata: {
				contentType,
				chunkIndex: index,
				totalChunks: chunks.length,
				isFirstChunk: index === 0,
				isLastChunk: index === chunks.length - 1,
				originalLength: originalContent.length,
			},
		}))
	}

	/**
	 * Calculate overlap percentage between chunks
	 */
	private calculateOverlapPercentage(chunks: Chunk[]): number {
		if (chunks.length < 2) return 0

		let totalOverlap = 0
		let totalTokens = 0

		for (let i = 1; i < chunks.length; i++) {
			const prevChunk = chunks[i - 1]
			const currChunk = chunks[i]

			// Find common text at the end of prev and start of curr
			const overlap = this.findTextOverlap(prevChunk.text, currChunk.text)
			totalOverlap += this.countTokens(overlap)
			totalTokens += currChunk.tokenCount
		}

		return totalTokens > 0 ? (totalOverlap / totalTokens) * 100 : 0
	}

	/**
	 * Find overlapping text between two strings
	 */
	private findTextOverlap(text1: string, text2: string): string {
		// Find the longest common suffix of text1 and prefix of text2
		const maxOverlap = Math.min(text1.length, text2.length)

		for (let len = maxOverlap; len > 0; len--) {
			const suffix = text1.slice(-len)
			const prefix = text2.slice(0, len)

			if (suffix === prefix) {
				return suffix
			}
		}

		return ""
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Test chunking with sample text
		try {
			const sampleText =
				"This is a test. This is only a test. Testing chunking service."
			const chunks = await this.chunk(sampleText, { chunkSize: 50 })
			return chunks.length > 0
		} catch {
			return false
		}
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create chunking service with optional configuration
 */
export function createChunkingService(
	options?: Partial<ChunkingOptions>,
): ChunkingService {
	return new ChunkingService(options)
}
