/**
 * Chat Router
 * Handles all /chat/* routes
 */
import { Hono } from "hono"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"
import { generateChatTitle, handleChat } from "./chat"
import { handleChatV2 } from "./chat-v2"

export const chatRouter = new Hono<{ Variables: { session: SessionContext } }>()

chatRouter.post("/", async (c) => {
	const { organizationId } = c.var.session
	const body = await c.req.json()
	const supabase = createClientForSession(c.var.session)
	return handleChat({ orgId: organizationId, client: supabase, body })
})

chatRouter.post("/v2", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const body = await c.req.json()
	const supabase = createClientForSession(c.var.session)
	return handleChatV2({
		orgId: organizationId,
		userId: internalUserId,
		client: supabase,
		body,
	})
})

chatRouter.post("/title", async (c) => {
	const body = await c.req.json()
	try {
		const title = generateChatTitle(body)
		return c.text(title)
	} catch (error) {
		console.error("Failed to generate chat title", error)
		return c.text("Untitled conversation", 400)
	}
})
