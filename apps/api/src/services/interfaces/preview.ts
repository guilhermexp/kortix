/**
 * Preview Generation Interfaces
 *
 * Interfaces for document preview generation: image extraction,
 * SVG generation, and favicon extraction.
 */

import type { ExtractionResult } from "./document-processing"

// ============================================================================
// Core Preview Types
// ============================================================================

/**
 * Preview generation input
 */
export interface PreviewInput {
	/** Extraction result to generate preview from */
	extraction: ExtractionResult
	/** Document metadata */
	metadata?: Record<string, unknown>
	/** Force regeneration of preview */
	forceRegenerate?: boolean
	/** Preview options */
	options?: PreviewOptions
}

/**
 * Preview generation options
 */
export interface PreviewOptions {
	/** Preferred preview type */
	preferredType?: "image" | "svg" | "favicon"
	/** Target dimensions */
	targetDimensions?: {
		width: number
		height: number
	}
	/** Image quality (0-1) */
	quality?: number
	/** Format for image previews */
	format?: "png" | "jpeg" | "webp"
	/** Enable fallback chain */
	enableFallback?: boolean
	/** Timeout in milliseconds */
	timeout?: number
}

/**
 * Preview generation result
 */
export interface PreviewResult {
	/** Preview image URL */
	url: string
	/** Preview source/method */
	source: string
	/** Preview type */
	type: "image" | "svg" | "favicon" | "generated"
	/** Width in pixels (if applicable) */
	width?: number
	/** Height in pixels (if applicable) */
	height?: number
	/** File size in bytes */
	fileSize?: number
	/** Additional metadata */
	metadata?: PreviewMetadata
	/** Generation time in milliseconds */
	generationTime?: number
}

/**
 * Preview metadata
 */
export interface PreviewMetadata {
	/** Generator used */
	generator: string
	/** Generation timestamp */
	timestamp: Date
	/** Source URL (if applicable) */
	sourceUrl?: string
	/** Content type */
	contentType: string
	/** Is cached */
	cached: boolean
	/** Cache key */
	cacheKey?: string
	/** Additional properties */
	properties?: Record<string, unknown>
}

// ============================================================================
// Image Extraction Interfaces
// ============================================================================

/**
 * Service for extracting preview images from documents
 */
export interface ImageExtractor {
	/**
	 * Extract image from document
	 */
	extract(
		extraction: ExtractionResult,
		options?: ImageExtractionOptions,
	): Promise<string | null>

	/**
	 * Extract images from URL
	 */
	extractFromUrl(
		url: string,
		options?: ImageExtractionOptions,
	): Promise<ImageExtractionResult>

	/**
	 * Extract images from HTML content
	 */
	extractFromHtml(html: string, baseUrl?: string): Promise<string[]>

	/**
	 * Extract Open Graph image
	 */
	extractOgImage(url: string): Promise<string | null>

	/**
	 * Extract Twitter card image
	 */
	extractTwitterImage(url: string): Promise<string | null>

	/**
	 * Validate image URL
	 */
	validateImageUrl(url: string): Promise<boolean>

	/**
	 * Get image metadata
	 */
	getImageMetadata(url: string): Promise<ImageMetadata>
}

/**
 * Image extraction options
 */
export interface ImageExtractionOptions {
	/** Prefer Open Graph image */
	preferOgImage?: boolean
	/** Prefer Twitter card image */
	preferTwitterImage?: boolean
	/** Minimum image dimensions */
	minDimensions?: {
		width: number
		height: number
	}
	/** Maximum image size in bytes */
	maxSize?: number
	/** Allowed formats */
	allowedFormats?: string[]
	/** Timeout in milliseconds */
	timeout?: number
}

/**
 * Image extraction result
 */
export interface ImageExtractionResult {
	/** Primary image URL */
	primaryImage: string | null
	/** All found images */
	allImages: string[]
	/** Open Graph image */
	ogImage?: string
	/** Twitter card image */
	twitterImage?: string
	/** Favicon */
	favicon?: string
	/** Image metadata */
	metadata: Map<string, ImageMetadata>
}

/**
 * Image metadata
 */
export interface ImageMetadata {
	/** Image URL */
	url: string
	/** Width in pixels */
	width: number
	/** Height in pixels */
	height: number
	/** File size in bytes */
	size: number
	/** Image format */
	format: string
	/** Content type */
	contentType: string
	/** Aspect ratio */
	aspectRatio: number
	/** Alt text (if available) */
	altText?: string
	/** Is vector image */
	isVector: boolean
}

// ============================================================================
// SVG Generation Interfaces
// ============================================================================

