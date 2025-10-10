/**
 * Repository Ingestion Service
 * Fetches and processes Git repositories for memory storage
 */

import { FILE_LIMITS } from "../config/constants"

interface RepositoryFile {
	path: string
	content: string
	size: number
}

interface RepositoryIngestResult {
	summary: string
	tree: string
	content: string
	stats: {
		totalFiles: number
		totalSize: number
		estimatedTokens: number
	}
}

const GITHUB_API = "https://api.github.com"

/**
 * Parse GitHub URL to extract owner and repo
 */
function parseGitHubUrl(url: string): { owner: string; repo: string; branch?: string } | null {
	try {
		const urlObj = new URL(url)
		if (!urlObj.hostname.includes("github.com")) {
			return null
		}

		const parts = urlObj.pathname.split("/").filter(Boolean)
		if (parts.length < 2) {
			return null
		}

		const [owner, repo] = parts
		// Remove .git extension if present
		const cleanRepo = repo.replace(/\.git$/, "")

		return { owner, repo: cleanRepo }
	} catch {
		return null
	}
}

/**
 * Fetch repository tree from GitHub API
 */
async function fetchRepositoryTree(
	owner: string,
	repo: string,
	branch = "main",
	token?: string,
): Promise<any[]> {
	const headers: HeadersInit = {
		Accept: "application/vnd.github.v3+json",
	}

	if (token) {
		headers.Authorization = `Bearer ${token}`
	}

	// Try main branch first, fallback to master
	let url = `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
	let response = await fetch(url, { headers })

	if (!response.ok && branch === "main") {
		// Try master branch
		url = `${GITHUB_API}/repos/${owner}/${repo}/git/trees/master?recursive=1`
		response = await fetch(url, { headers })
	}

	if (!response.ok) {
		throw new Error(`Failed to fetch repository: ${response.statusText}`)
	}

	const data = await response.json()
	return data.tree || []
}

/**
 * Sanitize text to remove invalid Unicode surrogate pairs
 */
function sanitizeUnicode(text: string): string {
	// Replace invalid surrogate pairs with replacement character
	return text.replace(/[\uD800-\uDFFF]/g, (match) => {
		// If it's a valid surrogate pair, keep it
		const code = match.charCodeAt(0)
		if (code >= 0xD800 && code <= 0xDBFF) {
			// High surrogate - check if followed by low surrogate
			const nextChar = text[text.indexOf(match) + 1]
			if (nextChar) {
				const nextCode = nextChar.charCodeAt(0)
				if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
					return match // Valid pair
				}
			}
		}
		// Invalid surrogate, replace with safe character
		return '\uFFFD' // Unicode replacement character
	})
}

/**
 * Fetch file content from GitHub
 */
async function fetchFileContent(
	owner: string,
	repo: string,
	path: string,
	token?: string,
): Promise<string | null> {
	const headers: HeadersInit = {
		Accept: "application/vnd.github.v3.raw",
	}

	if (token) {
		headers.Authorization = `Bearer ${token}`
	}

	const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`
	const response = await fetch(url, { headers })

	if (!response.ok) {
		return null
	}

	const text = await response.text()
	return sanitizeUnicode(text)
}

/**
 * Check if file should be included based on extension and path
 */
function shouldIncludeFile(path: string): boolean {
	// Exclude common non-code files
	const excludePatterns = [
		/node_modules/,
		/\.git\//,
		/\.next/,
		/dist\//,
		/build\//,
		/\.cache/,
		/coverage/,
		/\.DS_Store/,
		/\.env/,
		/package-lock\.json/,
		/yarn\.lock/,
		/pnpm-lock\.yaml/,
		/bun\.lockb/,
		/\.png$/,
		/\.jpg$/,
		/\.jpeg$/,
		/\.gif$/,
		/\.svg$/,
		/\.ico$/,
		/\.woff/,
		/\.ttf$/,
		/\.eot$/,
	]

	return !excludePatterns.some((pattern) => pattern.test(path))
}

/**
 * Generate repository tree structure
 */
function generateTree(files: RepositoryFile[]): string {
	const tree: string[] = []
	tree.push("Repository Structure:")
	tree.push("")

	// Group by directory
	const dirs = new Set<string>()
	files.forEach((file) => {
		const parts = file.path.split("/")
		for (let i = 1; i < parts.length; i++) {
			dirs.add(parts.slice(0, i).join("/"))
		}
	})

	// Sort and display
	const sortedDirs = Array.from(dirs).sort()
	sortedDirs.forEach((dir) => {
		const depth = dir.split("/").length - 1
		tree.push(`${"  ".repeat(depth)}📁 ${dir.split("/").pop()}`)
	})

	tree.push("")
	tree.push("Files:")
	files.forEach((file) => {
		const depth = file.path.split("/").length - 1
		tree.push(`${"  ".repeat(depth)}📄 ${file.path.split("/").pop()} (${file.size} bytes)`)
	})

	return tree.join("\n")
}

/**
 * Generate summary of repository
 */
function generateSummary(owner: string, repo: string, stats: any): string {
	return `Repository: ${owner}/${repo}

Statistics:
- Total Files: ${stats.totalFiles}
- Total Size: ${(stats.totalSize / 1024).toFixed(2)} KB
- Estimated Tokens: ~${stats.estimatedTokens}

This repository has been ingested and processed for AI/LLM context.`
}

/**
 * Ingest a GitHub repository
 */
export async function ingestRepository(
	repoUrl: string,
	githubToken?: string,
): Promise<RepositoryIngestResult> {
	// Parse URL
	const parsed = parseGitHubUrl(repoUrl)
	if (!parsed) {
		throw new Error("Invalid GitHub URL")
	}

	const { owner, repo } = parsed

	// Fetch repository tree
	const tree = await fetchRepositoryTree(owner, repo, "main", githubToken)

	// Filter files
	const filesToFetch = tree
		.filter((item: any) => item.type === "blob" && shouldIncludeFile(item.path))
		.filter((item: any) => item.size <= FILE_LIMITS.MAX_FILE_SIZE_BYTES)

	// Limit number of files to prevent excessive API calls
	const limitedFiles = filesToFetch.slice(0, 100)

	// Fetch file contents
	const files: RepositoryFile[] = []
	let totalSize = 0

	for (const item of limitedFiles) {
		if (totalSize >= FILE_LIMITS.MAX_TOTAL_REPO_SIZE_BYTES) {
			break
		}

		const content = await fetchFileContent(owner, repo, item.path, githubToken)
		if (content) {
			files.push({
				path: item.path,
				content,
				size: item.size,
			})
			totalSize += item.size
		}

		// Add small delay to avoid rate limiting
		await new Promise((resolve) => setTimeout(resolve, 100))
	}

	// Generate content
	const contentParts: string[] = []
	files.forEach((file) => {
		contentParts.push(`\n## File: ${file.path}\n`)
		contentParts.push("```")
		contentParts.push(file.content)
		contentParts.push("```\n")
	})

	const content = contentParts.join("\n")

	// Calculate stats
	const stats = {
		totalFiles: files.length,
		totalSize,
		estimatedTokens: Math.ceil(content.length / 4), // Rough estimate: 1 token ≈ 4 chars
	}

	return {
		summary: generateSummary(owner, repo, stats),
		tree: generateTree(files),
		content,
		stats,
	}
}
