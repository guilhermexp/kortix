/**
 * Documents Router
 * Handles all /v3/documents/* routes
 *
 * Note: This extracts route handlers from index.ts while keeping
 * the business logic in documents.ts
 */

import { zValidator } from "@hono/zod-validator"
import {
	BundleCreateSchema,
	DocumentsWithMemoriesQuerySchema,
	ListMemoriesQuerySchema,
	MemoryAddSchema,
	MigrateMCPRequestSchema,
} from "@repo/validation/api"
import { Hono } from "hono"
import { z } from "zod"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"
import {
	addDocument,
	cancelDocument,
	checkUrlExists,
	createBundle,
	DocumentsByIdsSchema,
	deleteDocument,
	deleteDocumentAttachment,
	ensureSpace,
	findDocumentRelatedLinks,
	getDocument,
	getDocumentAttachment,
	getDocumentChildren,
	getDocumentStatus,
	getQueueMetrics,
	listDocumentAttachments,
	listDocuments,
	listDocumentsWithMemories,
	listDocumentsWithMemoriesByIds,
	migrateMcpDocuments,
	updateDocument,
	uploadDocumentAttachment,
} from "./documents"

export const documentsRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

const MemoryCreateSchema = MemoryAddSchema.extend({
	content: z.string().trim().min(1, "Content is required to create a document"),
})

// Queue metrics endpoint
documentsRouter.get("/queue/metrics", async (c) => {
	try {
		const metrics = await getQueueMetrics()
		if (!metrics) {
			return c.json(
				{
					error: {
						message: "Queue not available (Redis not enabled)",
					},
				},
				503,
			)
		}
		return c.json(metrics)
	} catch (error) {
		console.error("Failed to fetch queue metrics", error)
		return c.json(
			{
				error: {
					message:
						error instanceof Error
							? error.message
							: "Failed to fetch queue metrics",
				},
			},
			500,
		)
	}
})

// Check if URL already exists (for duplicate validation before submission)
documentsRouter.post(
	"/check-url",
	zValidator("json", z.object({ url: z.string().url() })),
	async (c) => {
		const { organizationId } = c.var.session
		const { url } = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const result = await checkUrlExists(supabase, organizationId, url)
			return c.json(result)
		} catch (error) {
			console.error("Failed to check URL", error)
			return c.json(
				{
					error: {
						message:
							error instanceof Error ? error.message : "Failed to check URL",
					},
				},
				500,
			)
		}
	},
)

// Add document (text or URL)
documentsRouter.post("/", zValidator("json", MemoryCreateSchema), async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const payload = c.req.valid("json")
	const supabase = createClientForSession(c.var.session)

	try {
		const doc = await addDocument({
			organizationId,
			userId: internalUserId,
			payload,
			client: supabase,
		})
		return c.json(doc, 201)
	} catch (error) {
		console.error("Failed to add document", error)
		// Use custom status code if provided (e.g., 409 for duplicates)
		const statusCode = (error as any)?.status ?? 400
		const errorCode = (error as any)?.code
		const existingDocumentId = (error as any)?.existingDocumentId
		return c.json(
			{
				error: {
					message:
						error instanceof Error ? error.message : "Failed to add document",
					code: errorCode,
					existingDocumentId,
				},
			},
			statusCode,
		)
	}
})

// Batch add documents (e.g. Twitter bookmarks import)
const BatchDocumentsSchema = z.object({
	documents: z.array(MemoryCreateSchema).min(1).max(100),
	metadata: z.record(z.string(), z.unknown()).optional(),
})

