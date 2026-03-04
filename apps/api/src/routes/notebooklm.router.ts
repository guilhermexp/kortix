/**
 * NotebookLM Router
 * Handles all /v3/notebooklm/* routes for the NotebookLM integration.
 */

import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { z } from "zod"
import { NotebookLMClient } from "../services/notebooklm"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"

export const notebookLmRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

// ─── Helper: Get NotebookLM client from connection ───────────

async function getClient(
	supabase: ReturnType<typeof createClientForSession>,
	organizationId: string,
): Promise<NotebookLMClient> {
	const client = await NotebookLMClient.fromConnection(supabase, organizationId)
	if (!client) {
		throw new Error(
			"NotebookLM not connected. Please connect in Settings → Integrations.",
		)
	}
	return client
}

// ─── Auth: Save cookies from browser popup ───────────────────

/**
 * POST /v3/notebooklm/auth
 * Receives cookies captured from the browser popup after Google login.
 * Validates them by fetching NotebookLM homepage, then stores in connections table.
 */
notebookLmRouter.post(
	"/auth",
	zValidator(
		"json",
		z.object({
			cookies: z.string().min(10),
			email: z.string().email().optional(),
		}),
	),
	async (c) => {
		const { organizationId, userId } = c.var.session
		const { cookies: cookieString, email } = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			// Validate cookies by creating a client (fetches CSRF token + session ID)
			const nlmClient = await NotebookLMClient.fromCookieString(cookieString)

			// Verify by listing notebooks
			const notebooks = await nlmClient.notebooks.list()

			// Save connection to DB
			const authState = nlmClient.getAuthState()
			const { data: existing } = await supabase
				.from("connections")
				.select("id")
				.eq("org_id", organizationId)
				.eq("provider", "notebooklm")
				.maybeSingle()

			if (existing) {
				// Update existing connection
				const { error: updateErr } = await supabase
					.from("connections")
					.update({
						email: email ?? null,
						metadata: {
							cookieHeader: authState.cookieHeader,
							cookies: authState.cookies,
							csrfToken: authState.csrfToken,
							sessionId: authState.sessionId,
							notebookCount: notebooks.length,
							connectedAt: new Date().toISOString(),
						},
						updated_at: new Date().toISOString(),
					})
					.eq("id", existing.id)
				if (updateErr) throw updateErr
			} else {
				// Create new connection
				await supabase.from("connections").insert({
					org_id: organizationId,
					user_id: userId,
					provider: "notebooklm",
					email: email ?? null,
					document_limit: 10000,
					container_tags: [],
					metadata: {
						cookieHeader: authState.cookieHeader,
						cookies: authState.cookies,
						csrfToken: authState.csrfToken,
						sessionId: authState.sessionId,
						notebookCount: notebooks.length,
						connectedAt: new Date().toISOString(),
					},
				})
			}

			return c.json({
				data: {
					success: true,
					notebookCount: notebooks.length,
					email: email ?? null,
				},
			})
		} catch (error) {
			console.error("[NotebookLM] Auth failed:", error)
			const message =
				error instanceof Error ? error.message : "Authentication failed"
			return c.json({ error: { message } }, 401)
		}
	},
)

// ─── Status: Check if connected ──────────────────────────────

/**
 * GET /v3/notebooklm/status
 * Returns connection status and basic info.
 */
notebookLmRouter.get("/status", async (c) => {
	const { organizationId } = c.var.session
	const supabase = createClientForSession(c.var.session)

	const { data: connection } = await supabase
		.from("connections")
		.select("id, email, metadata, created_at")
		.eq("org_id", organizationId)
		.eq("provider", "notebooklm")
		.maybeSingle()

	if (!connection) {
		return c.json({ data: { connected: false } })
	}

	const meta = (connection.metadata ?? {}) as Record<string, unknown>
	return c.json({
		data: {
			connected: true,
			connectionId: connection.id,
			email: connection.email,
			notebookCount: meta.notebookCount ?? null,
			connectedAt: meta.connectedAt ?? connection.created_at,
		},
	})
})

// ─── Notebooks ───────────────────────────────────────────────

/**
 * GET /v3/notebooklm/notebooks
 * List all notebooks in the user's NotebookLM account.
 */
notebookLmRouter.get("/notebooks", async (c) => {
	const { organizationId } = c.var.session
	const supabase = createClientForSession(c.var.session)

	try {
		const nlm = await getClient(supabase, organizationId)
		const notebooks = await nlm.notebooks.list()

		return c.json({ data: notebooks })
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to list notebooks"
		return c.json({ error: { message } }, 500)
	}
})

/**
 * POST /v3/notebooklm/notebooks
 * Create a new notebook.
 */
notebookLmRouter.post(
	"/notebooks",
	zValidator(
		"json",
		z.object({
			title: z.string().min(1).max(200),
		}),
	),
	async (c) => {
		const { organizationId } = c.var.session
		const supabase = createClientForSession(c.var.session)
		const { title } = c.req.valid("json")

		try {
			const nlm = await getClient(supabase, organizationId)
			const notebook = await nlm.notebooks.create(title)
			return c.json({ data: notebook })
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to create notebook"
			return c.json({ error: { message } }, 500)
		}
	},
)

