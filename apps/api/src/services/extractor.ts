// Removed Readability/JSDOM HTML extraction to simplify pipeline
import pdfParse from "pdf-parse/lib/pdf-parse.js"
import { env } from "../env"
import { safeFetch, URLValidationError } from "../security/url-validator"
import { getGoogleModel } from "./google-genai"
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
		// GitHub navigation menu and header
		/Navigation Menu/gi,
		/Toggle navigation/gi,
		/\[Sign in\]\([^)]*\)/gi,
		/\[Sign up\]\([^)]*\)/gi,
		/Appearance settings/gi,
		/Product navigation/gi,

		// GitHub main menu sections
		/\*\s*Platform\s*\+/gi,
		/\*\s*Solutions\s*\+/gi,
		/\*\s*Resources\s*\+/gi,
		/\*\s*Open Source\s*\+/gi,
		/\*\s*Enterprise\s*\+/gi,

		// GitHub product features
		/GitHub (Copilot|Spark|Models|Actions|Packages|Security|Codespaces|Issues|Pull requests|Discussions|Projects)/gi,
		/Write better code with AI/gi,
		/Security.*Find and fix vulnerabilities/gi,
		/Actions.*Automate any workflow/gi,
		/Codespaces.*Instant dev environments/gi,
		/Packages.*Host and manage packages/gi,

		// Repository navigation tabs
		/\bCode\s+Issues\s+Pull requests\s+Discussions/gi,
		/\bCode\s+Issues\s+Pull requests/gi,
		/\bIssues\s+Pull requests/gi,

		// GitHub footer and about links
		/\b(Pricing|API|Training|Blog|About)\s+GitHub/gi,
		/Contact GitHub/gi,
		/Terms\s+Privacy/gi,
		/Security\s+Status/gi,
		/Docs/gi,

		// GitHub-specific UI elements
		/\[Skip to content\]\([^)]*\)/gi,
		/You signed (in|out) (with|in) another (tab|window)/gi,
		/(Reload|to refresh) (to refresh )?your session\.?/gi,
		/You switched accounts on another (tab|window)/gi,
		/Dismiss alert\s*\{\{?\s*message\s*\}\}?/gi,
		/You must be signed in to (change notification settings|make or propose changes)/gi,
		/Notifications?\s*You must be signed in/gi,

		// Star/Fork badges with backslash escapes
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
		/\[!?\[.*?\]\([^)]*\)\]\([^)]*\)/g, // Nested markdown links
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
		cleaned = cleaned.replace(
			/You can't perform that action at this time\.?/gi,
			"",
		)

		// Remove URL-encoded navigation links
		cleaned = cleaned.replace(/return_to=https?%3A%2F%2F[^\s)]+/gi, "")
		cleaned = cleaned.replace(/\(https?:\/\/github\.com\/[^)]*%2F[^)]*\)/g, "")

		// Remove URL patterns in parentheses that are GitHub links
		cleaned = cleaned.replace(/\(https?:\/\/github\.com\/[^)]+\?[^)]*\)/g, "")

		// Remove repository owner/name patterns like "com%2Ftt-rss%2Ftt-rss"
		cleaned = cleaned.replace(/com%2F[\w-]+%2F[\w-]+/gi, "")

		// Remove version badges
		cleaned = cleaned.replace(/\bv\d+\s*$/gm, "")

		// Remove "Public" or "Private" repo indicators when standalone
		cleaned = cleaned.replace(/\b(Public|Private)\s*-?\s*/gi, "")
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
 * Extract meta tags from HTML for preview images and metadata
 */