documentsRouter.post(
	"/batch",
	zValidator("json", BatchDocumentsSchema),
	async (c) => {
		const { organizationId, internalUserId } = c.var.session
		const { documents, metadata: batchMetadata } = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		// Pre-create spaces sequentially to avoid race condition where parallel
		// addDocument calls each create duplicate spaces for the same containerTag
		const uniqueTags = new Set<string>()
		for (const doc of documents) {
			const tag =
				doc.containerTags && doc.containerTags.length > 0
					? doc.containerTags[0]
					: "sm_project_default"
			uniqueTags.add(tag)
		}
		for (const tag of uniqueTags) {
			await ensureSpace(supabase, organizationId, tag)
		}

		// Process documents sequentially to prevent race condition where parallel
		// addDocument calls all pass the duplicate check before any INSERT completes
		const output: Array<{
			status: "created" | "skipped" | "failed"
			document?: Awaited<ReturnType<typeof addDocument>>
			error?: string
			code?: string
			existingDocumentId?: string
			index?: number
		}> = []

		for (let i = 0; i < documents.length; i++) {
			const doc = documents[i]
			const mergedMetadata = {
				...(batchMetadata ?? {}),
				...(doc.metadata ?? {}),
			}
			const payload = { ...doc, metadata: mergedMetadata }
			try {
				const result = await addDocument({
					organizationId,
					userId: internalUserId,
					payload,
					client: supabase,
				})
				output.push({ status: "created", document: result })
			} catch (e) {
				const err = e as Error & {
					status?: number
					code?: string
					existingDocumentId?: string
				}
				const isDuplicate = err.status === 409
				output.push({
					status: isDuplicate ? "skipped" : "failed",
					error: err.message,
					code: err.code,
					existingDocumentId: err.existingDocumentId,
					index: i,
				})
			}
		}

		const successCount = output.filter(
			(r) => r.status === "created" || r.status === "skipped",
		).length

		return c.json(
			{
				results: output,
				total: documents.length,
				successCount,
			},
			201,
		)
	},
)

// File upload endpoint
documentsRouter.post("/file", async (c) => {
	const { organizationId, internalUserId } = c.var.session

	try {
		const body = await c.req.parseBody()
		const file = body.file

		if (!file || !(file instanceof File)) {
			return c.json({ error: { message: "No file uploaded" } }, 400)
		}

		const MAX_SIZE_BYTES = 10 * 1024 * 1024
		const ALLOWED_MIME = new Set([
			"text/plain",
			"text/markdown",
			"text/csv",
			"application/pdf",
			"application/json",
			"text/html",
			"image/png",
			"image/jpeg",
			"image/webp",
			"image/gif",
			"application/msword",
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"application/vnd.ms-excel",
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/vnd.ms-powerpoint",
			"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		])

		if (file.size > MAX_SIZE_BYTES) {
			return c.json({ error: { message: "File too large (max 10MB)" } }, 413)
		}

		const arrayBuffer = await file.arrayBuffer()
		const buffer = Buffer.from(arrayBuffer)
		const filename = file.name || "uploaded-file"
		const mimeType = file.type || "application/octet-stream"

		if (!ALLOWED_MIME.has(mimeType)) {
			return c.json(
				{
					error: {
						message: "Unsupported file type",
						allowed: Array.from(ALLOWED_MIME),
					},
				},
				415,
			)
		}

		let containerTags: string[] | undefined
		const rawContainerTags = body.containerTags
		if (Array.isArray(rawContainerTags)) {
			containerTags = rawContainerTags
				.map((value) => String(value))
				.filter(Boolean)
		} else if (
			typeof rawContainerTags === "string" &&
			rawContainerTags.trim().length > 0
		) {
			try {
				const parsed = JSON.parse(rawContainerTags)
				if (Array.isArray(parsed)) {
					containerTags = parsed.map((value) => String(value)).filter(Boolean)
				} else {
					containerTags = [rawContainerTags]
				}
			} catch {
				containerTags = [rawContainerTags]
			}
		}

		const rawMetadata = body.metadata
		let extraMetadata: Record<string, unknown> | undefined
		if (typeof rawMetadata === "string" && rawMetadata.trim().length > 0) {
			try {
				const parsed = JSON.parse(rawMetadata)
				if (parsed && typeof parsed === "object") {
					extraMetadata = parsed as Record<string, unknown>
				}
			} catch {
				extraMetadata = undefined
			}
		}

		const base64Content = buffer.toString("base64")
		const dataUrl = `data:${mimeType};base64,${base64Content}`

		const payload = {
			content: dataUrl,
			containerTags,
			metadata: {
				...(extraMetadata ?? {}),
				filename,
				mimeType,
				size: file.size,
				type: "file",
				source: "upload",
			},
		}

		const supabase = createClientForSession(c.var.session)
		const doc = await addDocument({
			organizationId,
			userId: internalUserId,
			payload,
			client: supabase,
		})
		return c.json(doc, 201)
	} catch (error) {
		console.error("File upload failed", error)
		// Use custom status code if provided (e.g., 409 for duplicates)
		const statusCode = (error as any)?.status ?? 500
		const errorCode = (error as any)?.code
		const existingDocumentId = (error as any)?.existingDocumentId
		return c.json(
			{
				error: {
					message:
						error instanceof Error ? error.message : "File upload failed",
					code: errorCode,
					existingDocumentId,
				},
			},
			statusCode,
		)
	}
})

// List documents
documentsRouter.post(
	"/list",
	zValidator("json", ListMemoriesQuerySchema.partial().optional()),
	async (c) => {
		const { organizationId } = c.var.session
		const filters = c.req.valid("json") ?? {}
		const supabase = createClientForSession(c.var.session)

		try {
			const response = await listDocuments(supabase, organizationId, filters)
			return c.json(response)
		} catch (error) {
			console.error("Failed to list documents", error)
			return c.json(
				{
					error: {
						message:
							error instanceof Error
								? error.message
								: "Failed to list documents",
					},
				},
				500,
			)
		}
	},
)

// Documents with memories
documentsRouter.post(
	"/documents",
	zValidator("json", DocumentsWithMemoriesQuerySchema),
	async (c) => {
		const { organizationId } = c.var.session
		const query = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const docs = await listDocumentsWithMemories(
				supabase,
				organizationId,
				query,
			)
			return c.json(docs)
		} catch (error) {
			console.error("Failed to fetch documents with memories:", error)
			return c.json(
				{
					error: {
						message:
							error instanceof Error
								? error.message
								: "Failed to fetch documents",
					},
				},
				500,
			)
		}
	},
)

// Documents by IDs
documentsRouter.post(
	"/documents/by-ids",
	zValidator("json", DocumentsByIdsSchema),
	async (c) => {
		const { organizationId } = c.var.session
		const query = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const docs = await listDocumentsWithMemoriesByIds(
				supabase,
				organizationId,
				query,
			)
			return c.json(docs)
		} catch (error) {
			console.error("Failed to fetch documents by ids", error)
			return c.json({ error: { message: "Failed to fetch documents" } }, 500)
		}
	},
)