/**
 * DELETE /v3/notebooklm/notebooks/:notebookId
 * Delete a notebook.
 */
notebookLmRouter.delete("/notebooks/:notebookId", async (c) => {
	const { organizationId } = c.var.session
	const supabase = createClientForSession(c.var.session)
	const notebookId = c.req.param("notebookId")

	try {
		const nlm = await getClient(supabase, organizationId)
		await nlm.notebooks.delete(notebookId)
		return c.json({ data: { success: true } })
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to delete notebook"
		return c.json({ error: { message } }, 500)
	}
})

// ─── Sources ─────────────────────────────────────────────────

/**
 * GET /v3/notebooklm/notebooks/:notebookId/sources
 * List sources in a notebook.
 */
notebookLmRouter.get("/notebooks/:notebookId/sources", async (c) => {
	const { organizationId } = c.var.session
	const supabase = createClientForSession(c.var.session)
	const notebookId = c.req.param("notebookId")

	try {
		const nlm = await getClient(supabase, organizationId)
		const sources = await nlm.sources.list(notebookId)
		return c.json({ data: sources })
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to list sources"
		return c.json({ error: { message } }, 500)
	}
})

/**
 * POST /v3/notebooklm/notebooks/:notebookId/sources
 * Add a source (URL or text) to a notebook.
 */
notebookLmRouter.post(
	"/notebooks/:notebookId/sources",
	zValidator(
		"json",
		z.object({
			type: z.enum(["url", "text"]),
			url: z.string().url().optional(),
			title: z.string().optional(),
			content: z.string().optional(),
		}),
	),
	async (c) => {
		const { organizationId } = c.var.session
		const supabase = createClientForSession(c.var.session)
		const notebookId = c.req.param("notebookId")
		const { type, url, title, content } = c.req.valid("json")

		try {
			const nlm = await getClient(supabase, organizationId)

			let source = null
			if (type === "url" && url) {
				source = await nlm.sources.addUrl(notebookId, url)
			} else if (type === "text" && title && content) {
				source = await nlm.sources.addText(notebookId, title, content)
			} else {
				return c.json(
					{
						error: { message: "Invalid source: provide url or title+content" },
					},
					400,
				)
			}

			return c.json({ data: source })
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to add source"
			return c.json({ error: { message } }, 500)
		}
	},
)

// ─── Artifacts ───────────────────────────────────────────────

/**
 * POST /v3/notebooklm/notebooks/:notebookId/artifacts
 * Generate an artifact (audio, video, report, infographic, etc.).
 */
notebookLmRouter.post(
	"/notebooks/:notebookId/artifacts",
	zValidator(
		"json",
		z.object({
			type: z.enum([
				"audio",
				"video",
				"report",
				"infographic",
				"slide_deck",
				"mind_map",
			]),
			sourceIds: z.array(z.string()).optional(),
			options: z.record(z.unknown()).optional(),
		}),
	),
	async (c) => {
		const { organizationId } = c.var.session
		const supabase = createClientForSession(c.var.session)
		const notebookId = c.req.param("notebookId")
		const { type, sourceIds, options: opts } = c.req.valid("json")

		try {
			const nlm = await getClient(supabase, organizationId)

			let status = null
			switch (type) {
				case "audio":
					status = await nlm.artifacts.generateAudio(notebookId, {
						sourceIds,
						...(opts as Record<string, unknown>),
					})
					break
				case "video":
					status = await nlm.artifacts.generateVideo(notebookId, {
						sourceIds,
						...(opts as Record<string, unknown>),
					})
					break
				case "report":
					status = await nlm.artifacts.generateReport(notebookId, {
						sourceIds,
						...(opts as Record<string, unknown>),
					})
					break
				case "infographic":
					status = await nlm.artifacts.generateInfographic(notebookId, {
						sourceIds,
						...(opts as Record<string, unknown>),
					})
					break
				case "slide_deck":
					status = await nlm.artifacts.generateSlideDeck(notebookId, {
						sourceIds,
						...(opts as Record<string, unknown>),
					})
					break
				case "mind_map":
					status = await nlm.artifacts.generateMindMap(notebookId, sourceIds)
					break
			}

			return c.json({ data: status })
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to generate artifact"
			return c.json({ error: { message } }, 500)
		}
	},
)

/**
 * GET /v3/notebooklm/notebooks/:notebookId/artifacts
 * List all artifacts in a notebook.
 */
notebookLmRouter.get("/notebooks/:notebookId/artifacts", async (c) => {
	const { organizationId } = c.var.session
	const supabase = createClientForSession(c.var.session)
	const notebookId = c.req.param("notebookId")

	try {
		const nlm = await getClient(supabase, organizationId)
		const artifacts = await nlm.artifacts.list(notebookId)
		return c.json({ data: artifacts })
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to list artifacts"
		return c.json({ error: { message } }, 500)
	}
})

