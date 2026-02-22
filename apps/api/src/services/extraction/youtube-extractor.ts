/**
 * YouTube Extractor (Firecrawl-based)
 *
 * Specialized extractor for YouTube videos using Firecrawl API.
 * Firecrawl handles transcript extraction, title, and metadata in a single call.
 *
 * Features:
 * - YouTube video ID extraction from various URL formats
 * - Transcript + metadata via Firecrawl scrape API
 * - Fallback to oEmbed for title when Firecrawl fails
 */

import type {
	ExtractionInput,
	ExtractionResult,
	YouTubeExtractor as IYouTubeExtractor,
	YouTubeMetadata,
	YouTubeOptions,
} from "../interfaces"

// ============================================================================
// Firecrawl Configuration
// ============================================================================

const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
const FIRECRAWL_TIMEOUT_MS = 60_000 // 60s — YouTube transcripts can be large

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetch video title using YouTube oEmbed API (free, no auth required)
 */
async function fetchTitleFromOEmbed(videoId: string): Promise<string | null> {
	try {
		const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
		const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
		if (!response.ok) return null
		const data = await response.json()
		return data.title || null
	} catch {
		return null
	}
}

// ============================================================================
// YouTube Extractor Implementation
// ============================================================================

/**
 * Extractor for YouTube videos using Firecrawl API
 */
export class YouTubeExtractor implements IYouTubeExtractor {
	readonly serviceName = "YouTubeExtractor"
	private initialized = false

	constructor(_preferredLanguages?: string[]) {
		// Languages are handled by Firecrawl automatically
	}

	async initialize(): Promise<void> {
		if (this.initialized) return
		this.initialized = true
	}

	async healthCheck(): Promise<boolean> {
		// Check Firecrawl is configured
		return !!(FIRECRAWL_API_URL && FIRECRAWL_API_KEY)
	}

	async cleanup(): Promise<void> {
		// No resources to clean up
	}

	// ========================================================================
	// DocumentExtractor Interface
	// ========================================================================

	async extract(input: ExtractionInput): Promise<ExtractionResult> {
		if (!input.url) {
			throw new Error("URL is required for YouTube extraction")
		}

		const videoId = this.parseVideoId(input.url)
		if (!videoId) {
			throw new Error("Invalid YouTube URL")
		}

		return await this.extractTranscript(videoId)
	}

	canHandle(input: ExtractionInput): boolean {
		if (!input.url) return false
		return this.isYouTubeUrl(input.url)
	}

	getPriority(): number {
		return 15 // High priority for YouTube URLs
	}

	async validateInput(input: ExtractionInput): Promise<void> {
		if (!input.url) {
			throw new Error("URL is required")
		}
		if (!this.isYouTubeUrl(input.url)) {
			throw new Error("Not a valid YouTube URL")
		}
	}

	// ========================================================================
	// YouTubeExtractor Interface
	// ========================================================================

	async extractTranscript(
		videoId: string,
		_options?: YouTubeOptions,
	): Promise<ExtractionResult> {
		const videoUrl = `https://www.youtube.com/watch?v=${videoId}`

		console.info("[YouTubeExtractor] Extracting via Firecrawl", videoId)

		// Single Firecrawl call gets transcript + title + metadata
		const firecrawlResult = await this.scrapeWithFirecrawl(videoUrl)

		if (firecrawlResult) {
			const title =
				(firecrawlResult.metadata?.title as string | undefined) ||
				(await fetchTitleFromOEmbed(videoId)) ||
				`YouTube Video ${videoId}`

			const cleanedContent = this.cleanContent(firecrawlResult.markdown)

			return {
				text: cleanedContent,
				title,
				source: "youtube",
				url: videoUrl,
				contentType: "video/youtube",
				raw: {
					metadata: firecrawlResult.metadata,
					videoId,
					transcriptSource: "firecrawl",
				},
				wordCount: this.countWords(cleanedContent),
				extractorUsed: "YouTubeExtractor (Firecrawl)",
				extractionMetadata: {
					videoId,
					thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
				},
			}
		}

		// Firecrawl failed — throw so pipeline can retry or fall back
		throw new Error(
			`Firecrawl failed to extract YouTube transcript for ${videoId}`,
		)
	}

	async extractMetadata(videoId: string): Promise<YouTubeMetadata> {
		const title =
			(await fetchTitleFromOEmbed(videoId)) || `YouTube Video ${videoId}`

		return {
			videoId,
			title,
			channelName: "Unknown",
			description: "",
			duration: 0,
			availableLanguages: [],
			thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
		}
	}

	parseVideoId(url: string): string | null {
		const patterns = [
			/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
			/youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
			/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
		]

		for (const pattern of patterns) {
			const match = url.match(pattern)
			if (match) return match[1]
		}

		if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
			return url
		}

		return null
	}

	isYouTubeUrl(url: string): boolean {
		const lowerUrl = url.toLowerCase()
		return (
			lowerUrl.includes("youtube.com") ||
			lowerUrl.includes("youtu.be") ||
			!!this.parseVideoId(url)
		)
	}

	// ========================================================================
	// Private Methods
	// ========================================================================

	/**
	 * Scrape YouTube URL via Firecrawl API
	 */
	private async scrapeWithFirecrawl(
		url: string,
	): Promise<{ markdown: string; metadata?: Record<string, unknown> } | null> {
		if (!FIRECRAWL_API_URL || !FIRECRAWL_API_KEY) {
			console.warn("[YouTubeExtractor] Firecrawl not configured")
			return null
		}

		try {
			const response = await fetch(`${FIRECRAWL_API_URL}/v1/scrape`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
				},
				body: JSON.stringify({ url, formats: ["markdown"] }),
				signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
			})

			if (!response.ok) {
				console.warn(
					"[YouTubeExtractor] Firecrawl HTTP error",
					response.status,
				)
				return null
			}

			const data = (await response.json()) as {
				success?: boolean
				data?: {
					markdown?: string
					metadata?: Record<string, unknown>
				}
			}

			if (!data.success || !data.data?.markdown) {
				console.warn("[YouTubeExtractor] Firecrawl returned no markdown")
				return null
			}

			// Validate we got real content (not just a page stub)
			if (data.data.markdown.length < 100) {
				console.warn(
					"[YouTubeExtractor] Firecrawl markdown too short",
					data.data.markdown.length,
				)
				return null
			}

			return {
				markdown: data.data.markdown,
				metadata: data.data.metadata,
			}
		} catch (err) {
			console.warn(
				"[YouTubeExtractor] Firecrawl request failed",
				err instanceof Error ? err.message : String(err),
			)
			return null
		}
	}

	private cleanContent(content: string): string {
		let cleaned = content.replace(/\0/g, "")
		cleaned = cleaned.replace(/\n{4,}/g, "\n\n\n")
		cleaned = cleaned.trim()
		return cleaned
	}

	private countWords(text: string): number {
		const normalized = text.trim()
		if (!normalized) return 0
		return normalized.split(/\s+/).length
	}
}
