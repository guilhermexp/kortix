/**
 * Canvas Router
 * Handles all /v3/canvas/* and /v3/canvas-projects/* routes
 */
import { Hono } from "hono"
import type { SessionContext } from "../session"
import { createClientForSession } from "../supabase"
import {
	createCanvasProject,
	deleteCanvasProject,
	deleteCanvasState,
	getCanvasState,
	listCanvasProjects,
	saveCanvasState,
	updateCanvasProject,
} from "./canvas"

export const canvasRouter = new Hono<{
	Variables: { session: SessionContext }
}>()
export const canvasProjectsRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

// Canvas Projects endpoints
canvasProjectsRouter.get("/", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const supabase = createClientForSession(c.var.session)
	try {
		const projects = await listCanvasProjects(
			supabase,
			internalUserId,
			organizationId,
		)
		return c.json({ projects })
	} catch (error) {
		console.error("Failed to list canvas projects", error)
		return c.json({ error: { message: "Failed to list canvas projects" } }, 500)
	}
})

canvasProjectsRouter.post("/", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const body = await c.req.json()
	const supabase = createClientForSession(c.var.session)
	try {
		const project = await createCanvasProject(
			supabase,
			internalUserId,
			organizationId,
			body,
		)
		return c.json(project, 201)
	} catch (error) {
		console.error("Failed to create canvas project", error)
		return c.json(
			{ error: { message: "Failed to create canvas project" } },
			400,
		)
	}
})

canvasProjectsRouter.patch("/:projectId", async (c) => {
	const { internalUserId } = c.var.session
	const projectId = c.req.param("projectId")
	const body = await c.req.json()
	const supabase = createClientForSession(c.var.session)
	try {
		const project = await updateCanvasProject(
			supabase,
			internalUserId,
			projectId,
			body,
		)
		return c.json(project)
	} catch (error) {
		console.error("Failed to update canvas project", error)
		return c.json(
			{ error: { message: "Failed to update canvas project" } },
			400,
		)
	}
})

canvasProjectsRouter.delete("/:projectId", async (c) => {
	const { internalUserId } = c.var.session
	const projectId = c.req.param("projectId")
	const supabase = createClientForSession(c.var.session)
	try {
		const result = await deleteCanvasProject(
			supabase,
			internalUserId,
			projectId,
		)
		return c.json(result)
	} catch (error) {
		console.error("Failed to delete canvas project", error)
		return c.json(
			{ error: { message: "Failed to delete canvas project" } },
			400,
		)
	}
})

// Canvas state endpoints
canvasRouter.get("/:projectId?", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const projectId = c.req.param("projectId") || "default"
	const supabase = createClientForSession(c.var.session)
	try {
		const result = await getCanvasState(
			supabase,
			internalUserId,
			organizationId,
			projectId,
		)
		return c.json(result)
	} catch (error) {
		console.error("Failed to fetch canvas state", error)
		return c.json({ error: { message: "Failed to fetch canvas state" } }, 500)
	}
})

canvasRouter.post("/:projectId?", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const projectId = c.req.param("projectId") || "default"
	const body = await c.req.json()
	const supabase = createClientForSession(c.var.session)
	try {
		const result = await saveCanvasState(
			supabase,
			internalUserId,
			organizationId,
			projectId,
			body.state,
		)
		return c.json(result)
	} catch (error) {
		console.error("Failed to save canvas state", error)
		return c.json({ error: { message: "Failed to save canvas state" } }, 500)
	}
})

canvasRouter.delete("/:projectId?", async (c) => {
	const { internalUserId } = c.var.session
	const projectId = c.req.param("projectId") || "default"
	const supabase = createClientForSession(c.var.session)
	try {
		const result = await deleteCanvasState(supabase, internalUserId, projectId)
		return c.json(result)
	} catch (error) {
		console.error("Failed to delete canvas state", error)
		return c.json({ error: { message: "Failed to delete canvas state" } }, 500)
	}
})
