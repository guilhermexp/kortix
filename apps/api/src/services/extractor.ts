import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"
import pdfParse from "pdf-parse/lib/pdf-parse.js"
import { env } from "../env"
import { convertUrlWithFirecrawl } from "./firecrawl"
import { summarizeBinaryWithGemini } from "./gemini-files"
import {
	checkMarkItDownHealth,
	convertUrlWithMarkItDown,
	convertWithMarkItDown,
} from "./markitdown"
import { ingestRepository } from "./repository-ingest"
import { summarizeYoutubeVideo } from "./summarizer"

const DEFAULT_USER_AGENT = "SupermemorySelfHosted/1.0 (+self-hosted extractor)"

export type ExtractionInput = {
	originalContent?: string | null
	url?: string | null
	type?: string | null
	metadata?: Record<string, unknown> | null
}

export type ExtractionResult = {
	text: string
	title?: string | null
	source?: string | null
	url?: string | null
	contentType?: string | null
	raw?: Record<string, unknown> | null
	wordCount: number
}

function isProbablyUrl(value: string | null | undefined): value is string {
	if (!value) return false
	if (!/^https?:\/\//i.test(value)) return false
	try {
		new URL(value)
		return true
	} catch {
		return false
	}
}

function sanitiseText(value: string): string {
	return value.replaceAll("\0", "").replace(/\s+/g, " ").trim()
}

function countWords(value: string): number {
	const normalised = value.trim()
	if (!normalised) return 0
	return normalised.split(/\s+/).length
}

function readRecordString(value: unknown, key: string): string | null {
	if (!value || typeof value !== "object") {
		return null
	}

	const record = value as Record<string, unknown>
	const raw = record[key]
	if (typeof raw !== "string") {
		return null
	}

	const trimmed = raw.trim()
	return trimmed.length > 0 ? trimmed : null
}

/**
 * Check if URL is from GitHub
 */
function isGitHubUrl(url?: string): boolean {
	if (!url) return false
	try {
		const parsed = new URL(url)
		return parsed.hostname.toLowerCase().includes("github.com")
	} catch {
		return false
	}
}

/**
 * Remove common UI noise from extracted content (navigation, alerts, notifications, etc.)
 */
function cleanExtractedContent(text: string, url?: string): string {
	let cleaned = text

	// Common UI patterns to remove (case-insensitive, multiline)
	const uiNoisePatterns = [
		// GitHub-specific UI elements
		/\[Skip to content\]\([^)]*\)/gi,
		/You signed (in|out) (with|in) another (tab|window)/gi,
		/(Reload|to refresh) (to refresh )?your session\.?/gi,
		/You switched accounts on another (tab|window)/gi,
		/Dismiss alert\s*\{\{?\s*message\s*\}\}?/gi,
		/You must be signed in to (change notification settings|make or propose changes)/gi,
		/Notifications?\s*You must be signed in/gi,

		// Star/Fork badges with backslash escapes (e.g., "Star\ 2.9k")
		/\b(Star|Fork|Watch|Unwatch)(ing)?\\?\s+[\d.,]+[kKmMbB]?/g,
		/[\d.,]+[kKmMbB]?\\?\s+(stars?|forks?|watching)/gi,

		// Navigation and action buttons
		/\[Reload\]\([^)]*\)/gi,
		/\[Notifications?\]\([^)]*\)/gi,
		/Go to (file|Branches|Tags)/gi,

		// Cookie/privacy banners
		/This (site|website) uses cookies/gi,
		/By (clicking|continuing|using) .{0,30}(accept|agree|consent)/gi,

		// Generic navigation
		/\[Skip to main content\]/gi,
		/\[Skip navigation\]/gi,

		// GitHub file tree and metadata
		/##\s*(Collapse|Expand) file tree/gi,
		/##\s*Files\s+(main|master|[\w-]+)\s+Search this repository/gi,
		/Copy (path|file path)/gi,
		/More file actions/gi,
		/(Latest|View) commit ##/gi,
		/History\s+View commit history for this file/gi,
		/\d+\.\d+\s*MB\s*\/\s*##\s*\d+[_\w]+\.[\w]+\s*Top/gi,
		/File metadata and controls/gi,
		/\d+\.\d+\s*MB\s*Download raw file/gi,
		/More edit options/gi,
		/Edit and raw actions/gi,
		/\[\!?\[.*?\]\([^)]*\)\]\([^)]*\)/g, // Nested markdown links
	]

	for (const pattern of uiNoisePatterns) {
		cleaned = cleaned.replace(pattern, "")
	}

	// GitHub-specific: remove file path references like "or window. 302ai/ 302_ai_ai_model_judge Public -"
	if (isGitHubUrl(url)) {
		// Remove repeated "or window. to refresh your session" patterns
		cleaned = cleaned.replace(
			/(or window\.\s*)?(to refresh your session\.?)+/gi,
			"",
		)

		// Remove GitHub file paths and repo references
		cleaned = cleaned.replace(
			/\b(or window\.)?\s*[\w-]+\/[\w_-]+\s+(Public|Private)\s*-?\s*/g,
			"",
		)

		// Remove "## Collapse file tree ## Files main/master"
		cleaned = cleaned.replace(/##\s*Collapse.*?##\s*Files\s+\w+/g, "")

		// Remove file path patterns like "/ # filename.ext"
		cleaned = cleaned.replace(/\/\s*#\s*[\w._-]+\s*/g, "")

		// Remove "Search this repository"
		cleaned = cleaned.replace(/Search this repository\s*/gi, "")

		// Remove commit/history references
		cleaned = cleaned.replace(/##\s*Latest commit\s*##\s*History/g, "")
		cleaned = cleaned.replace(/History\s+View commit history/gi, "")

		// Remove file size patterns like "1.07 MB /"
		cleaned = cleaned.replace(/\d+\.\d+\s*(MB|KB|GB)\s*\/\s*/gi, "")

		// Remove download/raw file patterns
		cleaned = cleaned.replace(/Download raw file\s*/gi, "")

		// Remove "You can't perform that action at this time"
		cleaned = cleaned.replace(/You can't perform that action at this time\.?/gi, "")

		// Remove URL patterns in parentheses that are GitHub links
		cleaned = cleaned.replace(
			/\(https?:\/\/github\.com\/[^)]+\?[^)]*\)/g,
			"",
		)

		// Remove version badges
		cleaned = cleaned.replace(/\bv\d+\s*$/gm, "")
	}

	// Remove empty markdown links []() or [text]()
	cleaned = cleaned.replace(/\[[^\]]*\]\(\s*\)/g, "")

	// Remove excessive whitespace and empty lines
	cleaned = cleaned
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")

	return cleaned.trim()
}

