/**
 * Settings Router
 * Handles all /v3/settings routes
 */

import { zValidator } from "@hono/zod-validator"
import { SettingsRequestSchema } from "@repo/validation/api"
import { Hono } from "hono"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"
import { getSettings, updateSettings } from "./settings"

export const settingsRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

settingsRouter.get("/", async (c) => {
	const { organizationId } = c.var.session
	const supabase = createClientForSession(c.var.session)
	try {
		const settings = await getSettings(supabase, organizationId)
		return c.json(settings)
	} catch (error) {
		console.error("Failed to fetch settings", error)
		return c.json({ error: { message: "Failed to fetch settings" } }, 500)
	}
})

settingsRouter.patch(
	"/",
	zValidator("json", SettingsRequestSchema.partial().optional()),
	async (c) => {
		const { organizationId } = c.var.session
		const payload = c.req.valid("json") ?? {}
		const supabase = createClientForSession(c.var.session)

		try {
			const response = await updateSettings(supabase, organizationId, payload)
			return c.json(response)
		} catch (error) {
			console.error("Failed to update settings", error)
			return c.json({ error: { message: "Failed to update settings" } }, 400)
		}
	},
)
