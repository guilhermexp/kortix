/**
 * Preview Module
 *
 * Central export point for all preview generation services and utilities.
 */

// ============================================================================
// Preview Services
// ============================================================================

export { createFaviconExtractor, FaviconExtractor } from "./favicon-extractor"
export { createImageExtractor, ImageExtractor } from "./image-extractor"
export {
	createPreviewGeneratorService,
	PreviewGeneratorService,
} from "./preview-generator"
export { createSVGGenerator, SVGGenerator } from "./svg-generator"

// ============================================================================
// Re-export Types
// ============================================================================

export type {
	FaviconCollection,
	FaviconExtractionOptions,
	FaviconExtractor as IFaviconExtractor,
	FaviconMetadata,
	IconSVGOptions,
	// Configuration types
	ImageExtractionOptions,
	// Result types
	ImageExtractionResult,
	// Service types
	ImageExtractor as IImageExtractor,
	ImageMetadata,
	PreviewGenerationOptions,
	PreviewGeneratorConfig,
	PreviewGeneratorService as IPreviewGeneratorService,
	PreviewMetrics,
	PreviewResult,
	SVGGenerationOptions,
	SVGGenerator as ISVGGenerator,
	SVGTemplate,
	// SVG types
	TextSVGOptions,
} from "../interfaces"
