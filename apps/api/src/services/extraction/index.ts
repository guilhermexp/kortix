/**
 * Extraction Module
 *
 * Central export point for all extraction services and utilities.
 */

// ============================================================================
// Specialized Extractors
// ============================================================================

export {
	URLExtractor,
	createURLExtractor,
} from './url-extractor'

export {
	YouTubeExtractor,
	createYouTubeExtractor,
} from './youtube-extractor'

export {
	PDFExtractor,
	createPDFExtractor,
} from './pdf-extractor'

export {
	FileExtractor,
	createFileExtractor,
} from './file-extractor'

export {
	RepositoryExtractor,
	createRepositoryExtractor,
} from './repository-extractor'

// ============================================================================
// Main Services
// ============================================================================

export {
	DocumentExtractorService,
	createDocumentExtractorService,
} from './document-extractor-service'

export {
	ExtractionValidator,
	createExtractionValidator,
} from './extraction-validator'

// ============================================================================
// Re-export Types
// ============================================================================

export type {
	// Core types
	ExtractionInput,
	ExtractionResult,
	DocumentExtractor,

	// Service types
	DocumentExtractorService as IDocumentExtractorService,
	ExtractorServiceConfig,

	// Specialized extractor types
	URLExtractor as IURLExtractor,
	YouTubeExtractor as IYouTubeExtractor,
	PDFExtractor as IPDFExtractor,
	FileExtractor as IFileExtractor,
	RepositoryExtractor as IRepositoryExtractor,

	// Options types
	URLExtractorOptions,
	YouTubeOptions,
	PDFOptions,
	FileOptions,
	RepositoryOptions,

	// Metadata types
	YouTubeMetadata,
	PDFMetadata,
	FileMetadata,
	RepositoryInfo,
	FileTreeNode,

	// Chain types
	ExtractorChainConfig,
	ChainExecutionResult,
} from '../interfaces'
