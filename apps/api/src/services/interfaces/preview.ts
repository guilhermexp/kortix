/**
 * Preview Generation Interfaces
 *
 * This file contains interfaces specific to document preview generation.
 * These interfaces define the contracts for image extraction, SVG generation,
 * favicon extraction, and preview caching.
 *
 * Preview Services:
 * - ImageExtractor: Extract preview images from documents
 * - SVGGenerator: Generate SVG previews for documents
 * - FaviconExtractor: Extract favicons from URLs
 * - PreviewCache: Cache preview results
 */

import type { BaseService, ExtractionResult } from "./document-processing"

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
export interface ImageExtractor extends BaseService {
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
export interface SVGGenerator extends BaseService {
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
export interface FaviconExtractor extends BaseService {
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
// Preview Cache Interfaces
// ============================================================================

/**
 * Service for caching preview results
 */
export interface PreviewCache extends BaseService {
	/**
	 * Get cached preview
	 */
	get(key: string): Promise<PreviewResult | null>

	/**
	 * Set preview in cache
	 */
	set(key: string, preview: PreviewResult, ttl?: number): Promise<void>

	/**
	 * Delete preview from cache
	 */
	delete(key: string): Promise<void>

	/**
	 * Check if preview is cached
	 */
	has(key: string): Promise<boolean>

	/**
	 * Get cache key for extraction
	 */
	getCacheKey(extraction: ExtractionResult): string

	/**
	 * Clear cache
	 */
	clear(): Promise<void>

	/**
	 * Get cache statistics
	 */
	getStats(): Promise<CacheStatistics>
}

/**
 * Cache configuration
 */
export interface CacheConfig {
	/** Default TTL in seconds */
	defaultTTL: number
	/** Maximum cache size in bytes */
	maxSize?: number
	/** Maximum number of entries */
	maxEntries?: number
	/** Cache strategy */
	strategy?: "lru" | "lfu" | "fifo"
	/** Enable cache compression */
	compress?: boolean
}

/**
 * Cache statistics
 */
export interface CacheStatistics {
	/** Total cache size in bytes */
	size: number
	/** Number of entries */
	entries: number
	/** Hit rate */
	hitRate: number
	/** Miss rate */
	missRate: number
	/** Total hits */
	hits: number
	/** Total misses */
	misses: number
	/** Evictions */
	evictions: number
}

// ============================================================================
// Preview Generation Pipeline
// ============================================================================

/**
 * Preview generation pipeline with fallbacks
 */
export interface PreviewGenerationPipeline {
	/**
	 * Generate preview with fallback chain
	 */
	generate(input: PreviewInput): Promise<PreviewResult>

	/**
	 * Add generator to pipeline
	 */
	addGenerator(generator: PreviewGeneratorStrategy, priority: number): void

	/**
	 * Remove generator from pipeline
	 */
	removeGenerator(name: string): void

	/**
	 * Get pipeline configuration
	 */
	getConfig(): PreviewPipelineConfig
}

/**
 * Preview generator strategy
 */
export interface PreviewGeneratorStrategy {
	/** Strategy name */
	name: string
	/** Can handle input */
	canHandle(input: PreviewInput): boolean
	/** Generate preview */
	generate(input: PreviewInput): Promise<PreviewResult>
	/** Priority (higher = preferred) */
	priority: number
}

/**
 * Preview pipeline configuration
 */
export interface PreviewPipelineConfig {
	/** Generator strategies */
	strategies: PreviewGeneratorStrategy[]
	/** Enable caching */
	enableCache: boolean
	/** Cache config */
	cacheConfig?: CacheConfig
	/** Fallback chain */
	fallbackChain: string[]
	/** Timeout per strategy */
	strategyTimeout: number
	/** Total timeout */
	totalTimeout: number
}

// ============================================================================
// Preview Storage Interfaces
// ============================================================================

/**
 * Service for storing generated previews
 */
export interface PreviewStorage extends BaseService {
	/**
	 * Upload preview to storage
	 */
	upload(preview: Buffer, metadata: PreviewMetadata): Promise<string>

	/**
	 * Download preview from storage
	 */
	download(url: string): Promise<Buffer>

	/**
	 * Delete preview from storage
	 */
	delete(url: string): Promise<void>

	/**
	 * Check if preview exists
	 */
	exists(url: string): Promise<boolean>

	/**
	 * Get preview URL
	 */
	getUrl(key: string): string