// Migrate MCP documents
documentsRouter.post(
	"/migrate-mcp",
	zValidator("json", MigrateMCPRequestSchema),
	async (c) => {
		const { organizationId } = c.var.session
		const payload = c.req.valid("json")

		try {
			const response = await migrateMcpDocuments(organizationId, payload)
			return c.json(response)
		} catch (error) {
			console.error("Failed to migrate MCP documents", error)
			return c.json({ error: { message: "Failed to migrate documents" } }, 500)
		}
	},
)

// Create document bundle (multi-link/note)
documentsRouter.post(
	"/bundle",
	zValidator("json", BundleCreateSchema),
	async (c) => {
		const { organizationId, internalUserId } = c.var.session
		const payload = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const result = await createBundle({
				organizationId,
				userId: internalUserId,
				payload,
				client: supabase,
			})
			return c.json(result, 201)
		} catch (error) {
			console.error("Failed to create bundle", error)
			const statusCode = (error as any)?.status ?? 400
			return c.json(
				{
					error: {
						message:
							error instanceof Error
								? error.message
								: "Failed to create bundle",
						code: (error as any)?.code,
					},
				},
				statusCode,
			)
		}
	},
)

// Resume all paused documents
documentsRouter.post("/resume-all", async (c) => {
	const { organizationId } = c.var.session
	const supabase = createClientForSession(c.var.session)

	try {
		const { data: pausedDocs, error: selectError } = await supabase
			.from("documents")
			.select("id")
			.eq("org_id", organizationId)
			.eq("status", "paused")

		if (selectError) throw selectError

		const documentIds = pausedDocs?.map((d) => d.id) ?? []

		if (documentIds.length === 0) {
			return c.json({ message: "No paused documents found", count: 0 }, 200)
		}

		const { error: docError } = await supabase
			.from("documents")
			.update({ status: "queued" })
			.in("id", documentIds)

		if (docError) throw docError

		const { error: jobError } = await supabase
			.from("ingestion_jobs")
			.update({ status: "queued", error_message: null })
			.in("document_id", documentIds)
			.eq("status", "paused")

		if (jobError) throw jobError

		console.log(
			`[resume-all] Resumed ${documentIds.length} paused documents for org ${organizationId}`,
		)
		return c.json(
			{ message: "All paused documents resumed", count: documentIds.length },
			200,
		)
	} catch (error) {
		console.error("Failed to resume all documents", error)
		return c.json({ error: { message: "Failed to resume documents" } }, 400)
	}
})

