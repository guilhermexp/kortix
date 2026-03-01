/**
 * Document Attachments — CRUD business logic
 *
 * Handles upload, listing, single fetch, and deletion
 * of file attachments linked to documents.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import {
	deleteFromStorage,
	extractTextContent,
	getSignedUrl,
	uploadAttachment,
} from "../../utils/attachment-storage"

export interface AttachmentRow {
	id: string
	document_id: string
	org_id: string
	user_id: string | null
	filename: string
	mime_type: string
	size_bytes: number
	storage_path: string
	content_text: string | null
	metadata: Record<string, unknown>
	created_at: string
}

/**
 * Upload a new attachment for a document.
 */
export async function uploadDocumentAttachment(
	client: SupabaseClient,
	opts: {
		organizationId: string
		userId: string | null | undefined
		documentId: string
		file: File
	},
): Promise<AttachmentRow> {
	const { organizationId, userId, documentId, file } = opts

	// Validate the document belongs to this org
	const { data: doc, error: docErr } = await client
		.from("documents")
		.select("id")
		.eq("id", documentId)
		.eq("org_id", organizationId)
		.maybeSingle()

	if (docErr) throw docErr
	if (!doc) throw Object.assign(new Error("Document not found"), { status: 404 })

	const arrayBuffer = await file.arrayBuffer()
	const buffer = Buffer.from(arrayBuffer)
	const filename = file.name || "attachment"
	const mimeType = file.type || "application/octet-stream"

	// Upload to storage
	const storagePath = await uploadAttachment(
		organizationId,
		documentId,
		filename,
		buffer,
		mimeType,
	)

	// Extract text content for agent access
	const contentText = await extractTextContent(buffer, mimeType, filename)

	// Insert DB row
	const { data, error } = await client
		.from("document_attachments")
		.insert({
			document_id: documentId,
			org_id: organizationId,
			user_id: userId ?? null,
			filename,
			mime_type: mimeType,
			size_bytes: file.size,
			storage_path: storagePath,
			content_text: contentText,
			metadata: {},
		})
		.select()
		.single()

	if (error) {
		// Cleanup uploaded file on DB failure
		await deleteFromStorage(storagePath)
		throw error
	}

	return data as AttachmentRow
}

/**
 * List all attachments for a document.
 */
export async function listDocumentAttachments(
	client: SupabaseClient,
	organizationId: string,
	documentId: string,
): Promise<AttachmentRow[]> {
	const { data, error } = await client
		.from("document_attachments")
		.select("*")
		.eq("document_id", documentId)
		.eq("org_id", organizationId)
		.order("created_at", { ascending: true })

	if (error) throw error
	return (data ?? []) as AttachmentRow[]
}

/**
 * Get a single attachment with a signed download URL.
 */
export async function getDocumentAttachment(
	client: SupabaseClient,
	organizationId: string,
	documentId: string,
	attachmentId: string,
): Promise<(AttachmentRow & { downloadUrl: string }) | null> {
	const { data, error } = await client
		.from("document_attachments")
		.select("*")
		.eq("id", attachmentId)
		.eq("document_id", documentId)
		.eq("org_id", organizationId)
		.maybeSingle()

	if (error) throw error
	if (!data) return null

	const downloadUrl = await getSignedUrl(data.storage_path)
	return { ...(data as AttachmentRow), downloadUrl }
}

/**
 * Delete an attachment (storage + DB row).
 */
export async function deleteDocumentAttachment(
	client: SupabaseClient,
	organizationId: string,
	documentId: string,
	attachmentId: string,
): Promise<void> {
	// Fetch first to get storage_path
	const { data, error } = await client
		.from("document_attachments")
		.select("storage_path")
		.eq("id", attachmentId)
		.eq("document_id", documentId)
		.eq("org_id", organizationId)
		.maybeSingle()

	if (error) throw error
	if (!data) throw Object.assign(new Error("Attachment not found"), { status: 404 })

	// Delete from storage (best-effort)
	await deleteFromStorage(data.storage_path)

	// Delete DB row
	const { error: delError } = await client
		.from("document_attachments")
		.delete()
		.eq("id", attachmentId)

	if (delError) throw delError
}