	/**
	 * Get storage statistics
	 */
	getStats(): Promise<StorageStatistics>
}

/**
 * Storage configuration
 */
export interface StorageConfig {
	/** Storage provider */
	provider: "supabase" | "s3" | "local"
	/** Bucket/container name */
	bucket: string
	/** Base path */
	basePath?: string
	/** Public URL base */
	publicUrlBase?: string
	/** Maximum file size */
	maxFileSize?: number
}

/**
 * Storage statistics
 */
export interface StorageStatistics {
	/** Total storage used in bytes */
	totalSize: number
	/** Number of files */
	fileCount: number
	/** Average file size */
	averageFileSize: number
	/** Storage provider */
	provider: string
}

// ============================================================================
// Preview Optimization Interfaces
// ============================================================================

/**
 * Service for optimizing preview images
 */
export interface PreviewOptimizer extends BaseService {
	/**
	 * Optimize image
	 */
	optimize(image: Buffer, options?: OptimizationOptions): Promise<Buffer>

	/**
	 * Resize image
	 */
	resize(image: Buffer, width: number, height: number): Promise<Buffer>

	/**
	 * Convert format
	 */
	convert(image: Buffer, format: "png" | "jpeg" | "webp"): Promise<Buffer>

	/**
	 * Compress image
	 */
	compress(image: Buffer, quality: number): Promise<Buffer>

	/**
	 * Get image info
	 */
	getInfo(image: Buffer): Promise<ImageInfo>
}

/**
 * Optimization options
 */
export interface OptimizationOptions {
	/** Target format */
	format?: "png" | "jpeg" | "webp"
	/** Quality (0-1) */
	quality?: number
	/** Target dimensions */
	dimensions?: {
		width: number
		height: number
	}
	/** Maintain aspect ratio */
	maintainAspectRatio?: boolean
	/** Strip metadata */
	stripMetadata?: boolean
	/** Enable progressive encoding */
	progressive?: boolean
}

/**
 * Image information
 */
export interface ImageInfo {
	/** Width */
	width: number
	/** Height */
	height: number
	/** Format */
	format: string
	/** Size in bytes */
	size: number
	/** Color space */
	colorSpace?: string
	/** Has alpha channel */
	hasAlpha: boolean
	/** Bit depth */
	bitDepth?: number
}

// ============================================================================
// Preview Validation Interfaces
// ============================================================================

/**
 * Validator for preview generation
 */
export interface PreviewValidator {
	/**
	 * Validate preview input
	 */
	validateInput(input: PreviewInput): Promise<void>

	/**
	 * Validate preview result
	 */
	validateResult(result: PreviewResult): boolean

	/**
	 * Check if URL is a valid image
	 */
	isValidImageUrl(url: string): Promise<boolean>

	/**
	 * Get validation errors
	 */
	getValidationErrors(): ValidationError[]
}

/**
 * Validation error
 */
export interface ValidationError {
	/** Error code */
	code: string
	/** Error message */
	message: string
	/** Field that failed validation */
	field?: string
	/** Expected value */
	expected?: unknown
	/** Actual value */
	actual?: unknown
}

// ============================================================================
// Preview Event Types
// ============================================================================

/**
 * Preview generation event
 */
export interface PreviewGenerationEvent {
	/** Event type */
	type:
		| "started"
		| "completed"
		| "failed"
		| "cached"
		| "uploaded"
		| "fallback_used"
		| "optimized"
	/** Timestamp */
	timestamp: Date
	/** Document ID */
	documentId?: string
	/** Preview URL */
	previewUrl?: string
	/** Generator used */
	generator?: string
	/** Duration in milliseconds */
	duration?: number
	/** Error (if applicable) */
	error?: Error
	/** Metadata */
	metadata?: Record<string, unknown>
}

/**
 * Preview monitor for tracking generation events
 */
export interface PreviewMonitor {
	/**
	 * Record event
	 */
	recordEvent(event: PreviewGenerationEvent): void

	/**
	 * Get metrics for document
	 */
	getMetrics(documentId: string): PreviewMetrics | null

	/**
	 * Get aggregate statistics
	 */
	getAggregateStats(): PreviewAggregateStats
}

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

/**
 * Aggregate preview statistics
 */
export interface PreviewAggregateStats {
	/** Total previews generated */
	totalGenerated: number
	/** Cache hit rate */
	cacheHitRate: number
	/** Average generation time */
	averageGenerationTime: number
	/** Success rate */
	successRate: number
	/** Most used generator */
	mostUsedGenerator: string
	/** Fallback usage rate */
	fallbackRate: number
}
