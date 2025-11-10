/**
 * Document Processing Core Interfaces
 *
 * This file contains the core interfaces for the document processing system.
 * These interfaces define the contracts between services and ensure proper
 * separation of concerns.
 *
 * Architecture:
 * - IngestionOrchestratorService: Orchestrates the complete document processing flow
 * - DocumentExtractorService: Extracts raw content from various sources
 * - DocumentProcessorService: Processes and enriches extracted content
 * - PreviewGeneratorService: Generates visual previews for documents
 */

// ============================================================================
// Core Data Types
// ============================================================================

/**
 * Input for document extraction
 */
export interface ExtractionInput {
	/** Raw content if already available */
	originalContent?: string | null
	/** URL to extract content from */
	url?: string | null
	/** Content type hint (e.g., 'youtube', 'pdf', 'url') */
	type?: string | null
	/** Additional metadata about the source */
	metadata?: Record<string, unknown> | null
	/** File buffer for binary content */
	fileBuffer?: Buffer | null
	/** Original filename for files */
	fileName?: string | null
	/** MIME type for binary content */
	mimeType?: string | null
}

/**
 * Result from successful extraction
 */
export interface ExtractionResult {
	/** Extracted text content */
	text: string
	/** Document title */
	title: string | null
	/** Source identifier (e.g., URL, filename) */
	source: string
	/** Original URL if applicable */
	url: string | null
	/** Content type detected */
	contentType: string | null
	/** Raw extraction data for debugging */
	raw: Record<string, unknown> | null
	/** Word count of extracted text */
	wordCount: number
	/** Extraction method used (for debugging) */
	extractorUsed?: string
	/** Extraction metadata */
	extractionMetadata?: Record<string, unknown>
}

/**
 * Text chunk with embedding and metadata
 */
export interface Chunk {
	/** Chunk content */
	content: string
	/** Position/order in the document */
	position: number
	/** Chunk-specific metadata */
	metadata: Record<string, unknown>
	/** Vector embedding for this chunk */
	embedding: number[]
	/** Optional chunk ID for tracking */
	id?: string
}

/**
 * Fully processed document ready for storage
 */
export interface ProcessedDocument {
	/** Full document content */
	content: string
	/** AI-generated summary */
	summary: string
	/** Text chunks with embeddings */
	chunks: Chunk[]
	/** Document-level embedding (optional) */
	documentEmbedding?: number[]
	/** AI-generated tags */
	tags: string[]
	/** Processing metadata */
	metadata: Record<string, unknown>
	/** Processing statistics */
	statistics?: ProcessingStatistics
}

/**
 * Statistics about document processing
 */
export interface ProcessingStatistics {
	/** Total processing time in milliseconds */
	totalProcessingTime: number
	/** Extraction time in milliseconds */
	extractionTime: number
	/** Processing time in milliseconds */
	processingTime: number
	/** Preview generation time in milliseconds */
	previewTime: number
	/** Number of chunks created */
	chunkCount: number
	/** Number of retries needed */
	retryCount: number
}

/**
 * Input for preview generation
 */
export interface PreviewInput {
	/** Extraction result to generate preview from */
	extraction: ExtractionResult
	/** Document metadata */
	metadata?: Record<string, unknown>
	/** Force regeneration of preview */
	forceRegenerate?: boolean
}

/**
 * Result from preview generation
 */
export interface PreviewResult {
	/** Preview image URL */
	url: string
	/** Preview source/method */
	source: string
	/** Preview type */
	type: 'image' | 'svg' | 'favicon' | 'generated'
	/** Width in pixels (if applicable) */
	width?: number
	/** Height in pixels (if applicable) */
	height?: number
	/** Additional metadata */
	metadata?: Record<string, unknown>
}

/**
 * Input for document processing
 */
export interface ProcessDocumentInput {
	/** Content to process */
	content: string
	/** URL if applicable */
	url?: string | null
	/** Content type */
	type?: string | null
	/** User ID */
	userId: string
	/** Organization ID */
	organizationId: string
	/** Additional metadata */
	metadata?: Record<string, unknown> | null
	/** Processing options */
	options?: ProcessingOptions
}

/**
 * Processing options
 */
export interface ProcessingOptions {
	/** Skip summary generation */
	skipSummary?: boolean
	/** Skip tag generation */
	skipTags?: boolean
	/** Skip preview generation */
	skipPreview?: boolean
	/** Skip embedding generation */
	skipEmbeddings?: boolean
	/** Custom chunk size */
	chunkSize?: number
	/** Custom chunk overlap */
	chunkOverlap?: number
	/** Priority level */
	priority?: 'low' | 'normal' | 'high'
}

