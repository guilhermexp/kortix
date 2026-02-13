/**
 * Canvas Router
 * Handles all /v3/canvas routes
 */

import { zValidator } from "@hono/zod-validator"
import { CreateCanvasSchema, UpdateCanvasSchema } from "@repo/validation/api"
import { Hono } from "hono"
import { z } from "zod"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"
import {
	createCanvas,
	deleteCanvas,
	getCanvas,
	listCanvases,
	updateCanvas,
} from "./canvas"

export const canvasRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

canvasRouter.get(
	"/",
	zValidator(
		"query",
		z.object({
			projectId: z.string().optional(),
		}),
	),
	async (c) => {
		const { userId } = c.var.session
		const { projectId } = c.req.valid("query")
		const supabase = createClientForSession(c.var.session)

		try {
			const canvases = await listCanvases(
				supabase,
				userId,
				projectId,
			)
			return c.json(canvases)
		} catch (error) {
			console.error("Failed to list canvases", error)
			return c.json({ error: { message: "Failed to list canvases" } }, 500)
		}
	},
)

canvasRouter.get("/:id", async (c) => {
	const { userId } = c.var.session
	const id = c.req.param("id")
	const supabase = createClientForSession(c.var.session)

	try {
		const canvas = await getCanvas(supabase, id, userId)
		return c.json(canvas)
	} catch (error) {
		console.error("Failed to get canvas", error)
		return c.json({ error: { message: "Failed to get canvas" } }, 404)
	}
})

canvasRouter.post("/", zValidator("json", CreateCanvasSchema), async (c) => {
	const { userId } = c.var.session
	const payload = c.req.valid("json")
	const supabase = createClientForSession(c.var.session)

	try {
		const canvas = await createCanvas(
			supabase,
			userId,
			payload,
		)
		return c.json(canvas, 201)
	} catch (error) {
		const detail = error instanceof Error ? error.message : JSON.stringify(error)
		console.error("Failed to create canvas", { userId, payload, error: detail })
		return c.json({ error: { message: `Failed to create canvas: ${detail}` } }, 400)
	}
})

canvasRouter.patch(
	"/:id",
	zValidator("json", UpdateCanvasSchema),
	async (c) => {
		const { userId } = c.var.session
		const id = c.req.param("id")
		const payload = c.req.valid("json")
		const supabase = createClientForSession(c.var.session)

		try {
			const canvas = await updateCanvas(
				supabase,
				id,
				userId,
				payload,
			)
			return c.json(canvas)
		} catch (error) {
			console.error("Failed to update canvas", error)
			return c.json({ error: { message: "Failed to update canvas" } }, 400)
		}
	},
)

canvasRouter.delete("/:id", async (c) => {
	const { userId } = c.var.session
	const id = c.req.param("id")
	const supabase = createClientForSession(c.var.session)

	try {
		const result = await deleteCanvas(
			supabase,
			id,
			userId,
		)
		return c.json(result)
	} catch (error) {
		const message = error instanceof Error ? error.message : "Failed to delete canvas"
		if (message === "Canvas not found") {
			return c.json({ error: { message } }, 404)
		}
		console.error("Failed to delete canvas", error)
		return c.json({ error: { message: "Failed to delete canvas" } }, 400)
	}
})
