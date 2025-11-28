/**
 * Document preview utilities
 * Consolidates getDocumentPreview and getDocumentSnippet functionality
 */

import type { DocumentWithMemories } from "@repo/validation/types/document"
import { generateDocumentPreview, stripHtml } from "./image-preview"

export interface DocumentPreviewData {
  thumbnailUrl?: string
  favicon?: string
  title?: string
  description?: string
  domain?: string
  type: 'youtube' | 'github' | 'website' | 'image' | 'default'
  isProcessing?: boolean
}

/**
 * Sanitize and validate URLs for image previews
 * Security: Prevents XSS via javascript:, data:text/html, and other malicious URLs
 */
export function safeHttpUrl(value: unknown, baseUrl?: string): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  // Handle data: URLs - only allow image types
  if (trimmed.startsWith("data:")) {
    // Only allow data:image/ URLs
    if (
      trimmed.startsWith("data:image/svg+xml") ||
      trimmed.startsWith("data:image/png") ||
      trimmed.startsWith("data:image/jpeg") ||
      trimmed.startsWith("data:image/jpg") ||
      trimmed.startsWith("data:image/gif") ||
      trimmed.startsWith("data:image/webp")
    ) {
      // Limit data URL size to prevent DoS (2MB max)
      if (trimmed.length > 2 * 1024 * 1024) {
        console.warn("Data URL too large, ignoring")
        return undefined
      }
      return trimmed
    }
    // Reject any other data: URLs (text/html, application/javascript, etc.)
    return undefined
  }

  try {
    const url = new URL(trimmed)
    // Only allow http: and https: protocols (blocks javascript:, file:, etc.)
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString()
    }
  } catch {
    if (baseUrl) {
      try {
        const url = new URL(trimmed, baseUrl)
        if (url.protocol === "http:" || url.protocol === "https:") {
          return url.toString()
        }
      } catch {
        // Invalid URL even with base
      }
    }
    // Invalid URL or blocked protocol
  }
  return undefined
}

/**
 * Check if URL is inline SVG data URL
 */
export function isInlineSvgDataUrl(value?: string | null): boolean {
  if (!value) return false
  return value.trim().toLowerCase().startsWith("data:image/svg+xml")
}

/**
 * Get document preview data
 * Consolidates getDocumentPreview functionality from multiple components
 */
export function getDocumentPreview(
  document: DocumentWithMemories | any
): DocumentPreviewData {
  const isProcessing = PROCESSING_STATUSES.has(document.processing_status)

  if (isProcessing) {
    return {
      type: 'default',
      isProcessing: true,
      title: document.title || 'Processing...'
    }
  }

  // Try to get image preview from metadata
  const anyDoc = document as any
  const raw = anyDoc?.raw && typeof anyDoc.raw === "object" ? anyDoc.raw : null
  const metadata = anyDoc?.metadata && typeof anyDoc.metadata === "object" ? anyDoc.metadata : null

  // Check for images in metadata
  const imageUrl = safeHttpUrl(
    metadata?.og_image || metadata?.image || raw?.image
  )

  if (imageUrl) {
    return {
      thumbnailUrl: imageUrl,
      title: document.title,
      type: isInlineSvgDataUrl(imageUrl) ? 'default' : 'image'
    }
  }

  // Generate preview from URL if available
  if (document.url) {
    return generateDocumentPreview(
      document.url,
      document.title,
      document.content
    )
  }

  // Fallback preview
  return {
    title: document.title,
    type: 'default'
  }
}

/**
 * Build a document snippet preferring summary > analysis > first memory > content
 * Consolidates getDocumentSnippet functionality
 */
export function getDocumentSnippet(
  document: DocumentWithMemories | any
): string | null {
  try {
    const anyDoc = document as any
    const raw =
      anyDoc?.raw && typeof anyDoc.raw === "object" ? anyDoc.raw : null
    const extraction =
      raw?.extraction && typeof raw.extraction === "object"
        ? raw.extraction
        : null
    const metadata =
      anyDoc?.metadata && typeof anyDoc.metadata === "object"
        ? anyDoc.metadata
        : null

    const firstActiveMemory = Array.isArray(anyDoc?.memoryEntries)
      ? anyDoc.memoryEntries.find(
          (m: any) => !m?.isForgotten && typeof m?.memory === "string",
        )?.memory
      : undefined

    const candidates = [
      typeof anyDoc?.summary === "string" ? anyDoc.summary : undefined,
      typeof metadata?.description === "string"
        ? metadata.description
        : undefined,
      typeof raw?.description === "string" ? raw.description : undefined,
      typeof extraction?.description === "string"
        ? extraction.description
        : undefined,
      typeof extraction?.analysis === "string"
        ? extraction.analysis
        : undefined,
      typeof raw?.analysis === "string" ? raw.analysis : undefined,
      firstActiveMemory,
      typeof anyDoc?.content === "string" ? anyDoc.content : undefined,
    ].filter(Boolean) as string[]

    if (candidates.length === 0) return null
    const cleaned = stripMarkdown(candidates[0])

    // Remove generic heading lines like "RESUMO EXECUTIVO --" at the start
    const sanitizeHeading = (text: string): string => {
      const GENERIC = new Set([
        "RESUMO EXECUTIVO",
        "RESUMO",
        "EXECUTIVE SUMMARY",
        "SUMMARY",
        "OVERVIEW",
        "INTRODUÇÃO",
        "INTRODUCTION",
      ])
      const lines = text.split(/\n+/)
      let i = 0
      while (i < lines.length) {
        const original = lines[i]
        const trimmed = original.trim()
        if (!trimmed) {
          i++
          continue
        }
        // Remove leading bullet/dashes and trailing separators for heading detection
        const head = trimmed
          .replace(/^[-–—•*+>\s]+/, "")
          .replace(/[-–—•:\s]+$/, "")
        const upper = head.toUpperCase()
        const isGeneric =
          GENERIC.has(upper) ||
          upper.startsWith("RESUMO EXECUTIVO") ||
          upper.startsWith("EXECUTIVE SUMMARY") ||
          upper === "RESUMO" ||
          upper === "SUMMARY"
        if (isGeneric && head.length <= 40) {
          i++
          continue
        }
        break
      }
      const rest = lines.slice(i).join("\n").trim()
      return rest || text
    }

    const body = sanitizeHeading(cleaned)
    const trimmed = body
      .replace(/^['"''`]+/, "")
      .replace(/['"''`]+$/, "")
      .trim()
    return trimmed || null
  } catch {
    return null
  }
}

/**
 * Strip markdown formatting from text
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '') // Headers
    .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
    .replace(/\*(.*?)\*/g, '$1') // Italic
    .replace(/`(.*?)`/g, '$1') // Inline code
    .replace(/```[\s\S]*?```/g, '') // Code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // Images
    .replace(/^\s*[-*+]\s+/gm, '') // List items
    .replace(/^\s*\d+\.\s+/gm, '') // Numbered lists
    .replace(/^\s*>\s+/gm, '') // Blockquotes
    .replace(/\n{3,}/g, '\n\n') // Multiple newlines
    .trim()
}

/**
 * Processing statuses that indicate a document is still being processed
 */
export const PROCESSING_STATUSES = new Set([
  "queued",
  "fetching",
  "extracting",
  "chunking",
  "embedding",
  "processing",
])

/**
 * Check if document is currently being processed
 */
export function isDocumentProcessing(status?: string): boolean {
  return status ? PROCESSING_STATUSES.has(status) : false
}