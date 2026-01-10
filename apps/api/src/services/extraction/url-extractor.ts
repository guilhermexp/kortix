/**
 * URL Extractor (HTTP Fetch)
 *
 * Specialized extractor for web URLs using basic HTTP fetch.
 * Features:
 * - Simple HTTP fetch for text extraction
 * - Image extraction from HTML
 * - Meta tag extraction (og:image, twitter:image, etc.)
 * - Preview generation support
 *
 * Note: MarkItDown is disabled - using basic HTML scraping instead.
 */

import { safeFetch } from "../../security/url-validator"
import { BaseService } from "../base/base-service"
import type {
	ExtractionInput,
	ExtractionResult,
	URLExtractor as IURLExtractor,
	MetaTags,
	RateLimitInfo,
	URLExtractorOptions,
} from "../interfaces"

// ============================================================================
// URL Extractor Implementation
// ============================================================================

/**
 * Extractor for web URLs using HTTP fetch
 */
export class URLExtractor extends BaseService implements IURLExtractor {
	private rateLimitInfo: RateLimitInfo = {
		remaining: 999999, // HTTP fetch has no rate limits
		limit: 999999,
		resetTime: new Date(Date.now() + 3600000), // 1 hour
		used: 0,
	}

	constructor() {
		super("URLExtractor")
	}

	// ========================================================================
	// DocumentExtractor Interface
	// ========================================================================

	/**
	 * Extract content from the given input
	 */
	async extract(input: ExtractionInput): Promise<ExtractionResult> {
		this.assertInitialized()

		if (!input.url) {
			throw this.createError(
				"MISSING_URL",
				"URL is required for URL extraction",
			)
		}

		return await this.extractFromUrl(input.url, {
			includeMarkdown: true,
			includeLinks: true,
		})
	}

	/**
	 * Check if this extractor can handle the given input
	 */
	canHandle(input: ExtractionInput): boolean {
		// Can handle any URL that's not YouTube or a direct file
		// NOTE: GitHub URLs are now handled by MarkItDown (RepositoryExtractor disabled)
		if (!input.url) return false

		const url = input.url.toLowerCase()

		// Exclude specific content types
		if (url.includes("youtube.com") || url.includes("youtu.be")) return false
		if (url.match(/\.(pdf|docx?|xlsx?|pptx?)$/i)) return false

		return true
	}

	/**
	 * Get extractor priority (higher = preferred)
	 */
	getPriority(): number {
		return 5 // Standard priority for URL extraction
	}

	/**
	 * Validate input before extraction
	 */
	async validateInput(input: ExtractionInput): Promise<void> {
		if (!input.url) {
			throw this.createError("VALIDATION_ERROR", "URL is required")
		}

		this.validateUrl(input.url, "url")
	}

	// ========================================================================
	// URLExtractor Interface
	// ========================================================================

	/**
	 * Extract content from a web URL using MarkItDown
	 */
	async extractFromUrl(
		url: string,
		options?: URLExtractorOptions,
	): Promise<ExtractionResult> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation("extractFromUrl")

