/**
 * Processing Module
 *
 * Central export point for all document processing services and utilities.
 */

// ============================================================================
// Processing Services
// ============================================================================

export {
	ChunkingService,
	createChunkingService,
} from "./chunking-service"
export {
	createDocumentProcessorService,
	DocumentProcessorService,
} from "./document-processor"
export {
	createEmbeddingService,
	EmbeddingService,
} from "./embedding-service"
export {
	createSummarizationService,
	SummarizationService,
} from "./summarization-service"
export {
	createTaggingService,
	TaggingService,
} from "./tagging-service"

// ============================================================================
// Re-export Types
// ============================================================================

export type {
	AggregateStatistics,
	// Result types
	Chunk,
	// Configuration types
	ChunkingOptions,
	// Service types
	ChunkingService as IChunkingService,
	ChunkingStatistics,
	DocumentProcessorService as IDocumentProcessorService,
	EmbeddingOptions,
	EmbeddingProviderInfo,
	EmbeddingService as IEmbeddingService,
	ProcessedDocument,
	ProcessingEvent,
	// Processing types
	ProcessingMetrics,
	ProcessingMonitor,
	ProcessingOptions,
	ProcessorServiceConfig,
	SummarizationOptions,
	SummarizationResult,
	SummarizationService as ISummarizationService,
	TaggingOptions,
	TaggingResult,
	TaggingService as ITaggingService,
} from "../interfaces"
