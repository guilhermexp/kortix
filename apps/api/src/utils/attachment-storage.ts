/**
 * Supabase Storage utilities for document attachments.
 *
 * Handles upload, signed URL generation, deletion, and text extraction
 * for files attached to documents.
 */

import pdfParse from "pdf-parse/lib/pdf-parse.js"
import { supabaseAdmin } from "../supabase"

const BUCKET = "document-attachments"

const TEXT_MIME_TYPES = new Set([
	"text/plain",
	"text/markdown",
	"text/csv",
	"text/html",
	"text/xml",
	"application/json",
	"application/xml",
	"application/x-yaml",
	"text/yaml",
	"text/x-yaml",
])

function isTextMime(mimeType: string): boolean {
	if (TEXT_MIME_TYPES.has(mimeType)) return true
	if (mimeType.startsWith("text/")) return true
	return false
}

/**
 * Upload a file to the document-attachments bucket.
 * Returns the storage path used.
 */
export async function uploadAttachment(
	orgId: string,
	documentId: string,
	filename: string,
	buffer: Buffer | ArrayBuffer,
	mimeType: string,
): Promise<string> {
	const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_")
	const storagePath = `${orgId}/${documentId}/${crypto.randomUUID()}-${safeName}`

	const { error } = await supabaseAdmin.storage
		.from(BUCKET)
		.upload(storagePath, buffer, {
			contentType: mimeType,
			upsert: false,
		})

	if (error) {
		throw new Error(`Failed to upload attachment: ${error.message}`)
	}

	return storagePath
}

/**
 * Generate a signed URL for private attachment download.
 */
export async function getSignedUrl(
	storagePath: string,
	expiresIn = 3600,
): Promise<string> {
	const { data, error } = await supabaseAdmin.storage
		.from(BUCKET)
		.createSignedUrl(storagePath, expiresIn)

	if (error || !data?.signedUrl) {
		throw new Error(
			`Failed to generate signed URL: ${error?.message ?? "unknown error"}`,
		)
	}

	return data.signedUrl
}

/**
 * Delete a file from the document-attachments bucket.
 */
export async function deleteFromStorage(storagePath: string): Promise<void> {
	const { error } = await supabaseAdmin.storage
		.from(BUCKET)
		.remove([storagePath])

	if (error) {
		console.warn(
			`[deleteFromStorage] Failed to remove ${storagePath}: ${error.message}`,
		)
	}
}

/**
 * Extract text content from a file buffer when possible.
 * Returns null for binary files (images, docx, etc.).
 */
export async function extractTextContent(
	buffer: Buffer,
	mimeType: string,
	_filename: string,
): Promise<string | null> {
	// Text-based files: decode UTF-8 directly
	if (isTextMime(mimeType)) {
		return buffer.toString("utf-8")
	}

	// PDF: use pdf-parse
	if (mimeType === "application/pdf") {
		try {
			const result = await pdfParse(buffer)
			return result.text?.trim() || null
		} catch (err) {
			console.warn(
				"[extractTextContent] PDF parse failed:",
				err instanceof Error ? err.message : err,
			)
			return null
		}
	}

	// Binary files (images, docx, etc.): no text extraction
	return null
}
