/**
 * Image preview and thumbnail utilities
 * Shared across web components to eliminate code duplication
 */

export interface PreviewData {
  thumbnailUrl?: string
  favicon?: string
  title?: string
  description?: string
  domain?: string
  type: 'youtube' | 'github' | 'website' | 'image' | 'default'
}

export interface DocumentPreviewOptions {
  preferImage?: boolean
  maxSize?: number
  fallbackToFavicon?: boolean
}

/**
 * Generates preview data for a document URL
 */
export function generateDocumentPreview(
  url: string,
  title?: string,
  content?: string,
  options: DocumentPreviewOptions = {}
): PreviewData {
  const { preferImage = false, fallbackToFavicon = true } = options

  // Handle YouTube URLs
  if (isYouTubeUrl(url)) {
    return generateYouTubePreview(url, title)
  }

  // Handle GitHub URLs
  if (isGitHubUrl(url)) {
    return generateGitHubPreview(url, title)
  }

  // Handle direct image URLs
  if (preferImage && isImageUrl(url)) {
    return {
      thumbnailUrl: url,
      title,
      description: content ? stripHtml(content).substring(0, 200) : undefined,
      type: 'image'
    }
  }

  // Default website preview
  return generateWebsitePreview(url, title, content, fallbackToFavicon)
}

/**
 * Generates YouTube preview data
 */
export function generateYouTubePreview(url: string, title?: string): PreviewData {
  const videoId = extractYouTubeVideoId(url)
  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : undefined

  return {
    thumbnailUrl,
    favicon: 'https://www.youtube.com/favicon.ico',
    title: title || extractYouTubeTitle(url),
    type: 'youtube'
  }
}

/**
 * Generates GitHub preview data
 */
export function generateGitHubPreview(url: string, title?: string): PreviewData {
  const { owner, repo } = parseGitHubUrl(url)
  const repoName = owner && repo ? `${owner}/${repo}` : extractDomain(url)

  return {
    thumbnailUrl: `https://github.com/${owner || '_'}/${repo || '_'}.png`,
    favicon: 'https://github.com/favicon.ico',
    title: title || repoName,
    type: 'github'
  }
}

/**
 * Generates website preview data
 */
export function generateWebsitePreview(
  url: string,
  title?: string,
  content?: string,
  fallbackToFavicon: boolean = true
): PreviewData {
  const domain = extractDomain(url)
  const favicon = fallbackToFavicon ? getFaviconUrl(url) : undefined

  return {
    favicon,
    title: title || extractDomain(url),
    description: content ? stripHtml(content).substring(0, 200) : undefined,
    domain,
    type: 'website'
  }
}

/**
 * Gets optimized thumbnail URL
 */
export function getOptimizedThumbnail(
  url: string,
  width: number = 400,
  height: number = 300
): string {
  if (!url) return ''

  // Handle different image services
  if (url.includes('unsplash.com')) {
    return `${url}&w=${width}&h=${height}&fit=crop`
  }

  if (url.includes('images.unsplash.com')) {
    return `${url}?w=${width}&h=${height}&fit=crop`
  }

  return url
}

/**
 * Validates if URL is an image
 */
export function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']
  const lowerUrl = url.toLowerCase()
  return imageExtensions.some(ext => lowerUrl.includes(ext))
}

/**
 * Validates if URL is a YouTube video
 */
export function isYouTubeUrl(url: string): boolean {
  try {
    const domain = new URL(url).hostname
    return domain.includes('youtube.com') || domain.includes('youtu.be')
  } catch {
    return false
  }
}

/**
 * Validates if URL is a GitHub repository
 */
export function isGitHubUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes('github.com')
  } catch {
    return false
  }
}

/**
 * Extracts YouTube video ID
 */
export function extractYouTubeVideoId(url: string): string | undefined {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
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
 * Parses GitHub URL to extract owner and repo
 */
export function parseGitHubUrl(url: string): { owner?: string; repo?: string } {
  try {
    const urlObj = new URL(url)
    const parts = urlObj.pathname.split('/').filter(Boolean)

    if (parts.length >= 2) {
      return {
        owner: parts[0],
        repo: parts[1]
      }
    }
  } catch {
    // Invalid URL
  }

  return {}
}

/**
 * Extracts domain from URL
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * Gets favicon URL
 */
export function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).origin
    return `${domain}/favicon.ico`
  } catch {
    return '/icons/default-favicon.svg'
  }
}

/**
 * Extracts title from YouTube URL (placeholder)
 */
export function extractYouTubeTitle(url: string): string {
  const videoId = extractYouTubeVideoId(url)
  return videoId ? `YouTube Video: ${videoId}` : 'YouTube Video'
}

/**
 * Strips HTML tags from content
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Checks if thumbnail URL is accessible
 */
export async function isThumbnailAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Gets fallback preview when no specific preview is available
 */
export function getFallbackPreview(url: string, title?: string): PreviewData {
  return {
    favicon: getFaviconUrl(url),
    title: title || extractDomain(url),
    type: 'default'
  }
}