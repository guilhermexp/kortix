/**
 * Repository Extractor
 *
 * Specialized extractor for GitHub repositories.
 * Features:
 * - GitHub API integration for repository content
 * - README extraction and parsing
 * - File tree traversal
 * - Content aggregation from multiple files
 * - Rate limit handling
 * - Support for public and private repositories
 */

import { BaseService } from '../base/base-service'
import { safeFetch } from '../../security/url-validator'
import type {
	RepositoryExtractor as IRepositoryExtractor,
	ExtractionInput,
	ExtractionResult,
	RepositoryOptions,
	RepositoryInfo,
	FileTreeNode,
} from '../interfaces'

// ============================================================================
// GitHub API Types
// ============================================================================

interface GitHubFile {
	name: string
	path: string
	sha: string
	size: number
	url: string
	html_url: string
	git_url: string
	download_url: string | null
	type: 'file' | 'dir'
	content?: string
	encoding?: string
}

interface GitHubTree {
	sha: string
	url: string
	tree: Array<{
		path: string
		mode: string
		type: 'blob' | 'tree'
		sha: string
		size?: number
		url: string
	}>
	truncated: boolean
}

// ============================================================================
// Repository Extractor Implementation
// ============================================================================

/**
 * Extractor for GitHub repositories
 */
export class RepositoryExtractor extends BaseService implements IRepositoryExtractor {
	private readonly apiKey: string | undefined
	private readonly baseUrl = 'https://api.github.com'
	private rateLimitRemaining = 60 // Default for unauthenticated
	private rateLimitReset = Date.now()

	constructor(apiKey?: string) {
		super('RepositoryExtractor')
		this.apiKey = apiKey || process.env.GITHUB_TOKEN || process.env.GITHUB_API_KEY
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
			throw this.createError('MISSING_URL', 'URL is required for repository extraction')
		}

		const repoInfo = this.parseRepositoryUrl(input.url)
		if (!repoInfo) {
			throw this.createError('INVALID_REPOSITORY_URL', 'Invalid GitHub repository URL')
		}

