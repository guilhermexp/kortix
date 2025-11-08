/**
 * Document Processing Interfaces
 *
 * This file contains interfaces specific to document processing functionality.
 * These interfaces define the contracts for chunking, embedding generation,
 * summarization, and tagging services.
 *
 * Processing Services:
 * - ChunkingService: Intelligent text chunking with overlap
 * - EmbeddingService: Vector embedding generation
 * - SummarizationService: AI-powered document summarization
 * - TaggingService: Automatic tag generation
 */

import {
	ExtractionResult,
	Chunk,
	ProcessedDocument,
	ProcessingOptions,
	BaseService,
} from './document-processing'

// ============================================================================
// Chunking Service Interfaces
// ============================================================================

/**
 * Service for chunking text into smaller pieces
 */
export interface ChunkingService extends BaseService {
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

/**
 * Chunk boundary detection
 */
export interface ChunkBoundary {
	/** Start position */
	start: number
	/** End position */
	end: number
	/** Boundary type */
	type: 'sentence' | 'paragraph' | 'section' | 'token'
	/** Confidence score */
	confidence: number
}

// ============================================================================
// Embedding Service Interfaces
// ============================================================================

/**
 * Service for generating vector embeddings
 */
export interface EmbeddingService extends BaseService {
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
	provider?: 'gemini' | 'openai' | 'hybrid' | 'deterministic'
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

/**
 * Hybrid embedding strategy
 */
export interface HybridEmbeddingStrategy {
	/**
	 * Generate hybrid embedding (AI + deterministic)
	 */
	generateHybrid(text: string): Promise<number[]>

	/**
	 * Combine multiple embeddings
	 */
	combineEmbeddings(embeddings: number[][]): number[]

	/**
	 * Get strategy configuration
	 */
	getConfig(): HybridEmbeddingConfig
}

/**
 * Hybrid embedding configuration
 */
export interface HybridEmbeddingConfig {
	/** AI provider */
	aiProvider: 'gemini' | 'openai'
	/** Weight for AI embedding (0-1) */
	aiWeight: number
	/** Weight for deterministic embedding (0-1) */
	deterministicWeight: number
	/** Fallback to deterministic on AI failure */
	fallbackToDeterministic: boolean
}

// ============================================================================
// Summarization Service Interfaces
// ============================================================================

/**
 * Service for generating document summaries
 */
export interface SummarizationService extends BaseService {
	/**
	 * Generate summary for content
	 */
	generateSummary(content: string, options?: SummarizationOptions): Promise<string>

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
	getSummarizationStats(content: string, summary: string): SummarizationStatistics
}

/**
 * Summarization options
 */
export interface SummarizationOptions {
	/** Target summary length */
	targetLength?: 'brief' | 'medium' | 'detailed'
	/** Maximum words */
	maxWords?: number
	/** Minimum words */
	minWords?: number
	/** Style */
	style?: 'bullet-points' | 'paragraph' | 'executive'
	/** Include key points */
	includeKeyPoints?: boolean
	/** AI provider */
	provider?: 'openrouter' | 'gemini' | 'claude'
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
export interface TaggingService extends BaseService {
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
	provider?: 'openrouter' | 'gemini'
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
	source: 'ai' | 'keyword' | 'manual'
	/** Confidence score (0-1) */
	confidence: number
}

/**
 * Tag category
 */
export type TagCategory =
	| 'topic'
	| 'technology'
	| 'person'
	| 'organization'
	| 'location'
	| 'concept'
	| 'language'
	| 'format'
	| 'domain'
	| 'other'

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

// ============================================================================
// Document Enrichment Interfaces
// ============================================================================

/**
 * Service for enriching document metadata
 */
export interface DocumentEnrichmentService extends BaseService {
	/**
	 * Enrich document with additional metadata
	 */
	enrich(extraction: ExtractionResult): Promise<EnrichedDocument>

	/**
	 * Extract entities (people, places, organizations)
	 */
	extractEntities(content: string): Promise<Entity[]>

	/**
	 * Detect language
	 */
	detectLanguage(content: string): Promise<LanguageDetection>

