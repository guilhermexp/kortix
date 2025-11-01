import { spawn } from "node:child_process"
import { unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { FILE_LIMITS } from "../config/constants"

// In production, use system Python configured via nixpacks
// In development, use local venv
const isProduction = process.env.NODE_ENV === "production"
const MARKITDOWN_PYTHON_PATH =
	process.env.MARKITDOWN_PYTHON_PATH ||
	(isProduction
		? "python3"
		: "/Users/guilhermevarela/Public/supermemory/apps/markitdown/.venv/bin/python")
const MARKITDOWN_VENV_PATH =
	process.env.MARKITDOWN_VENV_PATH ||
	(isProduction
		? ""
		: "/Users/guilhermevarela/Public/supermemory/apps/markitdown/.venv")

let markitdownAvailable: boolean | null = null

type MarkItDownResponse = {
	markdown: string
	metadata: {
		filename?: string
		title?: string
		size_bytes?: number
		markdown_length?: number
		url?: string
	}
}

async function runMarkItDownCLI(filePath: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const args = ["-m", "markitdown", filePath]
		// Only set VIRTUAL_ENV if we have a venv path (development)
		const env = MARKITDOWN_VENV_PATH
			? { ...process.env, VIRTUAL_ENV: MARKITDOWN_VENV_PATH }
			: process.env

		const child = spawn(MARKITDOWN_PYTHON_PATH, args, {
			timeout: FILE_LIMITS.MARKITDOWN_REQUEST_TIMEOUT_MS,
			env,
		})

		let stdout = ""
		let stderr = ""

		child.stdout.on("data", (data) => {
			stdout += data.toString()
		})

		child.stderr.on("data", (data) => {
			stderr += data.toString()
		})

		child.on("close", (code) => {
			if (code === 0) {
				resolve(stdout)
			} else {
				reject(
					new Error(
						`MarkItDown CLI failed with code ${code}: ${stderr || stdout}`,
					),
				)
			}
		})

		child.on("error", (error) => {
			reject(error)
		})
	})
}

/**
 * Helper function to implement retry with exponential backoff
 * Useful for handling rate limiting from YouTube and other services
 */
async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	options: {
		maxRetries?: number
		initialDelayMs?: number
		maxDelayMs?: number
		backoffMultiplier?: number
		shouldRetry?: (error: Error) => boolean
	} = {},
): Promise<T> {
	const {
		maxRetries = 3,
		initialDelayMs = 1000,
		maxDelayMs = 10000,
		backoffMultiplier = 2,
		shouldRetry = () => true,
	} = options

	let lastError: Error | null = null
	let delayMs = initialDelayMs

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn()
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))

			// Don't retry if we've exhausted attempts or if error is not retryable
			if (attempt === maxRetries || !shouldRetry(lastError)) {
				throw lastError
			}

			// Log retry attempt
			console.warn(
				`[MarkItDown] Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delayMs}ms: ${lastError.message}`,
			)

			// Wait before retrying
			await new Promise((resolve) => setTimeout(resolve, delayMs))

			// Increase delay for next attempt (exponential backoff)
			delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs)
		}
	}

	throw lastError || new Error("Retry failed with unknown error")
}

/**
 * Run MarkItDown via Python API (convert_url method)
 * This is specifically for URLs that need special handling like YouTube
 * Implements retry with exponential backoff for rate limiting
 */