function isYouTubeUrl(url: string): boolean {
	try {
		const parsed = new URL(url)
		const host = parsed.hostname.toLowerCase()
		return host.includes("youtube.com") || host.includes("youtu.be")
	} catch {
		return false
	}
}

function extractYouTubeVideoId(url: string): string {
	try {
		const parsed = new URL(url)
		if (parsed.hostname.includes("youtu.be")) {
			return parsed.pathname.slice(1).split("?")[0]
		}
		return parsed.searchParams.get("v") || "unknown"
	} catch {
		return "unknown"
	}
}

function inferFilenameFromUrl(url: string, defaultName = "document"): string {
	try {
		const pathname = new URL(url).pathname
		const name = pathname.split("/").filter(Boolean).pop()
		return name ?? defaultName
	} catch {
		return defaultName
	}
}

/**
 * Check if content type should use Gemini for processing
 * NOTE: Office documents are handled by MarkItDown first (see shouldUseMarkItDown)
 * This is only used when MarkItDown is unavailable or fails
 */
function shouldUseGemini(mime: string) {
	const m = mime.toLowerCase()
	// Media files - Gemini is best for these
	if (m.startsWith("image/")) return true
	if (m.startsWith("audio/")) return true
	if (m.startsWith("video/")) return true

	// Office documents - only if MarkItDown is not available
	// This acts as a fallback
	if (m.includes("officedocument")) return true
	if (m.includes("msword") || m.includes("mspowerpoint") || m.includes("excel"))
		return true
	if (m.includes("application/epub+zip")) return true

	return false
}

