/**
 * Preview-related types and interfaces
 * Centralized to eliminate duplication across the codebase
 */

export interface PreviewData {
	thumbnailUrl?: string
	favicon?: string
	title?: string
	description?: string
	domain?: string
	type: "youtube" | "github" | "website" | "image" | "default"
}

export interface ImagePreviewOptions {
	preferImage?: boolean
	maxSize?: number
	fallbackToFavicon?: boolean
	width?: number
	height?: number
}

export interface VideoPreviewData extends PreviewData {
	type: "youtube"
	videoId: string
	duration?: string
	viewCount?: number
}

export interface GitHubPreviewData extends PreviewData {
	type: "github"
	owner: string
	repo: string
	stars?: number
	language?: string
	description?: string
}

export interface WebsitePreviewData extends PreviewData {
	type: "website"
	metaTitle?: string
	metaDescription?: string
	ogImage?: string
	twitterImage?: string
	faviconUrl?: string
}

export interface PreviewGenerationOptions {
	timeout?: number
	followRedirects?: boolean
	userAgent?: string
	headers?: Record<string, string>
}

export interface PreviewError {
	type: "timeout" | "network" | "parse" | "forbidden"
	message: string
	originalUrl: string
}

export interface PreviewCache {
	url: string
	data: PreviewData
	expiresAt: Date
	createdAt: Date
}

export interface PreviewService {
	generate(
		url: string,
		options?: PreviewGenerationOptions,
	): Promise<PreviewData>
	generateBatch(
		urls: string[],
		options?: PreviewGenerationOptions,
	): Promise<PreviewData[]>
	clearCache?(): void
	getFromCache(url: string): PreviewData | null
}