// ─── Chat ────────────────────────────────────────────────────

/**
 * POST /v3/notebooklm/notebooks/:notebookId/chat
 * Ask a question about the notebook's sources.
 */
notebookLmRouter.post(
	"/notebooks/:notebookId/chat",
	zValidator(
		"json",
		z.object({
			question: z.string().min(1),
			sourceIds: z.array(z.string()).optional(),
			conversationId: z.string().optional(),
		}),
	),
	async (c) => {
		const { organizationId } = c.var.session
		const supabase = createClientForSession(c.var.session)
		const notebookId = c.req.param("notebookId")
		const { question, sourceIds, conversationId } = c.req.valid("json")

		try {
			const nlm = await getClient(supabase, organizationId)
			const result = await nlm.chat.ask(notebookId, question, {
				sourceIds,
				conversationId,
			})
			return c.json({ data: result })
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to chat"
			return c.json({ error: { message } }, 500)
		}
	},
)

// ─── Sync: Link project to notebook ──────────────────────────

/**
 * POST /v3/notebooklm/sync/link
 * Link a Kortix project (space) to a NotebookLM notebook.
 */
notebookLmRouter.post(
	"/sync/link",
	zValidator(
		"json",
		z.object({
			spaceId: z.string().uuid(),
			notebookId: z.string().min(1),
		}),
	),
	async (c) => {
		const { organizationId } = c.var.session
		const supabase = createClientForSession(c.var.session)
		const { spaceId, notebookId } = c.req.valid("json")

		try {
			// Save mapping in space metadata
			const { data: space, error: fetchErr } = await supabase
				.from("spaces")
				.select("id, metadata")
				.eq("id", spaceId)
				.eq("org_id", organizationId)
				.single()

			if (fetchErr || !space) {
				return c.json({ error: { message: "Project not found" } }, 404)
			}

			const metadata = (space.metadata ?? {}) as Record<string, unknown>
			metadata.notebookLmId = notebookId
			metadata.notebookLmLinkedAt = new Date().toISOString()

			const { error: updateErr } = await supabase
				.from("spaces")
				.update({ metadata })
				.eq("id", spaceId)

			if (updateErr) throw updateErr

			return c.json({ data: { success: true, spaceId, notebookId } })
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to link project"
			return c.json({ error: { message } }, 500)
		}
	},
)

/**
 * POST /v3/notebooklm/sync/push
 * Push all documents from a Kortix project to the linked NotebookLM notebook.
 */
notebookLmRouter.post(
	"/sync/push",
	zValidator(
		"json",
		z.object({
			spaceId: z.string().uuid(),
		}),
	),
	async (c) => {
		const { organizationId } = c.var.session
		const supabase = createClientForSession(c.var.session)
		const { spaceId } = c.req.valid("json")

		try {
			// Get space with linked notebook
			const { data: space } = await supabase
				.from("spaces")
				.select("id, metadata")
				.eq("id", spaceId)
				.eq("org_id", organizationId)
				.single()

			if (!space) {
				return c.json({ error: { message: "Project not found" } }, 404)
			}

			const metadata = (space.metadata ?? {}) as Record<string, unknown>
			const notebookId = metadata.notebookLmId as string | undefined
			if (!notebookId) {
				return c.json(
					{ error: { message: "Project not linked to a NotebookLM notebook" } },
					400,
				)
			}

			const nlm = await getClient(supabase, organizationId)

			// Get existing sources in notebook
			const existingSources = await nlm.sources.list(notebookId)
			const existingUrls = new Set(
				existingSources.map((s) => s.url).filter(Boolean),
			)

			// Get documents from project
			const { data: documents } = await supabase
				.from("documents")
				.select("id, title, url, content, type")
				.eq("org_id", organizationId)
				.eq("space_id", spaceId)
				.eq("status", "done")
				.limit(50)

			if (!documents || documents.length === 0) {
				return c.json({
					data: { synced: 0, skipped: 0, message: "No documents to sync" },
				})
			}

			let synced = 0
			let skipped = 0

			for (const doc of documents) {
				try {
					// Skip if URL already exists in notebook
					if (doc.url && existingUrls.has(doc.url)) {
						skipped++
						continue
					}

					if (doc.url) {
						await nlm.sources.addUrl(notebookId, doc.url)
					} else if (doc.content) {
						await nlm.sources.addText(
							notebookId,
							doc.title ?? "Untitled",
							doc.content.slice(0, 500_000), // NLM has limits
						)
					} else {
						skipped++
						continue
					}
					synced++

					// Small delay to avoid rate limiting
					await new Promise((r) => setTimeout(r, 500))
				} catch (e) {
					console.warn("[NotebookLM sync] Failed to push document", {
						documentId: doc.id,
						error: e instanceof Error ? e.message : String(e),
					})
					skipped++
				}
			}

			return c.json({ data: { synced, skipped, total: documents.length } })
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to sync"
			return c.json({ error: { message } }, 500)
		}
	},
)
