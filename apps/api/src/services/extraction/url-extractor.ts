/**
 * URL Extractor (Firecrawl + HTTP Fetch Fallback)
 *
 * Specialized extractor for web URLs.
 * Features:
 * - Primary: Firecrawl API for clean markdown extraction
 * - Fallback: Basic HTTP fetch with HTML scraping
 * - Image extraction from markdown and HTML
 * - Meta tag extraction (og:image, twitter:image, etc.)
 * - Preview generation support
 */

import { safeFetch } from "../../security/url-validator"
import type {
	ExtractionInput,
	ExtractionRateLimitInfo,
	ExtractionResult,
	URLExtractor as IURLExtractor,
	MetaTags,
	URLExtractorOptions,
} from "../interfaces"

// ============================================================================
// Firecrawl Configuration
// ============================================================================

const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
const FIRECRAWL_TIMEOUT_MS = 30000

// ============================================================================
// URL Extractor Implementation
// ============================================================================

/**
 * Extractor for web URLs using Firecrawl API with HTTP fetch fallback
 */
export class URLExtractor implements IURLExtractor {
	readonly serviceName = "URLExtractor"
	private initialized = false
	private rateLimitInfo: ExtractionRateLimitInfo = {
		remaining: 999999,
		limit: 999999,
		resetTime: new Date(Date.now() + 3600000),
		used: 0,
	}

	constructor() {}

	async initialize(): Promise<void> {
		if (this.initialized) return
		this.initialized = true
	}

	async healthCheck(): Promise<boolean> {
		return await this.checkServiceHealth()
	}

	async cleanup(): Promise<void> {
		// No resources to clean up
	}

	// ========================================================================
	// DocumentExtractor Interface
	// ========================================================================

	/**
	 * Extract content from the given input
	 */
	async extract(input: ExtractionInput): Promise<ExtractionResult> {
		if (!input.url) {
			throw new Error("URL is required for URL extraction")
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
			throw new Error("URL is required")
		}

		try {
			new URL(input.url)
		} catch {
			throw new Error(`Invalid URL: ${input.url}`)
		}
	}

	// ========================================================================
	// URLExtractor Interface
	// ========================================================================

	/**
	 * Extract content from a web URL using Firecrawl (primary) or HTTP fetch (fallback)
	 */
	async extractFromUrl(
		url: string,
		options?: URLExtractorOptions,
	): Promise<ExtractionResult> {
		try {
			const result = await this.extractWithFirecrawl(url, options)
			return result
		} catch (error) {
			throw error instanceof Error ? error : new Error(String(error))
		}
	}

	/**
	 * Check service health
	 */
	async checkServiceHealth(): Promise<boolean> {
		if (!FIRECRAWL_API_URL || !FIRECRAWL_API_KEY) {
			console.debug("Firecrawl not configured, using HTTP fetch fallback")
			return true
		}

		try {
			const response = await fetch(FIRECRAWL_API_URL, {
				signal: AbortSignal.timeout(5000),
			})
			return response.ok || response.status === 404 || response.status === 405
		} catch {
			console.warn("Firecrawl health check failed, fallback available")
			return true
		}
	}

	/**
	 * Get rate limit information
	 */
	async getRateLimitInfo(): Promise<ExtractionRateLimitInfo> {
		return { ...this.rateLimitInfo }
	}

	// ========================================================================
	// Firecrawl Extraction (Primary)
	// ========================================================================

	/**
	 * Extract using Firecrawl API, falling back to HTTP fetch on failure
	 */
	private async extractWithFirecrawl(
		url: string,
		options?: URLExtractorOptions,
	): Promise<ExtractionResult> {
		// If Firecrawl env vars are missing, go straight to fallback
		if (!FIRECRAWL_API_URL || !FIRECRAWL_API_KEY) {
			console.info("Firecrawl not configured, using HTTP fetch fallback", url)
			return this.extractWithHttpFetchFallback(url, options)
		}

		try {
			console.info("Extracting URL with Firecrawl", url)

			const response = await fetch(`${FIRECRAWL_API_URL}/v1/scrape`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
				},
				body: JSON.stringify({ url, formats: ["markdown", "html"] }),
				signal: AbortSignal.timeout(options?.timeout ?? FIRECRAWL_TIMEOUT_MS),
			})

			if (!response.ok) {
				console.warn(
					"Firecrawl HTTP error, falling back to HTTP fetch",
					url,
					response.status,
				)
				return this.extractWithHttpFetchFallback(url, options)
			}

