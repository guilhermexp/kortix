/**
 * Preview Generator Service
 *
 * Unified service for generating preview images from documents.
 * Features:
 * - Orchestrates all preview generation strategies
 * - Fallback chain: Image → SVG → Favicon
 * - Configurable pipeline with priorities
 * - Performance monitoring and optimization
 * - Caching for improved performance
 * - Multiple generation strategies
 */

import { BaseService } from "../base/base-service"
import type {
	ExtractionResult,
	PreviewGeneratorService as IPreviewGeneratorService,
	PreviewGenerationOptions,
	PreviewGeneratorConfig,
	PreviewInput,
	PreviewMetrics,
	PreviewResult,
} from "../interfaces"
import {
	createFaviconExtractor,
	type FaviconExtractor,
} from "./favicon-extractor"
import { createImageExtractor, type ImageExtractor } from "./image-extractor"

// NOTE: SVG generator is lazily imported to avoid runtime parse issues
type SVGGenerator = any

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT = 15000 // 15 seconds total
const DEFAULT_STRATEGY_TIMEOUT = 5000 // 5 seconds per strategy

// Fallback chain priorities
const _STRATEGY_PRIORITIES = {
	image: 3, // Highest priority
	svg: 2,
	favicon: 1, // Lowest priority (fallback)
} as const

// ============================================================================
// Preview Generator Service Implementation
// ============================================================================

/**
 * Service for generating preview images with fallback strategies
 */
