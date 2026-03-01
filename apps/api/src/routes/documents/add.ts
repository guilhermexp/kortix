/**
 * Documents — ingestion (addDocument, ensureSpace, checkUrlExists)
 */

import { MemoryAddSchema, MemoryResponseSchema } from "@repo/validation/api"
import type { SupabaseClient } from "@supabase/supabase-js"
import { processDocumentInline } from "../../services/document-processor-inline"
import { sanitizeJson, sanitizeString } from "../../services/ingestion/utils"
import { addConnectionUpdateJob } from "../../worker/connection-updater-job"
import type { MemoryAddInput } from "./utils"
import {
	defaultContainerTag,
	extractOgImageQuick,
	invalidateDocumentCaches,
	resolveDefaultProject,
} from "./utils"

export async function ensureSpace(
	client: SupabaseClient,
	organizationId: string,
	containerTag: string,
) {
	const { data: existing, error: fetchError } = await client
		.from("spaces")
		.select("id, name")
		.eq("org_id", organizationId)
		.eq("container_tag", containerTag)
		.maybeSingle()

	if (fetchError) throw fetchError
	if (existing) return existing.id

	const name =
		containerTag
			.replace(/^sm_project_/, "")
			.replace(/[_-]+/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase()) || "Untitled"

	const { data: created, error: insertError } = await client
		.from("spaces")
		.upsert(
			{
				org_id: organizationId,
				container_tag: containerTag,
				name,
			},
			{ onConflict: "org_id,container_tag", ignoreDuplicates: true },
		)
		.select("id")
		.single()

	if (insertError) {
		// If upsert race: another request created it first, just fetch it
		const { data: retry } = await client
			.from("spaces")
			.select("id")
			.eq("org_id", organizationId)
			.eq("container_tag", containerTag)
			.single()
		if (retry) return retry.id
		throw insertError
	}
	return created.id
}

