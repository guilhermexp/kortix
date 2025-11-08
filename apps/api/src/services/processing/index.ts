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
} from './chunking-service'

export {
	EmbeddingService,
	createEmbeddingService,
} from './embedding-service'

export {
	SummarizationService,
	createSummarizationService,
} from './summarization-service'

export {
	TaggingService,
	createTaggingService,
} from './tagging-service'

export {
	DocumentProcessorService,
	createDocumentProcessorService,
} from './document-processor'

// ============================================================================
// Re-export Types
// ============================================================================

export type {
	// Service types
	ChunkingService as IChunkingService,
	EmbeddingService as IEmbeddingService,
	SummarizationService as ISummarizationService,
	TaggingService as ITaggingService,
	DocumentProcessorService as IDocumentProcessorService,

	// Configuration types
	ChunkingOptions,
	EmbeddingOptions,
	SummarizationOptions,
	TaggingOptions,
	ProcessorServiceConfig,
	ProcessingOptions,

	// Result types
	Chunk,
	ProcessedDocument,
	SummarizationResult,
	TaggingResult,
	ChunkingStatistics,
	EmbeddingProviderInfo,

	// Processing types
	ProcessingMetrics,
	ProcessingEvent,
	ProcessingMonitor,
	AggregateStatistics,
} from '../interfaces'
