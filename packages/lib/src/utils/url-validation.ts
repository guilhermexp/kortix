/**
 * URL validation and sanitization utilities
 * Shared across web components to eliminate code duplication
 */

export interface ParsedUrl {
	original: string
	clean: string
	domain: string
	isYouTube: boolean
	videoId?: string
	isGitHub: boolean
	owner?: string
	repo?: string
}

/**
 * Validates and sanitizes a URL
 */
export function isValidUrl(string: string): boolean {
	try {
		new URL(string)
		return true
	} catch {
		return false
	}
}

/**
 * Extracts domain from URL
 */
export function extractDomain(url: string): string {
	try {
		return new URL(url).hostname
	} catch {
		return ""
	}
}

/**
 * Parses a URL and extracts common information
 */
export function parseUrl(url: string): ParsedUrl {
	const result: ParsedUrl = {
		original: url,
		clean: url,
		domain: extractDomain(url),
		isYouTube: false,
		isGitHub: false,
	}

	try {
		const urlObj = new URL(url)
		result.domain = urlObj.hostname

		// Check for YouTube URLs
		if (
			urlObj.hostname.includes("youtube.com") ||
			urlObj.hostname.includes("youtu.be")
		) {
			result.isYouTube = true
			result.videoId = extractYouTubeVideoId(url)
		}

		// Check for GitHub URLs
		if (urlObj.hostname.includes("github.com")) {
			result.isGitHub = true
			const parts = urlObj.pathname.split("/")
			if (parts.length >= 3) {
				result.owner = parts[1]
				result.repo = parts[2]
			}
		}
	} catch {
		// Invalid URL, return defaults
	}

	return result
}

/**
 * Extracts YouTube video ID from URL
 */
export function extractYouTubeVideoId(url: string): string | undefined {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
		/youtube\.com\/watch\?.*v=([^&\n?#]+)/,
	]

	for (const pattern of patterns) {
		const match = url.match(pattern)
		if (match) {
			return match[1]
		}
	}

	return undefined
}

/**
 * Generates YouTube thumbnail URL
 */
export function generateYouTubeThumbnail(videoId: string): string {
	return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
}

/**
 * Cleans and normalizes URLs
 */
export function cleanUrl(url: string): string {
	try {
		const urlObj = new URL(url.trim())
		return urlObj.toString()
	} catch {
		return url.trim()
	}
}

/**
 * Checks if URL is from a trusted domain
 */
export function isTrustedDomain(url: string): boolean {
	const trustedDomains = [
		"youtube.com",
		"youtu.be",
		"github.com",
		"twitter.com",
		"x.com",
		"linkedin.com",
		"medium.com",
	]

	try {
		const domain = new URL(url).hostname
		return trustedDomains.some((trusted) => domain.includes(trusted))
	} catch {
		return false
	}
}

/**
 * Gets URL favicon (placeholder implementation)
 */
export function getFaviconUrl(url: string): string {
	try {
		const domain = new URL(url).origin
		return `${domain}/favicon.ico`
	} catch {
		return "/icons/default-favicon.svg"
	}
}