// Regenerate summary for a document
documentsRouter.post("/:id/regenerate-summary", async (c) => {
	const { organizationId } = c.var.session
	const documentId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)

	try {
		// 1. Fetch document
		const { data: doc, error } = await supabase
			.from("documents")
			.select("id, content, title, url, source, metadata")
			.eq("id", documentId)
			.eq("org_id", organizationId)
			.single()

		if (error || !doc) {
			return c.json({ error: { message: "Document not found" } }, 404)
		}

		if (!doc.content) {
			return c.json(
				{ error: { message: "Document has no content to summarize" } },
				400,
			)
		}

		// 2. Generate summary
		const { generateSummary } = await import("../services/summarizer")
		const summary = await generateSummary(doc.content, {
			title: doc.title,
			url: doc.url,
		})

		if (!summary) {
			return c.json(
				{
					error: {
						message: "Summary generation failed — check provider credits",
					},
				},
				502,
			)
		}

		// 3. Update document
		const existingMetadata = (doc.metadata as Record<string, unknown>) || {}
		const { error: updateError } = await supabase
			.from("documents")
			.update({
				summary,
				metadata: {
					...existingMetadata,
					summaryFailed: false,
					summaryRegeneratedAt: new Date().toISOString(),
				},
				updated_at: new Date().toISOString(),
			})
			.eq("id", documentId)

		if (updateError) throw updateError

		return c.json({ summary, documentId }, 200)
	} catch (error) {
		console.error("Failed to regenerate summary", error)
		return c.json(
			{
				error: {
					message:
						error instanceof Error
							? error.message
							: "Failed to regenerate summary",
				},
			},
			500,
		)
	}
})

// Get single document
documentsRouter.get("/:id", async (c) => {
	const { organizationId } = c.var.session
	const documentId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)

	try {
		const document = await getDocument(supabase, organizationId, documentId)
		if (!document) {
			return c.json({ error: { message: "Document not found" } }, 404)
		}
		return c.json(document)
	} catch (error) {
		console.error("Failed to fetch document", error)
		return c.json(
			{
				error: {
					message:
						error instanceof Error ? error.message : "Failed to fetch document",
				},
			},
			500,
		)
	}
})

// Get bundle children
documentsRouter.get("/:id/children", async (c) => {
	const { organizationId } = c.var.session
	const parentId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)

	try {
		const children = await getDocumentChildren(
			supabase,
			organizationId,
			parentId,
		)
		return c.json({ children })
	} catch (error) {
		console.error("Failed to fetch document children", error)
		return c.json(
			{
				error: {
					message:
						error instanceof Error ? error.message : "Failed to fetch children",
				},
			},
			500,
		)
	}
})

// Get document processing status with job queue info
documentsRouter.get("/:id/status", async (c) => {
	const { organizationId } = c.var.session
	const documentId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)

	try {
		const status = await getDocumentStatus(supabase, organizationId, documentId)
		if (!status) {
			return c.json({ error: { message: "Document not found" } }, 404)
		}
		return c.json(status)
	} catch (error) {
		console.error("Failed to fetch document status", error)
		return c.json(
			{
				error: {
					message:
						error instanceof Error
							? error.message
							: "Failed to fetch document status",
				},
			},
			500,
		)
	}
})

// Update document
documentsRouter.patch(
	"/:id",
	zValidator(
		"json",
		z
			.object({
				content: z.string().optional(),
				title: z.string().optional(),
				containerTag: z.string().optional(),
				containerTags: z.array(z.string()).optional(),
				metadata: z.record(z.string(), z.unknown()).nullable().optional(),
			})
			.refine(
				(data) =>
					data.content !== undefined ||
					data.title !== undefined ||
					data.containerTag !== undefined ||
					(Array.isArray(data.containerTags) &&
						data.containerTags.length > 0) ||
					data.metadata !== undefined,
				{ message: "At least one field must be provided for update" },
			),
	),
	async (c) => {
		const { organizationId } = c.var.session
		const documentId = c.req.param("id")
		const { content, title, containerTag, containerTags, metadata } =
			c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const normalizedTags =
				containerTags ??
				(containerTag && containerTag.length > 0 ? [containerTag] : undefined)

			const updatedDocument = await updateDocument(supabase, {
				organizationId,
				documentId,
				content,
				title,
				containerTags: normalizedTags,
				metadata,
			})
			return c.json(updatedDocument)
		} catch (error) {
			console.error("Failed to update document", error)
			return c.json(
				{
					error: {
						message:
							error instanceof Error
								? error.message
								: "Failed to update document",
					},
				},
				400,
			)
		}
	},
)

// Cancel document processing
documentsRouter.post("/:id/cancel", async (c) => {
	const { organizationId } = c.var.session
	const documentId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)

	try {
		await cancelDocument(supabase, { organizationId, documentId })
		return c.json({ message: "Document processing cancelled" }, 200)
	} catch (error) {
		console.error("Failed to cancel document", error)
		return c.json({ error: { message: "Failed to cancel document" } }, 400)
	}
})

