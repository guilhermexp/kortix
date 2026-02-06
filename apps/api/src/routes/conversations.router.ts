/**
 * Conversations Router
 * Handles all /v3/conversations/* routes
 */
import { Hono } from "hono"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"
import {
	handleCreateConversation,
	handleDeleteConversation,
	handleGetConversation,
	handleGetConversationEvents,
	handleGetConversationHistory,
	handleListConversations,
	handleUpdateConversation,
} from "./conversations"

export const conversationsRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

conversationsRouter.post("/", async (c) => {
	const { organizationId, userId } = c.var.session
	const body = await c.req.json()
	const supabase = createClientForSession(c.var.session)
	return handleCreateConversation({
		client: supabase,
		orgId: organizationId,
		userId,
		body,
	})
})

conversationsRouter.get("/", async (c) => {
	const { organizationId } = c.var.session
	const supabase = createClientForSession(c.var.session)
	return handleListConversations({
		client: supabase,
		orgId: organizationId,
		searchParams: new URLSearchParams(c.req.query()),
	})
})

conversationsRouter.get("/:id", async (c) => {
	const { organizationId } = c.var.session
	const conversationId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)
	return handleGetConversation({
		client: supabase,
		orgId: organizationId,
		conversationId,
	})
})

conversationsRouter.get("/:id/events", async (c) => {
	const { organizationId } = c.var.session
	const conversationId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)
	return handleGetConversationEvents({
		client: supabase,
		orgId: organizationId,
		conversationId,
	})
})

conversationsRouter.get("/:id/history", async (c) => {
	const { organizationId } = c.var.session
	const conversationId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)
	return handleGetConversationHistory({
		client: supabase,
		orgId: organizationId,
		conversationId,
	})
})

conversationsRouter.patch("/:id", async (c) => {
	const { organizationId } = c.var.session
	const conversationId = c.req.param("id")
	const body = await c.req.json()
	const supabase = createClientForSession(c.var.session)
	return handleUpdateConversation({
		client: supabase,
		orgId: organizationId,
		conversationId,
		body,
	})
})

conversationsRouter.delete("/:id", async (c) => {
	const { organizationId } = c.var.session
	const conversationId = c.req.param("id")
	const supabase = createClientForSession(c.var.session)
	return handleDeleteConversation({
		client: supabase,
		orgId: organizationId,
		conversationId,
	})
})
