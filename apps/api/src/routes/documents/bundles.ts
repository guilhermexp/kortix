/**
 * Documents — bundle operations (createBundle, getDocumentChildren, updateBundleParentStatus)
 */

import { BundleCreateSchema, BundleResponseSchema } from "@repo/validation/api"
import type { SupabaseClient } from "@supabase/supabase-js"
import { processDocumentInline } from "../../services/document-processor-inline"
import { sanitizeString } from "../../services/ingestion/utils"
import { addDocument, ensureSpace } from "./add"
import type { BundleCreateInput, MemoryAddInput } from "./utils"
import {
	defaultContainerTag,
	extractOgImageQuick,
	invalidateDocumentCaches,
	resolveDefaultProject,
} from "./utils"

export async function createBundle({
	organizationId,
	userId,
	payload,
	client,
}: {
	organizationId: string
	userId: string
	payload: BundleCreateInput
	client: SupabaseClient
}) {
	const parsed = BundleCreateSchema.parse(payload)

	// If only 1 item, delegate to the standard addDocument flow
	if (parsed.items.length === 1) {
		const item = parsed.items[0]
		return addDocument({
			organizationId,
			userId,
			payload: {
				content: item.content,
				containerTags: parsed.containerTags,
				metadata: item.metadata ?? parsed.metadata ?? undefined,
			},
			client,
		})
	}

	// --- Multi-item bundle ---

	// Resolve container tag: respect user choice, otherwise auto-route from first link
	let containerTag =
		parsed.containerTags && parsed.containerTags.length > 0
			? parsed.containerTags[0]
			: defaultContainerTag

	// Try to infer project from first link item
	const firstLink = parsed.items.find((it) => it.type === "link")
	if (containerTag === defaultContainerTag && firstLink) {
		const isUrl = /^https?:\/\//i.test(firstLink.content)
		containerTag = resolveDefaultProject({
			type: isUrl ? "url" : "text",
			source: isUrl ? "web" : "manual",
			url: isUrl ? firstLink.content : null,
		})
	}

	const spaceId = await ensureSpace(client, organizationId, containerTag)

	// Create the parent bundle document
	const bundleTitle = parsed.title ?? `Bundle (${parsed.items.length} items)`

	const { data: parentDoc, error: parentError } = await client
		.from("documents")
		.insert({
			org_id: organizationId,
			user_id: userId,
			space_id: spaceId,
			title: bundleTitle,
			content: null,
			url: null,
			source: "bundle",
			status: "processing",
			type: "bundle",
			metadata: parsed.metadata ?? null,
			chunk_count: 0,
		})
		.select("id, status")
		.single()

	if (parentError) {
		console.error("[createBundle] Failed to insert parent", parentError)
		throw parentError
	}

	const parentId = parentDoc.id

	// Insert children + create ingestion jobs
	const children: Array<{
		id: string
		status: string
		url: string | null
		type: string
	}> = []

	for (let i = 0; i < parsed.items.length; i++) {
		const item = parsed.items[i]
		const isUrl = /^https?:\/\//i.test(item.content)
		const inferredType = item.type === "note" ? "text" : isUrl ? "url" : "text"
		const inferredSource =
			item.type === "note" ? "manual" : isUrl ? "web" : "manual"
		const inferredUrl = isUrl ? item.content : null
		const initialTitle = isUrl
			? null
			: sanitizeString(item.content.slice(0, 80))
		const initialContent = isUrl ? null : sanitizeString(item.content)

		const childMetadata: Record<string, unknown> = {
			...(item.metadata ?? {}),
			...(isUrl ? { originalUrl: item.content } : {}),
		}

		const { data: childDoc, error: childError } = await client
			.from("documents")
			.insert({
				org_id: organizationId,
				user_id: userId,
				space_id: spaceId,
				parent_id: parentId,
				child_order: i,
				title: initialTitle,
				content: initialContent,
				url: inferredUrl,
				source: inferredSource,
				status: "queued",
				type: inferredType,
				metadata: Object.keys(childMetadata).length > 0 ? childMetadata : null,
				chunk_count: 0,
			})
			.select("id, status")
			.single()

		if (childError) {
			console.error("[createBundle] Failed to insert child", childError)
			continue
		}

		children.push({
			id: childDoc.id,
			status: childDoc.status ?? "queued",
			url: inferredUrl,
			type: item.type,
		})

		// Quick OG image extraction for URL children (non-blocking)
		if (isUrl && inferredUrl) {
			extractOgImageQuick(inferredUrl)
				.then(async (ogImage) => {
					if (ogImage) {
						await client
							.from("documents")
							.update({ preview_image: ogImage })
							.eq("id", childDoc.id)
							.eq("org_id", organizationId)
					}
				})
				.catch(() => {})
		}

		// Create ingestion job for child
		const { data: jobRecord } = await client
			.from("ingestion_jobs")
			.insert({
				document_id: childDoc.id,
				org_id: organizationId,
				status: "queued",
				payload: {
					containerTags: [containerTag],
					content: item.content,
					metadata: childMetadata,
					url: inferredUrl,
					type: inferredType,
					source: inferredSource,
				},
			})
			.select("id")
			.single()

		// Process inline (async)
		if (jobRecord) {
			processDocumentInline({
				documentId: childDoc.id,
				jobId: jobRecord.id,
				orgId: organizationId,
				payload: {
					containerTags: [containerTag],
					content: item.content,
					metadata: childMetadata,
					url: inferredUrl,
					type: inferredType,
					source: inferredSource,
				},
			}).catch((err) => {
				console.error("[createBundle] Child processing failed", {
					childId: childDoc.id,
					error: err instanceof Error ? err.message : String(err),
				})
			})
		}
	}

	invalidateDocumentCaches()

	return BundleResponseSchema.parse({
		id: parentId,
		status: "processing",
		children,
	})
}

