/**
 * Projects Router
 * Handles all /v3/projects/* routes
 */

import { zValidator } from "@hono/zod-validator"
import { CreateProjectSchema, DeleteProjectSchema } from "@repo/validation/api"
import { Hono } from "hono"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"
import { createProject, deleteProject, listProjects } from "./projects"

export const projectsRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

projectsRouter.get("/", async (c) => {
	const { organizationId } = c.var.session
	const supabase = createClientForSession(c.var.session)

	try {
		const projects = await listProjects(supabase, organizationId)
		return c.json({ projects })
	} catch (error) {
		console.error("Failed to list projects", error)
		return c.json({ error: { message: "Failed to list projects" } }, 500)
	}
})

projectsRouter.post("/", zValidator("json", CreateProjectSchema), async (c) => {
	const { organizationId, userId } = c.var.session
	const body = c.req.valid("json")
	const supabase = createClientForSession(c.var.session)

	try {
		const project = await createProject(supabase, {
			organizationId,
			userId,
			payload: body,
		})
		return c.json(project, 201)
	} catch (error) {
		console.error("Failed to create project", error)
		return c.json({ error: { message: "Failed to create project" } }, 400)
	}
})

projectsRouter.delete(
	"/:projectId",
	zValidator("json", DeleteProjectSchema.optional()),
	async (c) => {
		const { organizationId } = c.var.session
		const projectId = c.req.param("projectId")
		const body = c.req.valid("json") ?? { action: "delete" as const }
		const supabase = createClientForSession(c.var.session)

		try {
			const result = await deleteProject(supabase, {
				organizationId,
				projectId,
				mode: body,
			})
			return c.json(result)
		} catch (error) {
			console.error("Failed to delete project", error)
			return c.json({ error: { message: "Failed to delete project" } }, 400)
		}
	},
)