			const data = (await response.json()) as {
				success?: boolean
				data?: {
					markdown?: string
					html?: string
					metadata?: {
						title?: string
						description?: string
						ogImage?: string
						twitterImage?: string
						favicon?: string
					}
				}
			}

			if (!data.success || !data.data?.markdown) {
				console.warn(
					"Firecrawl returned unsuccessful result, falling back",
					url,
					data.success,
				)
				return this.extractWithHttpFetchFallback(url, options)
			}

			const markdown = this.cleanMarkdownContent(data.data.markdown)
			const title =
				data.data.metadata?.title || this.extractTitleFromContent(markdown)
			const previewImage =
				data.data.metadata?.ogImage || data.data.metadata?.twitterImage

			// Extract images from HTML (comprehensive) + markdown (supplemental)
			const htmlImages = data.data.html
				? this.extractImagesFromHtml(data.data.html, url)
				: []
			const markdownImages = this.extractImagesFromMarkdown(markdown)
			const images = [...htmlImages]
			for (const img of markdownImages) {
				if (!images.includes(img)) {
					images.push(img)
				}
			}

			console.info(
				"Firecrawl extraction completed",
				url,
				`chars=${markdown.length}`,
				`images=${images.length}`,
			)

			const metaTags: MetaTags = {
				title: title || undefined,
				description: data.data.metadata?.description,
				ogImage: data.data.metadata?.ogImage,
				twitterImage: data.data.metadata?.twitterImage,
				favicon: data.data.metadata?.favicon,
			}