async function runMarkItDownPythonAPI(url: string): Promise<MarkItDownResponse> {
	return new Promise((resolve, reject) => {
		const pythonScript = `
import json
from markitdown import MarkItDown

md = MarkItDown()
try:
    result = md.convert_url('${url.replace(/'/g, "\\'")}')
    output = {
        'markdown': result.text_content,
        'title': result.title if hasattr(result, 'title') else None,
        'success': True
    }
    print(json.dumps(output))
except Exception as e:
    output = {
        'success': False,
        'error': str(e)
    }
    print(json.dumps(output))
`

		const env = MARKITDOWN_VENV_PATH
			? { ...process.env, VIRTUAL_ENV: MARKITDOWN_VENV_PATH }
			: process.env

		const child = spawn(MARKITDOWN_PYTHON_PATH, ["-c", pythonScript], {
			timeout: FILE_LIMITS.MARKITDOWN_REQUEST_TIMEOUT_MS,
			env,
		})

		let stdout = ""
		let stderr = ""

		child.stdout.on("data", (data) => {
			stdout += data.toString()
		})

		child.stderr.on("data", (data) => {
			stderr += data.toString()
		})

		child.on("close", (code) => {
			try {
				// Find the last line with JSON (Python warnings may appear before)
				const lines = stdout.trim().split("\n")
				const jsonLine = lines[lines.length - 1]
				const result = JSON.parse(jsonLine)

				if (result.success) {
					resolve({
						markdown: result.markdown,
						metadata: {
							url,
							title: result.title,
							markdown_length: result.markdown.length,
						},
					})
				} else {
					reject(new Error(`MarkItDown Python API failed: ${result.error}`))
				}
			} catch (error) {
				reject(
					new Error(
						`Failed to parse MarkItDown output: ${error instanceof Error ? error.message : String(error)}\nOutput: ${stdout}\nStderr: ${stderr}`,
					),
				)
			}
		})

		child.on("error", (error) => {
			reject(error)
		})
	})
}

export async function convertWithMarkItDown(
	buffer: Buffer,
	filename?: string,
): Promise<MarkItDownResponse> {
	const tempPath = join(
		tmpdir(),
		`markitdown-${Date.now()}-${filename || "file"}`,
	)

	try {
		await writeFile(tempPath, buffer)
		const markdown = await runMarkItDownCLI(tempPath)

		return {
			markdown,
			metadata: {
				filename: filename || "document",
				size_bytes: buffer.length,
				markdown_length: markdown.length,
			},
		}
	} finally {
		await unlink(tempPath).catch(() => {})
	}
}

export async function convertUrlWithMarkItDown(
	url: string,
): Promise<MarkItDownResponse> {
	// Use Python API directly for URLs (supports YouTube transcripts, etc)
	console.log('[MarkItDown] Using convert_url() for:', url)

	// Implement retry with exponential backoff for rate limiting
	const result = await retryWithBackoff(
		() => runMarkItDownPythonAPI(url),
		{
			maxRetries: 2, // Total 3 attempts (initial + 2 retries)
			initialDelayMs: 2000, // Start with 2 second delay
			maxDelayMs: 8000, // Cap at 8 seconds
			backoffMultiplier: 2, // Double delay each retry
			shouldRetry: (error) => {
				// Retry on rate limiting, IP blocking, or network errors
				const errorMsg = error.message.toLowerCase()
				const isRateLimit = errorMsg.includes('429') ||
					errorMsg.includes('too many requests') ||
					errorMsg.includes('ipblocked') ||
					errorMsg.includes('rate limit')

				if (isRateLimit) {
					console.warn('[MarkItDown] Rate limit detected, will retry with backoff')
					return true
				}

				// Don't retry on other types of errors (e.g., video not found)
				return false
			}
		}
	)

	console.log('[MarkItDown] Result:', {
		chars: result.markdown.length,
		title: result.metadata.title,
		preview: result.markdown.substring(0, 100)
	})

	return result
}

export async function checkMarkItDownHealth(): Promise<boolean> {
	// Use cache if already checked
	if (markitdownAvailable !== null) {
		return markitdownAvailable
	}

	console.info(
		"MarkItDown health check: Testing with Python path:",
		MARKITDOWN_PYTHON_PATH,
	)

	try {
		// Test with a simple HTML file
		const testHtml =
			"<html><body><h1>Test</h1><p>MarkItDown is working</p></body></html>"
		const tempPath = join(tmpdir(), `markitdown-health-${Date.now()}.html`)

		await writeFile(tempPath, testHtml)
		const testResult = await runMarkItDownCLI(tempPath)
		await unlink(tempPath).catch(() => {})

		markitdownAvailable = testResult.length > 10
		console.info("MarkItDown health check:", {
			available: markitdownAvailable,
			resultLength: testResult.length,
		})
		return markitdownAvailable
	} catch (error) {
		console.error("MarkItDown health check failed:", error)
		markitdownAvailable = false
		return false
	}
}
