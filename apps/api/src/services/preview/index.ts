/**
 * Preview Module
 *
 * Central export point for all preview generation services and utilities.
 */

// ============================================================================
// Preview Services
// ============================================================================

export { ImageExtractor, createImageExtractor } from './image-extractor'

export { SVGGenerator, createSVGGenerator } from './svg-generator'

export { FaviconExtractor, createFaviconExtractor } from './favicon-extractor'

export {
	PreviewGeneratorService,
	createPreviewGeneratorService,
} from './preview-generator'

// ============================================================================
// Re-export Types
// ============================================================================

export type {
	// Service types
	ImageExtractor as IImageExtractor,
	SVGGenerator as ISVGGenerator,
	FaviconExtractor as IFaviconExtractor,
	PreviewGeneratorService as IPreviewGeneratorService,

	// Configuration types
	ImageExtractionOptions,
	SVGGenerationOptions,
	FaviconExtractionOptions,
	PreviewGenerationOptions,
	PreviewGeneratorConfig,

	// Result types
	ImageExtractionResult,
	ImageMetadata,
	FaviconCollection,
	FaviconMetadata,
	PreviewResult,
	PreviewMetrics,

	// SVG types
	TextSVGOptions,
	IconSVGOptions,
	SVGTemplate,
} from '../interfaces'
