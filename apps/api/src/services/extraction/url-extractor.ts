/**
 * URL Extractor (MarkItDown + Puppeteer)
 *
 * Specialized extractor for web URLs with intelligent fallback.
 * Features:
 * - MarkItDown integration for fast extraction (static sites)
 * - Puppeteer fallback for SPAs and JavaScript-heavy sites
 * - Full browser rendering with Chrome headless
 * - URL validation and sanitization
 * - Content cleaning and normalization
 * - Meta tag extraction (og:image, twitter:image, etc.)
 */

import { BaseService } from '../base/base-service'
import { safeFetch } from '../../security/url-validator'
import { convertUrlWithMarkItDown } from '../markitdown'
import puppeteer from 'puppeteer'
import type {
	URLExtractor as IURLExtractor,
	ExtractionInput,
	ExtractionResult,
	URLExtractorOptions,
	RateLimitInfo,
	MetaTags,
} from '../interfaces'

// ============================================================================
// URL Extractor Implementation
// ============================================================================

/**
 * Extractor for web URLs using MarkItDown
 */
export class URLExtractor extends BaseService implements IURLExtractor {
	private rateLimitInfo: RateLimitInfo = {
		remaining: 999999, // Puppeteer has no rate limits
		limit: 999999,
		resetTime: new Date(Date.now() + 3600000), // 1 hour
		used: 0,
	}

	constructor() {
		super('URLExtractor')
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
			throw this.createError('MISSING_URL', 'URL is required for URL extraction')
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
		if (url.includes('youtube.com') || url.includes('youtu.be')) return false
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
			throw this.createError('VALIDATION_ERROR', 'URL is required')
		}

