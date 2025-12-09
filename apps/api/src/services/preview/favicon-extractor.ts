/**
 * Favicon Extractor Service
 *
 * Service for extracting favicons from URLs.
 * Features:
 * - Multiple favicon source detection (HTML, manifest, standard locations)
 * - Support for various icon sizes and formats
 * - High-resolution favicon preference (Apple touch icons, etc.)
 * - Fallback strategies with external services
 * - Favicon validation and metadata extraction
 * - Caching for improved performance
 */

import { BaseService } from "../base/base-service"
import type {
	FaviconCollection,
	FaviconExtractionOptions,
	FaviconMetadata,
	FaviconExtractor as IFaviconExtractor,
} from "../interfaces"

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT = 5000 // 5 seconds
const DEFAULT_MIN_SIZE = 16
const DEFAULT_ALLOWED_FORMATS = ["ico", "png", "svg", "jpg", "jpeg", "gif"]

// Common favicon paths to check
const STANDARD_FAVICON_PATHS = [
	"/favicon.ico",
	"/favicon.png",
	"/favicon.svg",
	"/apple-touch-icon.png",
	"/apple-touch-icon-precomposed.png",
]

// External favicon services (fallback)
const EXTERNAL_SERVICES = [
	"https://www.google.com/s2/favicons?domain={{domain}}&sz=128",
	"https://icons.duckduckgo.com/ip3/{{domain}}.ico",
]

// ============================================================================
// Favicon Extractor Service Implementation
// ============================================================================

/**
 * Service for extracting favicons from URLs
 */
export class FaviconExtractor extends BaseService implements IFaviconExtractor {
	private readonly defaultOptions: Required<FaviconExtractionOptions>
	private readonly cache: Map<string, FaviconCollection>

	constructor(options?: Partial<FaviconExtractionOptions>) {
		super("FaviconExtractor")

		this.defaultOptions = {
			preferHighRes: options?.preferHighRes ?? true,
			minSize: options?.minSize ?? DEFAULT_MIN_SIZE,
			allowedFormats: options?.allowedFormats ?? DEFAULT_ALLOWED_FORMATS,
			timeout: options?.timeout ?? DEFAULT_TIMEOUT,
			useExternalService: options?.useExternalService ?? true,
		}

		this.cache = new Map()
	}

	// ========================================================================
	// Public API
	// ========================================================================

	/**
	 * Extract favicon from URL
	 */
	async extract(
		url: string,
		options?: FaviconExtractionOptions,
	): Promise<string | null> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("extract")
		const config = { ...this.defaultOptions, ...options }

