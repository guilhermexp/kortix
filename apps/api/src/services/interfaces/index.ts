/**
 * Document Processing Interfaces - Central Export
 *
 * This file provides a central location for importing all document processing
 * interfaces. Import from this file instead of individual interface files.
 *
 * Usage:
 * ```typescript
 * import {
 *   DocumentExtractorService,
 *   ExtractionInput,
 *   ProcessedDocument,
 *   // ... other interfaces
 * } from './services/interfaces'
 * ```
 */

// ============================================================================
// Core Document Processing Interfaces
// ============================================================================
export type {
	ExtractionInput,
	ExtractionResult,
	Chunk,
	ProcessedDocument,
	ProcessingStatistics,
	PreviewInput as CorePreviewInput,
	PreviewResult as CorePreviewResult,
	ProcessDocumentInput,
	ProcessingOptions,
	QueueDocumentInput,
	JobResult,
	ProcessingError,
	ProcessingResult,
	CircuitBreakerState,
	RetryOptions,
	ExtractorServiceConfig,
	ProcessorServiceConfig,
	PreviewServiceConfig,
	OrchestratorServiceConfig,
	DocumentExtractorService,
	DocumentProcessorService,
	PreviewGeneratorService,
	IngestionOrchestratorService,
	BaseService,
} from './document-processing'

// ============================================================================
// Extraction Interfaces
// ============================================================================
export type {
	DocumentExtractor,
	URLExtractor,
	URLExtractorOptions,
	RateLimitInfo as ExtractionRateLimitInfo,
	YouTubeExtractor,
	YouTubeOptions,
	YouTubeMetadata,
	PDFExtractor,
	PDFOptions,
	OCROptions,
	PDFMetadata,
	FileExtractor,
	FileOptions,
	FileMetadata,
	RepositoryExtractor,
	RepositoryOptions,
	RepositoryInfo,
	FileTreeNode,
	ExtractorChainConfig,
	ChainExecutionResult,
	ExtractorChain,
	ValidationRules,
	SanitizationOptions,
	ExtractionValidator,
	MetaTags,
	ExtractionMetadata,
} from './extraction'

// ============================================================================
// Processing Interfaces
// ============================================================================
export type {
	ChunkingService,
	ChunkingOptions,
	ChunkingStatistics,
	ChunkBoundary,
	EmbeddingService,
	EmbeddingOptions,
	EmbeddingProviderInfo,
	HybridEmbeddingStrategy,
	HybridEmbeddingConfig,
	SummarizationService,
	SummarizationOptions,
	MultiLevelSummary,
	SummarizationStatistics,
	TaggingService,
	TaggingOptions,
	TagWithMetadata,
	TagCategory,
	TagExtractionResult,
	DocumentEnrichmentService,
	EnrichedDocument,
	Entity,
	LanguageDetection,
	QualityScore,
	Sentiment,
	ReadabilityMetrics,
	ProcessingPipeline,
	ProcessingStage,
	ProcessingStageData,
	PipelineConfig,
	ProcessingMetrics,
	ProcessingEvent,
	ProcessingMonitor,
	AggregateStatistics,
} from './processing'

// ============================================================================
// Preview Generation Interfaces
// ============================================================================
export type {
	PreviewInput,
	PreviewOptions,
	PreviewResult,
	PreviewMetadata,
	ImageExtractor,
	ImageExtractionOptions,
	ImageExtractionResult,
	ImageMetadata,
	SVGGenerator,
	SVGGenerationOptions,
	TextSVGOptions,
	IconSVGOptions,
	SVGTemplate,
	FaviconExtractor,
	FaviconExtractionOptions,
	FaviconCollection,
	FaviconMetadata,
	PreviewCache,
	CacheConfig,
	CacheStatistics,
	PreviewGenerationPipeline,
	PreviewGeneratorStrategy,
	PreviewPipelineConfig,
	PreviewStorage,
	StorageConfig,
	StorageStatistics,
	PreviewOptimizer,
	OptimizationOptions,
	ImageInfo,
	PreviewValidator,
	ValidationError,
	PreviewGenerationEvent,
	PreviewMonitor,
	PreviewMetrics,
	PreviewAggregateStats,
} from './preview'

// ============================================================================
// Orchestration Interfaces
// ============================================================================
export type {
	CircuitBreaker,
	CircuitBreakerOptions,
	CircuitBreakerMetrics,
	StateChange,
	CircuitBreakerEvent,
	RetryHandler,
	ExtendedRetryOptions,
	RetryStatistics,
	RetryAttempt,
	RetryExecutionContext,
	JobQueue,
	Job,
	JobOptions,
	BackoffOptions,
	JobStatus,
	QueueStatistics,
	JobEvent,
	WorkflowOrchestrator,
	Workflow,
	WorkflowStep,
	WorkflowOptions,
	WorkflowContext,
	WorkflowStepResult,
	WorkflowResult,
	WorkflowStatus,
	WorkflowMetrics,
	WorkflowCheckpoint,
	TransactionManager,
	Transaction,
	RateLimiter,
	RateLimitResult,
	RateLimitInfo,
	RateLimitConfig,
	OrchestrationEvent,
	OrchestrationMonitor,
	EventFilter,
	OrchestrationMetrics,
} from './orchestration'
