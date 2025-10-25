import { describe, expect, it } from "bun:test"
import { Hono } from "hono"
import { registerMcpRoutes } from "./mcp"

/**
 * Unit tests for MCP routes
 *
 * NOTE: These tests do not test API key authentication against the database.
 * For full integration tests with database, set up test API keys manually.
 */

describe("MCP Routes", () => {

	describe("GET /mcp", () => {
		it("should return status ok", async () => {
			const app = new Hono()
			registerMcpRoutes(app)

			const res = await app.request("/mcp")
			const data = await res.json()

			expect(res.status).toBe(200)
			expect(data.status).toBe("ok")
		})
	})

	describe("GET /mcp/:userId/sse", () => {
		it("should reject without API key", async () => {
			const app = new Hono()
			registerMcpRoutes(app)

			const res = await app.request("/mcp/testuser/sse")
			const data = await res.json()

			expect(res.status).toBe(401)
			expect(data.error?.message).toBe("Missing API key")
		})

		it("should reject with invalid API key", async () => {
			const app = new Hono()
			registerMcpRoutes(app)

			const res = await app.request("/mcp/testuser/sse", {
				headers: {
					Authorization: "Bearer invalid-key",
				},
			})
			const data = await res.json()

			expect(res.status).toBe(401)
			expect(data.error?.message).toBe("Invalid or expired API key")
		})

		/**
		 * Integration tests for valid API keys require database setup
		 * To run these tests:
		 * 1. Create a test API key in the database
		 * 2. Set TEST_MCP_API_KEY environment variable
		 * 3. Uncomment and run the tests below
		 */
	})

	describe("POST /mcp/:userId/messages", () => {
		it("should reject without session ID", async () => {
			const app = new Hono()
			registerMcpRoutes(app)

			const res = await app.request("/mcp/testuser/messages", {
				method: "POST",
			})
			const data = await res.json()

			expect(res.status).toBe(400)
			expect(data.error?.message).toBe("Missing session identifier")
		})

		it("should reject with invalid session ID", async () => {
			const app = new Hono()
			registerMcpRoutes(app)

			const res = await app.request(
				"/mcp/testuser/messages?sessionId=invalid-session",
				{
					method: "POST",
				},
			)
			const data = await res.json()

			expect(res.status).toBe(404)
			expect(data.error?.message).toBe("Session not found")
		})
	})
})

describe("MCP Helper Functions", () => {
	it("should normalize identifiers correctly", () => {
		const normalizeIdentifier = (raw: string, fallback: string): string => {
			const trimmed = raw.trim().toLowerCase()
			const normalized = trimmed
				.replace(/[^a-z0-9_-]+/g, "-")
				.replace(/-+/g, "-")
				.replace(/^[-_]+|[-_]+$/g, "")
			return normalized.length > 0 ? normalized.slice(0, 64) : fallback
		}

		expect(normalizeIdentifier("My Project", "default")).toBe("my-project")
		expect(normalizeIdentifier("test_user_123", "default")).toBe(
			"test_user_123",
		)
		expect(normalizeIdentifier("  ", "default")).toBe("default")
		expect(normalizeIdentifier("Test@User#123", "default")).toBe(
			"test-user-123",
		)
		expect(normalizeIdentifier("___test___", "default")).toBe("test")
	})
})
