/**
 * Document Connections Router
 * Handles all /v3/document-connections/* routes
 */

import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import {
	CreateManualConnectionSchema,
	FindSimilarDocumentsSchema,
	ListConnectionsQuerySchema,
} from "@repo/validation/document-connections"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"
import {
	createConnection,
	deleteConnection,
	findSimilarDocuments,
	listConnections,
} from "./document-connections"

export const documentConnectionsRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

// Find similar documents
// IMPORTANT: This route must come BEFORE /:connectionId to avoid matching "find-similar" as a connectionId
documentConnectionsRouter.post(
	"/find-similar",
	zValidator("json", FindSimilarDocumentsSchema),
	async (c) => {
		const { organizationId } = c.var.session
		const payload = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const result = await findSimilarDocuments(supabase, {
				organizationId,
				payload,
			})
			return c.json({ data: result })
		} catch (error) {
			console.error("Failed to find similar documents", error)
			return c.json(
				{ error: { message: "Failed to find similar documents" } },
				500,
			)
		}
	},
)

// List connections for a document
// IMPORTANT: This route must come BEFORE /:connectionId to avoid matching "list" as a connectionId
documentConnectionsRouter.post(
	"/list",
	zValidator("json", ListConnectionsQuerySchema),
	async (c) => {
		const { organizationId } = c.var.session
		const payload = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const result = await listConnections(supabase, {
				organizationId,
				documentId: payload.documentId,
				connectionType: payload.connectionType,
				limit: payload.limit,
			})
			return c.json({ data: result })
		} catch (error) {
			console.error("Failed to list document connections", error)
			return c.json(
				{ error: { message: "Failed to list document connections" } },
				500,
			)
		}
	},
)

// Create a manual connection
documentConnectionsRouter.post(
	"/",
	zValidator("json", CreateManualConnectionSchema),
	async (c) => {
		const { organizationId, userId } = c.var.session
		const payload = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const result = await createConnection(supabase, {
				organizationId,
				userId,
				payload,
			})
			return c.json({ data: result })
		} catch (error) {
			console.error("Failed to create manual connection", error)
			return c.json(
				{ error: { message: "Failed to create manual connection" } },
				500,
			)
		}
	},
)

// Delete a connection
documentConnectionsRouter.delete("/:connectionId", async (c) => {
	const { organizationId, userId } = c.var.session
	const connectionId = c.req.param("connectionId")
	const supabase = createClientForSession(c.var.session)

	try {
		const result = await deleteConnection(supabase, {
			organizationId,
			userId,
			connectionId,
		})
		return c.json({ data: result })
	} catch (error) {
		console.error("Failed to delete connection", error)
		return c.json(
			{ error: { message: "Failed to delete connection" } },
			500,
		)
	}
})
