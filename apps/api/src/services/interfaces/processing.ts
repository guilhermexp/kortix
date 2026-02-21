/**
 * Document Processing Interfaces
 *
 * Interfaces for chunking, embedding generation,
 * summarization, and tagging services.
 */

import type { Chunk, ExtractionResult } from "./document-processing"

// ============================================================================
// Chunking Service Interfaces
// ============================================================================

/**
 * Service for chunking text into smaller pieces
 */
export interface ChunkingService {
	/**
	 * Chunk text content
	 */
	chunk(content: string, options?: ChunkingOptions): Promise<Chunk[]>

	/**
	 * Chunk with semantic boundaries (sentences, paragraphs)
	 */
	chunkSemantic(content: string, options?: ChunkingOptions): Promise<Chunk[]>

	/**
	 * Calculate optimal chunk size based on content
	 */
	calculateOptimalChunkSize(content: string): number

	/**
	 * Validate chunk configuration
	 */
	validateChunkConfig(options: ChunkingOptions): void

	/**
	 * Get chunking statistics
	 */
	getChunkingStats(chunks: Chunk[]): ChunkingStatistics
}

/**
 * Chunking options
 */
export interface ChunkingOptions {
	/** Chunk size in tokens */
	chunkSize?: number
	/** Overlap between chunks in tokens */
	chunkOverlap?: number
	/** Minimum chunk size */
	minChunkSize?: number
	/** Maximum chunk size */
	maxChunkSize?: number
	/** Respect sentence boundaries */
	respectSentences?: boolean
	/** Respect paragraph boundaries */
	respectParagraphs?: boolean
	/** Separator to use */
	separator?: string
	/** Include metadata in chunks */
	includeMetadata?: boolean
}

/**
 * Chunking statistics
 */
export interface ChunkingStatistics {
	/** Total number of chunks */
	totalChunks: number
	/** Average chunk size */
	averageChunkSize: number
	/** Minimum chunk size */
	minChunkSize: number
	/** Maximum chunk size */
	maxChunkSize: number
	/** Total tokens */
	totalTokens: number
	/** Overlap percentage */
	overlapPercentage: number
}

// ============================================================================
// Embedding Service Interfaces
// ============================================================================

/**
 * Service for generating vector embeddings
 */
export interface EmbeddingService {
	/**
	 * Generate embeddings for chunks
	 */
	generateEmbeddings(chunks: Chunk[]): Promise<Chunk[]>

	/**
	 * Generate single embedding
	 */
	generateEmbedding(text: string): Promise<number[]>

	/**
	 * Generate embeddings in batch
	 */
	generateBatchEmbeddings(texts: string[]): Promise<number[][]>

	/**
	 * Get embedding dimensions
	 */
	getEmbeddingDimensions(): number

	/**
	 * Get embedding provider info
	 */
	getProviderInfo(): EmbeddingProviderInfo

	/**
	 * Check embedding cache
	 */
	getCachedEmbedding(text: string): Promise<number[] | null>

	/**
	 * Cache embedding
	 */
	cacheEmbedding(text: string, embedding: number[]): Promise<void>
}

/**
 * Embedding options
 */
export interface EmbeddingOptions {
	/** Embedding provider */
	provider?: "gemini" | "openai" | "hybrid" | "deterministic"
	/** Model to use */
	model?: string
	/** Batch size for processing */
	batchSize?: number
	/** Use cache */
	useCache?: boolean
	/** Normalize embeddings */
	normalize?: boolean
	/** Timeout per batch */
	timeout?: number
}

/**
 * Embedding provider information
 */
export interface EmbeddingProviderInfo {
	/** Provider name */
	name: string
	/** Model name */
	model: string
	/** Embedding dimensions */
	dimensions: number
	/** Maximum input length */
	maxInputLength: number
	/** Cost per token (if applicable) */
	costPerToken?: number
	/** Rate limits */
	rateLimits?: {
		requestsPerMinute: number
		tokensPerMinute: number
	}
}