		try {
			this.logger.info("Extracting favicon", { url })

			// Validate URL
			if (!this.isValidUrl(url)) {
				throw this.createError("INVALID_URL", `Invalid URL: ${url}`)
			}

			// Try to get from cache
			const cached = this.cache.get(url)
			if (cached) {
				this.logger.debug("Favicon found in cache", { url })
				return cached.primary
			}

			// Get all available favicons
			const collection = await this.getAllFavicons(url)

			// Cache result
			this.cache.set(url, collection)

			tracker.end(true)

			return collection.primary
		} catch (error) {
			tracker.end(false)
			this.logger.error("Failed to extract favicon", {
				error: (error as Error).message,
				url,
			})
			return null
		}
	}

	async extractFavicon(url: string, options?: { generateDefault?: boolean }): Promise<{ success: boolean; data?: { favicons: Array<{ url: string; format?: string; size?: number }>; extractionTime?: number }; error?: { code: string; message: string } }> {
		try {
			const res = await (this as any).fetchFaviconFromURL(url)
			if (res.favicons.length === 0 && options?.generateDefault) {
				const def = await (this as any).generateDefaultFavicon()
				return { success: true, data: { favicons: def.favicons } }
			}
			return { success: true, data: res }
		} catch (e) {
			return { success: false, error: { code: "EXTRACTION_FAILED", message: e instanceof Error ? e.message : String(e) } }
		}
	}

	private async fetchFaviconFromURL(url: string): Promise<{ favicons: Array<{ url: string; format?: string; size?: number }>; extractionTime?: number }> {
		const start = Date.now()
		const collection = await this.getAllFavicons(url)
		const list: Array<{ url: string; format?: string; size?: number }> = []
		for (const icon of [...collection.highRes, ...collection.standard]) {
			list.push({ url: icon })
		}
		if (collection.primary) list.unshift({ url: collection.primary })
		return { favicons: list, extractionTime: Date.now() - start }
	}

	private async generateDefaultFavicon(): Promise<{ favicons: Array<{ url: string; format?: string; size?: number }> }> {
		const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" fill=\"#4b5563\"/></svg>"
		const dataUrl = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64")
		return { favicons: [{ url: dataUrl, format: "svg", size: 32 }] }
	}

	/**
	 * Get all available favicon URLs
	 */
	async getAllFavicons(url: string): Promise<FaviconCollection> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("getAllFavicons")

		try {
			this.logger.debug("Getting all favicons", { url })

			const baseUrl = this.getBaseUrl(url)
			const collection: FaviconCollection = {
				primary: null,
				highRes: [],
				standard: [],
				metadata: new Map(),
			}

			// Strategy 1: Parse HTML for icon links
			try {
				const html = await this.fetchHtml(url, this.defaultOptions.timeout)
				const htmlIcons = this.extractFromHtml(html, baseUrl)

				for (const icon of htmlIcons) {
					await this.addToCollection(collection, icon)
				}
			} catch (error) {
				this.logger.warn("Failed to parse HTML for favicons", {
					error: (error as Error).message,
					url,
				})
			}

			// Strategy 2: Check standard locations
			for (const path of STANDARD_FAVICON_PATHS) {
				const iconUrl = `${baseUrl}${path}`
				if (await this.exists(iconUrl)) {
					await this.addToCollection(collection, iconUrl)
				}
			}

			// Strategy 3: Use external service if enabled and no icons found
			if (
				this.defaultOptions.useExternalService &&
				!collection.primary &&
				collection.highRes.length === 0 &&
				collection.standard.length === 0
			) {
				const domain = this.getDomain(baseUrl)
				for (const serviceTemplate of EXTERNAL_SERVICES) {
					const serviceUrl = serviceTemplate.replace("{{domain}}", domain)
					if (await this.exists(serviceUrl)) {
						await this.addToCollection(collection, serviceUrl)
						break // Use first working service
					}
				}
			}

			// Select best favicon as primary
			collection.primary = await this.getBestFavicon(url)

			tracker.end(true)

			this.logger.debug("Favicons collected", {
				primary: !!collection.primary,
				highRes: collection.highRes.length,
				standard: collection.standard.length,
			})

			return collection
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "getAllFavicons")
		}
	}

	/**
	 * Get best quality favicon
	 */
	async getBestFavicon(url: string): Promise<string | null> {
		this.assertInitialized()

		try {
			const collection = this.cache.get(url) || (await this.getAllFavicons(url))

			// Prefer high-res if configured
			if (this.defaultOptions.preferHighRes && collection.highRes.length > 0) {
				// Return largest high-res icon
				const sorted = await this.sortBySize(collection.highRes)
				return sorted[0]
			}

			// Otherwise return largest standard icon
			if (collection.standard.length > 0) {
				const sorted = await this.sortBySize(collection.standard)
				return sorted[0]
			}

			return null
		} catch (error) {
			this.logger.error("Failed to get best favicon", {
				error: (error as Error).message,
				url,
			})
			return null
		}
	}

	/**
	 * Check if favicon exists
	 */
	async exists(url: string): Promise<boolean> {
		this.assertInitialized()

		try {
			const response = await fetch(url, {
				method: "HEAD",
				signal: AbortSignal.timeout(this.defaultOptions.timeout),
			})

			if (!response.ok) {
				return false
			}

			// Check content type
			const contentType = response.headers.get("content-type")
			if (!contentType) {
				return true // Assume it exists if no content type
			}

			// Check if it's an image or icon
			return (
				contentType.startsWith("image/") ||
				contentType.includes("icon") ||
				contentType.includes("octet-stream")
			)
		} catch {
			return false
		}
	}

	/**
	 * Get favicon metadata
	 */
	async getMetadata(url: string): Promise<FaviconMetadata> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("getMetadata")

		try {
			this.logger.debug("Getting favicon metadata", { url })

			const response = await fetch(url, {
				method: "HEAD",
				signal: AbortSignal.timeout(this.defaultOptions.timeout),
			})

			if (!response.ok) {
				throw this.createError(
					"FAVICON_NOT_ACCESSIBLE",
					`Favicon not accessible: ${response.status}`,
				)
			}

			const contentType = response.headers.get("content-type") || "image/x-icon"
			const contentLength = response.headers.get("content-length")

			// Try to determine size from URL or filename
			const sizeMatch = url.match(/(\d+)x(\d+)/)
			const width = sizeMatch ? Number.parseInt(sizeMatch[1], 10) : undefined
			const height = sizeMatch ? Number.parseInt(sizeMatch[2], 10) : undefined

			const metadata: FaviconMetadata = {
				url,
				type: contentType,
				width,
				height,
				size: sizeMatch ? `${width}x${height}` : undefined,
				rel: this.determineRel(url),
			}

			tracker.end(true)

			return metadata
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "getMetadata")
		}
	}

	// ========================================================================
	// Private Methods - Extraction
	// ========================================================================

	/**
	 * Extract favicon URLs from HTML
	 */
	private extractFromHtml(html: string, baseUrl: string): string[] {
		const icons: string[] = []

		// Match link tags with icon relationship
		const linkRegex =
			/<link[^>]+rel=["']([^"']*(?:icon|shortcut)[^"']*)["'][^>]*>/gi
		const matches = html.matchAll(linkRegex)

		for (const match of matches) {
			const linkTag = match[0]

			// Extract href
			const hrefMatch = linkTag.match(/href=["']([^"']+)["']/)
			if (hrefMatch && hrefMatch[1]) {
				const iconUrl = this.resolveUrl(hrefMatch[1], baseUrl)
				icons.push(iconUrl)
			}
		}

		return icons
	}

	/**
	 * Add icon to collection
	 */
	private async addToCollection(
		collection: FaviconCollection,
		iconUrl: string,
	): Promise<void> {
		// Get metadata
		try {
			const metadata = await this.getMetadata(iconUrl)
			collection.metadata.set(iconUrl, metadata)

			// Categorize icon
			if (this.isHighResIcon(iconUrl, metadata)) {
				collection.highRes.push(iconUrl)

				// Store Apple touch icon separately
				if (iconUrl.includes("apple-touch-icon")) {
					collection.appleTouchIcon = iconUrl
				}
			} else {
				collection.standard.push(iconUrl)
			}
		} catch (error) {
			this.logger.debug("Failed to get metadata for icon", {
				error: (error as Error).message,
				iconUrl,
			})
		}
	}

	/**
	 * Check if icon is high resolution
	 */
	private isHighResIcon(url: string, metadata: FaviconMetadata): boolean {
		// Check URL for size indicators
		if (url.includes("apple-touch-icon")) return true
		if (url.match(/(\d+)x(\d+)/)) {
			const match = url.match(/(\d+)x(\d+)/)
			if (match) {
				const size = Number.parseInt(match[1], 10)
				return size >= 128
			}
		}

		// Check metadata
		if (metadata.width && metadata.width >= 128) return true
		if (metadata.size) {
			const sizeMatch = metadata.size.match(/(\d+)/)
			if (sizeMatch) {
				const size = Number.parseInt(sizeMatch[1], 10)
				return size >= 128
			}
		}

		return false
	}

	/**
	 * Sort icons by size (largest first)
	 */
	private async sortBySize(icons: string[]): Promise<string[]> {
		const withSizes: Array<{ url: string; size: number }> = []

		for (const icon of icons) {
			// Try to extract size from URL
			const sizeMatch = icon.match(/(\d+)x(\d+)/)
			const size = sizeMatch ? Number.parseInt(sizeMatch[1], 10) : 0

			withSizes.push({ url: icon, size })
		}

		// Sort by size descending
		withSizes.sort((a, b) => b.size - a.size)

		return withSizes.map((item) => item.url)
	}

	// ========================================================================
	// Private Methods - Utilities
	// ========================================================================

	/**
	 * Fetch HTML from URL
	 */
	private async fetchHtml(url: string, timeout: number): Promise<string> {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(timeout),
			headers: {
				"User-Agent":
					"Mozilla/5.0 (compatible; KortixBot/1.0)",
			},
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
	 * Get base URL
	 */
	private getBaseUrl(url: string): string {
		try {
			const parsed = new URL(url)
			return `${parsed.protocol}//${parsed.host}`
		} catch {
			return url
		}
	}

	/**
	 * Get domain from URL
	 */
	private getDomain(url: string): string {
		try {
			const parsed = new URL(url)
			return parsed.hostname
		} catch {
			return url
		}
	}

	/**
	 * Resolve relative URL
	 */
	private resolveUrl(url: string, baseUrl: string): string {
		try {
			if (this.isValidUrl(url)) {
				return url
			}

			const base = new URL(baseUrl)
			const resolved = new URL(url, base)
			return resolved.href
		} catch {
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
	 * Determine rel attribute from URL
	 */
	private determineRel(url: string): string {
		if (url.includes("apple-touch-icon")) {
			return "apple-touch-icon"
		}

		if (url.includes("shortcut")) {
			return "shortcut icon"
		}

		return "icon"
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Test favicon extraction with a reliable URL
		try {
			const testUrl = "https://www.github.com"
			const favicon = await this.extract(testUrl, {
				timeout: 5000,
			})
			return true // Service is operational even if no favicon found
		} catch {
			return false
		}
	}

	protected async onCleanup(): Promise<void> {
		// Clear cache
		this.cache.clear()
		this.logger.info("Favicon cache cleared")
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create favicon extractor service with optional configuration
 */
export function createFaviconExtractor(
    options?: Partial<FaviconExtractionOptions>,
): FaviconExtractor {
    return new FaviconExtractor(options)
}

export interface FaviconOptions { generateDefault?: boolean }

export class FaviconExtractorFacade {
    constructor(private readonly inner: FaviconExtractor) {}
    async extractFavicon(url: string, options?: FaviconOptions): Promise<{ success: boolean; data?: { favicons: Array<{ url: string; format?: string; size?: number }>; extractionTime?: number }; error?: { code: string; message: string } }> {
        try {
            const res = await (this as any).fetchFaviconFromURL(url)
            if (res.favicons.length === 0 && options?.generateDefault) {
                const def = await (this as any).generateDefaultFavicon()
                return { success: true, data: { favicons: def.favicons } }
            }
            return { success: true, data: res }
        } catch (e) {
            return { success: false, error: { code: "EXTRACTION_FAILED", message: e instanceof Error ? e.message : String(e) } }
        }
    }
    private async fetchFaviconFromURL(url: string): Promise<{ favicons: Array<{ url: string; format?: string; size?: number }>; extractionTime?: number }> {
        const start = Date.now()
        const collection = await this.inner.getAllFavicons(url)
        const list: Array<{ url: string; format?: string; size?: number }> = []
        for (const icon of [...collection.highRes, ...collection.standard]) {
            list.push({ url: icon })
        }
        if (collection.primary) list.unshift({ url: collection.primary })
        return { favicons: list, extractionTime: Date.now() - start }
    }
    private async generateDefaultFavicon(): Promise<{ favicons: Array<{ url: string; format?: string; size?: number }> }> {
        const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\"><rect width=\"32\" height=\"32\" fill=\"#4b5563\"/></svg>"
        const dataUrl = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64")
        return { favicons: [{ url: dataUrl, format: "svg", size: 32 }] }
    }
}
