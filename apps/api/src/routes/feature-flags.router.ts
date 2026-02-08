/**
 * Feature Flags Router
 * Handles all /v3/feature-flags routes
 */

import { zValidator } from "@hono/zod-validator"
import {
	CreateFlagSchema,
	EvaluateFlagRequestSchema,
	UpdateFlagSchema,
} from "@repo/validation/feature-flags"
import { Hono } from "hono"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"
import {
	createFlag,
	deleteFlag,
	evaluateFlag,
	getFlag,
	getFlagAuditLog,
	listFlags,
	updateFlag,
} from "./feature-flags"

export const featureFlagsRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

featureFlagsRouter.get("/", async (c) => {
	const { organizationId } = c.var.session
	const supabase = createClientForSession(c.var.session)

	try {
		const response = await listFlags(supabase, organizationId)
		return c.json(response)
	} catch (error) {
		console.error("Failed to list feature flags", error)
		return c.json({ error: { message: "Failed to list feature flags" } }, 500)
	}
})

featureFlagsRouter.get("/:flagId", async (c) => {
	const { organizationId } = c.var.session
	const flagId = c.req.param("flagId")
	const supabase = createClientForSession(c.var.session)

	try {
		const response = await getFlag(supabase, organizationId, flagId)
		return c.json(response)
	} catch (error) {
		console.error("Failed to get feature flag", error)
		return c.json({ error: { message: "Failed to get feature flag" } }, 404)
	}
})

featureFlagsRouter.post("/", zValidator("json", CreateFlagSchema), async (c) => {
	const { organizationId } = c.var.session
	const body = c.req.valid("json")
	const supabase = createClientForSession(c.var.session)

	try {
		const response = await createFlag(supabase, organizationId, body)
		return c.json(response, 201)
	} catch (error) {
		console.error("Failed to create feature flag", error)
		return c.json({ error: { message: "Failed to create feature flag" } }, 400)
	}
})

featureFlagsRouter.patch(
	"/:flagId",
	zValidator("json", UpdateFlagSchema.partial().optional()),
	async (c) => {
		const { organizationId } = c.var.session
		const flagId = c.req.param("flagId")
		const payload = c.req.valid("json") ?? {}
		const supabase = createClientForSession(c.var.session)

		try {
			const response = await updateFlag(
				supabase,
				organizationId,
				flagId,
				payload,
			)
			return c.json(response)
		} catch (error) {
			console.error("Failed to update feature flag", error)
			return c.json({ error: { message: "Failed to update feature flag" } }, 400)
		}
	},
)

featureFlagsRouter.delete("/:flagId", async (c) => {
	const { organizationId } = c.var.session
	const flagId = c.req.param("flagId")
	const supabase = createClientForSession(c.var.session)

	try {
		const response = await deleteFlag(supabase, organizationId, flagId)
		return c.json(response)
	} catch (error) {
		console.error("Failed to delete feature flag", error)
		return c.json({ error: { message: "Failed to delete feature flag" } }, 400)
	}
})

featureFlagsRouter.post(
	"/evaluate",
	zValidator("json", EvaluateFlagRequestSchema),
	async (c) => {
		const { organizationId } = c.var.session
		const body = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const result = await evaluateFlag(supabase, organizationId, body)
			return c.json(result)
		} catch (error) {
			console.error("Failed to evaluate feature flag", error)
			return c.json(
				{ error: { message: "Failed to evaluate feature flag" } },
				400,
			)
		}
	},
)

featureFlagsRouter.get("/:flagId/audit", async (c) => {
	const { organizationId } = c.var.session
	const flagId = c.req.param("flagId")
	const limit = c.req.query("limit")
	const supabase = createClientForSession(c.var.session)

	try {
		let parsedLimit: number | undefined
		if (limit !== undefined) {
			parsedLimit = Number.parseInt(limit, 10)
			if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
				return c.json(
					{ error: { message: "Invalid limit parameter" } },
					400,
				)
			}
			parsedLimit = Math.min(parsedLimit, 1000)
		}

		const response = await getFlagAuditLog(
			supabase,
			organizationId,
			flagId,
			parsedLimit,
		)
		return c.json(response)
	} catch (error) {
		console.error("Failed to get feature flag audit log", error)
		return c.json(
			{ error: { message: "Failed to get feature flag audit log" } },
			404,
		)
	}
})