		try {
			this.logger.info("Extracting URL with HTTP fetch", { url })

			const result = await this.extractWithHttpFetch(url, options)

			this.logger.debug("HTTP fetch extraction completed", {
				url,
				chars: result.text.length,
			})

			tracker.end(true)
			return result
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, "extractFromUrl")
		}
	}

	/**
	 * Check service health
	 */
	async checkServiceHealth(): Promise<boolean> {
		// MarkItDown runs locally, always available
		return true
	}

	/**
	 * Get rate limit information
	 */
	async getRateLimitInfo(): Promise<RateLimitInfo> {
		return { ...this.rateLimitInfo }
	}

	// ========================================================================
	// Private Methods
	// ========================================================================

	/**
	 * Extract using basic HTTP fetch
	 * Extracts: text, images, meta tags, previews
	 */
	private async extractWithHttpFetch(
		url: string,
		options?: URLExtractorOptions,
	): Promise<ExtractionResult> {
		this.logger.debug("Extracting with HTTP fetch", { url })

		// Basic HTML scraping - fetch and parse HTML directly
		const response = await safeFetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
			signal: AbortSignal.timeout(options?.timeout ?? 30000),
		})

		if (!response.ok) {
			throw this.createError(
				"FETCH_FAILED",
				`Failed to fetch URL: ${response.status} ${response.statusText}`,
			)
		}

		const html = await response.text()
		const textContent = this.extractTextFromHtml(html)
		const cleanedContent = this.cleanContent(textContent)

		const title =
			this.extractMetaTag(html, "og:title") ||
			this.extractMetaTag(html, "title") ||
			this.extractTitleFromContent(cleanedContent)

		const metaTags: MetaTags = {
			title,
			description:
				this.extractMetaTag(html, "og:description") ||
				this.extractMetaTag(html, "description"),
			ogImage: this.extractMetaTag(html, "og:image"),
			twitterImage: this.extractMetaTag(html, "twitter:image"),
			favicon: this.extractFavicon(html, url),
		}

		// Extract images from HTML
		const images = this.extractImagesFromHtml(html, url)

		// Use ogImage or twitterImage as preview image
		const previewImage = metaTags.ogImage || metaTags.twitterImage

		this.logger.debug("Extracted images from HTML", {
			url,
			imageCount: images.length,
		})

		return {
			text: cleanedContent,
			title,
			source: "direct-scraping",
			url,
			contentType: "text/html",
			raw: { html, images },
			images, // Array of image URLs for frontend gallery
			wordCount: this.countWords(cleanedContent),
			extractorUsed: "URLExtractor (HTML scraping)",
			metadata: previewImage ? { image: previewImage } : undefined,
			extractionMetadata: { metaTags },
		}
	}

	/**
	 * Extract images from HTML
	 */
	private extractImagesFromHtml(html: string, baseUrl: string): string[] {
		const images: string[] = []

		// Match img tags with src attribute
		const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
		let match

		while ((match = imgRegex.exec(html)) !== null) {
			const src = match[1]

			// Skip data URLs, SVGs, and very small images (likely icons)
			if (src.startsWith("data:")) continue
			if (src.endsWith(".svg")) continue
			if (src.includes("1x1")) continue
			if (src.includes("icon")) continue

			try {
				// Make absolute URL
				let absoluteUrl: string
				if (src.startsWith("http://") || src.startsWith("https://")) {
					absoluteUrl = src
				} else {
					const base = new URL(baseUrl)
					absoluteUrl = new URL(src, base.origin).toString()
				}

				// Avoid duplicates
				if (!images.includes(absoluteUrl)) {
					images.push(absoluteUrl)
				}
			} catch (_error) {}
		}

		return images
	}

	/**
	 * Extract text from HTML (basic implementation)
	 */
	private extractTextFromHtml(html: string): string {
		// Remove scripts and styles
		let text = html.replace(
			/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
			"",
		)
		text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")

		// Remove HTML tags
		text = text.replace(/<[^>]+>/g, " ")

		// Decode HTML entities
		text = text
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")

		return text
	}

	/**
	 * Extract meta tag content
	 */
	private extractMetaTag(html: string, property: string): string | undefined {
		const patterns = [
			new RegExp(
				`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`,
				"i",
			),
			new RegExp(
				`<meta\\s+name=["']${property}["']\\s+content=["']([^"']+)["']`,
				"i",
			),
			new RegExp(
				`<meta\\s+content=["']([^"']+)["']\\s+property=["']${property}["']`,
				"i",
			),
			new RegExp(
				`<meta\\s+content=["']([^"']+)["']\\s+name=["']${property}["']`,
				"i",
			),
		]

		for (const pattern of patterns) {
			const match = html.match(pattern)
			if (match) return match[1]
		}

		// Special handling for title tag
		if (property === "title") {
			const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
			if (titleMatch) return titleMatch[1]
		}

		return undefined
	}

	/**
	 * Extract favicon URL
	 */
	private extractFavicon(html: string, baseUrl: string): string | undefined {
		const iconMatch = html.match(
			/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i,
		)

		if (iconMatch) {
			const iconUrl = iconMatch[1]
			// Make absolute URL
			if (iconUrl.startsWith("http")) {
				return iconUrl
			}
			try {
				const base = new URL(baseUrl)
				return new URL(iconUrl, base.origin).toString()
			} catch {
				return undefined
			}
		}

		return undefined
	}

	/**
	 * Extract title from content
	 */
	private extractTitleFromContent(content: string): string | null {
		// Get first line or first 100 characters
		const firstLine = content.split("\n")[0].trim()
		if (firstLine.length > 0 && firstLine.length <= 200) {
			return firstLine
		}

		const truncated = content.substring(0, 100).trim()
		return truncated.length > 0 ? `${truncated}...` : null
	}

	/**
	 * Clean extracted content
	 */
	private cleanContent(content: string): string {
		// Remove null bytes
		let cleaned = content.replace(/\0/g, "")

		// Normalize whitespace
		cleaned = cleaned.replace(/\s+/g, " ")

		// Remove excessive line breaks
		cleaned = cleaned.replace(/\n{3,}/g, "\n\n")

		// Trim
		cleaned = cleaned.trim()

		return cleaned
	}

	/**
	 * Count words in text
	 */
	private countWords(text: string): number {
		const normalized = text.trim()
		if (!normalized) return 0
		return normalized.split(/\s+/).length
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		return await this.checkServiceHealth()
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create URL extractor (uses MarkItDown internally)
 */
export function createURLExtractor(): URLExtractor {
	return new URLExtractor()
}
