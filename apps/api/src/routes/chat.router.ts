/**
 * Chat Router
 * Handles all /chat/* routes
 */
import { Hono } from "hono"
import { z } from "zod"
import type { SessionContext } from "../session"
import { chatSessionManager } from "../services/chat-session-manager"
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

const chatSessionControlSchema = z.object({
	conversationId: z.string().uuid().optional(),
	sdkSessionId: z.string().min(1).optional(),
})

chatRouter.post("/v2/cancel", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const parsed = chatSessionControlSchema.safeParse(await c.req.json())
	if (!parsed.success) {
		return new Response(
			JSON.stringify({ error: "Invalid payload", issues: parsed.error.issues }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		)
	}

	const abortedSessionId = chatSessionManager.abortForUser({
		orgId: organizationId,
		userId: internalUserId,
		conversationId: parsed.data.conversationId,
		sdkSessionId: parsed.data.sdkSessionId,
		reason: "Cancelled by client",
	})

	return c.json({
		cancelled: Boolean(abortedSessionId),
		sessionId: abortedSessionId,
	})
})

chatRouter.post("/v2/is-active", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const parsed = chatSessionControlSchema.safeParse(await c.req.json())
	if (!parsed.success) {
		return new Response(
			JSON.stringify({ error: "Invalid payload", issues: parsed.error.issues }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		)
	}

	const active = chatSessionManager.isActiveForUser({
		orgId: organizationId,
		userId: internalUserId,
		conversationId: parsed.data.conversationId,
		sdkSessionId: parsed.data.sdkSessionId,
	})

	return c.json({ active })
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