		this.validateUrl(input.url, 'url')
	}

	// ========================================================================
	// URLExtractor Interface
	// ========================================================================

	/**
	 * Extract content from a web URL using MarkItDown with Puppeteer fallback for SPAs
	 */
	async extractFromUrl(url: string, options?: URLExtractorOptions): Promise<ExtractionResult> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation('extractFromUrl')

		try {
			this.logger.info('Extracting URL with MarkItDown', { url })

			// Try MarkItDown first (fast and free)
			const markitdownResult = await this.extractWithDirectScraping(url, options)

			// Check if MarkItDown returned sufficient content
			if (markitdownResult.text.length >= 100) {
				this.logger.debug('MarkItDown extraction successful', {
					url,
					chars: markitdownResult.text.length,
				})
				tracker.end(true)
				return markitdownResult
			}

			// MarkItDown returned insufficient content (likely a SPA)
			// Try Puppeteer for full JavaScript rendering
			this.logger.info('MarkItDown returned insufficient content, trying Puppeteer', {
				url,
				markitdownChars: markitdownResult.text.length,
			})

			try {
				const puppeteerResult = await this.extractWithPuppeteer(url, options)
				this.logger.info('Puppeteer extraction successful', {
					url,
					chars: puppeteerResult.text.length,
				})
				tracker.end(true)
				return puppeteerResult
			} catch (puppeteerError) {
				this.logger.warn('Puppeteer extraction failed, using MarkItDown result', {
					error: (puppeteerError as Error).message,
				})
				// Fall through to return MarkItDown result
			}

			// Return MarkItDown result even if insufficient (better than nothing)
			tracker.end(true)
			return markitdownResult
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, 'extractFromUrl')
		}
	}

	/**
	 * Check service health
	 */
	async checkServiceHealth(): Promise<boolean> {
		// Puppeteer runs locally, always available
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
	 * Extract using Puppeteer (full browser rendering)
	 */
	private async extractWithPuppeteer(
		url: string,
		options?: URLExtractorOptions
	): Promise<ExtractionResult> {
		this.logger.info('Starting Puppeteer extraction', { url })

		let browser = null
		try {
			// Launch browser
			browser = await puppeteer.launch({
				headless: true,
				args: [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-dev-shm-usage',
					'--disable-gpu',
				],
			})

			const page = await browser.newPage()

			// Set viewport and user agent
			await page.setViewport({ width: 1920, height: 1080 })
			await page.setUserAgent(
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
			)

			// Navigate to page with timeout
			this.logger.debug('Navigating to URL', { url })
			await page.goto(url, {
				waitUntil: 'networkidle0', // Wait until network is idle
				timeout: options?.timeout ?? 30000,
			})

			// Wait additional time for any lazy-loaded content
			await new Promise((resolve) => setTimeout(resolve, 2000))

			// Extract content
			this.logger.debug('Extracting content from rendered page')
			const content = await page.evaluate(() => {
				// Remove script and style tags
				const scripts = document.querySelectorAll('script, style')
				scripts.forEach((el) => el.remove())

				// Get text content
				return document.body.innerText
			})

			// Extract metadata and images
			const metadata = await page.evaluate(() => {
				const getMetaContent = (name: string) => {
					const meta =
						document.querySelector(`meta[property="${name}"]`) ||
						document.querySelector(`meta[name="${name}"]`)
					return meta?.getAttribute('content') || undefined
				}

				// Extract all images from the page
				const images: string[] = []
				const imgElements = document.querySelectorAll('img[src]')
				imgElements.forEach((img) => {
					const src = img.getAttribute('src')
					if (src && src.startsWith('http')) {
						// Only include absolute URLs
						if (!images.includes(src)) {
							images.push(src)
						}
					}
				})

				return {
					title: document.title,
					description: getMetaContent('description') || getMetaContent('og:description'),
					ogImage: getMetaContent('og:image'),
					twitterImage: getMetaContent('twitter:image'),
					language: document.documentElement.lang || undefined,
					images, // Array of image URLs
				}
			})

			await browser.close()
			browser = null

			const cleanedContent = this.cleanContent(content)

			this.logger.info('Puppeteer extraction complete', {
				url,
				contentLength: cleanedContent.length,
				title: metadata.title,
			})

			const metaTags: MetaTags = {
				title: metadata.title,
				description: metadata.description,
				ogImage: metadata.ogImage,
				twitterImage: metadata.twitterImage,
				language: metadata.language,
			}

			// Use ogImage or twitterImage as preview image
			const previewImage = metadata.ogImage || metadata.twitterImage

			this.logger.info('Extracted images from page', {
				url,
				imageCount: metadata.images.length,
			})

			return {
				text: cleanedContent,
				title: metadata.title || this.extractTitleFromContent(cleanedContent),
				source: 'puppeteer',
				url,
				contentType: 'text/html',
				raw: { content: cleanedContent, images: metadata.images },
				images: metadata.images, // Array of image URLs for frontend gallery
				wordCount: this.countWords(cleanedContent),
				extractorUsed: 'URLExtractor (Puppeteer)',
				metadata: previewImage ? { image: previewImage } : undefined,
				extractionMetadata: { metaTags },
			}
		} catch (error) {
			if (browser) {
				await browser.close().catch(() => {})
			}
			this.logger.error('Puppeteer extraction failed', {
				error: (error as Error).message,
				url,
			})
			throw this.createError('PUPPETEER_FAILED', `Puppeteer extraction failed: ${(error as Error).message}`)
		}
	}

	/**
	 * Extract using direct scraping (fallback)
	 */
	private async extractWithDirectScraping(
		url: string,
		options?: URLExtractorOptions
	): Promise<ExtractionResult> {
		this.logger.debug('Extracting with MarkItDown', { url })

		try {
			// Use MarkItDown for URL conversion (supports YouTube, PDFs, etc.)
			const markitdownResult = await convertUrlWithMarkItDown(url)

			if (markitdownResult && markitdownResult.text && markitdownResult.text.length > 100) {
				this.logger.debug('MarkItDown extraction successful', {
					url,
					chars: markitdownResult.text.length,
				})

				// Even when MarkItDown succeeds, we need to extract images and metadata
				// for preview generation. Fetch HTML separately for this.
				let images: string[] = []
				let previewImage: string | undefined
				let metaTags: MetaTags | undefined

				try {
					const response = await safeFetch(url, {
						headers: {
							'User-Agent':
								'Mozilla/5.0 (compatible; SupermemoryBot/1.0; +https://supermemory.ai)',
						},
						signal: AbortSignal.timeout(options?.timeout ?? 30000),
					})

					if (response.ok) {
						const html = await response.text()

						// Extract meta tags for preview image
						metaTags = {
							title: this.extractMetaTag(html, 'og:title') || this.extractMetaTag(html, 'title'),
							description: this.extractMetaTag(html, 'og:description') || this.extractMetaTag(html, 'description'),
							ogImage: this.extractMetaTag(html, 'og:image'),
							twitterImage: this.extractMetaTag(html, 'twitter:image'),
							favicon: this.extractFavicon(html, url),
						}

						// Extract images from HTML
						images = this.extractImagesFromHtml(html, url)

						// Use ogImage or twitterImage as preview image
						previewImage = metaTags.ogImage || metaTags.twitterImage

						this.logger.debug('Extracted metadata and images for MarkItDown result', {
							url,
							imageCount: images.length,
							hasPreviewImage: !!previewImage,
						})
					}
				} catch (htmlError) {
					this.logger.warn('Failed to extract HTML metadata for MarkItDown result', {
						error: (htmlError as Error).message,
					})
				}

				return {
					text: markitdownResult.text,
					title: markitdownResult.title || metaTags?.title || 'Untitled',
					source: 'markitdown',
					url,
					contentType: 'text/markdown',
					raw: { markdown: markitdownResult.text, images },
					images, // Array of image URLs for frontend gallery
					wordCount: this.countWords(markitdownResult.text),
					extractorUsed: 'URLExtractor (MarkItDown)',
					metadata: previewImage ? { image: previewImage } : undefined,
					extractionMetadata: metaTags ? { metaTags } : {},
				}
			}
		} catch (error) {
			this.logger.warn('MarkItDown extraction failed, trying basic scraping', {
				error: (error as Error).message,
			})
		}

		// Fallback to basic HTML scraping if MarkItDown fails
		const response = await safeFetch(url, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (compatible; SupermemoryBot/1.0; +https://supermemory.ai)',
			},
			signal: AbortSignal.timeout(options?.timeout ?? 30000),
		})

		if (!response.ok) {
			throw this.createError(
				'FETCH_FAILED',
				`Failed to fetch URL: ${response.status} ${response.statusText}`
			)
		}

		const html = await response.text()
		const textContent = this.extractTextFromHtml(html)
		const cleanedContent = this.cleanContent(textContent)

		const title =
			this.extractMetaTag(html, 'og:title') ||
			this.extractMetaTag(html, 'title') ||
			this.extractTitleFromContent(cleanedContent)

		const metaTags: MetaTags = {
			title,
			description: this.extractMetaTag(html, 'og:description') || this.extractMetaTag(html, 'description'),
			ogImage: this.extractMetaTag(html, 'og:image'),
			twitterImage: this.extractMetaTag(html, 'twitter:image'),
			favicon: this.extractFavicon(html, url),
		}

		// Extract images from HTML
		const images = this.extractImagesFromHtml(html, url)

		// Use ogImage or twitterImage as preview image
		const previewImage = metaTags.ogImage || metaTags.twitterImage

		this.logger.debug('Extracted images from HTML', {
			url,
			imageCount: images.length,
		})

		return {
			text: cleanedContent,
			title,
			source: 'direct-scraping',
			url,
			contentType: 'text/html',
			raw: { html, images },
			images, // Array of image URLs for frontend gallery
			wordCount: this.countWords(cleanedContent),
			extractorUsed: 'URLExtractor (HTML scraping)',
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
			if (src.startsWith('data:')) continue
			if (src.endsWith('.svg')) continue
			if (src.includes('1x1')) continue
			if (src.includes('icon')) continue

			try {
				// Make absolute URL
				let absoluteUrl: string
				if (src.startsWith('http://') || src.startsWith('https://')) {
					absoluteUrl = src
				} else {
					const base = new URL(baseUrl)
					absoluteUrl = new URL(src, base.origin).toString()
				}

				// Avoid duplicates
				if (!images.includes(absoluteUrl)) {
					images.push(absoluteUrl)
				}
			} catch (error) {
				// Skip invalid URLs
				continue
			}
		}

		return images
	}

	/**
	 * Extract text from HTML (basic implementation)
	 */
	private extractTextFromHtml(html: string): string {
		// Remove scripts and styles
		let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
		text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')

		// Remove HTML tags
		text = text.replace(/<[^>]+>/g, ' ')

		// Decode HTML entities
		text = text
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")

		return text
	}

	/**
	 * Extract meta tag content
	 */
	private extractMetaTag(html: string, property: string): string | undefined {
		const patterns = [
			new RegExp(`<meta\\s+property=["']${property}["']\\s+content=["']([^"']+)["']`, 'i'),
			new RegExp(`<meta\\s+name=["']${property}["']\\s+content=["']([^"']+)["']`, 'i'),
			new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${property}["']`, 'i'),
			new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+name=["']${property}["']`, 'i'),
		]

		for (const pattern of patterns) {
			const match = html.match(pattern)
			if (match) return match[1]
		}

		// Special handling for title tag
		if (property === 'title') {
			const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
			if (titleMatch) return titleMatch[1]
		}

		return undefined
	}

	/**
	 * Extract favicon URL
	 */
	private extractFavicon(html: string, baseUrl: string): string | undefined {
		const iconMatch = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i)

		if (iconMatch) {
			const iconUrl = iconMatch[1]
			// Make absolute URL
			if (iconUrl.startsWith('http')) {
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
		const firstLine = content.split('\n')[0].trim()
		if (firstLine.length > 0 && firstLine.length <= 200) {
			return firstLine
		}

		const truncated = content.substring(0, 100).trim()
		return truncated.length > 0 ? truncated + '...' : null
	}

	/**
	 * Clean extracted content
	 */
	private cleanContent(content: string): string {
		// Remove null bytes
		let cleaned = content.replace(/\0/g, '')

		// Normalize whitespace
		cleaned = cleaned.replace(/\s+/g, ' ')

		// Remove excessive line breaks
		cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

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
