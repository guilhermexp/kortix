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
	BaseService,
	Chunk,
	CircuitBreakerState,
	DocumentExtractorService,
	DocumentProcessorService,
	ExtractionInput,
	ExtractionResult,
	ExtractorServiceConfig,
	IngestionOrchestratorService,
	JobResult,
	OrchestratorServiceConfig,
	PreviewGeneratorService,
	PreviewInput as CorePreviewInput,
	PreviewResult as CorePreviewResult,
	PreviewServiceConfig,
	ProcessDocumentInput,
	ProcessedDocument,
	ProcessingError,
	ProcessingOptions,
	ProcessingResult,
	ProcessingStatistics,
	ProcessorServiceConfig,
	QueueDocumentInput,
	RetryOptions,
} from "./document-processing"

// ============================================================================
// Extraction Interfaces
// ============================================================================
export type {
	ChainExecutionResult,
	DocumentExtractor,
	ExtractionMetadata,
	ExtractionValidator,
	ExtractorChain,
	ExtractorChainConfig,
	FileExtractor,
	FileMetadata,
	FileOptions,
	MetaTags,
	OCROptions,
	PDFExtractor,
	PDFMetadata,
	PDFOptions,
	RateLimitInfo as ExtractionRateLimitInfo,
	SanitizationOptions,
	URLExtractor,
	URLExtractorOptions,
	ValidationRules,
	YouTubeExtractor,
	YouTubeMetadata,
	YouTubeOptions,
} from "./extraction"
// ============================================================================
// Orchestration Interfaces
// ============================================================================
export type {
	BackoffOptions,
	CircuitBreaker,
	CircuitBreakerEvent,
	CircuitBreakerMetrics,
	CircuitBreakerOptions,
	EventFilter,
	ExtendedRetryOptions,
	Job,
	JobEvent,
	JobOptions,
	JobQueue,
	JobStatus,
	OrchestrationEvent,
	OrchestrationMetrics,
	OrchestrationMonitor,
	QueueStatistics,
	RateLimitConfig,
	RateLimiter,
	RateLimitInfo,
	RateLimitResult,
	RetryAttempt,
	RetryExecutionContext,
	RetryHandler,
	RetryStatistics,
	StateChange,
	Transaction,
	TransactionManager,
	Workflow,
	WorkflowCheckpoint,
	WorkflowContext,
	WorkflowMetrics,
	WorkflowOptions,
	WorkflowOrchestrator,
	WorkflowResult,
	WorkflowStatus,
	WorkflowStep,
	WorkflowStepResult,
} from "./orchestration"

// ============================================================================
// Preview Generation Interfaces
// ============================================================================
export type {
	CacheConfig,
	CacheStatistics,
	FaviconCollection,
	FaviconExtractionOptions,
	FaviconExtractor,
	FaviconMetadata,
	IconSVGOptions,
	ImageExtractionOptions,
	ImageExtractionResult,
	ImageExtractor,
	ImageInfo,
	ImageMetadata,
	OptimizationOptions,
	PreviewAggregateStats,
	PreviewCache,
	PreviewGenerationEvent,
	PreviewGenerationPipeline,
	PreviewGeneratorStrategy,
	PreviewInput,
	PreviewMetadata,
	PreviewMetrics,
	PreviewMonitor,
	PreviewOptimizer,
	PreviewOptions,
	PreviewPipelineConfig,
	PreviewResult,
	PreviewStorage,
	PreviewValidator,
	StorageConfig,
	StorageStatistics,
	SVGGenerationOptions,
	SVGGenerator,
	SVGTemplate,
	TextSVGOptions,
	ValidationError,
} from "./preview"
// ============================================================================
// Processing Interfaces
// ============================================================================
export type {
	AggregateStatistics,
	ChunkBoundary,
	ChunkingOptions,
	ChunkingService,
	ChunkingStatistics,
	DocumentEnrichmentService,
	EmbeddingOptions,
	EmbeddingProviderInfo,
	EmbeddingService,
	EnrichedDocument,
	Entity,
	HybridEmbeddingConfig,
	HybridEmbeddingStrategy,
	LanguageDetection,
	MultiLevelSummary,
	PipelineConfig,
	ProcessingEvent,
	ProcessingMetrics,
	ProcessingMonitor,
	ProcessingPipeline,
	ProcessingStage,
	ProcessingStageData,
	QualityScore,
	ReadabilityMetrics,
	Sentiment,
	SummarizationOptions,
	SummarizationService,
	SummarizationStatistics,
	TagCategory,
	TagExtractionResult,
	TaggingOptions,
	TaggingService,
	TagWithMetadata,
} from "./processing"
