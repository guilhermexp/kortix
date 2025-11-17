/**
 * Extraction Module
 *
 * Central export point for all extraction services and utilities.
 */

// ============================================================================
// Specialized Extractors
// ============================================================================

export {
	createFileExtractor,
	FileExtractor,
} from "./file-extractor"
export {
	createPDFExtractor,
	PDFExtractor,
} from "./pdf-extractor"
export {
	createURLExtractor,
	URLExtractor,
} from "./url-extractor"
export {
	createYouTubeExtractor,
	YouTubeExtractor,
} from "./youtube-extractor"

// GitHub extraction handled by MarkItDown via URLExtractor
// Repository-specific extractor removed

// ============================================================================
// Main Services
// ============================================================================

export {
	createDocumentExtractorService,
	DocumentExtractorService,
} from "./document-extractor-service"

export {
	createExtractionValidator,
	ExtractionValidator,
} from "./extraction-validator"

// ============================================================================
// Re-export Types
// ============================================================================

export type {
	ChainExecutionResult,
	DocumentExtractor,
	// Service types
	DocumentExtractorService as IDocumentExtractorService,
	// Core types
	ExtractionInput,
	ExtractionResult,
	// Chain types
	ExtractorChainConfig,
	ExtractorServiceConfig,
	FileExtractor as IFileExtractor,
	FileMetadata,
	FileOptions,
	PDFExtractor as IPDFExtractor,
	PDFMetadata,
	PDFOptions,
	// Specialized extractor types
	URLExtractor as IURLExtractor,
	// Options types
	URLExtractorOptions,
	YouTubeExtractor as IYouTubeExtractor,
	// Metadata types
	YouTubeMetadata,
	YouTubeOptions,
} from "../interfaces"
