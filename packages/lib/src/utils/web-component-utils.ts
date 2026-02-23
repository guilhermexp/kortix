/**
 * Consolidated web component utilities
 * Centralizes utility functions used across memory-list-view, document-card, and memory-entries-sidebar
 */

/**
 * Base record type for type safety
 */
export type BaseRecord = Record<string, unknown>

/**
 * Safely casts unknown values to BaseRecord
 */
export const asRecord = (value: unknown): BaseRecord | null => {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null
	}
	return value as BaseRecord
}

/**
 * Validates and sanitizes HTTP URLs (including data URLs for images)
 */
export const safeHttpUrl = (
	value: unknown,
	baseUrl?: string,
): string | undefined => {
	if (typeof value !== "string") return undefined
	const trimmed = value.trim()
	if (!trimmed) return undefined

	// Only accept data URLs that are images, not text or other types
	if (trimmed.startsWith("data:")) {
		if (trimmed.startsWith("data:image/")) {
			return trimmed
		}
		return undefined
	}

	// Try absolute URL first
	try {
		const url = new URL(trimmed)
		if (url.protocol === "http:" || url.protocol === "https:") {
			return url.toString()
		}
	} catch {
		// If it fails, try as relative URL with baseUrl
		if (baseUrl) {
			try {
				const url = new URL(trimmed, baseUrl)
				if (url.protocol === "http:" || url.protocol === "https:") {
					return url.toString()
				}
			} catch {}
		}
	}
	return undefined
}

/**
 * Validates a URL for use as a document preview image.
 * Rejects: empty strings, SVG data URLs, non-http(s) URLs.
 * Accepts: http/https URLs, data:image/* (except SVG).
 * Does NOT filter by keywords — the backend already handles quality.
 */
export const isValidPreviewUrl = (url?: string | null): url is string => {
	if (typeof url !== "string") return false
	const trimmed = url.trim()
	if (!trimmed) return false
	// Reject inline SVG data URLs (often tiny icons/badges)
	if (trimmed.toLowerCase().startsWith("data:image/svg+xml")) return false
	// Accept other image data URLs
	if (trimmed.startsWith("data:image/")) return true
	// Accept http/https
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
		return true
	return false
}

/**
 * Formats preview labels by converting underscores/hyphens to spaces and title case
 */
export const formatPreviewLabel = (type?: string | null): string => {
	if (!type) return "Link"
	return type
		.split(/[_-]/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ")
}

/**
 * Checks if a URL is a YouTube video URL
 */
export const isYouTubeUrl = (value?: string): boolean => {
	if (!value) return false
	try {
		const parsed = new URL(value)
		const host = parsed.hostname.toLowerCase()
		if (!host.includes("youtube.com") && !host.includes("youtu.be"))
			return false
		return true
	} catch {
		return false
	}
}

/**
 * Extracts YouTube video ID from a YouTube URL
 */
export const getYouTubeId = (value?: string): string | undefined => {
	if (!value) return undefined
	try {
		const parsed = new URL(value)
		if (parsed.hostname.includes("youtu.be")) {
			return parsed.pathname.replace(/^\//, "") || undefined
		}
		if (parsed.searchParams.has("v")) {
			return parsed.searchParams.get("v") ?? undefined
		}
		const pathSegments = parsed.pathname.split("/").filter(Boolean)
		if (pathSegments[0] === "embed" && pathSegments[1]) {
			return pathSegments[1]
		}
	} catch {}
	return undefined
}

/**
 * Gets YouTube thumbnail URL for a video
 */
export const getYouTubeThumbnail = (value?: string): string | undefined => {
	const videoId = getYouTubeId(value)
	if (!videoId) return undefined
	return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

/**
 * Checks if a URL is an inline SVG data URL
 */
export const isInlineSvgDataUrl = (value?: string | null): boolean => {
	if (!value) return false
	return value.trim().toLowerCase().startsWith("data:image/svg+xml")
}

/**
 * Constants for processing statuses
 */
export const PROCESSING_STATUSES = new Set([
	"queued",
	"fetching",
	"generating_preview",
	"extracting",
	"chunking",
	"embedding",
	"processing",
	"indexing",
])

/**
 * Status that indicates the queue was paused due to systemic error
 */
export const PAUSED_STATUS = "paused"

/**
 * Domains that are safe and don't need proxying (our own domains, CDNs, etc.)
 */
const SAFE_DOMAINS = [
	"localhost",
	"127.0.0.1",
	"kortix.ai",
	"kortix.com",
	// YouTube thumbnails - they set CORS headers
	"img.youtube.com",
	"i.ytimg.com",
	// Common CDNs that allow CORS
	"cloudflare.com",
	"cdnjs.cloudflare.com",
	"unpkg.com",
	"jsdelivr.net",
	// Supabase Storage (persisted preview images)
	"supabase.co",
]

/**
 * Wraps an image URL through our proxy to bypass CORS
 * Proxies ALL external images except from safe/known domains
 */
export const proxyImageUrl = (
	url: string | undefined | null,
	apiBaseUrl?: string,
): string | undefined => {
	if (!url) return undefined

	// Don't proxy data URLs
	if (url.startsWith("data:")) return url

	// Don't proxy relative URLs
	if (!url.startsWith("http://") && !url.startsWith("https://")) return url

	try {
		const parsed = new URL(url)
		const hostname = parsed.hostname.toLowerCase()

		// Check if this is a safe domain that doesn't need proxying
		const isSafe = SAFE_DOMAINS.some(
			(domain) => hostname === domain || hostname.endsWith(`.${domain}`),
		)

		if (isSafe) return url

		// Proxy all other external images
		const base = apiBaseUrl || (typeof window !== "undefined" ? "" : "")
		return `${base}/api/image-proxy?url=${encodeURIComponent(url)}`
	} catch {
		return url
	}
}
