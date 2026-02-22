/**
 * Supabase Storage utilities for persisting preview images.
 *
 * Downloads an external image, validates it, and uploads to the
 * `document-previews` bucket so the frontend can load it from
 * Supabase Storage instead of hitting external URLs that may
 * rate-limit (GitHub 429) or become unavailable.
 */

import { supabaseAdmin } from "../supabase"
import { env } from "../env"

const BUCKET = "document-previews"
const MAX_SIZE = 5 * 1024 * 1024 // 5MB
const FETCH_TIMEOUT = 10_000 // 10s
const ALLOWED_TYPES: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
	"image/svg+xml": "svg",
}

/**
 * Download an external image and persist it in Supabase Storage.
 *
 * @returns The public URL of the stored image, or `null` on any failure.
 *          The caller should fall back to the original URL when `null`.
 */
export async function persistPreviewImage(
	documentId: string,
	sourceUrl: string,
): Promise<string | null> {
	try {
		// Handle SVG data URIs
		if (sourceUrl.startsWith("data:image/svg+xml")) {
			return await handleSvgDataUri(documentId, sourceUrl)
		}

		// Skip non-http(s) URLs
		if (!sourceUrl.startsWith("http://") && !sourceUrl.startsWith("https://")) {
			return null
		}

		// Download with timeout
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

		let response: Response
		try {
			response = await fetch(sourceUrl, {
				signal: controller.signal,
				headers: {
					"User-Agent": "KortixBot/1.0 (preview-image-fetcher)",
					Accept: "image/*",
				},
				redirect: "follow",
			})
		} finally {
			clearTimeout(timeout)
		}

		if (!response.ok) {
			return null
		}

		// Validate content-type
		const contentType = response.headers.get("content-type")?.split(";")[0]?.trim()
		if (!contentType || !ALLOWED_TYPES[contentType]) {
			return null
		}

		// Read body and validate size
		const buffer = await response.arrayBuffer()
		if (buffer.byteLength > MAX_SIZE || buffer.byteLength === 0) {
			return null
		}

		const ext = ALLOWED_TYPES[contentType]
		const storagePath = `${documentId}/preview.${ext}`

		// Upload with upsert (overwrites if re-processing)
		const { error } = await supabaseAdmin.storage
			.from(BUCKET)
			.upload(storagePath, buffer, {
				contentType,
				upsert: true,
			})

		if (error) {
			console.warn("[persistPreviewImage] Upload failed", {
				documentId,
				error: error.message,
			})
			return null
		}

		// Build public URL
		const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`
		return publicUrl
	} catch (err) {
		// Never throw — caller falls back to original URL
		console.warn("[persistPreviewImage] Failed", {
			documentId,
			sourceUrl: sourceUrl.slice(0, 120),
			error: err instanceof Error ? err.message : String(err),
		})
		return null
	}
}

/**
 * Handle SVG data URIs by decoding and uploading as .svg
 */
async function handleSvgDataUri(
	documentId: string,
	dataUri: string,
): Promise<string | null> {
	try {
		let svgContent: string

		if (dataUri.includes(";base64,")) {
			const base64 = dataUri.split(";base64,")[1]
			if (!base64) return null
			svgContent = atob(base64)
		} else {
			// URL-encoded: data:image/svg+xml,...
			const encoded = dataUri.split(",").slice(1).join(",")
			if (!encoded) return null
			svgContent = decodeURIComponent(encoded)
		}

		const buffer = new TextEncoder().encode(svgContent)
		if (buffer.byteLength > MAX_SIZE || buffer.byteLength === 0) {
			return null
		}

		const storagePath = `${documentId}/preview.svg`

		const { error } = await supabaseAdmin.storage
			.from(BUCKET)
			.upload(storagePath, buffer, {
				contentType: "image/svg+xml",
				upsert: true,
			})

		if (error) {
			console.warn("[persistPreviewImage] SVG upload failed", {
				documentId,
				error: error.message,
			})
			return null
		}

		return `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`
	} catch {
		return null
	}
}
