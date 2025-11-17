/**
 * Image Extractor Service
 *
 * Service for extracting preview images from various sources.
 * Features:
 * - OpenGraph and Twitter card image extraction
 * - HTML meta tag parsing
 * - Image URL validation and verification
 * - Image metadata extraction
 * - Fallback strategies for image discovery
 * - URL normalization and resolution
 */

import { BaseService } from "../base/base-service"
import type {
	ExtractionResult,
	ImageExtractor as IImageExtractor,
	ImageExtractionOptions,
	ImageExtractionResult,
	ImageMetadata,
} from "../interfaces"

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT = 10000 // 10 seconds
const DEFAULT_MIN_WIDTH = 200
const DEFAULT_MIN_HEIGHT = 200
const DEFAULT_MAX_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp", "gif", "svg"]

// Common image patterns to search for
const IMAGE_META_TAGS = [
	"og:image",
	"og:image:url",
	"og:image:secure_url",
	"twitter:image",
	"twitter:image:src",
	"image",
	"thumbnail",
	"image_src",
]

// ============================================================================
// Image Extractor Service Implementation
// ============================================================================

/**
 * Service for extracting preview images from documents and URLs
 */
export class ImageExtractor extends BaseService implements IImageExtractor {
	private readonly defaultOptions: Required<ImageExtractionOptions>

	constructor(options?: Partial<ImageExtractionOptions>) {
		super("ImageExtractor")

		this.defaultOptions = {
			preferOgImage: options?.preferOgImage ?? true,
			preferTwitterImage: options?.preferTwitterImage ?? false,
			minDimensions: options?.minDimensions ?? {
				width: DEFAULT_MIN_WIDTH,
				height: DEFAULT_MIN_HEIGHT,
			},
			maxSize: options?.maxSize ?? DEFAULT_MAX_SIZE,
			allowedFormats: options?.allowedFormats ?? DEFAULT_ALLOWED_FORMATS,
			timeout: options?.timeout ?? DEFAULT_TIMEOUT,
		}
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Extract preview image from extraction result
	 */
	async extract(
		extraction: ExtractionResult,
		options?: ImageExtractionOptions,
	): Promise<string | null> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("extract")
		const config = { ...this.defaultOptions, ...options }

		try {
			this.logger.info("Extracting preview image", {
				title: extraction.title,
				url: extraction.url,
				source: extraction.source,
			})

			// Strategy 1: Check if extraction already has an image URL in metadata
			if (extraction.metadata?.image) {
				const imageUrl = extraction.metadata.image as string
				if (await this.validateImageUrl(imageUrl)) {
					tracker.end(true)
					this.logger.info("Image found in extraction metadata", { imageUrl })
					return imageUrl
				}
			}

			// Strategy 2: Extract from URL if available
			if (extraction.url) {
				const result = await this.extractFromUrl(extraction.url, config)
				if (result.imageUrl) {
					tracker.end(true)
					this.logger.info("Image extracted from URL", {
						url: extraction.url,
						imageUrl: result.imageUrl,
					})
					return result.imageUrl
				}
			}

			// Strategy 3: Look for images in raw HTML if available
			if (extraction.raw?.html) {
				const html = extraction.raw.html as string
				const images = await this.extractFromHtml(html, extraction.url)
				if (images.length > 0) {
					// Return first valid image
					for (const imageUrl of images) {
						if (await this.validateImageUrl(imageUrl)) {
							tracker.end(true)
							this.logger.info("Image extracted from HTML", { imageUrl })
							return imageUrl
						}
					}
				}
			}

			tracker.end(false)
			this.logger.warn("No preview image found", {
				title: extraction.title,
				url: extraction.url,
			})

			return null
		} catch (error) {
			tracker.end(false)
			this.logger.error("Failed to extract preview image", {
				error: (error as Error).message,
				extraction: extraction.title,
			})
			return null
		}
	}

	/**
	 * Extract image from URL
	 */
	async extractFromUrl(
		url: string,
		options?: ImageExtractionOptions,
	): Promise<ImageExtractionResult> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("extractFromUrl")
		const config = { ...this.defaultOptions, ...options }

