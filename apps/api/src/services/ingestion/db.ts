import { supabaseAdmin } from "../../supabase"
import type { JsonRecord } from "./utils"

export async function updateDocumentStatus(
	documentId: string,
	status: string,
	extra?: JsonRecord,
) {
	const { error } = await supabaseAdmin
		.from("documents")
		.update({ status, ...(extra ?? {}) })
		.eq("id", documentId)
	if (error) throw error
}

export async function updateJobStatus(
	jobId: string,
	status: string,
	errorMessage?: string,
) {
	const { error } = await supabaseAdmin
		.from("ingestion_jobs")
		.update({ status, error_message: errorMessage ?? null })
		.eq("id", jobId)
	if (error) throw error
}

export async function upsertAutoSummaryMemory(params: {
	documentId: string
	organizationId: string
	userId: string | null | undefined
	spaceId?: string | null
	summary: string
	metadata?: JsonRecord | null
}) {
	const { documentId, organizationId, userId, spaceId, summary, metadata } =
		params
	let summaryMetadata: JsonRecord | null = null
	if (metadata && Object.keys(metadata).length > 0) {
		summaryMetadata = metadata
	}
	const { data: existing, error: fetchError } = await supabaseAdmin
		.from("memories")
		.select("id, version")
		.eq("document_id", documentId)
		.eq("org_id", organizationId)
		.eq("is_inference", true)
		.order("created_at", { ascending: true })
		.limit(1)
	if (fetchError) throw fetchError
	const baseUpdate = {
		content: summary,
		metadata: summaryMetadata,
		updated_at: new Date().toISOString(),
		is_latest: true,
		source_count: 1,
		space_id: spaceId ?? null,
		user_id: userId ?? null,
	}
	if (existing && existing.length > 0) {
		const current = existing[0]
		const nextVersion =
			typeof current.version === "number" && Number.isFinite(current.version)
				? current.version + 1
				: 1
		const { error: updateError } = await supabaseAdmin
			.from("memories")
			.update({ ...baseUpdate, version: nextVersion })
			.eq("id", current.id)
		if (updateError) throw updateError
		return
	}
	const { error: insertError } = await supabaseAdmin.from("memories").insert({
		document_id: documentId,
		org_id: organizationId,
		user_id: userId ?? null,
		space_id: spaceId ?? null,
		content: summary,
		metadata: summaryMetadata,
		is_inference: true,
		is_latest: true,
		source_count: 1,
	})
	if (insertError) throw insertError
}
