/**
 * Graph Router
 * Handles all /v3/graph/* routes
 */
import { Hono } from "hono"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"
import { handleGraphConnections } from "./graph"

export const graphRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

graphRouter.post("/connections", async (c) => {
	const { organizationId } = c.var.session
	const body = await c.req.json()
	const supabase = createClientForSession(c.var.session)
	return handleGraphConnections({
		client: supabase,
		payload: body,
		orgId: organizationId,
	})
})