/**
 * Get children of a bundle document, ordered by child_order
 */
export async function getDocumentChildren(
	client: SupabaseClient,
	organizationId: string,
	parentId: string,
) {
	const { data, error } = await client
		.from("documents")
		.select(
			"id, title, summary, status, url, type, content, preview_image, child_order, created_at, updated_at",
		)
		.eq("org_id", organizationId)
		.eq("parent_id", parentId)
		.order("child_order", { ascending: true })

	if (error) throw error

	return (data ?? []).map((child) => ({
		id: child.id,
		title: child.title ?? null,
		previewImage: child.preview_image ?? null,
		summary: child.summary ?? null,
		status: child.status ?? "unknown",
		url: child.url ?? null,
		type: child.type ?? "text",
		content: child.content ?? null,
		childOrder: child.child_order ?? 0,
	}))
}

/**
 * Update the parent bundle status based on children statuses.
 * Called after a child finishes processing.
 */
export async function updateBundleParentStatus(
	client: SupabaseClient,
	parentId: string,
	organizationId: string,
) {
	const { data: children, error } = await client
		.from("documents")
		.select("id, status, preview_image, summary")
		.eq("parent_id", parentId)
		.eq("org_id", organizationId)

	if (error) {
		console.error("[updateBundleParentStatus] Failed to fetch children", error)
		return
	}

	if (!children || children.length === 0) return

	const statuses = children.map((c) =>
		String(c.status ?? "unknown").toLowerCase(),
	)
	const allDone = statuses.every((s) => s === "done" || s === "failed")
	const anyProcessing = statuses.some((s) => !["done", "failed"].includes(s))

	const updates: Record<string, unknown> = {
		updated_at: new Date().toISOString(),
	}

	if (allDone) {
		updates.status = "done"

		// Set preview image from first child that has one
		const firstPreview = children.find((c) => c.preview_image)
		if (firstPreview) {
			updates.preview_image = firstPreview.preview_image
		}

		// Combine summaries
		const summaries = children
			.filter((c) => c.summary)
			.map((c, i) => `**${i + 1}.** ${c.summary}`)
			.join("\n\n")
		if (summaries) {
			updates.summary = summaries
		}
	} else if (anyProcessing) {
		updates.status = "processing"
	}

	await client
		.from("documents")
		.update(updates)
		.eq("id", parentId)
		.eq("org_id", organizationId)
}
