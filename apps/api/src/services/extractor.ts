import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"
import pdfParse from "pdf-parse/lib/pdf-parse.js"
import { env } from "../env"
import { convertUrlWithFirecrawl } from "./firecrawl"
import { summarizeYoutubeVideo } from "./summarizer"
import { summarizeBinaryWithGemini } from "./gemini-files"
import { convertWithMarkItDown, checkMarkItDownHealth } from "./markitdown"

const DEFAULT_USER_AGENT =
  "SupermemoryBot/1.0 (+https://supermemory.ai self-hosted extractor)"

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
  return value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim()
}

function countWords(value: string): number {
  const normalised = value.trim()
  if (!normalised) return 0
  return normalised.split(/\s+/).length
}

/**
 * Remove common UI noise from extracted content (navigation, alerts, notifications, etc.)
 */
function cleanExtractedContent(text: string, url?: string): string {
  let cleaned = text

  // Common UI patterns to remove (case-insensitive, multiline)
  const uiNoisePatterns = [
    // GitHub-specific UI elements
    /\[Skip to content\]\([^\)]*\)/gi,
    /You signed (in|out) with another (tab|window)/gi,
    /Reload to refresh your session/gi,
    /You switched accounts on another (tab|window)/gi,
    /Dismiss alert\s*\{\{?\s*message\s*\}\}?/gi,
    /You must be signed in to change notification settings/gi,
    /Notifications?\s*You must be signed in/gi,
    
    // Star/Fork badges with backslash escapes (e.g., "Star\ 2.9k")
    /\b(Star|Fork|Watch|Unwatch)(ing)?\\?\s+[\d.,]+[kKmMbB]?/g,
    /[\d.,]+[kKmMbB]?\\?\s+(stars?|forks?|watching)/gi,
    
    // Navigation and action buttons
    /\[Reload\]\([^\)]*\)/gi,
    /\[Notifications?\]\([^\)]*\)/gi,
    /Go to (file|Branches|Tags)/gi,
    
    // Cookie/privacy banners
    /This (site|website) uses cookies/gi,
    /By (clicking|continuing|using) .{0,30}(accept|agree|consent)/gi,
    
    // Generic navigation
    /\[Skip to main content\]/gi,
    /\[Skip navigation\]/gi,
  ]

  for (const pattern of uiNoisePatterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  // Remove empty markdown links []() or [text]()
  cleaned = cleaned.replace(/\[[^\]]*\]\(\s*\)/g, '')

  // Remove excessive whitespace and empty lines
  cleaned = cleaned
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')

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
  if (m.includes("msword") || m.includes("mspowerpoint") || m.includes("excel")) return true
  if (m.includes("application/epub+zip")) return true
  
  return false
}

async function extractFromHtml(html: string, url?: string) {
  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()
  if (article?.textContent && article.textContent.trim().length > 100) {
    const cleanedText = cleanExtractedContent(sanitiseText(article.textContent), url)
    return {
      text: cleanedText,
      title: article.title ?? dom.window.document.title ?? null,
      raw: {
        byline: article.byline,
        length: article.length,
        excerpt: article.excerpt,
      },
    }
  }
  const fallback = dom.window.document.body?.textContent ?? ""
  const cleanedFallback = cleanExtractedContent(sanitiseText(fallback), url)
  return {
    text: cleanedFallback,
    title: dom.window.document.title ?? null,
    raw: null,
  }
}

