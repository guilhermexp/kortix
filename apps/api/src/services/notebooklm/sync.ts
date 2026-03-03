/**
 * NotebookLM Sync Service
 * Handles automatic synchronization between Kortix projects and NotebookLM notebooks.
 *
 * Sync flow:
 * 1. When a document is added to a Kortix project → add as source to linked NLM notebook
 * 2. When a project is created → optionally create corresponding NLM notebook
 * 3. When project is linked → push existing documents to NLM notebook
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { NotebookLMClient } from "./client"

/**
 * Sync a single document to the linked NotebookLM notebook.
 * Called from the ingestion pipeline after a document is processed.
 *
 * This is fire-and-forget — errors are logged but don't block the pipeline.
 */
export async function syncDocumentToNotebookLM(params: {
	supabase: SupabaseClient
	organizationId: string
	spaceId: string
	document: {
		id: string
		title: string | null
		url: string | null
		content: string | null
		type: string
	}
}): Promise<void> {
	const { supabase, organizationId, spaceId, document } = params

	try {
		// 1. Check if space has a linked notebook
		const { data: space, error: spaceErr } = await supabase
			.from("spaces")
			.select("metadata")
			.eq("id", spaceId)
			.eq("org_id", organizationId)
			.single()

		if (spaceErr) {
			console.warn("[NotebookLM sync] Failed to fetch space metadata", {
				spaceId,
				error: spaceErr.message,
			})
			return
		}

		if (!space?.metadata) return

		const metadata = space.metadata as Record<string, unknown>
		const notebookId = metadata.notebookLmId as string | undefined
		if (!notebookId) return

		// 2. Get NotebookLM client
		const nlm = await NotebookLMClient.fromConnection(supabase, organizationId)
		if (!nlm) return

		// 3. Add document as source
		if (document.url) {
			await nlm.sources.addUrl(notebookId, document.url)
		} else if (document.content) {
			await nlm.sources.addText(
				notebookId,
				document.title ?? "Untitled",
				document.content.slice(0, 500_000),
			)
		}

		console.log("[NotebookLM sync] Document synced", {
			documentId: document.id,
			notebookId,
		})
	} catch (error) {
		// Non-blocking: log and continue
		console.warn("[NotebookLM sync] Failed to sync document", {
			documentId: document.id,
			spaceId,
			error: error instanceof Error ? error.message : String(error),
		})
	}
}

/**
 * Create a NotebookLM notebook for a Kortix project.
 * Stores the notebook ID in the space metadata.
 */
export async function createNotebookForProject(params: {
	supabase: SupabaseClient
	organizationId: string
	spaceId: string
	projectName: string
}): Promise<string | null> {
	const { supabase, organizationId, spaceId, projectName } = params

	try {
		const nlm = await NotebookLMClient.fromConnection(supabase, organizationId)
		if (!nlm) return null

		const notebook = await nlm.notebooks.create(projectName)

		// Save mapping
		const { data: space } = await supabase
			.from("spaces")
			.select("metadata")
			.eq("id", spaceId)
			.eq("org_id", organizationId)
			.single()

		const metadata = ((space?.metadata ?? {}) as Record<string, unknown>)
		metadata.notebookLmId = notebook.id
		metadata.notebookLmLinkedAt = new Date().toISOString()

		const { error: updateErr } = await supabase
			.from("spaces")
			.update({ metadata })
			.eq("id", spaceId)
			.eq("org_id", organizationId)

		if (updateErr) {
			console.warn("[NotebookLM sync] Created notebook but failed to save mapping", {
				spaceId,
				notebookId: notebook.id,
				error: updateErr.message,
			})
		}

		console.log("[NotebookLM sync] Notebook created for project", {
			spaceId,
			notebookId: notebook.id,
		})

		return notebook.id
	} catch (error) {
		console.warn("[NotebookLM sync] Failed to create notebook", {
			spaceId,
			error: error instanceof Error ? error.message : String(error),
		})
		return null
	}
}

/**
 * Check if an organization has NotebookLM connected.
 * Lightweight check — doesn't instantiate the full client.
 */
export async function isNotebookLMConnected(
	supabase: SupabaseClient,
	organizationId: string,
): Promise<boolean> {
	const { data } = await supabase
		.from("connections")
		.select("id")
		.eq("org_id", organizationId)
		.eq("provider", "notebooklm")
		.maybeSingle()

	return !!data
}
