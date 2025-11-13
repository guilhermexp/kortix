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
import { makeApiRequest } from './repository/api'
import { buildFileTree, formatFileTree, countFiles, formatFileSize } from './repository/file-tree'
import { extractImagesFromMarkdown } from './repository/images'
import { parseRepositoryUrl, isRepositoryUrl } from './repository/parser'
import { fetchFileContent } from './repository/files'
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
  private rateLimitRemaining = 60
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

		const repoInfo = parseRepositoryUrl(input.url)
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

		if (!isRepositoryUrl(input.url)) {
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
			const repoInfo = parseRepositoryUrl(url)
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
			const images = extractImagesFromMarkdown(readmeContent, repoInfo)

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
				fileCount: countFiles(fileTree),
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
		const repoInfo = parseRepositoryUrl(url)
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
		return buildFileTree(data.tree)
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
		return fetchFileContent(repoInfo, filePath, (u) => this.makeApiRequest(u))
	}

	/**
	 * Make authenticated API request
	 */
	private async makeApiRequest(url: string): Promise<Response> {
		const response = await makeApiRequest(this.baseUrl, url, this.apiKey, { remaining: this.rateLimitRemaining, reset: this.rateLimitReset })
		return response
	}

	/**
	 * Build file tree from GitHub tree API response
	 */
	private buildFileTree(items: GitHubTree['tree']): FileTreeNode[] { return buildFileTree(items) }

	/**
	 * Format file tree as readable text
	 */
	private formatFileTree(nodes: FileTreeNode[], indent = ''): string { return formatFileTree(nodes, indent) }

	/**
	 * Format file size
	 */
	private formatFileSize(bytes: number): string { return formatFileSize(bytes) }

	/**
	 * Count total files in tree
	 */
	private countFiles(nodes: FileTreeNode[]): number { return countFiles(nodes) }

	/**
	 * Clean extracted content
	 */
	private cleanContent(content: string): string { return content.replace(/\0/g, '').replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim() }

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
	private extractImagesFromMarkdown(markdown: string, repoInfo: RepositoryInfo): string[] { return extractImagesFromMarkdown(markdown, repoInfo) }

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