export async function addDocument({
	organizationId,
	userId,
	payload,
	client,
}: {
	organizationId: string
	userId: string
	payload: MemoryAddInput
	client: SupabaseClient
}) {
	const parsed = MemoryAddSchema.parse(payload)
	const rawContent = parsed.content?.trim()

	if (!rawContent) {
		throw new Error("Content is required to create a document")
	}

	// Guardrail: local filesystem paths pasted into the URL/text box are not fetchable by the server.
	// They often look like "/var/folders/.../file.png" or "file:///...".
	// If the user intended to upload a file, they should use `/v3/documents/file`.
	const looksLikeLocalFilePath =
		!rawContent.includes("\n") &&
		rawContent.length <= 500 &&
		(/^(file:\/\/|\/|~\/|[a-zA-Z]:\\)/.test(rawContent) ||
			rawContent.includes("/var/folders/")) &&
		/\.[a-z0-9]{2,8}$/i.test(rawContent) &&
		!/^https?:\/\//i.test(rawContent)
	if (looksLikeLocalFilePath) {
		throw new Error(
			"Looks like a local file path. Upload the file instead (POST /v3/documents/file).",
		)
	}

	const isUrl = /^https?:\/\//i.test(rawContent)

	// Infer type/source/url early so auto-routing can use them
	const inferredType =
		(parsed.metadata?.type as string | undefined) ?? (isUrl ? "url" : "text")
	const inferredSource =
		(parsed.metadata?.source as string | undefined) ??
		(isUrl ? "web" : "manual")
	const inferredUrl = isUrl
		? rawContent
		: ((parsed.metadata?.url as string | undefined) ?? null)

	// Resolve container tag: respect user choice, otherwise auto-route by type/source/URL
	let [containerTag] =
		parsed.containerTags && parsed.containerTags.length > 0
			? parsed.containerTags
			: [defaultContainerTag]

	if (containerTag === defaultContainerTag) {
		containerTag = resolveDefaultProject({
			type: inferredType,
			source: inferredSource,
			url: inferredUrl,
		})
	}

	const spaceId = await ensureSpace(client, organizationId, containerTag)

	const baseMetadata: Record<string, unknown> = {
		...(parsed.metadata ?? {}),
	}
	if (isUrl) {
		baseMetadata.originalUrl = rawContent
		// Provide an immediate preview while extraction runs: use site favicon
		try {
			const u = new URL(rawContent)
			const favicon = new URL("/favicon.ico", u.origin).toString()
			if (!baseMetadata.favicon) {
				baseMetadata.favicon = favicon
			}
		} catch {}
	}
	// Sanitize metadata to prevent Unicode surrogate errors
	const metadata =
		Object.keys(baseMetadata).length > 0
			? (sanitizeJson(baseMetadata) as Record<string, unknown>)
			: null
	const initialTitle = sanitizeString(
		(parsed.metadata?.title as string | undefined) ??
			(isUrl ? null : rawContent.slice(0, 80)) ??
			"Untitled",
	)
	const initialContent = isUrl ? null : sanitizeString(rawContent)

	// Ensure document is assigned to the target space (direct relationship via space_id)
	async function ensureDocumentInSpace(
		documentId: string,
		targetSpaceId: string,
	): Promise<boolean> {
		// Check current space_id
		const { data: doc, error: fetchErr } = await client
			.from("documents")
			.select("space_id")
			.eq("id", documentId)
			.eq("org_id", organizationId)
			.maybeSingle()

		if (fetchErr) {
			console.error(
				"[ensureDocumentInSpace] Failed to fetch document",
				fetchErr,
			)
			throw fetchErr
		}

		if (!doc) {
			throw new Error(`Document ${documentId} not found`)
		}

		// If already in the target space, no action needed
		if (doc.space_id === targetSpaceId) {
			return false
		}

		// Update to target space
		const { error: updateErr } = await client
			.from("documents")
			.update({ space_id: targetSpaceId })
			.eq("id", documentId)
			.eq("org_id", organizationId)

		if (updateErr) {
			console.error(
				"[ensureDocumentInSpace] Failed to update document space",
				updateErr,
			)
			throw updateErr
		}
		return true
	}

	// Deduplicate: check for existing documents with same URL or content hash
	// For URLs: check by URL
	// For text: check by content hash (if content is short enough to be exact match)
	const shouldCheckDuplicates =
		isUrl || (initialContent && initialContent.length < 1000)

	if (shouldCheckDuplicates) {
		let existing: {
			id: string
			status: string | null
			space_id: string | null
		} | null = null

		if (isUrl && inferredUrl) {
			// Check by URL
			const { data: urlDoc, error: urlError } = await client
				.from("documents")
				.select("id, status, space_id")
				.eq("org_id", organizationId)
				.eq("url", inferredUrl)
				.order("created_at", { ascending: false })
				.limit(1)
				.maybeSingle()

			if (!urlError && urlDoc) {
				existing = urlDoc
			}
		} else if (initialContent) {
			// For short text documents, check by exact content match
			// Only check recent documents (last 7 days) to avoid performance issues
			const sevenDaysAgo = new Date(
				Date.now() - 7 * 24 * 60 * 60 * 1000,
			).toISOString()
			const { data: contentDoc, error: contentError } = await client
				.from("documents")
				.select("id, status, space_id")
				.eq("org_id", organizationId)
				.eq("content", initialContent)
				.eq("type", inferredType)
				.gte("created_at", sevenDaysAgo)
				.order("created_at", { ascending: false })
				.limit(1)
				.maybeSingle()

			if (!contentError && contentDoc) {
				existing = contentDoc
			}
		}

		if (existing) {
			const currentStatus = String(existing.status ?? "unknown").toLowerCase()
			const processingStates = new Set([
				"queued",
				"fetching",
				"generating_preview",
				"extracting",
				"chunking",
				"embedding",
				"processing",
				"indexing",
			])

			// If document already exists and is done or processing, reject the submission
			// This saves resources and provides clear feedback to the user
			if (currentStatus === "done") {
				const error = new Error(
					"Este documento já existe na sua biblioteca. URL duplicada.",
				)
				;(error as any).code = "DUPLICATE_DOCUMENT"
				;(error as any).existingDocumentId = existing.id
				;(error as any).status = 409
				throw error
			}

			if (processingStates.has(currentStatus)) {
				const error = new Error(
					"Este documento já está sendo processado. Aguarde a conclusão.",
				)
				;(error as any).code = "DOCUMENT_PROCESSING"
				;(error as any).existingDocumentId = existing.id
				;(error as any).status = 409
				throw error
			}

			if (currentStatus === "failed") {
				// Requeue existing failed document rather than creating a new one
				// First ensure it's in the right space
				try {
					await ensureDocumentInSpace(existing.id, spaceId)
				} catch (e) {
					console.error("[addDocument] Failed mapping doc to project", {
						documentId: existing.id,
						spaceId,
						error: e instanceof Error ? e.message : String(e),
					})
				}

				const { error: updateError } = await client
					.from("documents")
					.update({ status: "queued", error: null })
					.eq("id", existing.id)
					.eq("org_id", organizationId)
				if (updateError) {
					console.error("[addDocument] Failed to requeue document", updateError)
					throw updateError
				}

				// Check if there's already a pending job for this document (queued or processing)
				const { data: existingJob } = await client
					.from("ingestion_jobs")
					.select("id")
					.eq("document_id", existing.id)
					.in("status", ["queued", "processing"])
					.maybeSingle()

				let jobId: string | undefined
				if (!existingJob) {
					const { data: jobRecord, error: jobError } = await client
						.from("ingestion_jobs")
						.insert({
							document_id: existing.id,
							org_id: organizationId,
							status: "queued",
							payload: {
								containerTags: parsed.containerTags ?? [containerTag],
								content: rawContent,
								metadata,
								url: inferredUrl,
								type: inferredType,
								source: inferredSource,
							},
						})
						.select("id")
						.single()
					if (jobError) {
						console.error("[addDocument] Failed to create job", jobError)
						throw jobError
					}
					jobId = jobRecord?.id
				} else {
					jobId = existingJob.id
				}

				// Process document inline (async - doesn't block response)
				if (jobId) {
					processDocumentInline({
						documentId: existing.id,
						jobId,
						orgId: organizationId,
						payload: {
							containerTags: parsed.containerTags ?? [containerTag],
							content: rawContent,
							metadata,
							url: inferredUrl,
							type: inferredType,
							source: inferredSource,
						},
					}).catch((err) => {
						console.error("[addDocument] Background reprocessing failed", {
							documentId: existing.id,
							error: err instanceof Error ? err.message : String(err),
						})
					})
				}

				// Queue connection update job (async - doesn't block response)
				addConnectionUpdateJob(existing.id, organizationId).catch((err) => {
					console.error("[addDocument] Failed to queue connection update", {
						documentId: existing.id,
						error: err instanceof Error ? err.message : String(err),
					})
				})

				invalidateDocumentCaches()
				return MemoryResponseSchema.parse({
					id: existing.id,
					status: "processing",
				})
			}
		}
	}

	const { data: document, error: insertError } = await client
		.from("documents")
		.insert({
			org_id: organizationId,
			user_id: userId,
			space_id: spaceId,
			title: initialTitle,
			content: initialContent,
			url: inferredUrl,
			source: inferredSource,
			status: "queued",
			type: inferredType,
			metadata,
			chunk_count: 0,
		})
		.select("id, status")
		.single()

	if (insertError) {
		console.error("[addDocument] Failed to insert document", insertError)
		// Check if it's a duplicate key error (race condition)
		if (
			insertError.code === "23505" ||
			insertError.message.includes("duplicate")
		) {
			// Document was created by another request - try to find it
			if (isUrl && inferredUrl) {
				const { data: existing } = await client
					.from("documents")
					.select("id, status")
					.eq("org_id", organizationId)
					.eq("url", inferredUrl)
					.order("created_at", { ascending: false })
					.limit(1)
					.maybeSingle()

				if (existing) {
					// Try to ensure it's in the right space
					try {
						await ensureDocumentInSpace(existing.id, spaceId)
					} catch {
						// Ignore errors here
					}
					return {
						id: existing.id,
						status: existing.status ?? "queued",
						alreadyExists: true,
						addedToProject: false,
					}
				}
			}
		}
		throw insertError
	}

	const docId = document.id

	// NOTE: No longer using documents_to_spaces junction table
	// Space is set via space_id in the document INSERT above

	// Quick OG image extraction for immediate preview (non-blocking)
	// This runs in the background and updates the document when done
	if (isUrl && inferredUrl) {
		extractOgImageQuick(inferredUrl)
			.then(async (ogImage) => {
				if (ogImage) {
					try {
						await client
							.from("documents")
							.update({ preview_image: ogImage })
							.eq("id", docId)
							.eq("org_id", organizationId)
						console.log("[addDocument] Quick OG image set for document", {
							docId,
							ogImage: ogImage.slice(0, 100),
						})
					} catch (e) {
						console.log(
							"[addDocument] Failed to update OG image:",
							e instanceof Error ? e.message : String(e),
						)
					}
				}
			})
			.catch(() => {
				// Silently ignore - preview is optional
			})
	}

	// Check if job already exists (race condition protection)
	// Include both queued and processing status to prevent duplicate jobs
	const { data: existingJob } = await client
		.from("ingestion_jobs")
		.select("id")
		.eq("document_id", docId)
		.in("status", ["queued", "processing"])
		.maybeSingle()

	let jobId: string | undefined
	if (!existingJob) {
		const { data: jobRecord, error: jobError } = await client
			.from("ingestion_jobs")
			.insert({
				document_id: docId,
				org_id: organizationId,
				status: "queued",
				payload: {
					containerTags: parsed.containerTags ?? [containerTag],
					content: rawContent,
					metadata,
					url: inferredUrl,
					type: inferredType,
					source: inferredSource,
				},
			})
			.select("id")
			.single()

		if (jobError) {
			console.error("[addDocument] Failed to create job", jobError)
			// If job creation fails, try to clean up the document
			// But don't fail the request - the document exists and can be processed later
			console.warn("[addDocument] Document created but job creation failed", {
				documentId: docId,
				error: jobError.message,
			})
		} else {
			jobId = jobRecord?.id
		}
	} else {
		jobId = existingJob.id
	}

	// Always process document inline (doesn't block response)
	if (jobId) {
		// Update document status to "processing" in DB so frontend polling sees it immediately
		await client
			.from("documents")
			.update({ status: "processing" })
			.eq("id", docId)

		// Fire and forget - process in background
		processDocumentInline({
			documentId: docId,
			jobId,
			orgId: organizationId,
			payload: {
				containerTags: parsed.containerTags ?? [containerTag],
				content: rawContent,
				metadata,
				url: inferredUrl,
				type: inferredType,
				source: inferredSource,
			},
		}).catch((err) => {
			console.error("[addDocument] Background processing failed", {
				documentId: docId,
				error: err instanceof Error ? err.message : String(err),
			})
		})
	}

	// Queue connection update job (async - doesn't block response)
	addConnectionUpdateJob(docId, organizationId).catch((err) => {
		console.error("[addDocument] Failed to queue connection update", {
			documentId: docId,
			error: err instanceof Error ? err.message : String(err),
		})
	})

	invalidateDocumentCaches()
	return MemoryResponseSchema.parse({ id: docId, status: "processing" })
}

/**
 * Check if a URL already exists in the organization's documents
 * Returns the existing document info if found
 */
export async function checkUrlExists(
	client: SupabaseClient,
	organizationId: string,
	url: string,
): Promise<{
	exists: boolean
	document?: { id: string; status: string; title: string | null }
}> {
	const { data: existing, error } = await client
		.from("documents")
		.select("id, status, title")
		.eq("org_id", organizationId)
		.eq("url", url)
		.order("created_at", { ascending: false })
		.limit(1)
		.maybeSingle()

	if (error) {
		console.error("[checkUrlExists] Error checking URL:", error)
		throw error
	}

	if (!existing) {
		return { exists: false }
	}

	return {
		exists: true,
		document: {
			id: existing.id,
			status: existing.status ?? "unknown",
			title: existing.title ?? null,
		},
	}
}
