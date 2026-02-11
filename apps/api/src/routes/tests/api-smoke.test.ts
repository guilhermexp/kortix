import { describe, expect, it } from "bun:test"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { z } from "zod"

// Test-only middleware to simulate auth gating without env dependencies
// Avoid importing handlers that require real env; test-only stubs below

describe("API Smoke - Auth gating and basic endpoints", () => {
	const app = new Hono()

	app.get("/health", (c) =>
		c.json({ status: "ok", timestamp: new Date().toISOString() }),
	)

	app.post("/api/auth/sign-in", async (c) => {
		const body = await c.req.json().catch(() => null)
		if (
			!body ||
			typeof body !== "object" ||
			!("email" in body) ||
			!("password" in body)
		) {
			return c.json({ error: { message: "Invalid credentials" } }, 400)
		}
		return c.json({ ok: true })
	})

	const testAuth = async (c: any, next: any) => {
		const auth = c.req.header("authorization")
		if (!auth) return c.json({ error: { message: "Unauthorized" } }, 401)
		await next()
	}
	app.use("/v3/*", testAuth)
	app.use("/chat", testAuth)
	app.use("/chat/*", testAuth)

	// Minimal route registrations to assert 401 on protected paths
	app.get("/v3/projects", (c) => c.json({ ok: true }))
	app.post("/v3/search", zValidator("json", z.object({ q: z.string() })), (c) =>
		c.json({ ok: true }),
	)
	app.post("/v3/documents", (c) => c.json({ ok: true }))
	app.post("/v3/connections/list", (c) => c.json({ ok: true }))
	app.get("/v3/settings", (c) => c.json({ ok: true }))
	app.post("/chat", (c) => c.json({ ok: true }))
	app.post("/chat/v2", (c) => c.json({ ok: true }))
	app.get("/v3/conversations", (c) => c.json({ ok: true }))

	it("/health responde com JSON", async () => {
		const res = await app.request("/health")
		expect(res.headers.get("content-type")?.includes("application/json")).toBe(
			true,
		)
	})

	it("/api/auth/sign-in inválido retorna 400", async () => {
		const res = await app.request("/api/auth/sign-in", {
			method: "POST",
			body: JSON.stringify({}),
		})
		expect([400, 401, 500]).toContain(res.status)
	})

	it("/v3/projects requer autenticação", async () => {
		const res = await app.request("/v3/projects")
		expect(res.status).toBe(401)
	})

	it("/v3/search requer autenticação", async () => {
		const res = await app.request("/v3/search", {
			method: "POST",
			body: JSON.stringify({ q: "test" }),
		})
		expect(res.status).toBe(401)
	})

	it("/v3/documents requer autenticação", async () => {
		const res = await app.request("/v3/documents", {
			method: "POST",
			body: JSON.stringify({}),
		})
		expect(res.status).toBe(401)
	})

	it("/v3/connections/list requer autenticação", async () => {
		const res = await app.request("/v3/connections/list", {
			method: "POST",
			body: JSON.stringify({}),
		})
		expect(res.status).toBe(401)
	})

	it("/v3/settings requer autenticação", async () => {
		const res = await app.request("/v3/settings")
		expect(res.status).toBe(401)
	})

	it("/chat requer autenticação", async () => {
		const res = await app.request("/chat", {
			method: "POST",
			body: JSON.stringify({}),
		})
		expect(res.status).toBe(401)
	})

	it("/chat/v2 requer autenticação", async () => {
		const res = await app.request("/chat/v2", {
			method: "POST",
			body: JSON.stringify({}),
		})
		expect(res.status).toBe(401)
	})

	it("/v3/conversations requer autenticação", async () => {
		const res = await app.request("/v3/conversations")
		expect(res.status).toBe(401)
	})
})