export class PreviewGeneratorService
	extends BaseService
	implements IPreviewGeneratorService
{
	private readonly config: PreviewGeneratorConfig
	private imageExtractor?: ImageExtractor
	private svgGenerator?: SVGGenerator
	private faviconExtractor?: FaviconExtractor
	private readonly metricsMap: Map<string, PreviewMetrics>
	private readonly cache: Map<string, any>

	constructor(config?: Partial<PreviewGeneratorConfig>) {
		super("PreviewGeneratorService")

		this.config = {
			enableImageExtraction: config?.enableImageExtraction ?? true,
			enableSvgGeneration: config?.enableSvgGeneration ?? false,
			enableFaviconExtraction: config?.enableFaviconExtraction ?? false,
			preferHighResolution: config?.preferHighResolution ?? true,
			timeout: config?.timeout ?? DEFAULT_TIMEOUT,
			strategyTimeout: config?.strategyTimeout ?? DEFAULT_STRATEGY_TIMEOUT,
			fallbackChain: config?.fallbackChain ?? ["image"],
			...config,
		}

		this.metricsMap = new Map()
		this.cache = new Map()
	}

	// ========================================================================
	// Initialization
	// ========================================================================

	protected async onInitialize(): Promise<void> {
		this.logger.info("Initializing preview generator service", {
			config: this.config,
		})

		// Initialize preview generators
		await this.initializeGenerators()

		this.logger.info("Preview generator service initialized")
	}

	/**
	 * Initialize all preview generators
	 */
	private async initializeGenerators(): Promise<void> {
		// Image extractor
		if (this.config.enableImageExtraction) {
			this.imageExtractor = createImageExtractor({
				preferOgImage: true,
				preferTwitterImage: false,
				timeout: this.config.strategyTimeout,
			})
			await this.imageExtractor.initialize()
			this.logger.debug("Image extractor initialized")
		}

		// SVG generator
		if (this.config.enableSvgGeneration) {
			const mod = await import("./svg-generator")
			this.svgGenerator = mod.createSVGGenerator()
			await this.svgGenerator.initialize()
			this.logger.debug("SVG generator initialized")
		}

		// Favicon extractor
		if (this.config.enableFaviconExtraction) {
			this.faviconExtractor = createFaviconExtractor({
				preferHighRes: this.config.preferHighResolution,
				timeout: this.config.strategyTimeout,
				useExternalService: true,
			})
			await this.faviconExtractor.initialize()
			this.logger.debug("Favicon extractor initialized")
		}
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Generate preview image for extraction result
	 *
	 * Uses intelligent fallback chain to generate preview images:
	 * 1. Image Extraction - Extracts og:image, twitter:image from meta tags
	 * 2. SVG Generation - Generates gradient SVG with first letter
	 * 3. Favicon Extraction - Falls back to website favicon
	 *
	 * @param extraction - Extracted document result
	 * @param options - Preview generation options
	 * @returns Preview result with image URL and generation metadata
	 *
	 * @example
	 * ```typescript
	 * // Generate with default fallback chain
	 * const preview = await generator.generate(extractionResult);
	 *
	 * // Generate with custom fallback chain
	 * const preview = await generator.generate(extractionResult, {
	 *   fallbackChain: ['image', 'favicon'],
	 *   preferHighResolution: true
	 * });
	 *
	 * // Generate with specific strategy
	 * const preview = await generator.generate(extractionResult, {
	 *   fallbackChain: ['svg']
	 * });
	 * ```
	 */
	async generate(
		input: ExtractionResult | PreviewInput,
		options?: PreviewGenerationOptions,
	): Promise<PreviewResult> {
		this.assertInitialized()
		this.assertGeneratorsRegistered()

		const { extraction, mergedOptions } = this.normalizeInput(input, options)

		const tracker = this.performanceMonitor.startOperation("generate")
		const startTime = Date.now()

		try {
			this.logger.info("Starting preview generation", {
				title: extraction.title,
				source: extraction.source,
			})

			// Priority 1: Check if extraction already has a preview URL (e.g., from README)
			if ((extraction as any).preview) {
				const previewUrl = (extraction as any).preview
				this.logger.info("Using preview from extraction result", {
					previewUrl,
					source: extraction.source,
				})

				tracker.end(true)
				return {
					url: previewUrl,
					type: "image" as const,
					generator: "extraction",
					metadata: {
						source: "extraction-result",
						originalUrl: extraction.url,
					},
				}
			}

			// Try each strategy in fallback chain
			const chain =
				mergedOptions?.fallbackChain && mergedOptions.fallbackChain.length > 0
					? mergedOptions.fallbackChain
					: this.config.fallbackChain

			for (const strategy of chain) {
				try {
					const result = await this.executeStrategy(
						strategy,
						extraction,
						mergedOptions,
					)

					if (result) {
						tracker.end(true)

						// Store metrics
						const metrics: PreviewMetrics = {
							totalTime: Date.now() - startTime,
							generator: strategy,
							cached: false,
							fallbackUsed: strategy !== chain[0],
						}
						this.metricsMap.set(extraction.url || extraction.title, metrics)

						this.logger.info("Preview generated successfully", {
							strategy,
							url: result.url,
							generationTime: metrics.totalTime,
						})

						return result
					}
				} catch (error) {
					this.logger.warn(`Strategy ${strategy} failed`, {
						error: (error as Error).message,
					})
					// Continue to next strategy
				}
			}

			// All strategies failed
			tracker.end(false)

			throw this.createError(
				"ALL_STRATEGIES_FAILED",
				"All preview generation strategies failed",
			)
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "generate")
		}
	}

	async generatePreview(
		documentInput: any,
		options?: any,
	): Promise<{
		success: boolean
		data?: {
			previewType: string
			content: string
			metadata?: any
			generatedAt: string
		}
		error?: { code: string; message: string }
	}> {
		this.assertInitialized()
		const key =
			documentInput?.id ||
			documentInput?.url ||
			documentInput?.title ||
			"__unknown__"
		if (this.cache.has(key) && !options?.force) {
			return { success: true, data: this.cache.get(key) }
		}
		const chain =
			options?.fallbackChain && options.fallbackChain.length > 0
				? options.fallbackChain
				: this.config.fallbackChain
		const start = Date.now()
		for (const strategy of chain) {
			try {
				if (strategy === "favicon") {
					const r = await this.extractFavicon(documentInput)
					if (r.success && r.data) {
						this.metricsMap.set(key, {
							totalTime: Date.now() - start,
							generator: "favicon",
							cached: false,
							fallbackUsed: strategy !== chain[0],
						})
						this.cache.set(key, r.data)
						return r
					}
				}
				if (strategy === "image") {
					const r = await this.generateImagePreview(documentInput)
					if (r.success && r.data) {
						this.metricsMap.set(key, {
							totalTime: Date.now() - start,
							generator: "image",
							cached: false,
							fallbackUsed: strategy !== chain[0],
						})
						this.cache.set(key, r.data)
						return r
					}
				}
				if (strategy === "svg") {
					const r = await this.generateSVGPreview(documentInput, options)
					if (r.success && r.data) {
						this.metricsMap.set(key, {
							totalTime: Date.now() - start,
							generator: "svg",
							cached: false,
							fallbackUsed: strategy !== chain[0],
						})
						this.cache.set(key, r.data)
						return r
					}
				}
			} catch {}
		}
		const now = new Date().toISOString()
		const fallback = {
			previewType: "svg",
			content: this.svgToDataUrl(
				'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#4b5563"/></svg>',
			),
			metadata: { source: "fallback" },
			generatedAt: now,
		}
		this.cache.set(key, fallback)
		return { success: true, data: fallback }
	}

	async generateImagePreview(documentInput: any): Promise<{
		success: boolean
		data?: {
			previewType: string
			content: string
			metadata?: any
			generatedAt: string
		}
		error?: { code: string; message: string }
	}> {
		try {
			if (!this.imageExtractor)
				return {
					success: false,
					error: {
						code: "NO_IMAGE_EXTRACTOR",
						message: "Image extractor not available",
					},
				}
			const extraction: ExtractionResult = {
				text: documentInput?.content || "",
				title: documentInput?.title || null,
				source: documentInput?.source || "document",
				url: documentInput?.url || null,
				contentType: documentInput?.contentType || null,
				raw: documentInput?.raw || null,
				wordCount: (documentInput?.content || "").split(/\s+/).filter(Boolean)
					.length,
			}
			const imageUrl = await this.imageExtractor.extract(extraction)
			if (!imageUrl)
				return {
					success: false,
					error: { code: "NO_IMAGES_FOUND", message: "No images found" },
				}
			const meta = await (async () => {
				try {
					return await this.imageExtractor.getImageMetadata(imageUrl)
				} catch {
					const url = imageUrl.toLowerCase()
					const format = url.endsWith(".svg")
						? "svg"
						: url.endsWith(".webp")
							? "webp"
							: url.endsWith(".gif")
								? "gif"
								: url.endsWith(".jpg") || url.endsWith(".jpeg")
									? "jpeg"
									: "png"
					return { url: imageUrl, format, isVector: format === "svg" } as any
				}
			})()
			return {
				success: true,
				data: {
					previewType: "image",
					content: imageUrl,
					metadata: {
						source: "extracted-image",
						format: meta.format,
						dimensions: {
							width: meta.width as any,
							height: meta.height as any,
						},
					},
					generatedAt: new Date().toISOString(),
				},
			}
		} catch (e) {
			return {
				success: false,
				error: {
					code: "IMAGE_EXTRACTION_FAILED",
					message: e instanceof Error ? e.message : String(e),
				},
			}
		}
	}

	async generateSVGPreview(
		documentInput: any,
		opts?: any,
	): Promise<{
		success: boolean
		data?: {
			previewType: string
			content: string
			metadata?: any
			generatedAt: string
		}
		error?: { code: string; message: string }
	}> {
		try {
			if (!this.svgGenerator)
				return {
					success: false,
					error: {
						code: "NO_SVG_GENERATOR",
						message: "SVG generator not available",
					},
				}
			const extraction: ExtractionResult = {
				text: documentInput?.content || "",
				title: documentInput?.title || null,
				source: documentInput?.source || "document",
				url: documentInput?.url || null,
				contentType: documentInput?.contentType || null,
				raw: documentInput?.raw || null,
				wordCount: (documentInput?.content || "").split(/\s+/).filter(Boolean)
					.length,
			}
			const svg = await this.svgGenerator.generate(extraction, {
				width: opts?.width,
				height: opts?.height,
			})
			return {
				success: true,
				data: {
					previewType: "svg",
					content: svg,
					metadata: { source: "svg-generated" },
					generatedAt: new Date().toISOString(),
				},
			}
		} catch (e) {
			return {
				success: false,
				error: {
					code: "PREVIEW_GENERATION_FAILED",
					message: e instanceof Error ? e.message : String(e),
				},
			}
		}
	}

	async extractFavicon(documentInput: any): Promise<{
		success: boolean
		data?: {
			previewType: string
			content: string
			metadata?: any
			generatedAt: string
		}
		error?: { code: string; message: string }
	}> {
		try {
			if (!this.faviconExtractor)
				return {
					success: false,
					error: {
						code: "NO_FAVICON_EXTRACTOR",
						message: "Favicon extractor not available",
					},
				}
			const url = documentInput?.url
			if (!url)
				return {
					success: false,
					error: { code: "NO_URL_AVAILABLE", message: "No URL provided" },
				}
			const fav = await this.faviconExtractor.getBestFavicon(url)
			if (!fav)
				return {
					success: false,
					error: { code: "NO_FAVICON", message: "No favicon found" },
				}
			const meta = await this.faviconExtractor.getMetadata(fav)
			return {
				success: true,
				data: {
					previewType: "favicon",
					content: fav,
					metadata: {
						source: "favicon",
						format: meta.type,
						url: fav,
						size: meta.width || meta.height || undefined,
					},
					generatedAt: new Date().toISOString(),
				},
			}
		} catch (e) {
			return {
				success: false,
				error: {
					code: "EXTRACTION_FAILED",
					message: e instanceof Error ? e.message : String(e),
				},
			}
		}
	}

	updateConfiguration(newOptions: any): void {
		Object.assign(this.config, newOptions || {})
	}

	clearCache(): void {
		this.cache.clear()
	}

	getMetrics(): {
		totalPreviews: number
		averageGenerationTime: number
		cacheHitRate: number
		successRates: { favicon: number; image: number; svg: number }
	} {
		const entries = Array.from(this.metricsMap.values())
		const total = entries.length
		const avg =
			total === 0
				? 0
				: entries.reduce((a, b) => a + (b.totalTime || 0), 0) / total
		const genCounts: Record<string, number> = { favicon: 0, image: 0, svg: 0 }
		for (const m of entries) {
			if (genCounts[m.generator] !== undefined) genCounts[m.generator]++
		}
		return {
			totalPreviews: total,
			averageGenerationTime: avg,
			cacheHitRate: 0,
			successRates: {
				favicon: genCounts.favicon,
				image: genCounts.image,
				svg: genCounts.svg,
			},
		}
	}

	private normalizeInput(
		input: ExtractionResult | PreviewInput,
		externalOptions?: PreviewGenerationOptions,
	): {
		extraction: ExtractionResult
		mergedOptions?: PreviewGenerationOptions
	} {
		if (input && typeof (input as PreviewInput).extraction === "object") {
			const previewInput = input as PreviewInput
			const baseOptions = previewInput.options ?? {}
			const extraOptions = externalOptions ?? {}
			const combined = {
				...baseOptions,
				...extraOptions,
			} as PreviewGenerationOptions

			return {
				extraction: previewInput.extraction,
				mergedOptions: Object.keys(combined).length > 0 ? combined : undefined,
			}
		}

		return {
			extraction: input as ExtractionResult,
			mergedOptions: externalOptions,
		}
	}

	/**
	 * Get service configuration
	 */
	getConfig(): PreviewGeneratorConfig {
		return { ...this.config }
	}

	/**
	 * Get preview generators
	 */
	getGenerators(): {
		imageExtractor?: ImageExtractor
		svgGenerator?: SVGGenerator
		faviconExtractor?: FaviconExtractor
	} {
		return {
			imageExtractor: this.imageExtractor,
			svgGenerator: this.svgGenerator,
			faviconExtractor: this.faviconExtractor,
		}
	}

	/**
	 * Get metrics for document
	 */
	getMetrics(documentId: string): PreviewMetrics | null {
		return this.metricsMap.get(documentId) || null
	}

	// ========================================================================
	// Private Methods - Strategy Execution
	// ========================================================================

	/**
	 * Execute preview generation strategy
	 */
	private async executeStrategy(
		strategy: string,
		extraction: ExtractionResult,
		options?: PreviewGenerationOptions,
	): Promise<PreviewResult | null> {
		const tracker = this.performanceMonitor.startOperation(
			`strategy:${strategy}`,
		)
		const startTime = Date.now()

		try {
			this.logger.debug(`Executing strategy: ${strategy}`, {
				title: extraction.title,
			})

			let result: PreviewResult | null = null

			switch (strategy) {
				case "image":
					result = await this.executeImageExtraction(extraction, options)
					break
				case "svg":
					result = await this.executeSvgGeneration(extraction, options)
					break
				case "favicon":
					result = await this.executeFaviconExtraction(extraction, options)
					break
				default:
					this.logger.warn(`Unknown strategy: ${strategy}`)
					return null
			}

			if (result) {
				result.generationTime = Date.now() - startTime
				tracker.end(true)
			} else {
				tracker.end(false)
			}

			return result
		} catch (error) {
			tracker.end(false)
			throw error
		}
	}

	/**
	 * Execute image extraction
	 */
	private async executeImageExtraction(
		extraction: ExtractionResult,
		options?: PreviewGenerationOptions,
	): Promise<PreviewResult | null> {
		if (!this.imageExtractor) {
			this.logger.warn("Image extractor not available")
			return null
		}

		try {
			const imageUrl = await this.imageExtractor.extract(extraction, {
				timeout: options?.timeout || this.config.strategyTimeout,
			})

			if (!imageUrl) {
				return null
			}

			// Get image metadata (best-effort) — a 429 here shouldn't fail the entire preview chain
			const metadata = await (async () => {
				try {
					return await this.imageExtractor.getImageMetadata(imageUrl)
				} catch {
					const url = imageUrl.toLowerCase()
					const format = url.endsWith(".svg")
						? "svg"
						: url.endsWith(".webp")
							? "webp"
							: url.endsWith(".gif")
								? "gif"
								: url.endsWith(".jpg") || url.endsWith(".jpeg")
									? "jpeg"
									: "png"
					return { url: imageUrl, format, isVector: format === "svg" } as any
				}
			})()

			return {
				url: imageUrl,
				source: "image",
				type: "image",
				width: metadata.width,
				height: metadata.height,
				fileSize: metadata.size,
				metadata: {
					format: metadata.format,
					isVector: metadata.isVector,
				},
			}
		} catch (error) {
			this.logger.warn("Image extraction failed", {
				error: (error as Error).message,
			})
			return null
		}
	}

	/**
	 * Execute SVG generation
	 */
	private async executeSvgGeneration(
		extraction: ExtractionResult,
		options?: PreviewGenerationOptions,
	): Promise<PreviewResult | null> {
		if (!this.svgGenerator) {
			this.logger.warn("SVG generator not available")
			return null
		}

		try {
			const svg = await this.svgGenerator.generate(extraction, {
				width: options?.width || 640,
				height: options?.height || 400,
			})

			// Convert SVG to data URL
			const dataUrl = this.svgToDataUrl(svg)

			return {
				url: dataUrl,
				source: "generated",
				type: "svg",
				width: options?.width || 640,
				height: options?.height || 400,
				fileSize: svg.length,
				metadata: {
					format: "svg+xml",
					isVector: true,
				},
			}
		} catch (error) {
			this.logger.warn("SVG generation failed", {
				error: (error as Error).message,
			})
			return null
		}
	}

	/**
	 * Execute favicon extraction
	 */
	private async executeFaviconExtraction(
		extraction: ExtractionResult,
		options?: PreviewGenerationOptions,
	): Promise<PreviewResult | null> {
		if (!this.faviconExtractor) {
			this.logger.warn("Favicon extractor not available")
			return null
		}

		// Only works for web URLs
		if (!extraction.url) {
			this.logger.debug("No URL available for favicon extraction")
			return null
		}

		try {
			const faviconUrl = await this.faviconExtractor.extract(extraction.url, {
				timeout: options?.timeout || this.config.strategyTimeout,
			})

			if (!faviconUrl) {
				return null
			}

			// Get favicon metadata
			const metadata = await this.faviconExtractor.getMetadata(faviconUrl)

			return {
				url: faviconUrl,
				source: "favicon",
				type: "favicon",
				width: metadata.width,
				height: metadata.height,
				metadata: {
					format: metadata.type,
					rel: metadata.rel,
				},
			}
		} catch (error) {
			this.logger.warn("Favicon extraction failed", {
				error: (error as Error).message,
			})
			return null
		}
	}

	// ========================================================================
	// Private Methods - Utilities
	// ========================================================================

	/**
	 * Convert SVG to data URL
	 */
	private svgToDataUrl(svg: string): string {
		return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
	}

	/**
	 * Assert all required generators are registered
	 */
	private assertGeneratorsRegistered(): void {
		const hasAnyGenerator =
			!!this.imageExtractor || !!this.svgGenerator || !!this.faviconExtractor

		if (!hasAnyGenerator) {
			throw this.createError(
				"NO_GENERATORS_AVAILABLE",
				"No preview generators are available",
			)
		}
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Check if at least one generator is healthy
		let healthyCount = 0
		let totalCount = 0

		if (this.imageExtractor) {
			totalCount++
			if (await this.imageExtractor.healthCheck()) {
				healthyCount++
			}
		}

		if (this.svgGenerator) {
			totalCount++
			if (await this.svgGenerator.healthCheck()) {
				healthyCount++
			}
		}

		if (this.faviconExtractor) {
			totalCount++
			if (await this.faviconExtractor.healthCheck()) {
				healthyCount++
			}
		}

		// At least one generator must be healthy
		const isHealthy = healthyCount > 0

		this.logger.debug("Preview generator health check", {
			healthy: isHealthy,
			healthyGenerators: healthyCount,
			totalGenerators: totalCount,
		})

		return isHealthy
	}

	protected async onCleanup(): Promise<void> {
		this.logger.info("Cleaning up preview generator service")

		// Cleanup generators
		if (this.imageExtractor) {
			await this.imageExtractor.cleanup()
		}
		if (this.svgGenerator) {
			await this.svgGenerator.cleanup()
		}
		if (this.faviconExtractor) {
			await this.faviconExtractor.cleanup()
		}

		// Clear metrics
		this.metricsMap.clear()
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create preview generator service with configuration
 */
export function createPreviewGeneratorService(
	config?: Partial<PreviewGeneratorConfig>,
): PreviewGeneratorService {
	return new PreviewGeneratorService(config)
}
