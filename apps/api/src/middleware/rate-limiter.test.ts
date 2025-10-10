import { describe, expect, it, beforeEach, afterEach } from "bun:test"
import { Hono } from "hono"
import { rateLimiter, clearRateLimitStore, getRateLimiterStats, stopCleanupTimer } from "./rate-limiter"

/**
 * Unit tests for Rate Limiting Middleware
 *
 * Tests sliding window rate limiting functionality including:
 * - Request counting and limits
 * - Rate limit headers
 * - Path-specific limits
 * - Skip paths
 */

describe("Rate Limiter Middleware", () => {
	beforeEach(() => {
		clearRateLimitStore()
	})

	afterEach(() => {
		clearRateLimitStore()
		stopCleanupTimer()
	})

	describe("Basic Rate Limiting", () => {
		it("should allow requests under the limit", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 5 }))
			app.get("/test", (c) => c.text("OK"))

			// Make 5 requests (all should succeed)
			for (let i = 0; i < 5; i++) {
				const res = await app.request("/test")
				expect(res.status).toBe(200)
			}
		})

		it("should block requests over the limit", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 3 }))
			app.get("/test", (c) => c.text("OK"))

			// Make 3 requests (should succeed)
			for (let i = 0; i < 3; i++) {
				const res = await app.request("/test")
				expect(res.status).toBe(200)
			}

			// 4th request should fail
			const res = await app.request("/test")
			expect(res.status).toBe(429)
		})

		it("should include rate limit headers", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 10 }))
			app.get("/test", (c) => c.text("OK"))

			const res = await app.request("/test")
			expect(res.status).toBe(200)
			expect(res.headers.get("X-RateLimit-Limit")).toBe("10")
			expect(res.headers.get("X-RateLimit-Remaining")).toBe("9")
			expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy()
		})

		it("should include Retry-After header when rate limited", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 1 }))
			app.get("/test", (c) => c.text("OK"))

			await app.request("/test") // First request succeeds
			const res = await app.request("/test") // Second fails

			expect(res.status).toBe(429)
			expect(res.headers.get("Retry-After")).toBeTruthy()
		})
	})

	describe("Client Identification", () => {
		it("should identify clients by IP address", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 2 }))
			app.get("/test", (c) => c.text("OK"))

			// Two requests from same IP
			const req1 = new Request("http://localhost/test", {
				headers: { "x-real-ip": "192.168.1.1" },
			})
			const req2 = new Request("http://localhost/test", {
				headers: { "x-real-ip": "192.168.1.1" },
			})

			await app.request(req1)
			await app.request(req2)

			// Third request should be blocked
			const req3 = new Request("http://localhost/test", {
				headers: { "x-real-ip": "192.168.1.1" },
			})
			const res = await app.request(req3)
			expect(res.status).toBe(429)
		})

		it("should identify clients by API key", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 2 }))
			app.get("/test", (c) => c.text("OK"))

			const apiKey = "test-api-key-123"
			const req1 = new Request("http://localhost/test", {
				headers: { "x-api-key": apiKey },
			})
			const req2 = new Request("http://localhost/test", {
				headers: { "x-api-key": apiKey },
			})

			await app.request(req1)
			await app.request(req2)

			// Third request should be blocked
			const req3 = new Request("http://localhost/test", {
				headers: { "x-api-key": apiKey },
			})
			const res = await app.request(req3)
			expect(res.status).toBe(429)
		})

		it("should track different clients separately", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 2 }))
			app.get("/test", (c) => c.text("OK"))

			// Client 1 makes 2 requests
			const req1 = new Request("http://localhost/test", {
				headers: { "x-real-ip": "192.168.1.1" },
			})
			await app.request(req1)
			await app.request(req1)

			// Client 2 should still be able to make requests
			const req2 = new Request("http://localhost/test", {
				headers: { "x-real-ip": "192.168.1.2" },
			})
			const res = await app.request(req2)
			expect(res.status).toBe(200)
		})
	})

	describe("Skip Paths", () => {
		it("should skip rate limiting for /health", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 1 }))
			app.get("/health", (c) => c.text("OK"))

			// Make multiple requests (all should succeed)
			for (let i = 0; i < 5; i++) {
				const res = await app.request("/health")
				expect(res.status).toBe(200)
			}
		})

		it("should skip rate limiting for /api/health", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 1 }))
			app.get("/api/health", (c) => c.text("OK"))

			// Make multiple requests (all should succeed)
			for (let i = 0; i < 5; i++) {
				const res = await app.request("/api/health")
				expect(res.status).toBe(200)
			}
		})

		it("should skip rate limiting for /ping", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 1 }))
			app.get("/ping", (c) => c.text("OK"))

			// Make multiple requests (all should succeed)
			for (let i = 0; i < 5; i++) {
				const res = await app.request("/ping")
				expect(res.status).toBe(200)
			}
		})

		it("should not skip rate limiting for other paths", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 1 }))
			app.get("/api/test", (c) => c.text("OK"))

			// First request succeeds
			const res1 = await app.request("/api/test")
			expect(res1.status).toBe(200)

			// Second request should be rate limited
			const res2 = await app.request("/api/test")
			expect(res2.status).toBe(429)
		})
	})

	describe("Statistics", () => {
		it("should track number of tracked clients", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 10 }))
			app.get("/test", (c) => c.text("OK"))

			// Initial state
			let stats = getRateLimiterStats()
			expect(stats.totalKeys).toBe(0)

			// Make a request
			await app.request("/test")

			// Should have one tracked key
			stats = getRateLimiterStats()
			expect(stats.totalKeys).toBe(1)
		})

		it("should return rate limiter configuration", () => {
			const stats = getRateLimiterStats()
			expect(stats).toHaveProperty("windowMs")
			expect(stats).toHaveProperty("limits")
			expect(stats.limits).toHaveProperty("DEFAULT")
			expect(stats.limits).toHaveProperty("AUTH")
			expect(stats.limits).toHaveProperty("SEARCH")
		})
	})

	describe("Store Management", () => {
		it("should clear all rate limit records", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 10 }))
			app.get("/test", (c) => c.text("OK"))

			// Make some requests
			await app.request("/test")
			await app.request("/test")

			let stats = getRateLimiterStats()
			expect(stats.totalKeys).toBeGreaterThan(0)

			// Clear store
			clearRateLimitStore()

			stats = getRateLimiterStats()
			expect(stats.totalKeys).toBe(0)
		})
	})

	describe("Edge Cases", () => {
		it("should handle requests without IP headers", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 5 }))
			app.get("/test", (c) => c.text("OK"))

			const req = new Request("http://localhost/test")
			const res = await app.request(req)
			expect(res.status).toBe(200)
		})

		it("should handle x-forwarded-for with multiple IPs", async () => {
			const app = new Hono()
			app.use("*", rateLimiter({ limit: 2 }))
			app.get("/test", (c) => c.text("OK"))

			// x-forwarded-for should use first IP
			const req1 = new Request("http://localhost/test", {
				headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1, 172.16.0.1" },
			})
			const req2 = new Request("http://localhost/test", {
				headers: { "x-forwarded-for": "192.168.1.1, 10.0.0.1, 172.16.0.1" },
			})

			await app.request(req1)
			await app.request(req2)

			// Third request should be blocked (same first IP)
			const req3 = new Request("http://localhost/test", {
				headers: { "x-forwarded-for": "192.168.1.1, 99.99.99.99" },
			})
			const res = await app.request(req3)
			expect(res.status).toBe(429)
		})
	})
})