async function extractFromHtml(html: string, url?: string) {
	const dom = new JSDOM(html, { url })
	const document = dom.window.document
	const reader = new Readability(document)
	const article = reader.parse()
	
	// Extract Open Graph metadata
	const ogImage = 
		document.querySelector('meta[property="og:image"]')?.getAttribute('content') ??
		document.querySelector('meta[name="og:image"]')?.getAttribute('content') ??
		document.querySelector('meta[property="twitter:image"]')?.getAttribute('content') ??
		document.querySelector('meta[name="twitter:image"]')?.getAttribute('content')
	
	const ogTitle = 
		document.querySelector('meta[property="og:title"]')?.getAttribute('content') ??
		document.querySelector('meta[name="og:title"]')?.getAttribute('content')
	
	const ogDescription = 
		document.querySelector('meta[property="og:description"]')?.getAttribute('content') ??
		document.querySelector('meta[name="og:description"]')?.getAttribute('content') ??
		document.querySelector('meta[name="description"]')?.getAttribute('content')
	
	// Extract favicon as fallback
	const favicon = 
		document.querySelector('link[rel="icon"]')?.getAttribute('href') ??
		document.querySelector('link[rel="shortcut icon"]')?.getAttribute('href') ??
		document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')
	
	// Build metadata object
	const metadata: Record<string, unknown> = {}
	if (ogImage) metadata.ogImage = ogImage
	if (ogTitle) metadata.ogTitle = ogTitle
	if (ogDescription) metadata.ogDescription = ogDescription
	if (favicon) metadata.favicon = favicon
	
	if (article?.textContent && article.textContent.trim().length > 100) {
		const cleanedText = cleanExtractedContent(
			sanitiseText(article.textContent),
			url,
		)
		return {
			text: cleanedText,
			title: article.title ?? ogTitle ?? document.title ?? null,
			raw: {
				byline: article.byline,
				length: article.length,
				excerpt: article.excerpt,
				...metadata,
			},
		}
	}
	const fallback = document.body?.textContent ?? ""
	const cleanedFallback = cleanExtractedContent(sanitiseText(fallback), url)
	return {
		text: cleanedFallback,
		title: ogTitle ?? document.title ?? null,
		raw: Object.keys(metadata).length > 0 ? metadata : null,
	}
}

async function extractFromPdf(buffer: Buffer) {
	const { text, info, metadata } = await pdfParse(buffer)
	const pdfTitle =
		readRecordString(metadata, "title") ??
		readRecordString(metadata, "Title") ??
		readRecordString(info, "Title")
	const rawData: Record<string, unknown> = { info, metadata }
	return {
		text: sanitiseText(text ?? ""),
		title: pdfTitle,
		raw: rawData,
	}
}

/**
 * Check if MarkItDown should be prioritized for this content type
 * MarkItDown is better for:
 * - Office documents (DOCX, PPTX, XLSX)
 * - PDFs (tries first, falls back to Gemini if needed)
 *
 * Returns true if we should TRY MarkItDown first
 * Falls back to Gemini if MarkItDown fails or is unavailable
 */
type MarkItDownRoutingOptions = {
	includeMedia?: boolean
	includeMarkdown?: boolean
	includeArchives?: boolean
}

function shouldTryMarkItDownFirst(
	contentType: string,
	filename?: string,
	options: MarkItDownRoutingOptions = {},
): boolean {
	const lower = contentType.toLowerCase()
	const lowerFilename = filename?.toLowerCase() ?? ""
	const includeMedia = options.includeMedia ?? false
	const includeMarkdown = options.includeMarkdown ?? false
	const includeArchives = options.includeArchives ?? false

	// Office documents - MarkItDown excels at these
	if (
		lower.includes("officedocument") ||
		lower.includes("msword") ||
		lower.includes("ms-excel") ||
		lower.includes("ms-powerpoint") ||
		lower.includes("spreadsheetml") ||
		lower.includes("presentationml") ||
		lower.includes("wordprocessingml") ||
		lower.includes("excel") ||
		lower.includes("spreadsheet") ||
		lowerFilename.endsWith(".doc") ||
		lowerFilename.endsWith(".docx") ||
		lowerFilename.endsWith(".ppt") ||
		lowerFilename.endsWith(".pptx") ||
		lowerFilename.endsWith(".xls") ||
		lowerFilename.endsWith(".xlsx")
	) {
		return true
	}

	// PDFs - try MarkItDown first, Gemini as fallback for complex tables
	if (lower.includes("pdf")) {
		return true
	}

	// Audio & Video - leverage MarkItDown transcription capabilities first
	if (
		includeMedia &&
		(lower.startsWith("audio/") || lower.startsWith("video/"))
	) {
		return true
	}

	// Markdown sources should round-trip through MarkItDown
	if (
		includeMarkdown &&
		(lower.includes("markdown") ||
			lowerFilename.endsWith(".md") ||
			lowerFilename.endsWith(".markdown"))
	) {
		return true
	}

	// EPUB & ZIP containers
	if (
		includeArchives &&
		(lower.includes("epub") ||
			lower.includes("zip") ||
			lowerFilename.endsWith(".epub") ||
			lowerFilename.endsWith(".zip"))
	) {
		return true
	}

	return false
}