		return await this.extractFromRepository(input.url, {
			includeReadme: true,
			includeFileTree: true,
			maxFileSize: 1024 * 1024, // 1MB per file
			maxTotalSize: 10 * 1024 * 1024, // 10MB total
		})
	}

	/**
	 * Check if this extractor can handle the given input
	 * DISABLED: GitHub URLs should be processed by MarkItDown (URLExtractor)
	 */
	canHandle(input: ExtractionInput): boolean {
		return false // Completely disabled - use MarkItDown for all URLs including GitHub
	}

	/**
	 * Get extractor priority (higher = preferred)
	 * DISABLED: Set to 0 to ensure URLExtractor (MarkItDown) is always preferred
	 */
	getPriority(): number {
		return 0 // Disabled - use MarkItDown for all URLs
	}

	/**
	 * Validate input before extraction
	 */
	async validateInput(input: ExtractionInput): Promise<void> {
		if (!input.url) {
			throw this.createError('VALIDATION_ERROR', 'URL is required')
		}

		if (!this.isRepositoryUrl(input.url)) {
			throw this.createError('VALIDATION_ERROR', 'Not a valid GitHub repository URL')
		}
	}

	// ========================================================================
	// RepositoryExtractor Interface
	// ========================================================================

	/**
	 * Extract content from GitHub repository
	 */
	async extractFromRepository(
		url: string,
		options?: RepositoryOptions
	): Promise<ExtractionResult> {
		this.assertInitialized()

		const tracker = this.performanceMonitor.startOperation('extractFromRepository')

		try {
			const repoInfo = this.parseRepositoryUrl(url)
			if (!repoInfo) {
				throw this.createError('INVALID_URL', 'Invalid repository URL')
			}

			this.logger.info('Extracting repository content', {
				owner: repoInfo.owner,
				name: repoInfo.name,
				branch: repoInfo.branch,
			})

			// Build content parts
			const contentParts: string[] = []
			let readmeContent = ''

			// Add repository header
			contentParts.push(`# Repository: ${repoInfo.owner}/${repoInfo.name}`)
			contentParts.push(`URL: ${repoInfo.url}`)
			if (repoInfo.branch) {
				contentParts.push(`Branch: ${repoInfo.branch}`)
			}
			contentParts.push('')

			// Extract README
			if (options?.includeReadme !== false) {
				try {
					readmeContent = await this.extractReadme(url)
					contentParts.push('## README\n')
					contentParts.push(readmeContent)
					contentParts.push('')
				} catch (error) {
					this.logger.warn('Failed to extract README', {
						error: (error as Error).message,
					})
				}
			}

			// Extract file tree
			let fileTree: FileTreeNode[] = []
			if (options?.includeFileTree !== false) {
				try {
					fileTree = await this.extractFileTree(url)
					contentParts.push('## File Structure\n')
					contentParts.push(this.formatFileTree(fileTree))
					contentParts.push('')
				} catch (error) {
					this.logger.warn('Failed to extract file tree', {
						error: (error as Error).message,
					})
				}
			}

			// Extract specific files if requested
			if (options?.includeFiles && options.includeFiles.length > 0) {
				contentParts.push('## Files\n')
				for (const filePath of options.includeFiles) {
					try {
						const content = await this.fetchFileContent(repoInfo, filePath)
						contentParts.push(`### ${filePath}\n`)
						contentParts.push('```')
						contentParts.push(content)
						contentParts.push('```\n')
					} catch (error) {
						this.logger.warn(`Failed to extract file: ${filePath}`, {
							error: (error as Error).message,
						})
					}
				}
			}

			const fullContent = contentParts.join('\n')
			const cleanedContent = this.cleanContent(fullContent)

			// Extract images from README markdown
			const images = this.extractImagesFromMarkdown(readmeContent, repoInfo)

			this.logger.info('Extracted images from GitHub repository', {
				owner: repoInfo.owner,
				name: repoInfo.name,
				imageCount: images.length,
			})

			tracker.end(true)

			return {
				text: cleanedContent,
				title: `${repoInfo.owner}/${repoInfo.name}`,
				source: 'github',
				url: repoInfo.url,
				contentType: 'text/markdown',
				raw: {
					repoInfo,
					fileTree,
					images, // Add images to raw data
				},
				images, // Add images array for frontend gallery
			preview: images[0] || null, // First image as preview (eliminates GitHub og:image dependency)
				wordCount: this.countWords(cleanedContent),
				extractorUsed: 'RepositoryExtractor',
				extractionMetadata: {
					owner: repoInfo.owner,
					repository: repoInfo.name,
					branch: repoInfo.branch,
					fileCount: this.countFiles(fileTree),
				},
			}
		} catch (error) {
			tracker.end(false)
			throw this.handleError(error, 'extractFromRepository')
		}
	}

	/**
	 * Extract README content
	 */
	async extractReadme(url: string): Promise<string> {
		const repoInfo = this.parseRepositoryUrl(url)
		if (!repoInfo) {
			throw this.createError('INVALID_URL', 'Invalid repository URL')
		}

		// Try common README names
		const readmeNames = ['README.md', 'README.MD', 'Readme.md', 'readme.md', 'README']

		for (const name of readmeNames) {
			try {
				const content = await this.fetchFileContent(repoInfo, name)
				return content
			} catch {
				// Try next name
			}
		}

		throw this.createError('README_NOT_FOUND', 'README file not found in repository')
	}

	/**
	 * Extract file tree
	 */
	async extractFileTree(url: string): Promise<FileTreeNode[]> {
		const repoInfo = this.parseRepositoryUrl(url)
		if (!repoInfo) {
			throw this.createError('INVALID_URL', 'Invalid repository URL')
		}

		// Get tree via API
		const branch = repoInfo.branch || 'main'
		const apiUrl = `${this.baseUrl}/repos/${repoInfo.owner}/${repoInfo.name}/git/trees/${branch}?recursive=1`

		const response = await this.makeApiRequest(apiUrl)
		const data = (await response.json()) as GitHubTree

		if (data.truncated) {
			this.logger.warn('File tree was truncated, showing partial results')
		}

		// Convert to FileTreeNode structure
		return this.buildFileTree(data.tree)
	}

	/**
	 * Parse repository URL
	 */
	parseRepositoryUrl(url: string): RepositoryInfo | null {
		try {
			// Clean URL
			let cleanUrl = url.trim()

			// Handle various GitHub URL formats
			const patterns = [
				// https://github.com/owner/repo
				/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+?)(\/.*)?$/,
				// github.com/owner/repo
				/^github\.com\/([^\/]+)\/([^\/]+?)(\/.*)?$/,
			]

			for (const pattern of patterns) {
				const match = cleanUrl.match(pattern)
				if (match) {
					const owner = match[1]
					let name = match[2]
					const path = match[3] || ''

					// Remove .git suffix
					name = name.replace(/\.git$/, '')

					// Extract branch and file path from URL
					let branch: string | undefined
					let filePath: string | undefined

					if (path) {
						// Parse /tree/branch/path or /blob/branch/path
						const pathMatch = path.match(/^\/(tree|blob)\/([^\/]+)(.*)$/)
						if (pathMatch) {
							branch = pathMatch[2]
							filePath = pathMatch[3] ? pathMatch[3].substring(1) : undefined
						}
					}

					return {
						owner,
						name,
						branch,
						filePath,
						url: `https://github.com/${owner}/${name}`,
					}
				}
			}

			return null
		} catch {
			return null
		}
	}

	/**
	 * Check if URL is a valid repository URL
	 */
	isRepositoryUrl(url: string): boolean {
		return this.parseRepositoryUrl(url) !== null
	}

	// ========================================================================
	// Private Methods
	// ========================================================================

	/**
	 * Fetch file content from repository
	 */
	private async fetchFileContent(repoInfo: RepositoryInfo, filePath: string): Promise<string> {
		const branch = repoInfo.branch || 'main'
		const apiUrl = `${this.baseUrl}/repos/${repoInfo.owner}/${repoInfo.name}/contents/${filePath}?ref=${branch}`

		const response = await this.makeApiRequest(apiUrl)
		const data = (await response.json()) as GitHubFile

		if (data.type !== 'file') {
			throw this.createError('NOT_A_FILE', `${filePath} is not a file`)
		}

		if (!data.content || !data.encoding) {
			// Try download_url as fallback
			if (data.download_url) {
				const contentResponse = await safeFetch(data.download_url)
				return await contentResponse.text()
			}
			throw this.createError('NO_CONTENT', `No content available for ${filePath}`)
		}

		// Decode base64 content
		if (data.encoding === 'base64') {
			return Buffer.from(data.content, 'base64').toString('utf-8')
		}

		return data.content
	}

	/**
	 * Make authenticated API request
	 */
	private async makeApiRequest(url: string): Promise<Response> {
		// Check rate limit
		if (this.rateLimitRemaining <= 1 && Date.now() < this.rateLimitReset) {
			const waitTime = this.rateLimitReset - Date.now()
			this.logger.warn('Rate limit reached, waiting', { waitTime })
			await new Promise((resolve) => setTimeout(resolve, waitTime))
		}

		const headers: Record<string, string> = {
			Accept: 'application/vnd.github.v3+json',
			'User-Agent': 'Supermemory-Bot/1.0',
		}

		if (this.apiKey) {
			headers.Authorization = `Bearer ${this.apiKey}`
		}

		const response = await safeFetch(url, { headers })

		// Update rate limit info
		const remaining = response.headers.get('x-ratelimit-remaining')
		const reset = response.headers.get('x-ratelimit-reset')

		if (remaining) this.rateLimitRemaining = parseInt(remaining, 10)
		if (reset) this.rateLimitReset = parseInt(reset, 10) * 1000

		if (!response.ok) {
			const errorText = await response.text()
			throw this.createError(
				'API_REQUEST_FAILED',
				`GitHub API request failed: ${response.status} ${errorText}`
			)
		}

		return response
	}

	/**
	 * Build file tree from GitHub tree API response
	 */
	private buildFileTree(
		items: GitHubTree['tree']
	): FileTreeNode[] {
		const rootNodes: FileTreeNode[] = []
		const nodeMap = new Map<string, FileTreeNode>()

		// Sort by path depth
		const sortedItems = [...items].sort((a, b) => {
			const depthA = a.path.split('/').length
			const depthB = b.path.split('/').length
			return depthA - depthB
		})

		for (const item of sortedItems) {
			const parts = item.path.split('/')
			const name = parts[parts.length - 1]
			const parentPath = parts.slice(0, -1).join('/')

			const node: FileTreeNode = {
				path: item.path,
				name,
				type: item.type === 'tree' ? 'directory' : 'file',
				size: item.size,
			}

			if (item.type === 'tree') {
				node.children = []
			}

			nodeMap.set(item.path, node)

			// Add to parent or root
			if (parentPath) {
				const parent = nodeMap.get(parentPath)
				if (parent && parent.children) {
					parent.children.push(node)
				}
			} else {
				rootNodes.push(node)
			}
		}

		return rootNodes
	}

	/**
	 * Format file tree as readable text
	 */
	private formatFileTree(nodes: FileTreeNode[], indent = ''): string {
		const lines: string[] = []

		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i]
			const isLast = i === nodes.length - 1
			const prefix = isLast ? '└── ' : '├── '
			const childIndent = indent + (isLast ? '    ' : '│   ')

			const icon = node.type === 'directory' ? '📁' : '📄'
			const sizeInfo = node.size ? ` (${this.formatFileSize(node.size)})` : ''

			lines.push(`${indent}${prefix}${icon} ${node.name}${sizeInfo}`)

			if (node.children && node.children.length > 0) {
				lines.push(this.formatFileTree(node.children, childIndent))
			}
		}

		return lines.join('\n')
	}

	/**
	 * Format file size
	 */
	private formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
	}

	/**
	 * Count total files in tree
	 */
	private countFiles(nodes: FileTreeNode[]): number {
		let count = 0

		for (const node of nodes) {
			if (node.type === 'file') {
				count++
			}
			if (node.children) {
				count += this.countFiles(node.children)
			}
		}

		return count
	}

	/**
	 * Clean extracted content
	 */
	private cleanContent(content: string): string {
		// Remove null bytes
		let cleaned = content.replace(/\0/g, '')

		// Normalize line breaks
		cleaned = cleaned.replace(/\r\n/g, '\n')

		// Remove excessive line breaks
		cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n')

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

	/**
	 * Extract image URLs from markdown content
	 */
	private extractImagesFromMarkdown(markdown: string, repoInfo: RepositoryInfo): string[] {
		console.log('[RepositoryExtractor] Starting image extraction from markdown', {
			markdownLength: markdown.length,
			owner: repoInfo.owner,
			name: repoInfo.name,
		})

		const images: string[] = []

		// Match markdown images: ![alt](url)
		const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
		let match
		let matchCount = 0

		while ((match = markdownImageRegex.exec(markdown)) !== null) {
			matchCount++
			const imageUrl = match[2]
			console.log('[RepositoryExtractor] Found markdown image', { imageUrl, matchNumber: matchCount })

			// Skip data URLs
			if (imageUrl.startsWith('data:')) {
				console.log('[RepositoryExtractor] Skipping data URL')
				continue
			}

			// Skip common badges and buttons (shields.io, StackBlitz, etc.)
			const badgeDomains = [
				'shields.io',
				'img.shields.io',
				'badge.fury.io',
				'badgen.net',
				'developer.stackblitz.com',
				'badge',
				'travis-ci',
				'codecov.io',
				'circleci.com',
				'star-history.com',
				'api.star-history.com',
			]

			const isBadge = badgeDomains.some(domain => imageUrl.includes(domain))
			if (isBadge) {
				console.log('[RepositoryExtractor] Skipping badge/button image', { imageUrl })
				continue
			}

			try {
				// Make absolute URL
				let absoluteUrl: string

				if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
					// Already absolute
					absoluteUrl = imageUrl
				} else if (imageUrl.startsWith('/')) {
					// Root-relative path - convert to raw GitHub URL
					const branch = repoInfo.branch || 'main'
					absoluteUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.name}/${branch}${imageUrl}`
				} else {
					// Relative path - convert to raw GitHub URL
					const branch = repoInfo.branch || 'main'
					absoluteUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.name}/${branch}/${imageUrl}`
				}

				// Avoid duplicates
				if (!images.includes(absoluteUrl)) {
					images.push(absoluteUrl)
				}
			} catch (error) {
				// Skip invalid URLs
				this.logger.warn('Failed to parse image URL from markdown', {
					url: imageUrl,
					error: (error as Error).message,
				})
			}
		}

		// Also match HTML img tags in markdown
		const htmlImageRegex = /<img[^>]+src=["']([^"']+)["']/gi

		while ((match = htmlImageRegex.exec(markdown)) !== null) {
			const imageUrl = match[1]

			// Skip data URLs
			if (imageUrl.startsWith('data:')) continue

			// Skip common badges and buttons
			const badgeDomains = [
				'shields.io',
				'img.shields.io',
				'badge.fury.io',
				'badgen.net',
				'developer.stackblitz.com',
				'badge',
				'travis-ci',
				'codecov.io',
				'circleci.com',
				'star-history.com',
				'api.star-history.com',
			]
			const isBadge = badgeDomains.some(domain => imageUrl.includes(domain))
			if (isBadge) continue

			try {
				// Make absolute URL
				let absoluteUrl: string

				if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
					// Already absolute
					absoluteUrl = imageUrl
				} else if (imageUrl.startsWith('/')) {
					// Root-relative path - convert to raw GitHub URL
					const branch = repoInfo.branch || 'main'
					absoluteUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.name}/${branch}${imageUrl}`
				} else {
					// Relative path - convert to raw GitHub URL
					const branch = repoInfo.branch || 'main'
					absoluteUrl = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.name}/${branch}/${imageUrl}`
				}

				// Avoid duplicates
				if (!images.includes(absoluteUrl)) {
					images.push(absoluteUrl)
				}
			} catch (error) {
				// Skip invalid URLs
				this.logger.warn('Failed to parse image URL from HTML', {
					url: imageUrl,
					error: (error as Error).message,
				})
			}
		}

		console.log('[RepositoryExtractor] Finished image extraction', {
			totalImages: images.length,
			markdownMatches: matchCount,
			owner: repoInfo.owner,
			name: repoInfo.name,
		})

		return images
	}

	// ========================================================================
	// Lifecycle Hooks
	// ========================================================================

	protected async onHealthCheck(): Promise<boolean> {
		// Check if we can access GitHub API
		try {
			const response = await this.makeApiRequest(`${this.baseUrl}/rate_limit`)
			return response.ok
		} catch {
			return false
		}
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create repository extractor with optional GitHub API key
 */
export function createRepositoryExtractor(apiKey?: string): RepositoryExtractor {
	return new RepositoryExtractor(apiKey)
}