			return {
				text: markdown,
				title,
				source: "firecrawl",
				url,
				contentType: "text/markdown",
				raw: { markdown, html: data.data.html, images },
				images,
				wordCount: this.countWords(markdown),
				extractorUsed: "URLExtractor (Firecrawl)",
				metadata: previewImage ? { image: previewImage } : undefined,
				extractionMetadata: { metaTags },
			}
		} catch (error) {
			console.warn(
				"Firecrawl extraction failed, falling back to HTTP fetch",
				url,
				error instanceof Error ? error.message : String(error),
			)
			return this.extractWithHttpFetchFallback(url, options)
		}
	}

	/**
	 * Extract images from markdown content (parses ![alt](url) patterns)
	 */
	private extractImagesFromMarkdown(markdown: string): string[] {
		const images: string[] = []
		const imgRegex = /!\[[^\]]*\]\(([^)]+)\)/g
		let match

		while ((match = imgRegex.exec(markdown)) !== null) {
			const src = match[1]

			if (src.startsWith("data:")) continue
			if (src.endsWith(".svg")) continue
			if (this.isLikelyNonContentImage(src)) continue

			if (!images.includes(src)) {
				images.push(src)
			}
		}

		return images
	}

	/**
	 * Clean markdown content (remove null bytes, normalize breaks)
	 */
	private cleanMarkdownContent(markdown: string): string {
		let cleaned = markdown.replace(/\0/g, "")
		cleaned = cleaned.replace(/\n{4,}/g, "\n\n\n")
		cleaned = cleaned.trim()
		return cleaned
	}

	// ========================================================================
	// HTTP Fetch Fallback
	// ========================================================================

	/**
	 * Extract using basic HTTP fetch (fallback when Firecrawl is unavailable)
	 */
	private async extractWithHttpFetchFallback(
		url: string,
		options?: URLExtractorOptions,
	): Promise<ExtractionResult> {
		console.debug("Extracting with HTTP fetch fallback", url)

		const response = await safeFetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			},
			signal: AbortSignal.timeout(options?.timeout ?? 30000),
		})

		if (!response.ok) {
			throw new Error(
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
			title: title ?? undefined,
			description:
				this.extractMetaTag(html, "og:description") ||
				this.extractMetaTag(html, "description"),
			ogImage: this.extractMetaTag(html, "og:image"),
			twitterImage: this.extractMetaTag(html, "twitter:image"),
			favicon: this.extractFavicon(html, url),
		}

		const images = this.extractImagesFromHtml(html, url)
		const previewImage = metaTags.ogImage || metaTags.twitterImage

		console.debug(
			"HTTP fetch fallback extraction completed",
			url,
			`images=${images.length}`,
		)

		return {
			text: cleanedContent,
			title,
			source: "direct-scraping",
			url,
			contentType: "text/html",
			raw: { html, images },
			images,
			wordCount: this.countWords(cleanedContent),
			extractorUsed: "URLExtractor (HTML scraping)",
			metadata: previewImage ? { image: previewImage } : undefined,
			extractionMetadata: { metaTags },
		}
	}

	// ========================================================================
	// HTML Parsing (used by fallback)
	// ========================================================================

	/**
	 * Extract images from HTML
	 */
	/**
	 * Check if an image URL or its HTML attributes suggest it's an icon, logo,
	 * badge, tracking pixel, or other non-content image that should be filtered out.
	 */
	private isLikelyNonContentImage(src: string, imgTag?: string): boolean {
		const lower = src.toLowerCase()

		// URL path patterns common in icons/logos/tracking
		const nonContentPatterns = [
			"favicon",
			"apple-touch-icon",
			"/icon",
			"/icons/",
			"/logo",
			"/logos/",
			"/badge",
			"/badges/",
			"/sprite",
			"/sprites/",
			"/pixel",
			"/tracking",
			"/analytics",
			"/beacon",
			"/ads/",
			"/ad-",
			"/button",
			"/buttons/",
			"/widget",
			"/widgets/",
			"/avatar",
			"/avatars/",
			"/emoji",
			"/emojis/",
			"/social/",
			"/share/",
			"/rating",
			"/star",
			"1x1",
			"spacer",
			"transparent",
			"blank.gif",
			"blank.png",
			"pixel.gif",
			"pixel.png",
			".ico",
		]

		if (nonContentPatterns.some((p) => lower.includes(p))) return true

		// Filename-level patterns (check just the filename)
		try {
			const pathname = new URL(src, "https://placeholder.com").pathname
			const filename = pathname.split("/").pop()?.toLowerCase() ?? ""
			if (
				filename.startsWith("logo") ||
				filename.startsWith("icon") ||
				filename.startsWith("favicon") ||
				filename.startsWith("badge") ||
				filename.startsWith("sprite") ||
				filename === "spacer.gif" ||
				filename === "pixel.gif"
			) {
				return true
			}
		} catch {}

		// Dimensions encoded in URL (e.g., "32x32", "16x16", "48x48")
		const sizeInUrl = lower.match(/[\W_](\d+)x(\d+)[\W_.]/)
		if (sizeInUrl) {
			const w = Number.parseInt(sizeInUrl[1], 10)
			const h = Number.parseInt(sizeInUrl[2], 10)
			if (w <= 96 && h <= 96) return true
		}

		// Check HTML attributes if full <img> tag is provided
		if (imgTag) {
			const tagLower = imgTag.toLowerCase()

			// Explicit width/height attributes indicating small images
			const widthMatch = tagLower.match(/\bwidth=["']?(\d+)/)
			const heightMatch = tagLower.match(/\bheight=["']?(\d+)/)
			if (widthMatch && heightMatch) {
				const w = Number.parseInt(widthMatch[1], 10)
				const h = Number.parseInt(heightMatch[1], 10)
				if (w <= 96 && h <= 96) return true
			}

			// CSS class/role hints
			const classMatch = tagLower.match(/class=["']([^"']+)["']/)
			if (classMatch) {
				const cls = classMatch[1]
				const iconClasses = [
					"icon",
					"logo",
					"avatar",
					"badge",
					"emoji",
					"favicon",
					"sprite",
					"social",
					"rating",
					"star",
				]
				if (iconClasses.some((c) => cls.includes(c))) return true
			}

			// Role attribute
			if (
				tagLower.includes('role="presentation"') ||
				tagLower.includes('role="none"') ||
				tagLower.includes("aria-hidden")
			) {
				return true
			}
		}

		return false
	}

	private extractImagesFromHtml(html: string, baseUrl: string): string[] {
		const images: string[] = []

		// Capture full <img> tag to inspect attributes
		const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
		let match

		while ((match = imgRegex.exec(html)) !== null) {
			const src = match[1]
			const fullTag = match[0]

			if (src.startsWith("data:")) continue
			if (src.endsWith(".svg")) continue
			if (this.isLikelyNonContentImage(src, fullTag)) continue

			try {
				let absoluteUrl: string
				if (src.startsWith("http://") || src.startsWith("https://")) {
					absoluteUrl = src
				} else {
					const base = new URL(baseUrl)
					absoluteUrl = new URL(src, base.origin).toString()
				}

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
		let text = html.replace(
			/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
			"",
		)
		text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")

		text = text.replace(/<[^>]+>/g, " ")

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
		let cleaned = content.replace(/\0/g, "")
		cleaned = cleaned.replace(/\s+/g, " ")
		cleaned = cleaned.replace(/\n{3,}/g, "\n\n")
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
}
