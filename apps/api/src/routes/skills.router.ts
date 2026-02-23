import { Hono } from "hono"
import type { SessionContext } from "../session"
import {
	createSkill,
	deleteSkill,
	getSkill,
	listSkills,
	updateSkill,
} from "./skills"

export const skillsRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

skillsRouter.get("/", async (c) => {
	try {
		const response = await listSkills(new URL(c.req.url).searchParams)
		return c.json(response)
	} catch (error) {
		console.error("Failed to list skills", error)
		return c.json({ error: { message: "Failed to list skills" } }, 400)
	}
})

skillsRouter.get("/:id", async (c) => {
	try {
		const response = await getSkill(
			decodeURIComponent(c.req.param("id")),
			new URL(c.req.url).searchParams,
		)
		return c.json(response)
	} catch (error) {
		console.error("Failed to get skill", error)
		return c.json({ error: { message: "Failed to get skill" } }, 400)
	}
})

skillsRouter.post("/", async (c) => {
	try {
		const response = await createSkill(await c.req.json())
		return c.json(response, 201)
	} catch (error) {
		console.error("Failed to create skill", error)
		return c.json({ error: { message: "Failed to create skill" } }, 400)
	}
})

skillsRouter.put("/:id", async (c) => {
	try {
		const response = await updateSkill(
			decodeURIComponent(c.req.param("id")),
			await c.req.json(),
		)
		return c.json(response)
	} catch (error) {
		console.error("Failed to update skill", error)
		return c.json({ error: { message: "Failed to update skill" } }, 400)
	}
})

skillsRouter.delete("/:id", async (c) => {
	try {
		const response = await deleteSkill(
			decodeURIComponent(c.req.param("id")),
			new URL(c.req.url).searchParams,
		)
		return c.json(response)
	} catch (error) {
		console.error("Failed to delete skill", error)
		return c.json({ error: { message: "Failed to delete skill" } }, 400)
	}
})
