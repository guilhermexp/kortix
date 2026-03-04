import { spawn } from "node:child_process"
import { unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { FILE_LIMITS } from "../config/constants"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const isProduction = process.env.NODE_ENV === "production"
const MARKITDOWN_PYTHON_PATH =
	process.env.MARKITDOWN_PYTHON_PATH ||
	(isProduction
		? "python3"
		: resolve(__dirname, "../../../markitdown/.venv/bin/python"))
const MARKITDOWN_VENV_PATH =
	process.env.MARKITDOWN_VENV_PATH ||
	(isProduction ? "" : resolve(__dirname, "../../../markitdown/.venv"))

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
