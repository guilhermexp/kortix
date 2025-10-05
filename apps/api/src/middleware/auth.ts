import { createMiddleware } from "hono/factory"
import { resolveSession, type SessionContext } from "../session"

export const requireAuth = createMiddleware(async (c, next) => {
	const session = await resolveSession(c.req.raw)

	if (!session) {
		return c.json({ error: { message: "Unauthorized" } }, 401)
	}

	c.set("session", session as SessionContext)
	await next()
})