	/**
	 * Calculate content quality score
	 */
	calculateQualityScore(content: string): Promise<QualityScore>
}

/**
 * Enriched document
 */
export interface EnrichedDocument extends ExtractionResult {
	/** Detected entities */
	entities?: Entity[]
	/** Language detection */
	language?: LanguageDetection
	/** Quality score */
	qualityScore?: QualityScore
	/** Sentiment analysis */
	sentiment?: Sentiment
	/** Readability metrics */
	readability?: ReadabilityMetrics
}

/**
 * Named entity
 */
export interface Entity {
	/** Entity text */
	text: string
	/** Entity type */
	type: 'person' | 'organization' | 'location' | 'date' | 'other'
	/** Confidence score */
	confidence: number
	/** Position in text */
	position: {
		start: number
		end: number
	}
}

/**
 * Language detection result
 */
export interface LanguageDetection {
	/** Language code (ISO 639-1) */
	code: string
	/** Language name */
	name: string
	/** Confidence score (0-1) */
	confidence: number
	/** Alternative languages */
	alternatives?: Array<{
		code: string
		name: string
		confidence: number
	}>
}

/**
 * Content quality score
 */
export interface QualityScore {
	/** Overall quality (0-1) */
	overall: number
	/** Completeness score (0-1) */
	completeness: number
	/** Clarity score (0-1) */
	clarity: number
	/** Structure score (0-1) */
	structure: number
	/** Factors affecting quality */
	factors: string[]
}

/**
 * Sentiment analysis
 */
export interface Sentiment {
	/** Sentiment label */
	label: 'positive' | 'negative' | 'neutral'
	/** Confidence score (0-1) */
	confidence: number
	/** Detailed scores */
	scores: {
		positive: number
		negative: number
		neutral: number
	}
}

/**
 * Readability metrics
 */
export interface ReadabilityMetrics {
	/** Flesch reading ease (0-100) */
	fleschReadingEase: number
	/** Grade level */
	gradeLevel: number
	/** Average sentence length */
	averageSentenceLength: number
	/** Average word length */
	averageWordLength: number
	/** Complexity score (0-1) */
	complexityScore: number
}

// ============================================================================
// Processing Pipeline Interfaces
// ============================================================================

/**
 * Document processing pipeline
 */
export interface ProcessingPipeline {
	/**
	 * Process document through complete pipeline
	 */
	process(extraction: ExtractionResult, options?: ProcessingOptions): Promise<ProcessedDocument>

	/**
	 * Add processing stage
	 */
	addStage(stage: ProcessingStage): void

	/**
	 * Remove processing stage
	 */
	removeStage(stageName: string): void

	/**
	 * Get pipeline configuration
	 */
	getConfig(): PipelineConfig
}

/**
 * Processing stage in pipeline
 */
export interface ProcessingStage {
	/** Stage name */
	name: string
	/** Stage priority (higher = earlier) */
	priority: number
	/** Process function */
	process(data: ProcessingStageData): Promise<ProcessingStageData>
	/** Skip condition */
	shouldSkip?(data: ProcessingStageData): boolean
	/** Error handler */
	onError?(error: Error, data: ProcessingStageData): Promise<ProcessingStageData>
}

/**
 * Data passed between processing stages
 */
export interface ProcessingStageData {
	/** Extraction result */
	extraction: ExtractionResult
	/** Chunks (if created) */
	chunks?: Chunk[]
	/** Summary (if generated) */
	summary?: string
	/** Tags (if generated) */
	tags?: string[]
	/** Enrichment data */
	enrichment?: Partial<EnrichedDocument>
	/** Processing options */
	options: ProcessingOptions
	/** Stage metadata */
	metadata: Map<string, unknown>
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
	/** Processing stages */
	stages: ProcessingStage[]
	/** Parallel processing */
	parallel: boolean
	/** Stop on error */
	stopOnError: boolean
	/** Timeout per stage */
	stageTimeout?: number
	/** Total timeout */
	totalTimeout?: number
}

// ============================================================================
// Processing Statistics & Monitoring
// ============================================================================

/**
 * Processing metrics
 */
export interface ProcessingMetrics {
	/** Start time */
	startTime: Date
	/** End time */
	endTime: Date
	/** Duration in milliseconds */
	duration: number
	/** Stages completed */
	stagesCompleted: string[]
	/** Stages failed */
	stagesFailed: string[]
	/** Memory usage (bytes) */
	memoryUsage: number
	/** CPU usage (percentage) */
	cpuUsage?: number
}

/**
 * Processing event for monitoring
 */
export interface ProcessingEvent {
	/** Event type */
	type: 'started' | 'completed' | 'failed' | 'stage_started' | 'stage_completed' | 'stage_failed'
	/** Timestamp */
	timestamp: Date
	/** Document ID */
	documentId?: string
	/** Stage name (if applicable) */
	stageName?: string
	/** Duration (if applicable) */
	duration?: number
	/** Error (if applicable) */
	error?: Error
	/** Metadata */
	metadata?: Record<string, unknown>
}

/**
 * Processing monitor
 */
export interface ProcessingMonitor {
	/**
	 * Record processing event
	 */
	recordEvent(event: ProcessingEvent): void

	/**
	 * Get processing metrics
	 */
	getMetrics(documentId: string): ProcessingMetrics | null

	/**
	 * Get aggregate statistics
	 */
	getAggregateStats(): AggregateStatistics
}

/**
 * Aggregate processing statistics
 */
export interface AggregateStatistics {
	/** Total documents processed */
	totalProcessed: number
	/** Successful processes */
	successful: number
	/** Failed processes */
	failed: number
	/** Average processing time */
	averageProcessingTime: number
	/** Median processing time */
	medianProcessingTime: number
	/** Success rate */
	successRate: number
	/** Most common errors */
	commonErrors: Array<{
		error: string
		count: number
	}>
}
