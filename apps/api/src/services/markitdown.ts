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
		: "/Users/guilhermevarela/Documents/Projetos/kortix/apps/markitdown/.venv/bin/python")
const MARKITDOWN_VENV_PATH =
	process.env.MARKITDOWN_VENV_PATH ||
	(isProduction
		? ""
		: "/Users/guilhermevarela/Documents/Projetos/kortix/apps/markitdown/.venv")

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
 * Validate MarkItDown result to ensure we got actual content, not just HTML footer
 * YouTube transcripts should be substantial (>500 chars for most videos)
 */
function isValidYouTubeTranscript(markdown: string, url: string): boolean {
	// Check if URL is YouTube
	const isYouTube =
		url.toLowerCase().includes("youtube.com") ||
		url.toLowerCase().includes("youtu.be")
	if (!isYouTube) return true // Not YouTube, skip validation

	// Minimum content length threshold
	// Allow shorter transcripts; some videos have brief captions
	const MIN_VALID_LENGTH = 300
	if (markdown.length < MIN_VALID_LENGTH) {
		console.warn(
			`[MarkItDown] YouTube result too short: ${markdown.length} chars (expected >${MIN_VALID_LENGTH})`,
		)
		return false
	}

	// Check for common footer patterns that indicate failed extraction
	const footerPatterns = [
		"[Sobre](https://www.youtube.com/about/)",
		"[Imprensa](https://www.youtube.com/about/press/)",
		"© 2025 Google LLC",
		"[Direitos autorais](https://www.youtube.com/about/copyright/)",
	]

	// Consider it "footer-only" only for very short results
	const hasOnlyFooter =
		footerPatterns.some((pattern) => markdown.includes(pattern)) &&
		markdown.length < 700

	if (hasOnlyFooter) {
		console.warn(
			"[MarkItDown] YouTube result contains only footer, no actual transcript",
		)
		return false
	}

	return true
}

/**
 * Run MarkItDown via Python API (convert_url method)
 * This is specifically for URLs that need special handling like YouTube
 * Implements retry with exponential backoff for rate limiting
 *
 * For YouTube videos, we use youtube-transcript-api directly since
 * MarkItDown 0.0.2 uses an incompatible old API version
 */
