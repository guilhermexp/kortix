/**
 * Document Processing Interfaces - Central Export
 *
 * This file provides a central location for importing all document processing
 * interfaces. Import from this file instead of individual interface files.
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
// Preview Generation Interfaces
// ============================================================================
export type {
	FaviconCollection,
	FaviconExtractionOptions,
	FaviconExtractor,
	FaviconMetadata,
	IconSVGOptions,
	ImageExtractionOptions,
	ImageExtractionResult,
	ImageExtractor,
	ImageMetadata,
	PreviewInput,
	PreviewMetadata,
	PreviewMetrics,
	PreviewOptions,
	PreviewResult,
	SVGGenerationOptions,
	SVGGenerator,
	SVGTemplate,
	TextSVGOptions,
} from "./preview"

// ============================================================================
// Processing Interfaces
// ============================================================================
export type {
	ChunkingOptions,
	ChunkingService,
	ChunkingStatistics,
	MultiLevelSummary,
	SummarizationOptions,
	SummarizationService,
	SummarizationStatistics,
	TagCategory,
	TagExtractionResult,
	TaggingOptions,
	TaggingService,
	TagWithMetadata,
} from "./processing"
