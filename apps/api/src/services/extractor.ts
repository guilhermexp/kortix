import { Readability } from "@mozilla/readability"
import { JSDOM } from "jsdom"
import pdfParse from "pdf-parse/lib/pdf-parse.js"
import { env } from "../env"
import { convertUrlWithFirecrawl } from "./firecrawl"
import { summarizeYoutubeVideo } from "./summarizer"
import { summarizeBinaryWithGemini } from "./gemini-files"

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

function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    return host.includes("youtube.com") || host.includes("youtu.be")
  } catch {
    return false
  }
}

function shouldUseGemini(mime: string) {
  const m = mime.toLowerCase()
  if (m.startsWith("image/")) return true
  if (m.startsWith("audio/")) return true
  if (m.startsWith("video/")) return true
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
    return {
      text: sanitiseText(article.textContent),
      title: article.title ?? dom.window.document.title ?? null,
      raw: {
        byline: article.byline,
        length: article.length,
        excerpt: article.excerpt,
      },
    }
  }
  const fallback = dom.window.document.body?.textContent ?? ""
  return {
    text: sanitiseText(fallback),
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

export async function extractDocumentContent(
  input: ExtractionInput,
): Promise<ExtractionResult> {
  const probableUrl = isProbablyUrl(input.url ?? input.originalContent ?? undefined)
    ? (input.url ?? input.originalContent ?? undefined)
    : undefined

  const originalFallback = sanitiseText(input.originalContent ?? "")

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
      return {
        text: summary,
        title: (input.metadata as any)?.title ?? null,
        source: "youtube",
        url: probableUrl,
        contentType: "text/youtube-summary",
        raw: {
          youtube: {
            url: probableUrl,
          },
        },
        wordCount: countWords(summary),
      }
    }
  }

  if (env.FIRECRAWL_API_KEY) {
    try {
      const firecrawlResult = await convertUrlWithFirecrawl(probableUrl)
      const markdown = firecrawlResult.markdown ?? ""
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