async function runMarkItDownPythonAPI(
	url: string,
): Promise<MarkItDownResponse> {
	return new Promise((resolve, reject) => {
		// Check if it's a YouTube URL
		const isYouTube =
			url.toLowerCase().includes("youtube.com") ||
			url.toLowerCase().includes("youtu.be")

		const pythonScript = isYouTube
			? `
import json
import re
import requests
from youtube_transcript_api import YouTubeTranscriptApi

url = '${url.replace(/'/g, "\\'")}'

def extract_video_id(url):
    patterns = [
        r'(?:youtube\\.com/watch\\?v=|youtu\\.be/|youtube\\.com/embed/)([^&\\n?#]+)',
        r'youtube\\.com/shorts/([^&\\n?#]+)',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def get_video_title(url):
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        resp = requests.get(url, headers=headers, timeout=10)
        html = resp.text
        # Try og:title
        match = re.search(r'<meta\\s+property=["\\'']og:title["\\'']\\s+content=["\\'']([^"\\'\\']+)["\\'']', html, re.I)
        if match:
            return match.group(1)
        # Try title tag
        match = re.search(r'<title>([^<]+)</title>', html, re.I)
        if match:
            return match.group(1).replace(' - YouTube', '').strip()
    except:
        pass
    return None

try:
    video_id = extract_video_id(url)
    if not video_id:
        raise ValueError('Could not extract video ID from URL')

    api = YouTubeTranscriptApi()
    transcript = api.fetch(video_id)
    full_text = ' '.join([e.text for e in transcript])
    title = get_video_title(url)

    markdown = f"# YouTube\\n\\n"
    if title:
        markdown += f"## {title}\\n\\n"
    markdown += f"### Transcript\\n\\n{full_text}"

    output = {
        'markdown': markdown,
        'title': title,
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
			: `
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

		child.on("close", (_code) => {
			try {
				// Find the last line with JSON (Python warnings may appear before)
				const lines = stdout.trim().split("\n")
				const jsonLine = lines[lines.length - 1]
				const result = JSON.parse(jsonLine)

				if (result.success) {
					// Validate content before resolving
					if (!isValidYouTubeTranscript(result.markdown, url)) {
						reject(
							new Error(
								"MarkItDown returned invalid YouTube transcript (too short or footer only). " +
									`Got ${result.markdown.length} chars, expected >500. ` +
									"Video may not have captions or transcript available.",
							),
						)
						return
					}

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

/**
 * Discover available transcript languages for a YouTube video by querying
 * the timedtext list API. Returns an array of language codes (e.g. ["en", "pt", "es"]).
 */
async function fetchAvailableTranscriptLanguages(
	videoId: string,
): Promise<string[]> {
	try {
		const url = `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`
		const res = await fetch(url, {
			headers: { "user-agent": "Mozilla/5.0" },
			signal: AbortSignal.timeout(5000),
		})
		if (!res.ok) return []
		const xml = await res.text()
		// Parse lang_code attributes from <track> elements
		const langs: string[] = []
		const trackRegex = /<track[^>]+lang_code="([^"]+)"/g
		let match: RegExpExecArray | null
		while ((match = trackRegex.exec(xml)) !== null) {
			if (match[1] && !langs.includes(match[1])) {
				langs.push(match[1])
			}
		}
		return langs
	} catch {
		return []
	}
}

function extractYouTubeVideoIdFromUrl(url: string): string | null {
	try {
		const u = new URL(url)
		if (!u.hostname.includes("youtube.com") && !u.hostname.includes("youtu.be"))
			return null
		if (u.hostname.includes("youtu.be")) {
			const id = u.pathname.replace(/^\//, "")
			return id || null
		}
		const id = u.searchParams.get("v")
		return id || null
	} catch {
		return null
	}
}

function htmlDecode(input: string): string {
	return input
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
}

async function fetchYouTubeTimedTextVtt(
	videoId: string,
	lang: string,
	asr = false,
): Promise<string | null> {
	const base = "https://www.youtube.com/api/timedtext"
	const params = new URLSearchParams({ v: videoId, lang, fmt: "vtt" })
	if (asr) params.set("kind", "asr")
	const url = `${base}?${params.toString()}`
	try {
		const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } })
		if (!res.ok) return null
		const vtt = await res.text()
		// Parse VTT to plain text: drop headers, timestamps, cues numbers
		const lines = vtt.split(/\r?\n/)
		const textLines: string[] = []
		for (const line of lines) {
			const l = line.trim()
			if (!l) continue
			if (l.startsWith("WEBVTT")) continue
			if (/^\d+$/.test(l)) continue
			if (/^\d{2}:\d{2}:\d{2}\.\d{3} -->/.test(l)) continue
			textLines.push(l)
		}
		const text = htmlDecode(textLines.join(" ")).replace(/\s+/g, " ").trim()
		return text.length > 0 ? text : null
	} catch {
		return null
	}
}

export async function fetchYouTubeTranscriptFallback(
	videoUrl: string,
): Promise<MarkItDownResponse | null> {
	const videoId = extractYouTubeVideoIdFromUrl(videoUrl)
	if (!videoId) return null

	// Extract title from YouTube page metadata
	let title: string | undefined
	try {
		const response = await fetch(videoUrl, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
			},
		})
		const html = await response.text()

		// Try multiple extraction methods
		// 1. og:title meta tag
		const ogTitleMatch = html.match(
			/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
		)
		if (ogTitleMatch) {
			title = ogTitleMatch[1]
		} else {
			// 2. twitter:title meta tag
			const twitterTitleMatch = html.match(
				/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i,
			)
			if (twitterTitleMatch) {
				title = twitterTitleMatch[1]
			} else {
				// 3. <title> tag
				const titleMatch = html.match(/<title>([^<]+)<\/title>/i)
				if (titleMatch) {
					title = titleMatch[1].replace(/ - YouTube$/, "").trim()
				}
			}
		}
	} catch (error) {
		console.warn(
			"[fetchYouTubeTranscriptFallback] Failed to extract title:",
			error,
		)
	}

	// Step 1: Try hardcoded languages (fast path)
	const hardcodedLangs = ["en", "en-US", "pt", "pt-BR"]
	for (const lang of hardcodedLangs) {
		// Try official + ASR
		const variants = [false, true]
		for (const asr of variants) {
			const text = await fetchYouTubeTimedTextVtt(videoId, lang, asr)
			if (text && text.length >= 100) {
				return {
					markdown: text,
					metadata: {
						url: videoUrl,
						title,
						markdown_length: text.length,
					},
				}
			}
		}
	}

	// Step 2: Discover available languages and try them
	const discoveredLangs = await fetchAvailableTranscriptLanguages(videoId)
	const newLangs = discoveredLangs.filter((l) => !hardcodedLangs.includes(l))
	if (newLangs.length > 0) {
		console.log(
			`[fetchYouTubeTranscriptFallback] Discovered languages: ${newLangs.join(", ")}`,
		)
		for (const lang of newLangs) {
			const variants = [false, true]
			for (const asr of variants) {
				const text = await fetchYouTubeTimedTextVtt(videoId, lang, asr)
				if (text && text.length >= 100) {
					return {
						markdown: text,
						metadata: {
							url: videoUrl,
							title,
							markdown_length: text.length,
						},
					}
				}
			}
		}
	}

	// Step 3: Final fallback - use Python youtube-transcript-api
	try {
		console.log(
			"[fetchYouTubeTranscriptFallback] Trying Python youtube-transcript-api fallback",
		)
		const pythonResult = await runMarkItDownPythonAPI(videoUrl)
		if (
			pythonResult?.markdown &&
			pythonResult.markdown.length >= 100
		) {
			console.log(
				"[fetchYouTubeTranscriptFallback] Python fallback succeeded:",
				pythonResult.markdown.length,
				"chars",
			)
			return {
				markdown: pythonResult.markdown,
				metadata: {
					url: videoUrl,
					title: pythonResult.metadata.title || title,
					markdown_length: pythonResult.markdown.length,
				},
			}
		}
	} catch (error) {
		console.warn(
			"[fetchYouTubeTranscriptFallback] Python fallback failed:",
			error instanceof Error ? error.message : String(error),
		)
	}

	// No transcript found from any source - return null
	// Title is already extracted by extractMetadata() in youtube-extractor.ts
	// and formatMetadataAsContent() handles the no-transcript case
	console.log(
		"[fetchYouTubeTranscriptFallback] No transcript found for video:",
		videoId,
	)
	return null
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
	console.log("[MarkItDown] Using convert_url() for:", url)

	// Implement retry with exponential backoff for rate limiting
	try {
		const result = await retryWithBackoff(() => runMarkItDownPythonAPI(url), {
			maxRetries: 2,
			initialDelayMs: 2000,
			maxDelayMs: 8000,
			backoffMultiplier: 2,
			shouldRetry: (error) => {
				const errorMsg = error.message.toLowerCase()
				const isRateLimit =
					errorMsg.includes("429") ||
					errorMsg.includes("too many requests") ||
					errorMsg.includes("ipblocked") ||
					errorMsg.includes("rate limit") ||
					errorMsg.includes("invalid youtube transcript") ||
					errorMsg.includes("likely rate limited")
				return isRateLimit
			},
		})

		console.log("[MarkItDown] Result:", {
			chars: result.markdown.length,
			title: result.metadata.title,
			preview: result.markdown.substring(0, 100),
		})

		return result
	} catch (err) {
		// Fallback to YouTube timedtext if applicable
		console.warn("MarkItDown URL conversion failed warn:", err)
		const fallback = await fetchYouTubeTranscriptFallback(url)
		if (fallback) {
			console.log("[MarkItDown] Fallback transcript (timedtext) used:", {
				chars: fallback.markdown.length,
				preview: fallback.markdown.substring(0, 80),
			})
			return fallback
		}
		throw err
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