		try {
			this.logger.debug("Extracting image from URL", { url })

			// Validate URL
			if (!this.isValidUrl(url)) {
				throw this.createError("INVALID_URL", `Invalid URL: ${url}`)
			}

			// Try OpenGraph first if preferred
			if (config.preferOgImage) {
				const ogImage = await this.extractOgImage(url)
				if (ogImage) {
					tracker.end(true)
					return {
						imageUrl: ogImage,
						source: "opengraph",
						metadata: await this.getImageMetadata(ogImage),
					}
				}
			}

			// Try Twitter card if preferred or OG failed
			if (config.preferTwitterImage || !config.preferOgImage) {
				const twitterImage = await this.extractTwitterImage(url)
				if (twitterImage) {
					tracker.end(true)
					return {
						imageUrl: twitterImage,
						source: "twitter",
						metadata: await this.getImageMetadata(twitterImage),
					}
				}
			}

			// Fetch HTML and parse for images
			const html = await this.fetchHtml(url, config.timeout)
			const images = await this.extractFromHtml(html, url)

			// Find best image
			for (const imageUrl of images) {
				if (await this.validateImageUrl(imageUrl)) {
					tracker.end(true)
					return {
						imageUrl,
						source: "html",
						metadata: await this.getImageMetadata(imageUrl),
					}
				}
			}

			tracker.end(false)
			return {
				imageUrl: null,
				source: "none",
				metadata: null,
			}
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "extractFromUrl")
		}
	}

	/**
	 * Extract images from HTML
	 */
	async extractFromHtml(html: string, baseUrl?: string): Promise<string[]> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("extractFromHtml")

		try {
			this.logger.debug("Extracting images from HTML", {
				htmlLength: html.length,
				hasBaseUrl: !!baseUrl,
			})

			const images: string[] = []

			// Extract meta tags
			const metaImages = this.extractMetaImages(html)
			images.push(...metaImages)

			// Extract img tags
			const imgTags = this.extractImgTags(html)
			images.push(...imgTags)

			// Resolve relative URLs if base URL provided
			const resolvedImages = baseUrl
				? images.map((img) => this.resolveUrl(img, baseUrl))
				: images

			// Remove duplicates
			const uniqueImages = [...new Set(resolvedImages)]

			tracker.end(true)

			this.logger.debug("Images extracted from HTML", {
				count: uniqueImages.length,
			})

			return uniqueImages
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "extractFromHtml")
		}
	}

	/**
	 * Extract OpenGraph image
	 */
	async extractOgImage(url: string): Promise<string | null> {
		this.assertInitialized()

		try {
			const html = await this.fetchHtml(url, this.defaultOptions.timeout)
			const match = html.match(
				/<meta\s+(?:property|name)=["']og:image(?::url)?["']\s+content=["']([^"']+)["']/i,
			)

			if (match && match[1]) {
				const imageUrl = this.resolveUrl(match[1], url)
				this.logger.debug("OpenGraph image found", { imageUrl })
				return imageUrl
			}

			return null
		} catch (error) {
			this.logger.warn("Failed to extract OpenGraph image", {
				error: (error as Error).message,
				url,
			})
			return null
		}
	}

	/**
	 * Extract Twitter card image
	 */
	async extractTwitterImage(url: string): Promise<string | null> {
		this.assertInitialized()

		try {
			const html = await this.fetchHtml(url, this.defaultOptions.timeout)
			const match = html.match(
				/<meta\s+(?:property|name)=["']twitter:image(?::src)?["']\s+content=["']([^"']+)["']/i,
			)

			if (match && match[1]) {
				const imageUrl = this.resolveUrl(match[1], url)
				this.logger.debug("Twitter card image found", { imageUrl })
				return imageUrl
			}

			return null
		} catch (error) {
			this.logger.warn("Failed to extract Twitter image", {
				error: (error as Error).message,
				url,
			})
			return null
		}
	}

	/**
	 * Validate image URL
	 */
	async validateImageUrl(url: string): Promise<boolean> {
		this.assertInitialized()

		try {
			// Basic URL validation
			if (!this.isValidUrl(url)) {
				return false
			}

			// Check file extension
			const ext = this.getFileExtension(url)
			if (ext && !this.defaultOptions.allowedFormats.includes(ext)) {
				this.logger.debug("Image format not allowed", { url, ext })
				return false
			}

			// Make HEAD request to check if image exists and get metadata
			const response = await fetch(url, {
				method: "HEAD",
				signal: AbortSignal.timeout(this.defaultOptions.timeout),
			})

			if (!response.ok) {
				this.logger.debug("Image URL not accessible", {
					url,
					status: response.status,
				})
				return false
			}

			// Check content type
			const contentType = response.headers.get("content-type")
			if (!contentType?.startsWith("image/")) {
				this.logger.debug("URL is not an image", { url, contentType })
				return false
			}

			// Check size
			const contentLength = response.headers.get("content-length")
			if (contentLength) {
				const size = Number.parseInt(contentLength, 10)
				if (size > this.defaultOptions.maxSize) {
					this.logger.debug("Image too large", { url, size })
					return false
				}
			}

			return true
		} catch (error) {
			this.logger.debug("Image validation failed", {
				url,
				error: (error as Error).message,
			})
			return false
		}
	}

	/**
	 * Get image metadata
	 */
	async getImageMetadata(url: string): Promise<ImageMetadata> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("getImageMetadata")

		try {
			this.logger.debug("Getting image metadata", { url })

			// Add GitHub token for GitHub URLs to increase rate limit
			const headers: Record<string, string> = {}
			const githubToken = process.env.GITHUB_TOKEN
			if (
				githubToken &&
				(url.includes("github.com") ||
					url.includes("githubassets.com") ||
					url.includes("githubusercontent.com"))
			) {
				headers["Authorization"] = `Bearer ${githubToken}`
			}

			// Make HEAD request
			const response = await fetch(url, {
				method: "HEAD",
				signal: AbortSignal.timeout(this.defaultOptions.timeout),
				headers,
			})

			if (!response.ok) {
				throw this.createError(
					"IMAGE_NOT_ACCESSIBLE",
					`Image not accessible: ${response.status}`,
				)
			}

			// Extract metadata from headers
			const contentType =
				response.headers.get("content-type") || "image/unknown"
			const contentLength = response.headers.get("content-length")
			const lastModified = response.headers.get("last-modified")

			const metadata: ImageMetadata = {
				url,
				format: this.getFormatFromContentType(contentType),
				size: contentLength ? Number.parseInt(contentLength, 10) : undefined,
				lastModified: lastModified ? new Date(lastModified) : undefined,
				isVector: contentType === "image/svg+xml",
			}

			tracker.end(true)

			this.logger.debug("Image metadata retrieved", metadata)

			return metadata
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "getImageMetadata")
		}
	}

	// ========================================================================
	// Private Methods - HTML Parsing
	// ========================================================================

	/**
	 * Extract images from meta tags
	 */
	private extractMetaImages(html: string): string[] {
		const images: string[] = []

		for (const tag of IMAGE_META_TAGS) {
			// Match both property and name attributes
			const propertyRegex = new RegExp(
				`<meta\\s+property=["']${tag}["']\\s+content=["']([^"']+)["']`,
				"gi",
			)
			const nameRegex = new RegExp(
				`<meta\\s+name=["']${tag}["']\\s+content=["']([^"']+)["']`,
				"gi",
			)

			let match: RegExpExecArray | null

			// Check property attribute
			while ((match = propertyRegex.exec(html)) !== null) {
				if (match[1]) {
					images.push(match[1])
				}
			}

			// Check name attribute
			while ((match = nameRegex.exec(html)) !== null) {
				if (match[1]) {
					images.push(match[1])
				}
			}
		}

		return images
	}

	/**
	 * Extract images from img tags
	 */
	private extractImgTags(html: string): string[] {
		const images: string[] = []

		// Match img tags with src attribute
		const regex = /<img[^>]+src=["']([^"']+)["']/gi
		let match: RegExpExecArray | null

		while ((match = regex.exec(html)) !== null) {
			if (match[1]) {
				images.push(match[1])
			}
		}

		return images
	}

	// ========================================================================
	// Private Methods - URL Utilities
	// ========================================================================

	/**
	 * Fetch HTML from URL
	 */
	private async fetchHtml(url: string, timeout: number): Promise<string> {
		const headers: Record<string, string> = {
			"User-Agent": "Mozilla/5.0 (compatible; MemoryBot/1.0)",
		}

		// Add GitHub token for GitHub URLs to increase rate limit
		const githubToken = process.env.GITHUB_TOKEN
		if (
			githubToken &&
			(url.includes("github.com") ||
				url.includes("githubassets.com") ||
				url.includes("githubusercontent.com"))
		) {
			headers["Authorization"] = `Bearer ${githubToken}`
		}

		const response = await fetch(url, {
			signal: AbortSignal.timeout(timeout),
			headers,
		})

		if (!response.ok) {
			throw this.createError(
				"FETCH_FAILED",
				`Failed to fetch URL: ${response.status}`,
			)
		}

		return await response.text()
	}

	/**
	 * Resolve relative URL against base URL
	 */
	private resolveUrl(url: string, baseUrl: string): string {
		try {
			// If URL is already absolute, return it
			if (this.isValidUrl(url)) {
				return url
			}

			// Resolve relative URL
			const base = new URL(baseUrl)
			const resolved = new URL(url, base)
			return resolved.href
		} catch {
			// If resolution fails, return original URL
			return url
		}
	}

	/**
	 * Check if URL is valid
	 */
	private isValidUrl(url: string): boolean {
		try {
			const parsed = new URL(url)
			return parsed.protocol === "http:" || parsed.protocol === "https:"
		} catch {
			return false
		}
	}

	/**
	 * Get file extension from URL
	 */
	private getFileExtension(url: string): string | null {
		try {
			const parsed = new URL(url)
			const pathname = parsed.pathname
			const match = pathname.match(/\.([a-z0-9]+)$/i)
			return match ? match[1].toLowerCase() : null
		} catch {
			return null
		}
	}

	/**
	 * Get format from content type
	 */
	private getFormatFromContentType(contentType: string): string {
		const match = contentType.match(/image\/([a-z0-9+.-]+)/i)
		return match ? match[1] : "unknown"
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Test image extraction with a reliable URL
		try {
			const testUrl = "https://www.example.com"
			const result = await this.extractFromUrl(testUrl, {
				timeout: 5000,
			})
			return true // Service is operational even if no image found
		} catch {
			return false
		}
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create image extractor service with optional configuration
 */
export function createImageExtractor(
	options?: Partial<ImageExtractionOptions>,
): ImageExtractor {
	return new ImageExtractor(options)
}