// Resume single document
documentsRouter.post("/:id/resume", async (c) => {
	const { organizationId } = c.var.session
	const documentId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)

	try {
		const { error: docError } = await supabase
			.from("documents")
			.update({ status: "queued" })
			.eq("id", documentId)
			.eq("org_id", organizationId)
			.eq("status", "paused")

		if (docError) throw docError

		const { error: jobError } = await supabase
			.from("ingestion_jobs")
			.update({ status: "queued", error_message: null })
			.eq("document_id", documentId)
			.eq("status", "paused")

		if (jobError) throw jobError

		return c.json({ message: "Document resumed", documentId }, 200)
	} catch (error) {
		console.error("Failed to resume document", error)
		return c.json({ error: { message: "Failed to resume document" } }, 400)
	}
})

// Find related links
documentsRouter.post("/:id/related-links", async (c) => {
	const { organizationId } = c.var.session
	const documentId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)

	try {
		const result = await findDocumentRelatedLinks(
			supabase,
			documentId,
			organizationId,
		)
		return c.json(result)
	} catch (error) {
		console.error("Failed to find related links", error)
		return c.json(
			{
				success: false,
				relatedLinks: [],
				error: "Failed to find related links",
			},
			500,
		)
	}
})

// --- Document Attachments ---

// Upload attachment
documentsRouter.post("/:id/attachments", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const documentId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)

	try {
		const body = await c.req.parseBody()
		const file = body.file

		if (!file || !(file instanceof File)) {
			return c.json({ error: { message: "No file uploaded" } }, 400)
		}

		const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50MB
		if (file.size > MAX_SIZE_BYTES) {
			return c.json({ error: { message: "File too large (max 50MB)" } }, 413)
		}

		const attachment = await uploadDocumentAttachment(supabase, {
			organizationId,
			userId: internalUserId,
			documentId,
			file,
		})
		return c.json(attachment, 201)
	} catch (error) {
		const statusCode = (error as any)?.status ?? 500
		console.error("Failed to upload attachment", error)
		return c.json(
			{
				error: {
					message:
						error instanceof Error
							? error.message
							: "Failed to upload attachment",
				},
			},
			statusCode,
		)
	}
})

// List attachments
documentsRouter.get("/:id/attachments", async (c) => {
	const { organizationId } = c.var.session
	const documentId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)

	try {
		const attachments = await listDocumentAttachments(
			supabase,
			organizationId,
			documentId,
		)
		return c.json({ attachments })
	} catch (error) {
		console.error("Failed to list attachments", error)
		return c.json({ error: { message: "Failed to list attachments" } }, 500)
	}
})

// Get single attachment (with download URL)
documentsRouter.get("/:id/attachments/:attachmentId", async (c) => {
	const { organizationId } = c.var.session
	const documentId = c.req.param("id")
	const attachmentId = c.req.param("attachmentId")
	const supabase = createClientForSession(c.var.session)

	try {
		const attachment = await getDocumentAttachment(
			supabase,
			organizationId,
			documentId,
			attachmentId,
		)
		if (!attachment) {
			return c.json({ error: { message: "Attachment not found" } }, 404)
		}
		return c.json(attachment)
	} catch (error) {
		console.error("Failed to get attachment", error)
		return c.json({ error: { message: "Failed to get attachment" } }, 500)
	}
})

// Delete attachment
documentsRouter.delete("/:id/attachments/:attachmentId", async (c) => {
	const { organizationId } = c.var.session
	const documentId = c.req.param("id")
	const attachmentId = c.req.param("attachmentId")
	const supabase = createClientForSession(c.var.session)

	try {
		await deleteDocumentAttachment(
			supabase,
			organizationId,
			documentId,
			attachmentId,
		)
		return c.body(null, 204)
	} catch (error) {
		const statusCode = (error as any)?.status ?? 500
		console.error("Failed to delete attachment", error)
		return c.json(
			{ error: { message: "Failed to delete attachment" } },
			statusCode,
		)
	}
})

// Delete document
documentsRouter.delete("/:id", async (c) => {
	const { organizationId } = c.var.session
	const documentId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)

	console.log("[DELETE document] Debug:", {
		organizationId,
		documentId,
		session: c.var.session,
	})

	try {
		await deleteDocument(supabase, { organizationId, documentId })
		return c.body(null, 204)
	} catch (error) {
		console.error("Failed to delete document", {
			error,
			organizationId,
			documentId,
		})
		return c.json({ error: { message: "Failed to delete document" } }, 400)
	}
})