/**
 * Input for queuing a document
 */
export interface QueueDocumentInput {
	/** Document processing input */
	document: ProcessDocumentInput
	/** Job priority */
	priority?: 'low' | 'normal' | 'high'
	/** Delay before processing (milliseconds) */
	delay?: number
}

/**
 * Result from queuing a document
 */
export interface JobResult {
	/** Job ID */
	jobId: string
	/** Document ID */
	documentId: string
	/** Job status */
	status: 'queued' | 'delayed'
	/** Estimated start time */
	estimatedStartTime?: Date
}

// ============================================================================
// Error Handling Types
// ============================================================================

/**
 * Processing error with context
 */
export interface ProcessingError {
	/** Error code for programmatic handling */
	code: string
	/** Human-readable error message */
	message: string
	/** Detailed error information */
	details?: Record<string, unknown>
	/** Whether the error is recoverable with retry */
	recoverable: boolean
	/** Suggested retry delay in milliseconds */
	retryAfter?: number
	/** Stack trace (for debugging) */
	stack?: string
	/** Original error if wrapped */
	originalError?: Error
}

/**
 * Result from document processing
 */
export interface ProcessingResult {
	/** Whether processing succeeded */
	success: boolean
	/** Document ID if created */
	documentId?: string
	/** Current processing status */
	status: 'queued' | 'processing' | 'done' | 'failed'
	/** Error if processing failed */
	error?: ProcessingError
	/** Processing metadata */
	metadata?: Record<string, unknown>
	/** Processing statistics */
	statistics?: ProcessingStatistics
}

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
	/** Current state */
	state: 'closed' | 'open' | 'half-open'
	/** Number of failures */
	failures: number
	/** Last failure timestamp */
	lastFailureTime: number
	/** Last success timestamp */
	lastSuccessTime: number
	/** Total requests */
	totalRequests: number
	/** Successful requests */
	successfulRequests: number
}

/**
 * Retry configuration
 */
export interface RetryOptions {
	/** Maximum number of retry attempts */
	maxAttempts?: number
	/** Base delay between retries in milliseconds */
	baseDelay?: number
	/** Maximum delay between retries in milliseconds */
	maxDelay?: number
	/** Exponential backoff multiplier */
	backoffMultiplier?: number
	/** Jitter to add to delay (0-1) */
	jitter?: boolean
	/** Timeout per attempt in milliseconds */
	timeout?: number
}

// ============================================================================
// Service Configuration Types
// ============================================================================

/**
 * Configuration for DocumentExtractorService
 */
export interface ExtractorServiceConfig {
	/** URL extraction configuration (MarkItDown + Puppeteer) */
	url?: {
		enabled: boolean
		timeout?: number
	}
	/** YouTube extraction configuration */
	youtube?: {
		enabled: boolean
		preferredLanguages?: string[]
		timeout?: number
	}
	/** PDF extraction configuration */
	pdf?: {
		enabled: boolean
		ocrEnabled: boolean
		ocrProvider?: 'replicate' | 'gemini'
		timeout?: number
	}
	/** Repository extraction configuration */
	repository?: {
		enabled: boolean
		maxFileSize?: number
		timeout?: number
	}
	/** Default timeout for all extractors */
	defaultTimeout?: number
	/** User agent for HTTP requests */
	userAgent?: string
}

/**
 * Configuration for DocumentProcessorService
 */
export interface ProcessorServiceConfig {
	/** Chunking configuration */
	chunking?: {
		defaultChunkSize: number
		defaultOverlap: number
		minChunkSize: number
		maxChunkSize: number
	}
	/** Embedding configuration */
	embedding?: {
		provider: 'gemini' | 'openai' | 'hybrid'
		model?: string
		dimensions?: number
		batchSize?: number
	}
	/** Summarization configuration */
	summarization?: {
		enabled: boolean
		provider: 'openrouter' | 'gemini' | 'claude'
		model?: string
		maxLength?: number
	}
	/** Tagging configuration */
	tagging?: {
		enabled: boolean
		provider: 'openrouter' | 'gemini'
		maxTags?: number
	}
}

/**
 * Configuration for PreviewGeneratorService
 */
export interface PreviewServiceConfig {
	/** Enable image extraction */
	imageExtractionEnabled?: boolean
	/** Enable SVG generation */
	svgGenerationEnabled?: boolean
	/** Enable favicon fallback */
	faviconFallbackEnabled?: boolean
	/** Preview cache TTL in seconds */
	cacheTTL?: number
	/** Maximum preview size in bytes */
	maxPreviewSize?: number
	/** Preferred preview dimensions */
	preferredDimensions?: {
		width: number
		height: number
	}
}

