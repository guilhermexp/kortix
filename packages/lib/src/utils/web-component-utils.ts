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
 * Picks the first valid URL from a list of object keys
 */
export const pickFirstUrl = (
	record: BaseRecord | null,
	keys: string[],
	baseUrl?: string,
): string | undefined => {
	if (!record) return undefined
	for (const key of keys) {
		const candidate = record[key]
		const url = safeHttpUrl(candidate, baseUrl)
		if (url) return url
	}
	return undefined
}

/**
 * Checks if a URL is from the same host or a trusted CDN
 */
export const sameHostOrTrustedCdn = (
	candidate?: string,
	baseUrl?: string,
): boolean => {
	if (!candidate) return false
	if (candidate.startsWith("data:image/")) return true
	if (!baseUrl) return true
	try {
		const c = new URL(candidate)
		const b = new URL(baseUrl)
		if (c.hostname === b.hostname) return true
		if (
			/(^|\.)github\.com$/i.test(b.hostname) &&
			/((^|\.)githubassets\.com$)/i.test(c.hostname)
		) {
			return true
		}
	} catch {}
	return false
}

/**
 * Picks the first URL from the same host or trusted CDN
 */
export const pickFirstUrlSameHost = (
	record: BaseRecord | null,
	keys: string[],
	baseUrl?: string,
): string | undefined => {
	if (!record) return undefined
	for (const key of keys) {
		const candidate = record[key]
		const url = safeHttpUrl(candidate, baseUrl)
		if (url && sameHostOrTrustedCdn(url, baseUrl)) return url
	}
	return undefined
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
 * Checks if an image URL is low resolution
 */
export const isLowResolutionImage = (url?: string): boolean => {
	if (!url) return false
	try {
		const lower = url.toLowerCase()
		if (lower.endsWith(".ico") || lower.includes("favicon")) return true
		if (/(apple-touch-icon|android-chrome)/.test(lower)) return true
		const sizeMatch = lower.match(/(\d{1,3})x(\d{1,3})/)
		if (sizeMatch) {
			const width = Number(sizeMatch[1])
			const height = Number(sizeMatch[2])
			if (Number.isFinite(width) && Number.isFinite(height)) {
				if (Math.max(width, height) <= 160) return true
			}
		}
	} catch {
		// ignore parsing errors
	}
	return false
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