async function extractFromPdf(buffer: Buffer) {
  const { text, info, metadata } = await pdfParse(buffer)
  return {
    text: sanitiseText(text ?? ""),
    title: (metadata as any)?.title ?? (info as any)?.Title ?? null,
    raw: {
      info,
      metadata,
    } as Record<string, unknown>,
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
function shouldTryMarkItDownFirst(contentType: string): boolean {
  const lower = contentType.toLowerCase()
  
  // Office documents - MarkItDown excels at these
  if (lower.includes("officedocument") ||
      lower.includes("msword") ||
      lower.includes("ms-excel") ||
      lower.includes("ms-powerpoint") ||
      lower.includes("spreadsheetml") ||
      lower.includes("presentationml") ||
      lower.includes("wordprocessingml") ||
      lower.includes("excel") ||
      lower.includes("spreadsheet")) {
    return true
  }
  
  // PDFs - try MarkItDown first, Gemini as fallback for complex tables
  if (lower.includes("pdf")) {
    return true
  }
  
  return false
}

export async function extractDocumentContent(
  input: ExtractionInput,
): Promise<ExtractionResult> {
  const probableUrl = isProbablyUrl(input.url ?? input.originalContent ?? undefined)
    ? (input.url ?? input.originalContent ?? undefined)
    : undefined

  const originalFallback = sanitiseText(input.originalContent ?? "")

  // Check if content is a data URL (base64 encoded file from upload)
  const dataUrlMatch = input.originalContent?.match(/^data:([^;]+);base64,(.+)$/)
  if (dataUrlMatch) {
    const [, mimeType, base64Data] = dataUrlMatch
    const buffer = Buffer.from(base64Data, 'base64')
    const filename = (input.metadata as any)?.filename ?? 'uploaded-file'
    
    console.log(`Processing uploaded file: ${filename} (${mimeType})`)
    
    // Try MarkItDown first for supported types
    if (shouldTryMarkItDownFirst(mimeType) && process.env.MARKITDOWN_INTERNAL_URL) {
      try {
        const isHealthy = await checkMarkItDownHealth()
        
        if (isHealthy) {
          console.log(`Using MarkItDown for uploaded ${mimeType}`)
          const markitdownResult = await convertWithMarkItDown(buffer, filename)
          const markdown = markitdownResult.markdown
          const cleanedMarkdown = cleanExtractedContent(markdown, undefined)
          const text = sanitiseText(cleanedMarkdown) || originalFallback

          if (text && text.length > 100) {
            return {
              text,
              title: markitdownResult.metadata?.title ?? (input.metadata as any)?.title ?? filename,
              source: "markitdown",
              url: null,
              contentType: "text/markdown",
              raw: { markitdown: markitdownResult.metadata, upload: { filename, mimeType, size: buffer.length } },
              wordCount: countWords(text),
            }
          }
        }
      } catch (error) {
        console.warn("MarkItDown failed for uploaded file, falling back to Gemini:", error)
      }
    }
    
    // Fallback to Gemini for uploaded files
    if (shouldUseGemini(mimeType)) {
      const geminiResult = await summarizeBinaryWithGemini(buffer, mimeType, filename)
      const text = sanitiseText(geminiResult.text || "") || originalFallback

      return {
        text,
        title: (input.metadata as any)?.title ?? filename,
        source: mimeType,
        url: null,
        contentType: mimeType,
        raw: { ...geminiResult.metadata, upload: { filename, mimeType, size: buffer.length } },
        wordCount: countWords(text),
      }
    }
    
    // If neither MarkItDown nor Gemini can process, return basic info
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
      title: (input.metadata as any)?.title ?? null,
      source: (input.metadata as any)?.source ?? null,
      url: input.url ?? null,
      contentType: "text/plain",
      raw: null,
      wordCount: countWords(text),
    }
  }

  if (probableUrl && isYouTubeUrl(probableUrl)) {
    const summary = await summarizeYoutubeVideo(probableUrl)
    if (summary) {
      const videoId = extractYouTubeVideoId(probableUrl)
      return {
        text: summary,
        title: (input.metadata as any)?.title ?? `Vídeo do YouTube: ${videoId}`,
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

  if (env.FIRECRAWL_API_KEY) {
    try {
      const firecrawlResult = await convertUrlWithFirecrawl(probableUrl)
      let markdown = firecrawlResult.markdown ?? ""
      
      // Clean up escaped markdown from Firecrawl
      markdown = markdown
        .replace(/\\\\/g, "\\")  // Replace double backslashes with single
        .replace(/\\\[/g, "[")   // Fix escaped brackets
        .replace(/\\\]/g, "]")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
      
      // Remove UI noise (navigation, alerts, notifications, etc.)
      markdown = cleanExtractedContent(markdown, probableUrl)
      
      const text = sanitiseText(markdown) || originalFallback

      if (text) {
        const metadata = firecrawlResult.metadata ?? {}
        const title = (metadata as any)?.title ?? (input.metadata as any)?.title ?? null
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

  // INTELLIGENT ROUTING: Try MarkItDown first for Office docs and PDFs
  // Falls back to Gemini if MarkItDown fails or is unavailable
  if (shouldTryMarkItDownFirst(contentType) && process.env.MARKITDOWN_INTERNAL_URL) {
    try {
      const isHealthy = await checkMarkItDownHealth()
      
      if (isHealthy) {
        console.log(`Using MarkItDown for ${contentType}`)
        const buffer = Buffer.from(await response.arrayBuffer())
        const filename = (() => {
          try {
            const pathname = new URL(probableUrl).pathname
            const name = pathname.split("/").filter(Boolean).pop()
            return name ?? "document"
          } catch {
            return "document"
          }
        })()

        const markitdownResult = await convertWithMarkItDown(buffer, filename)
        const markdown = markitdownResult.markdown
        const cleanedMarkdown = cleanExtractedContent(markdown, probableUrl)
        const text = sanitiseText(cleanedMarkdown) || originalFallback

        if (text && text.length > 100) {
          return {
            text,
            title: markitdownResult.metadata?.title ?? (input.metadata as any)?.title ?? null,
            source: "markitdown",
            url: probableUrl,
            contentType: "text/markdown",
            raw: { markitdown: markitdownResult.metadata },
            wordCount: countWords(text),
          }
        }
      }
    } catch (error) {
      console.warn("MarkItDown extraction failed, falling back to Gemini:", error)
      // Fall through to Gemini
    }
  }

  if (shouldUseGemini(contentType)) {
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "0", 10)
    if (contentLength > 50 * 1024 * 1024) {
      throw new Error("Arquivo muito grande para processamento automático (limite ~50MB)")
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const filename = (() => {
      try {
        const pathname = new URL(probableUrl).pathname
        const name = pathname.split("/").filter(Boolean).pop()
        return name ?? "arquivo"
      } catch {
        return "arquivo"
      }
    })()

    const geminiResult = await summarizeBinaryWithGemini(buffer, contentType, filename)
    const text = sanitiseText(geminiResult.text || "") || originalFallback

    return {
      text,
      title: (input.metadata as any)?.title ?? null,
      source: contentType,
      url: probableUrl,
      contentType,
      raw: geminiResult.metadata,
      wordCount: countWords(text),
    }
  }

  if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
    const html = await response.text()
    const { text, title, raw } = await extractFromHtml(html, probableUrl)
    const ensuredText = text || originalFallback
    return {
      text: ensuredText,
      title: title ?? (input.metadata as any)?.title ?? null,
      source: "web",
      url: probableUrl,
      contentType,
      raw,
      wordCount: countWords(ensuredText),
    }
  }

  if (contentType.includes("pdf")) {
    const buffer = Buffer.from(await response.arrayBuffer())
    const { text, title, raw } = await extractFromPdf(buffer)
    const ensuredText = text || originalFallback
    return {
      text: ensuredText,
      title: title ?? (input.metadata as any)?.title ?? null,
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
      title: (input.metadata as any)?.title ?? null,
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
