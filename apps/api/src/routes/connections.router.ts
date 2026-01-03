/**
 * Connections Router
 * Handles all /v3/connections/* routes
 */

import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { z } from "zod"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"
import {
	createConnection,
	createConnectionInputSchema,
	deleteConnection,
	getConnection,
	listConnections,
} from "./connections"

export const connectionsRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

// List all connections for the organization
// IMPORTANT: This route must come BEFORE /:provider to avoid matching "list" as a provider
connectionsRouter.post(
	"/list",
	zValidator(
		"json",
		z.object({
			containerTags: z.array(z.string()).optional(),
		}),
	),
	async (c) => {
		const { organizationId } = c.var.session
		const { containerTags } = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const connections = await listConnections(
				supabase,
				organizationId,
				containerTags,
			)
			return c.json({ data: connections })
		} catch (error) {
			console.error("Failed to list connections", error)
			return c.json({ error: { message: "Failed to load connections" } }, 500)
		}
	},
)

// Create a new connection (OAuth flow initiation)
connectionsRouter.post(
	"/:provider",
	zValidator("json", createConnectionInputSchema),
	async (c) => {
		const { organizationId, userId } = c.var.session
		const provider = c.req.param("provider")
		const payload = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const result = await createConnection(supabase, {
				organizationId,
				userId,
				provider,
				payload,
			})
			return c.json({ data: result })
		} catch (error) {
			console.error("Failed to create connection", error)
			return c.json({ error: { message: "Failed to create connection" } }, 500)
		}
	},
)

// Get a specific connection by ID
connectionsRouter.get("/:connectionId", async (c) => {
	const { organizationId } = c.var.session
	const connectionId = c.req.param("connectionId")
	const supabase = createClientForSession(c.var.session)

	try {
		const connection = await getConnection(
			supabase,
			organizationId,
			connectionId,
		)
		if (!connection) {
			return c.json({ error: { message: "Connection not found" } }, 404)
		}
		return c.json({ data: connection })
	} catch (error) {
		console.error("Failed to get connection", error)
		return c.json({ error: { message: "Failed to get connection" } }, 500)
	}
})

// Delete a connection
connectionsRouter.delete("/:connectionId", async (c) => {
	const { organizationId } = c.var.session
	const connectionId = c.req.param("connectionId")
	const supabase = createClientForSession(c.var.session)

	try {
		await deleteConnection(supabase, organizationId, connectionId)
		return c.json({ data: { success: true } })
	} catch (error) {
		console.error("Failed to delete connection", error)
		return c.json({ error: { message: "Failed to remove connection" } }, 500)
	}
})