function extractMetaTags(html: string): {
	ogImage?: string
	ogTitle?: string
	ogDescription?: string
	twitterImage?: string
	favicon?: string
} {
	const result: Record<string, string> = {}

	// Extract og:image
	const ogImageMatch = html.match(
		/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
	)
	if (ogImageMatch?.[1]) result.ogImage = ogImageMatch[1]

	// Extract twitter:image
	const twitterImageMatch = html.match(
		/<meta\s+(?:name|property)=["']twitter:image["']\s+content=["']([^"']+)["']/i,
	)
	if (twitterImageMatch?.[1]) result.twitterImage = twitterImageMatch[1]

	// Extract og:title
	const ogTitleMatch = html.match(
		/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
	)
	if (ogTitleMatch?.[1]) result.ogTitle = ogTitleMatch[1]

	// Extract og:description
	const ogDescriptionMatch = html.match(
		/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i,
	)
	if (ogDescriptionMatch?.[1]) result.ogDescription = ogDescriptionMatch[1]

	// Extract favicon
	const faviconMatch = html.match(
		/<link\s+rel=["'](?:icon|shortcut icon)["']\s+(?:type=["'][^"']*["']\s+)?href=["']([^"']+)["']/i,
	)
	if (faviconMatch?.[1]) result.favicon = faviconMatch[1]

	return result
}

async function extractPreviewImageWithGemini(
	html: string,
	url: string,
): Promise<string | null> {
	const model = getGoogleModel(env.SUMMARY_MODEL || "google/gemini-2.5-flash")
	if (!model) {
		console.warn("extractPreviewImageWithGemini: Google Generative AI not configured")
		return null
	}

	try {
		console.info("extractPreviewImageWithGemini: starting", {
			url,
			htmlLength: html.length,
		})
		const prompt = `Analyze this HTML and extract the best preview image URL.
Look for: og:image meta tags, large hero images, main content images, or logos.
Return ONLY the absolute URL of the best image, or "NONE" if no suitable image found.

HTML:
${html.slice(0, 50000)}

Base URL: ${url}`

		const result = await model.generateContent({
			contents: [{ role: "user", parts: [{ text: prompt }] }],
		})
		const response = result.response.text().trim()
		console.info("extractPreviewImageWithGemini: response", {
			url,
			response: response.slice(0, 200),
		})

		if (response === "NONE" || !response.startsWith("http")) {
			return null
		}

		return response
	} catch (error) {
		console.error("extractPreviewImageWithGemini: failed", {
			url,
			error: String(error),
		})
		return null
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

// Readability-based HTML extractor removed

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
	const includeMedia = options.includeMedia ?? true
	const includeMarkdown = options.includeMarkdown ?? true
	const includeArchives = options.includeArchives ?? true

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
		try {
			console.info("extractor: markitdown-buffer", {
				filename,
				chars: result.markdown.length,
			})
		} catch {}
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
				// Extract meta tags for preview images
				const metaTags = extractMetaTags(decoded)

				// Extract title from HTML
				let pageTitle = metaTags.ogTitle || metadataTitle
				if (!pageTitle) {
					const titleMatch = decoded.match(/<title[^>]*>([^<]+)<\/title>/i)
					if (titleMatch?.[1]) {
						pageTitle = titleMatch[1].trim()
					}
				}

				// Strip HTML tags for text content
				let plain = decoded
					.replace(/<script[\s\S]*?<\/script>/gi, " ")
					.replace(/<style[\s\S]*?<\/style>/gi, " ")
					.replace(/<[^>]+>/g, " ")
				plain = cleanExtractedContent(plain)
				const text = sanitiseText(plain)

				return {
					text,
					title: pageTitle ?? filename,
					source: "upload",
					url: input.url ?? null,
					contentType: mimeType,
					raw: {
						metaTags,
						ogImage: metaTags.ogImage || metaTags.twitterImage || null,
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

		if (shouldTryMarkItDownFirst(mimeType, filename)) {
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
				try {
					console.info("extractor: markitdown-youtube", {
						url: probableUrl,
						videoId,
						chars: text.length,
						words: countWords(text),
					})
				} catch {}
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
			try {
				console.info("extractor: youtube-summary", {
					url: probableUrl,
					videoId,
					chars: summary.length,
					words: countWords(summary),
				})
			} catch {}
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

	// Prefer MarkItDown for generic web pages (local)
	if (true /* always try MarkItDown for web */) {
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
					let metaTags = {}
					let ogImage = null
					try {
						const htmlResponse = await safeFetch(probableUrl, {
							method: "GET",
							headers: {
								"user-agent": DEFAULT_USER_AGENT,
								accept: "text/html",
							},
						})
						if (htmlResponse.ok) {
							const html = await htmlResponse.text()
							metaTags = extractMetaTags(html)
							ogImage = metaTags.ogImage || metaTags.twitterImage || null

							if (!ogImage) {
								console.info("extractor: no-og-image, trying Gemini fallback", {
									url: probableUrl,
								})
								ogImage = await extractPreviewImageWithGemini(html, probableUrl)
								if (ogImage) {
									console.info("extractor: gemini-extracted-image", {
										url: probableUrl,
										image: ogImage,
									})
								} else {
									console.warn("extractor: gemini-no-image-found", {
										url: probableUrl,
									})
								}
							}
						}
					} catch {
						// Ignore meta tag extraction errors
					}

					const finalTitle =
						markitdownTitle ?? metaTags.ogTitle ?? metadataTitle ?? null
					try {
						console.info("extractor: markitdown-url", {
							url: probableUrl,
							title: finalTitle,
							markitdownTitle,
							ogTitle: metaTags.ogTitle,
							chars: text.length,
							words: countWords(text),
							hasOgImage: !!ogImage,
						})
					} catch {}
					return {
						text,
						title: finalTitle,
						source: "markitdown",
						url: probableUrl,
						contentType: "text/markdown",
						raw: {
							markitdown: markitdownResult.metadata,
							metaTags,
							ogImage,
						},
						wordCount: countWords(text),
					}
				}
			}
		} catch (error) {
			console.warn("markitdown extraction failed", error)
		}
	}

	// Validate URL for security (SSRF protection)
	try {
		const response = await safeFetch(probableUrl, {
			headers: {
				accept:
					"text/html,application/pdf,q=0.9,application/xhtml+xml,application/xml;q=0.8,text/plain;q=0.7,*/*;q=0.5",
				"user-agent": DEFAULT_USER_AGENT,
			},
		})

		// Handle manual redirects (safeFetch uses redirect: 'manual')
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("location")
			if (location) {
				// Recursively validate and fetch redirect target
				return extractDocumentContent({
					...input,
					url: location,
				})
			}
		}

		if (!response.ok) {
			// Do not crash the ingestion pipeline; fall back gracefully
			try {
				console.warn("extractor: fetch-not-ok", {
					url: probableUrl,
					status: response.status,
				})
			} catch {}
			const ensuredText = originalFallback || ""
			return {
				text: ensuredText,
				title: metadataTitle ?? null,
				source: `http-${response.status}`,
				url: probableUrl,
				contentType: contentType || "text/plain",
				raw: { fetchError: response.status },
				wordCount: countWords(ensuredText),
			}
		}

		const contentType =
			response.headers.get("content-type")?.toLowerCase() ?? ""
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

			const metaTags = extractMetaTags(html)

			let pageTitle = metaTags.ogTitle || metadataTitle
			if (!pageTitle) {
				const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
				if (titleMatch?.[1]) {
					pageTitle = titleMatch[1].trim()
				}
			}

			let ogImage = metaTags.ogImage || metaTags.twitterImage || null
			if (!ogImage) {
				console.info("extractor: html-fallback-no-og-image, trying Gemini", {
					url: probableUrl,
				})
				ogImage = await extractPreviewImageWithGemini(html, probableUrl)
				if (ogImage) {
					console.info("extractor: html-fallback-gemini-extracted", {
						url: probableUrl,
						image: ogImage,
					})
				} else {
					console.warn("extractor: html-fallback-gemini-no-image", {
						url: probableUrl,
					})
				}
			}

			let plain = html
				.replace(/<script[\s\S]*?<\/script>/gi, " ")
				.replace(/<style[\s\S]*?<\/style>/gi, " ")
				.replace(/<[^>]+>/g, " ")
			plain = cleanExtractedContent(plain, probableUrl)
			const ensuredText = sanitiseText(plain) || originalFallback

			try {
				console.info("extractor: html-strip-fallback", {
					url: probableUrl,
					chars: ensuredText.length,
					words: countWords(ensuredText),
					hasOgImage: !!ogImage,
				})
			} catch {}

			return {
				text: ensuredText,
				title: pageTitle ?? null,
				source: "web",
				url: probableUrl,
				contentType,
				raw: {
					metaTags,
					ogImage,
				},
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
	} catch (error) {
		// Handle URL validation errors gracefully
		if (error instanceof URLValidationError) {
			console.warn("URL validation failed:", {
				url: probableUrl,
				reason: error.reason,
			})
			throw new Error(`URL blocked for security reasons: ${error.reason}`)
		}
		// Re-throw other errors
		throw error
	}
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
