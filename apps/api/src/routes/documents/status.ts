/**
 * Documents — status & misc operations
 * (getDocumentStatus, getQueueMetrics, findDocumentRelatedLinks, migrateMcpDocuments)
 */

import {
	MigrateMCPRequestSchema,
	MigrateMCPResponseSchema,
} from "@repo/validation/api"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
	documentQueue,
	getQueueStats,
	isRedisEnabled,
} from "../../services/queue"
import {
	findRelatedLinks,
	type RelatedLink,
} from "../../services/related-links"

/**
 * Get document processing status including job queue information
 */
export async function getDocumentStatus(
	client: SupabaseClient,
	organizationId: string,
	documentId: string,
) {
	// Get document from database
	const { data: document, error } = await client
		.from("documents")
		.select("id, status, title, url, type, created_at, updated_at")
		.eq("org_id", organizationId)
		.eq("id", documentId)
		.maybeSingle()

	if (error) throw error
	if (!document) return null

	const response: any = {
		id: document.id,
		status: document.status ?? "unknown",
		title: document.title ?? null,
		url: document.url ?? null,
		type: document.type ?? null,
		createdAt: document.created_at,
		updatedAt: document.updated_at,
		queueEnabled: isRedisEnabled(),
	}

	// If queue is enabled, try to fetch job info
	if (isRedisEnabled() && documentQueue) {
		try {
			const job = await documentQueue.getJob(`doc-${documentId}`)
			if (job) {
				const state = await job.getState()
				response.job = {
					id: job.id,
					state,
					progress: job.progress,
					attemptsMade: job.attemptsMade,
					processedOn: job.processedOn,
					finishedOn: job.finishedOn,
					failedReason: job.failedReason,
				}
			} else {
				// Job not found in queue (might be completed and removed)
				response.job = null
			}
		} catch (queueError) {
			console.warn("[getDocumentStatus] Failed to fetch job info", {
				documentId,
				error:
					queueError instanceof Error ? queueError.message : String(queueError),
			})
			response.job = null
		}
	} else {
		response.job = null
	}

	return response
}

/**
 * Get queue metrics and statistics
 */
export async function getQueueMetrics() {
	if (!isRedisEnabled()) {
		return null
	}

	try {
		const stats = await getQueueStats()
		return stats
	} catch (error) {
		console.error("[getQueueMetrics] Failed to fetch queue stats", {
			error: error instanceof Error ? error.message : String(error),
		})
		return null
	}
}

export async function findDocumentRelatedLinks(
	supabase: SupabaseClient,
	documentId: string,
	organizationId: string,
): Promise<{ success: boolean; relatedLinks: RelatedLink[]; error?: string }> {
	console.log("[findDocumentRelatedLinks] Starting for document:", documentId)

	// Get document content
	const { data: document, error: fetchError } = await supabase
		.from("documents")
		.select("id, content, title, url, raw")
		.eq("id", documentId)
		.eq("org_id", organizationId)
		.single()

	if (fetchError || !document) {
		console.error(
			"[findDocumentRelatedLinks] Failed to fetch document:",
			fetchError,
		)
		return { success: false, relatedLinks: [], error: "Document not found" }
	}

	const content = document.content || ""
	if (content.length < 100) {
		return {
			success: false,
			relatedLinks: [],
			error: "Content too short for analysis",
		}
	}

	// Find related links
	console.log("[findDocumentRelatedLinks] Finding related links...")
	const relatedLinks = await findRelatedLinks(content, { maxLinks: 10 })

	if (relatedLinks.length === 0) {
		console.log("[findDocumentRelatedLinks] No related links found")
		return { success: true, relatedLinks: [] }
	}

	console.log(
		`[findDocumentRelatedLinks] Found ${relatedLinks.length} related links`,
	)

	// Update document raw with related links
	const existingRaw = (document.raw as Record<string, unknown>) || {}
	const updatedRaw = {
		...existingRaw,
		relatedLinks,
	}

	const { error: updateError } = await supabase
		.from("documents")
		.update({ raw: updatedRaw })
		.eq("id", documentId)

	if (updateError) {
		console.error(
			"[findDocumentRelatedLinks] Failed to update document:",
			updateError,
		)
		return {
			success: false,
			relatedLinks,
			error: "Failed to save related links",
		}
	}

	console.log("[findDocumentRelatedLinks] Successfully saved related links")
	return { success: true, relatedLinks }
}

export async function migrateMcpDocuments(
	_organizationId: string,
	body: unknown,
) {
	const payload = MigrateMCPRequestSchema.parse(body ?? {})

	const response = {
		success: true,
		migratedCount: 0,
		message: `MCP migration placeholder for target ${payload.targetUrl}`,
		documentIds: [] as string[],
	}

	return MigrateMCPResponseSchema.parse(response)
}