// ============================================================================
// Summarization Service Interfaces
// ============================================================================

/**
 * Service for generating document summaries
 */
export interface SummarizationService {
	/**
	 * Generate summary for content
	 */
	generateSummary(
		content: string,
		options?: SummarizationOptions,
	): Promise<string>

	/**
	 * Generate multi-level summary (brief, detailed)
	 */
	generateMultiLevelSummary(content: string): Promise<MultiLevelSummary>

	/**
	 * Generate key points
	 */
	generateKeyPoints(content: string, maxPoints?: number): Promise<string[]>

	/**
	 * Get summarization statistics
	 */
	getSummarizationStats(
		content: string,
		summary: string,
	): SummarizationStatistics
}

/**
 * Summarization options
 */
export interface SummarizationOptions {
	/** Target summary length */
	targetLength?: "brief" | "medium" | "detailed"
	/** Maximum words */
	maxWords?: number
	/** Minimum words */
	minWords?: number
	/** Style */
	style?: "bullet-points" | "paragraph" | "executive"
	/** Include key points */
	includeKeyPoints?: boolean
	/** AI provider */
	provider?: "openrouter" | "gemini" | "claude"
	/** Model to use */
	model?: string
	/** Timeout */
	timeout?: number
}

/**
 * Multi-level summary
 */
export interface MultiLevelSummary {
	/** Brief summary (1-2 sentences) */
	brief: string
	/** Medium summary (1 paragraph) */
	medium: string
	/** Detailed summary (multiple paragraphs) */
	detailed: string
	/** Key points */
	keyPoints: string[]
	/** Main topics */
	topics: string[]
}

/**
 * Summarization statistics
 */
export interface SummarizationStatistics {
	/** Original word count */
	originalWordCount: number
	/** Summary word count */
	summaryWordCount: number
	/** Compression ratio */
	compressionRatio: number
	/** Time taken (ms) */
	timeTaken: number
	/** Provider used */
	provider: string
	/** Model used */
	model: string
}

// ============================================================================
// Tagging Service Interfaces
// ============================================================================

/**
 * Service for generating document tags
 */
export interface TaggingService {
	/**
	 * Generate tags for content
	 */
	generateTags(content: string, options?: TaggingOptions): Promise<string[]>

	/**
	 * Generate tags from summary
	 */
	generateTagsFromSummary(summary: string, maxTags?: number): Promise<string[]>

	/**
	 * Suggest additional tags based on existing tags
	 */
	suggestRelatedTags(existingTags: string[]): Promise<string[]>

	/**
	 * Validate and normalize tags
	 */
	normalizeTags(tags: string[]): string[]

	/**
	 * Get tag categories
	 */
	categorizeTag(tag: string): TagCategory
}

/**
 * Tagging options
 */
export interface TaggingOptions {
	/** Maximum number of tags */
	maxTags?: number
	/** Minimum tag relevance score */
	minRelevance?: number
	/** Include category tags */
	includeCategories?: boolean
	/** AI provider */
	provider?: "openrouter" | "gemini"
	/** Model to use */
	model?: string
	/** Timeout */
	timeout?: number
}

/**
 * Tag with metadata
 */
export interface TagWithMetadata {
	/** Tag text */
	tag: string
	/** Relevance score (0-1) */
	relevance: number
	/** Tag category */
	category: TagCategory
	/** Source of tag */
	source: "ai" | "keyword" | "manual"
	/** Confidence score (0-1) */
	confidence: number
}

/**
 * Tag category
 */
export type TagCategory =
	| "topic"
	| "technology"
	| "person"
	| "organization"
	| "location"
	| "concept"
	| "language"
	| "format"
	| "domain"
	| "other"

/**
 * Tag extraction result
 */
export interface TagExtractionResult {
	/** Generated tags */
	tags: string[]
	/** Tags with metadata */
	tagsWithMetadata: TagWithMetadata[]
	/** Extraction time */
	extractionTime: number
	/** Provider used */
	provider: string
}