/**
 * Configuration for IngestionOrchestratorService
 */
export interface OrchestratorServiceConfig {
	/** Circuit breaker configuration */
	circuitBreaker?: {
		enabled: boolean
		failureThreshold: number
		resetTimeout: number
		monitoringWindow: number
	}
	/** Retry configuration */
	retry?: RetryOptions
	/** Processing timeout in milliseconds */
	processingTimeout?: number
	/** Enable parallel processing */
	parallelProcessing?: boolean
	/** Maximum concurrent jobs */
	maxConcurrentJobs?: number
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * DocumentExtractorService - Responsible for extracting raw content
 */
export interface DocumentExtractorService {
	/**
	 * Extract content from any source
	 */
	extract(input: ExtractionInput): Promise<ExtractionResult>

	/**
	 * Extract content from a URL
	 */
	extractFromUrl(url: string, metadata?: Record<string, unknown>): Promise<ExtractionResult>

	/**
	 * Extract content from a file
	 */
	extractFromFile(
		file: Buffer,
		fileName: string,
		mimeType: string,
		metadata?: Record<string, unknown>
	): Promise<ExtractionResult>

	/**
	 * Extract content from YouTube
	 */
	extractFromYouTube(url: string, metadata?: Record<string, unknown>): Promise<ExtractionResult>

	/**
	 * Extract content from a repository
	 */
	extractFromRepository(url: string, metadata?: Record<string, unknown>): Promise<ExtractionResult>

	/**
	 * Validate extraction input
	 */
	validateInput(input: ExtractionInput): Promise<void>

	/**
	 * Get service configuration
	 */
	getConfig(): ExtractorServiceConfig
}

/**
 * DocumentProcessorService - Responsible for processing and enriching content
 */
export interface DocumentProcessorService {
	/**
	 * Process extracted content into a complete document
	 */
	process(extraction: ExtractionResult, options?: ProcessingOptions): Promise<ProcessedDocument>

	/**
	 * Chunk content into smaller pieces
	 */
	chunk(content: string, options?: { chunkSize?: number; overlap?: number }): Promise<Chunk[]>

	/**
	 * Generate embeddings for chunks
	 */
	generateEmbeddings(chunks: Chunk[]): Promise<Chunk[]>

	/**
	 * Generate document summary
	 */
	generateSummary(content: string): Promise<string>

	/**
	 * Generate document tags
	 */
	generateTags(content: string, summary?: string): Promise<string[]>

	/**
	 * Get service configuration
	 */
	getConfig(): ProcessorServiceConfig
}

/**
 * PreviewGeneratorService - Responsible for generating document previews
 */
export interface PreviewGeneratorService {
	/**
	 * Generate preview from extraction result
	 */
	generate(input: PreviewInput): Promise<PreviewResult>

	/**
	 * Extract image from document
	 */
	extractImage(extraction: ExtractionResult): Promise<string | null>

	/**
	 * Generate SVG preview
	 */
	generateSVG(extraction: ExtractionResult): Promise<string>

	/**
	 * Get favicon from URL
	 */
	getFavicon(url: string): Promise<string | null>

	/**
	 * Get service configuration
	 */
	getConfig(): PreviewServiceConfig
}

/**
 * IngestionOrchestratorService - Orchestrates the complete document processing flow
 */
export interface IngestionOrchestratorService {
	/**
	 * Process a document through the complete pipeline
	 */
	processDocument(input: ProcessDocumentInput): Promise<ProcessingResult>

	/**
	 * Queue a document for async processing
	 */
	queueDocument(input: QueueDocumentInput): Promise<JobResult>

	/**
	 * Retry a failed document
	 */
	retryFailedDocument(documentId: string): Promise<ProcessingResult>

	/**
	 * Get processing status
	 */
	getStatus(documentId: string): Promise<ProcessingResult>

	/**
	 * Cancel processing
	 */
	cancelProcessing(documentId: string): Promise<void>

	/**
	 * Get service configuration
	 */
	getConfig(): OrchestratorServiceConfig

	/**
	 * Get circuit breaker state
	 */
	getCircuitBreakerState(): CircuitBreakerState
}

// ============================================================================
// Base Service Interface
// ============================================================================

/**
 * Base interface for all services
 */
export interface BaseService {
	/**
	 * Service name for logging and identification
	 */
	readonly serviceName: string

	/**
	 * Initialize the service
	 */
	initialize(): Promise<void>

	/**
	 * Check if service is healthy
	 */
	healthCheck(): Promise<boolean>

	/**
	 * Cleanup resources
	 */
	cleanup(): Promise<void>
}
