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
	// Fetch URL content first (CLI doesn't support URLs directly)
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Failed to fetch URL ${url}: ${response.status}`)
	}

	const buffer = Buffer.from(await response.arrayBuffer())
	const tempPath = join(tmpdir(), `markitdown-url-${Date.now()}.html`)

	try {
		await writeFile(tempPath, buffer)
		const markdown = await runMarkItDownCLI(tempPath)

		return {
			markdown,
			metadata: {
				url,
				markdown_length: markdown.length,
			},
		}
	} finally {
		await unlink(tempPath).catch(() => {})
	}
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