async function tryMarkItDownOnBuffer(buffer: Buffer, filename: string) {
	const healthy = await checkMarkItDownHealth()
	if (!healthy) return null

	try {
		const result = await convertWithMarkItDown(buffer, filename)
		if (!result?.markdown) return null
		return result
	} catch (error) {
		console.warn("MarkItDown failed for uploaded buffer", error)
		return null
	}
}

async function tryMarkItDownOnUrl(url: string) {
	const healthy = await checkMarkItDownHealth()
	if (!healthy) return null

	try {
		const result = await convertUrlWithMarkItDown(url)
		if (!result?.markdown) return null
		return result
	} catch (error) {
		console.warn("MarkItDown URL conversion failed", error)
		return null
	}
}

export async function extractDocumentContent(
	input: ExtractionInput,
): Promise<ExtractionResult> {
	// Check if this is a GitHub repository
	const metadataType = readRecordString(input.metadata, "type")
	if (metadataType === "repository" || input.type === "repository") {
		const repoUrl = input.url ?? input.originalContent ?? ""
		if (repoUrl.includes("github.com")) {
			return await extractFromRepository(repoUrl)
		}
	}

	const probableUrl = isProbablyUrl(
		input.url ?? input.originalContent ?? undefined,
	)
		? (input.url ?? input.originalContent ?? undefined)
		: undefined

	const originalFallback = sanitiseText(input.originalContent ?? "")
	const metadataTitle = readRecordString(input.metadata, "title")
	const metadataSource = readRecordString(input.metadata, "source")
	const metadataFilename = readRecordString(input.metadata, "filename")

	const dataUrlMatch = input.originalContent?.match(
		/^data:([^;]+);base64,(.+)$/,
	)
	if (dataUrlMatch) {
		const [, mimeType, base64Data] = dataUrlMatch
		const buffer = Buffer.from(base64Data, "base64")
		const filename = metadataFilename ?? "uploaded-file"

		if (
			mimeType.startsWith("text/") ||
			[
				"application/json",
				"application/xml",
				"application/yaml",
				"application/x-yaml",
			].includes(mimeType)
		) {
			const decoded = buffer.toString("utf-8")
			if (mimeType.includes("html")) {
				const htmlResult = await extractFromHtml(
					decoded,
					input.url ?? undefined,
				)
				const text = sanitiseText(htmlResult.text)
				return {
					text,
					title: htmlResult.title ?? metadataTitle ?? filename,
					source: "upload",
					url: input.url ?? null,
					contentType: mimeType,
					raw: {
						...htmlResult.raw,
						upload: { filename, mimeType, size: buffer.length },
					},
					wordCount: countWords(text),
				}
			}

			const cleaned = cleanExtractedContent(decoded)
			const text = sanitiseText(cleaned)
			return {
				text,
				title: metadataTitle ?? filename,
				source: "upload",
				url: input.url ?? null,
				contentType: mimeType,
				raw: { upload: { filename, mimeType, size: buffer.length } },
				wordCount: countWords(text),
			}
		}

		if (
			shouldTryMarkItDownFirst(mimeType, filename, {
				includeMedia: true,
				includeMarkdown: true,
				includeArchives: true,
			})
		) {
			const markitdownResult = await tryMarkItDownOnBuffer(buffer, filename)
			if (markitdownResult) {
				const markdown = cleanExtractedContent(markitdownResult.markdown)
				const text = sanitiseText(markdown) || originalFallback
				const markitdownTitle = readRecordString(
					markitdownResult.metadata,
					"title",
				)

				if (text && text.length > 0) {
					return {
						text,
						title: markitdownTitle ?? metadataTitle ?? filename,
						source: "markitdown",
						url: null,
						contentType: "text/markdown",
						raw: {
							markitdown: markitdownResult.metadata,
							upload: { filename, mimeType, size: buffer.length },
						},
						wordCount: countWords(text),
					}
				}
			}
		}

		if (shouldUseGemini(mimeType)) {
			const geminiResult = await summarizeBinaryWithGemini(
				buffer,
				mimeType,
				filename,
			)
			const text = sanitiseText(geminiResult.text || "") || originalFallback

			return {
				text,
				title: metadataTitle ?? filename,
				source: mimeType,
				url: null,
				contentType: mimeType,
				raw: {
					...geminiResult.metadata,
					upload: { filename, mimeType, size: buffer.length },
				},
				wordCount: countWords(text),
			}
		}

		return {
			text: `Uploaded file: ${filename} (${mimeType}, ${buffer.length} bytes)`,
			title: filename,
			source: "upload",
			url: null,
			contentType: mimeType,
			raw: { upload: { filename, mimeType, size: buffer.length } },
			wordCount: 0,
		}
	}

	if (!probableUrl) {
		const text = originalFallback
		return {
			text,
			title: metadataTitle,
			source: metadataSource,
			url: input.url ?? null,
			contentType: "text/plain",
			raw: null,
			wordCount: countWords(text),
		}
	}

	if (probableUrl && isYouTubeUrl(probableUrl)) {
		const videoId = extractYouTubeVideoId(probableUrl)
		const markitdownResult = await tryMarkItDownOnUrl(probableUrl)

		if (markitdownResult) {
			const markdown = cleanExtractedContent(
				markitdownResult.markdown,
				probableUrl,
			)
			const text = sanitiseText(markdown) || originalFallback
			const markitdownTitle = readRecordString(
				markitdownResult.metadata,
				"title",
			)

			if (text) {
				return {
					text,
					title:
						markitdownTitle ?? metadataTitle ?? `Vídeo do YouTube: ${videoId}`,
					source: "youtube",
					url: probableUrl,
					contentType: "video/youtube",
					raw: {
						markitdown: markitdownResult.metadata,
						youtube: {
							url: probableUrl,
							videoId,
							thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
							embedUrl: `https://www.youtube.com/embed/${videoId}`,
						},
					},
					wordCount: countWords(text),
				}
			}
		}

		const summary = await summarizeYoutubeVideo(probableUrl)
		if (summary) {
			return {
				text: summary,
				title: metadataTitle ?? `Vídeo do YouTube: ${videoId}`,
				source: "youtube",
				url: probableUrl,
				contentType: "video/youtube",
				raw: {
					youtube: {
						url: probableUrl,
						videoId,
						thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
						embedUrl: `https://www.youtube.com/embed/${videoId}`,
					},
				},
				wordCount: countWords(summary),
			}
		}
	}

    // Prefer MarkItDown for generic web pages when enabled; fallback to Firecrawl
    if (env.USE_MARKITDOWN_FOR_WEB) {
        try {
            const markitdownResult = await tryMarkItDownOnUrl(probableUrl)
            if (markitdownResult) {
                const markdown = cleanExtractedContent(
                    markitdownResult.markdown,
                    probableUrl,
                )
                const text = sanitiseText(markdown) || originalFallback
                const markitdownTitle = readRecordString(
                    markitdownResult.metadata,
                    "title",
                )

                // Consider it a successful extraction if we have non-trivial text
                if (text && text.length >= 120) {
                    return {
                        text,
                        title: markitdownTitle ?? metadataTitle ?? null,
                        source: "markitdown",
                        url: probableUrl,
                        contentType: "text/markdown",
                        raw: { markitdown: markitdownResult.metadata },
                        wordCount: countWords(text),
                    }
                }
            }
        } catch (error) {
            console.warn("markitdown-first extraction fallback", error)
        }
    }

    if (env.FIRECRAWL_API_KEY) {
        try {
            const firecrawlResult = await convertUrlWithFirecrawl(probableUrl)
            let markdown = firecrawlResult.markdown ?? ""

			// Clean up escaped markdown from Firecrawl
			markdown = markdown
				.replace(/\\\\/g, "\\") // Replace double backslashes with single
				.replace(/\\\[/g, "[") // Fix escaped brackets
				.replace(/\\\]/g, "]")
				.replace(/\\\(/g, "(")
				.replace(/\\\)/g, ")")

			// Remove UI noise (navigation, alerts, notifications, etc.)
			markdown = cleanExtractedContent(markdown, probableUrl)

			const text = sanitiseText(markdown) || originalFallback

			if (text) {
				const metadata = firecrawlResult.metadata ?? {}
				const firecrawlTitle = readRecordString(metadata, "title")
				const title = firecrawlTitle ?? metadataTitle ?? null
				return {
					text,
					title,
					source: "web",
					url: probableUrl,
					contentType: "text/markdown",
					raw: { firecrawl: metadata },
					wordCount: countWords(text),
				}
			}
        } catch (error) {
            console.warn("firecrawl extraction fallback", error)
        }
    }

	const response = await fetch(probableUrl, {
		headers: {
			accept:
				"text/html,application/pdf,q=0.9,application/xhtml+xml,application/xml;q=0.8,text/plain;q=0.7,*/*;q=0.5",
			"user-agent": DEFAULT_USER_AGENT,
		},
	})

	if (!response.ok) {
		throw new Error(`Falha ao buscar conteúdo remoto (${response.status})`)
	}

	const contentType = response.headers.get("content-type")?.toLowerCase() ?? ""
	const contentLength = Number.parseInt(
		response.headers.get("content-length") ?? "0",
		10,
	)
	const inferredFilename = inferFilenameFromUrl(probableUrl)
	const binaryResponse = response.clone()
	let binaryBufferPromise: Promise<Buffer> | null = null

	const getBinaryBuffer = async () => {
		if (!binaryBufferPromise) {
			binaryBufferPromise = binaryResponse
				.arrayBuffer()
				.then((data) => Buffer.from(data))
		}
		return binaryBufferPromise
	}

	// INTELLIGENT ROUTING: Try MarkItDown first for Office docs and PDFs
	// Falls back to Gemini if MarkItDown fails or is unavailable
	if (shouldTryMarkItDownFirst(contentType, inferredFilename)) {
		const buffer = await getBinaryBuffer()
		const markitdownResult = await tryMarkItDownOnBuffer(
			buffer,
			inferredFilename,
		)

		if (markitdownResult) {
			const cleanedMarkdown = cleanExtractedContent(
				markitdownResult.markdown,
				probableUrl,
			)
			const text = sanitiseText(cleanedMarkdown) || originalFallback
			const markitdownTitle = readRecordString(
				markitdownResult.metadata,
				"title",
			)

			if (text && text.length > 0) {
				return {
					text,
					title: markitdownTitle ?? metadataTitle ?? null,
					source: "markitdown",
					url: probableUrl,
					contentType: "text/markdown",
					raw: { markitdown: markitdownResult.metadata },
					wordCount: countWords(text),
				}
			}
		}
	}

	if (shouldUseGemini(contentType)) {
		if (contentLength > 50 * 1024 * 1024) {
			throw new Error(
				"Arquivo muito grande para processamento automático (limite ~50MB)",
			)
		}

		const buffer = await getBinaryBuffer()
		const filename = inferredFilename || "arquivo"

		const geminiResult = await summarizeBinaryWithGemini(
			buffer,
			contentType,
			filename,
		)
		const text = sanitiseText(geminiResult.text || "") || originalFallback

		return {
			text,
			title: metadataTitle ?? null,
			source: contentType,
			url: probableUrl,
			contentType,
			raw: geminiResult.metadata,
			wordCount: countWords(text),
		}
	}

	if (
		contentType.includes("text/html") ||
		contentType.includes("application/xhtml")
	) {
		const html = await response.text()
		const { text, title, raw } = await extractFromHtml(html, probableUrl)
		const ensuredText = text || originalFallback
		return {
			text: ensuredText,
			title: title ?? metadataTitle ?? null,
			source: "web",
			url: probableUrl,
			contentType,
			raw,
			wordCount: countWords(ensuredText),
		}
	}

	if (contentType.includes("pdf")) {
		const buffer = await getBinaryBuffer()
		const { text, title, raw } = await extractFromPdf(buffer)
		const ensuredText = text || originalFallback
		return {
			text: ensuredText,
			title: title ?? metadataTitle ?? null,
			source: "pdf",
			url: probableUrl,
			contentType,
			raw,
			wordCount: countWords(ensuredText),
		}
	}

	if (contentType.startsWith("text/")) {
		const text = sanitiseText(await response.text())
		const ensuredText = text || originalFallback
		return {
			text: ensuredText,
			title: metadataTitle ?? null,
			source: contentType,
			url: probableUrl,
			contentType,
			raw: null,
			wordCount: countWords(ensuredText),
		}
	}

	// Unsupported rich media types for now
	throw new Error(
		`Tipo de conteúdo não suportado para ingestão automática (${contentType || "desconhecido"})`,
	)
}

/**
 * Extract content from a GitHub repository
 */
export async function extractFromRepository(
	repoUrl: string,
	githubToken?: string,
): Promise<ExtractionResult> {
	const result = await ingestRepository(repoUrl, githubToken)

	// Combine summary and content
	const fullText = `${result.summary}\n\n${result.tree}\n\n${result.content}`

	return {
		text: sanitiseText(fullText),
		title: `Repository: ${repoUrl}`,
		source: "github_repository",
		url: repoUrl,
		contentType: "repository",
		raw: {
			summary: result.summary,
			tree: result.tree,
			stats: result.stats,
		},
		wordCount: countWords(fullText),
	}
}