/**
 * Service for generating SVG previews
 */
export interface SVGGenerator {
	/**
	 * Generate SVG preview for document
	 */
	generate(
		extraction: ExtractionResult,
		options?: SVGGenerationOptions,
	): Promise<string>

	/**
	 * Generate gradient background
	 */
	generateGradientBackground(colors?: string[]): string

	/**
	 * Generate text-based SVG
	 */
	generateTextSVG(text: string, options?: TextSVGOptions): string

	/**
	 * Generate icon-based SVG
	 */
	generateIconSVG(iconType: string, options?: IconSVGOptions): string

	/**
	 * Generate custom SVG from template
	 */
	generateFromTemplate(template: string, data: Record<string, unknown>): string

	/**
	 * Optimize SVG
	 */
	optimizeSVG(svg: string): string
}

/**
 * SVG generation options
 */
export interface SVGGenerationOptions {
	/** SVG width */
	width?: number
	/** SVG height */
	height?: number
	/** Background color(s) */
	backgroundColor?: string | string[]
	/** Text color */
	textColor?: string
	/** Font family */
	fontFamily?: string
	/** Font size */
	fontSize?: number
	/** Include document title */
	includeTitle?: boolean
	/** Include icon */
	includeIcon?: boolean
	/** Icon type */
	iconType?: "document" | "url" | "youtube" | "pdf" | "code"
	/** Template to use */
	template?: SVGTemplate
}

/**
 * Text SVG options
 */
export interface TextSVGOptions {
	/** Text to display */
	text: string
	/** Font size */
	fontSize?: number
	/** Font weight */
	fontWeight?: string
	/** Text color */
	color?: string
	/** Text alignment */
	alignment?: "left" | "center" | "right"
	/** Max lines */
	maxLines?: number
	/** Line height */
	lineHeight?: number
}

/**
 * Icon SVG options
 */
export interface IconSVGOptions {
	/** Icon size */
	size?: number
	/** Icon color */
	color?: string
	/** Icon style */
	style?: "outline" | "filled"
	/** Custom path data */
	pathData?: string
}

/**
 * SVG template
 */
export interface SVGTemplate {
	/** Template name */
	name: string
	/** Template SVG */
	svg: string
	/** Placeholders */
	placeholders: string[]
	/** Default values */
	defaults?: Record<string, unknown>
}

// ============================================================================
// Favicon Extraction Interfaces
// ============================================================================

/**
 * Service for extracting favicons from URLs
 */
export interface FaviconExtractor {
	/**
	 * Extract favicon from URL
	 */
	extract(
		url: string,
		options?: FaviconExtractionOptions,
	): Promise<string | null>

	/**
	 * Get all available favicon URLs
	 */
	getAllFavicons(url: string): Promise<FaviconCollection>

	/**
	 * Get best quality favicon
	 */
	getBestFavicon(url: string): Promise<string | null>

	/**
	 * Check if favicon exists
	 */
	exists(url: string): Promise<boolean>

	/**
	 * Get favicon metadata
	 */
	getMetadata(url: string): Promise<FaviconMetadata>
}

/**
 * Favicon extraction options
 */
export interface FaviconExtractionOptions {
	/** Prefer high resolution */
	preferHighRes?: boolean
	/** Minimum size */
	minSize?: number
	/** Allowed formats */
	allowedFormats?: string[]
	/** Timeout in milliseconds */
	timeout?: number
	/** Use external service */
	useExternalService?: boolean
}

/**
 * Favicon collection
 */
export interface FaviconCollection {
	/** Primary favicon */
	primary: string | null
	/** Apple touch icon */
	appleTouchIcon?: string
	/** High resolution icons */
	highRes: string[]
	/** Standard icons */
	standard: string[]
	/** Metadata for each icon */
	metadata: Map<string, FaviconMetadata>
}

/**
 * Favicon metadata
 */
export interface FaviconMetadata {
	/** Favicon URL */
	url: string
	/** Size (e.g., "32x32") */
	size?: string
	/** Type */
	type: string
	/** Width */
	width?: number
	/** Height */
	height?: number
	/** Relationship type */
	rel: string
}

// ============================================================================
// Preview Metrics
// ============================================================================

/**
 * Preview metrics
 */
export interface PreviewMetrics {
	/** Total generation time */
	totalTime: number
	/** Generator used */
	generator: string
	/** Was cached */
	cached: boolean
	/** Fallback used */
	fallbackUsed: boolean
	/** Optimization time */
	optimizationTime?: number
	/** Upload time */
	uploadTime?: number
}
