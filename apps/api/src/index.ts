/**
 * Kortix API - Main Entry Point
 *
 * This is a slim entry point that:
 * - Sets up middleware (CORS, rate limiting)
 * - Mounts modular routers
 * - Handles server lifecycle
 */
import { lookup } from "node:dns/promises"
import { existsSync } from "node:fs"
import { isIP } from "node:net"
import { resolve } from "node:path"
import { config as loadEnv } from "dotenv"

// Load env in this order: local in app → root .env.local → generic .env
try {
	loadEnv({ path: ".env.local" })
	const rootEnvLocal = resolve(process.cwd(), "..", "..", ".env.local")
	if (existsSync(rootEnvLocal)) {
		loadEnv({ path: rootEnvLocal })
	}
	loadEnv()
} catch {
	// ignore env load errors
}

// Minimal logging - set LOG_LEVEL=debug for verbose output
const LOG_LEVEL = process.env.LOG_LEVEL || "warn"
const LEVELS: Record<string, number> = {
	silent: 0,
	error: 1,
	warn: 2,
	info: 3,
	debug: 4,
}
const level = LEVELS[LOG_LEVEL] ?? 2
const originalLog = console.log
const originalWarn = console.warn
console.log = (...args: unknown[]) => {
	if (level >= 4) originalLog(...args)
}
console.warn = (...args: unknown[]) => {
	if (level >= 2) originalWarn(...args)
}

import { serve } from "@hono/node-server"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { env } from "./env"
import { requireAuth } from "./middleware/auth"
import { rateLimiter } from "./middleware/rate-limiter"
import aiActionsRoutes from "./routes/ai-actions"
import { CreateApiKeySchema, createApiKeyHandler } from "./routes/api-keys"
// Auth routes (kept inline since they're simple)
import {
	getSession as getSessionInfo,
	refreshSession,
	signIn,
	signOut,
	signUp,
} from "./routes/auth"
import { canvasProjectsRouter, canvasRouter } from "./routes/canvas.router"
import { chatRouter } from "./routes/chat.router"
import { connectionsRouter } from "./routes/connections.router"
import { conversationsRouter } from "./routes/conversations.router"
import { councilRouter } from "./routes/council.router"
import { documentConnectionsRouter } from "./routes/document-connections.router"
import { deepAgentRouter, documentsRouter } from "./routes/documents.router"
import { healthHandler } from "./routes/health"
import { registerMcpRoutes } from "./routes/mcp"
import {
	completePasswordReset,
	requestPasswordReset,
	updatePassword,
	updatePasswordValidator,
} from "./routes/password"
// Modular routers
import { projectsRouter } from "./routes/projects.router"
import { searchRouter } from "./routes/search.router"
import { settingsRouter } from "./routes/settings.router"
import { getWaitlistStatus } from "./routes/waitlist"

// Services
import {
	startDocumentTimeoutMonitor,
	stopDocumentTimeoutMonitor,
} from "./services/document-timeout-monitor"
import type { SessionContext } from "./session"

const app = new Hono<{ Variables: { session: SessionContext } }>()

const allowedOrigins = new Set(env.ALLOWED_ORIGINS)
const IMAGE_PROXY_TIMEOUT_MS = 10_000
const IMAGE_PROXY_MAX_BYTES = 10 * 1024 * 1024 // 10MB

function transparentPixelResponse(): Response {
	// 1x1 transparent GIF
	const gif = Uint8Array.from([
		71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33,
		249, 4, 1, 0, 0, 1, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
	])

	return new Response(gif, {
		status: 200,
		headers: {
			"Content-Type": "image/gif",
			"Cache-Control": "public, max-age=300",
			"Access-Control-Allow-Origin": "*",
		},
	})
}

function isPrivateOrBlockedIp(address: string): boolean {
	// IPv4 checks
	if (isIP(address) === 4) {
		const parts = address.split(".").map((part) => Number.parseInt(part, 10))
		if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
			return true
		}

		const [a, b] = parts
		if (a === 10) return true
		if (a === 127) return true
		if (a === 0) return true
		if (a === 169 && b === 254) return true
		if (a === 172 && b >= 16 && b <= 31) return true
		if (a === 192 && b === 168) return true
		return false
	}

	// IPv6 checks (loopback/link-local/unique-local/mapped loopback)
	if (isIP(address) === 6) {
		const normalized = address.toLowerCase()
		return (
			normalized === "::1" ||
			normalized.startsWith("fc") ||
			normalized.startsWith("fd") ||
			normalized.startsWith("fe80:") ||
			normalized === "::" ||
			normalized.endsWith("::1") ||
			normalized.includes("127.0.0.1")
		)
	}

	return true
}

async function isSafeImageProxyTarget(url: URL): Promise<boolean> {
	if (url.username || url.password) return false

	const hostname = url.hostname.toLowerCase()
	if (
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname === "0.0.0.0"
	) {
		return false
	}

	if (isIP(hostname) > 0) {
		return !isPrivateOrBlockedIp(hostname)
	}

	try {
		const records = await lookup(hostname, { all: true, verbatim: true })
		if (!records || records.length === 0) return false
		return records.every((record) => !isPrivateOrBlockedIp(record.address))
	} catch {
		return false
	}
}

// Debug: confirm OpenRouter key presence without printing secrets
try {
	const hasOpenRouterKey = Boolean(
		process.env.OPENROUTER_API_KEY || env.OPENROUTER_API_KEY,
	)
	console.log("[Boot] OpenRouter key detected:", hasOpenRouterKey)
} catch {
	// ignore
}

// Handle preflight OPTIONS requests explicitly first
app.options("*", (c) => {
	const origin = c.req.header("origin")
	const allowedOrigin =
		origin &&
		(allowedOrigins.has(origin) || origin.startsWith("http://localhost"))
			? origin
			: (env.ALLOWED_ORIGINS[0] ?? "http://localhost:3000")

	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": allowedOrigin,
			"Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
			"Access-Control-Allow-Headers":
				"Content-Type, Authorization, X-Kortix-Organization, X-Kortix-User",
			"Access-Control-Allow-Credentials": "true",
			"Access-Control-Max-Age": "86400",
		},
	})
})

app.use(
	"*",
	cors({
		origin: (origin) => {
			if (!origin) {
				return env.ALLOWED_ORIGINS[0] ?? "http://localhost:3000"
			}
			if (allowedOrigins.has(origin) || origin.startsWith("http://localhost")) {
				return origin
			}
			return env.ALLOWED_ORIGINS[0] ?? origin
		},
		credentials: true,
		allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowHeaders: [
			"Content-Type",
			"Authorization",
			"X-Kortix-Organization",
			"X-Kortix-User",
		],
		exposeHeaders: ["Set-Cookie"],
	}),
)

// Apply rate limiting globally
app.use("*", rateLimiter())

// ============================================
// Public Routes
// ============================================

app.get("/health", healthHandler)

app.get("/", (c) =>
	c.json({
		message: "Kortix API",
		docs: "Pending",
	}),
)

// Image proxy to bypass CORS restrictions for external images
app.get("/api/image-proxy", async (c) => {
	const url = c.req.query("url")
	if (!url) {
		return transparentPixelResponse()
	}

	try {
		const parsedUrl = new URL(url)
		const allowedProtocols = ["http:", "https:"]
		if (!allowedProtocols.includes(parsedUrl.protocol)) {
			return transparentPixelResponse()
		}
		if (!(await isSafeImageProxyTarget(parsedUrl))) {
			return transparentPixelResponse()
		}

		const response = await fetch(url, {
			signal: AbortSignal.timeout(IMAGE_PROXY_TIMEOUT_MS),
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; KortixBot/1.0)",
				Accept: "image/*,*/*",
			},
		})

		if (!response.ok) {
			return transparentPixelResponse()
		}

		const contentType = response.headers.get("content-type") || ""
		if (!contentType.toLowerCase().startsWith("image/")) {
			return transparentPixelResponse()
		}

		const contentLengthRaw = response.headers.get("content-length")
		if (contentLengthRaw) {
			const contentLength = Number.parseInt(contentLengthRaw, 10)
			if (
				Number.isFinite(contentLength) &&
				contentLength > IMAGE_PROXY_MAX_BYTES
			) {
				return c.json({ error: "Image too large" }, 413)
			}
		}

		const buffer = await response.arrayBuffer()
		if (buffer.byteLength > IMAGE_PROXY_MAX_BYTES) {
			return c.json({ error: "Image too large" }, 413)
		}

		c.header("Content-Type", contentType)
		c.header("Cache-Control", "public, max-age=3600")
		c.header("Access-Control-Allow-Origin", "*")

		return c.body(buffer)
	} catch (error) {
		console.error("[image-proxy] Error fetching image:", error)
		return transparentPixelResponse()
	}
})

// ============================================
// Auth Routes (public)
// ============================================

app.post("/api/auth/sign-up", async (c) => signUp(c))
app.post("/api/auth/sign-in", async (c) => signIn(c))
app.post("/api/auth/sign-out", async (c) => signOut(c))
app.post("/api/auth/refresh", async (c) => refreshSession(c))
app.get("/api/auth/session", async (c) => getSessionInfo(c))
app.post("/api/auth/password/reset/request", async (c) =>
	requestPasswordReset(c),
)
app.post("/api/auth/password/reset/complete", async (c) =>
	completePasswordReset(c),
)
app.post(
	"/api/auth/password/update",
	requireAuth,
	zValidator("json", updatePasswordValidator),
	async (c) => updatePassword(c),
)
app.post(
	"/api/auth/api-keys",
	requireAuth,
	zValidator("json", CreateApiKeySchema),
	async (c) => createApiKeyHandler(c),
)

// MCP Routes
registerMcpRoutes(app)

// AI Actions routes (for canvas AI context menu)
app.route("/api/ai-actions", aiActionsRoutes)

// ============================================
// Protected Routes (require auth)
// ============================================

app.use("/v3/*", requireAuth)
app.use("/chat", requireAuth)
app.use("/chat/*", requireAuth)

// Mount modular routers
app.route("/v3/projects", projectsRouter)
app.route("/v3/documents", documentsRouter)
app.route("/v3/deep-agent", deepAgentRouter)
app.route("/v3/search", searchRouter)
app.route("/v3/connections", connectionsRouter)
app.route("/v3/document-connections", documentConnectionsRouter)
app.route("/v3/settings", settingsRouter)
app.route("/v3/canvas-projects", canvasProjectsRouter)
app.route("/v3/canvas", canvasRouter)
app.route("/v3/conversations", conversationsRouter)
app.route("/v3/council", councilRouter)
app.route("/chat", chatRouter)

// Waitlist status (simple inline)
app.get("/v3/waitlist/status", (c) => c.json(getWaitlistStatus()))

// ============================================
// Server Lifecycle
// ============================================

startDocumentTimeoutMonitor()

process.on("uncaughtException", (error) => {
	console.error("[FATAL] Uncaught Exception:", error)
	console.error("Stack:", error.stack)
})

process.on("unhandledRejection", (reason, promise) => {
	console.error("[FATAL] Unhandled Promise Rejection:", reason)
	console.error("Promise:", promise)
})

process.on("SIGTERM", () => {
	console.log("SIGTERM received, shutting down gracefully...")
	stopDocumentTimeoutMonitor()
	process.exit(0)
})

process.on("SIGINT", () => {
	console.log("SIGINT received, shutting down gracefully...")
	stopDocumentTimeoutMonitor()
	process.exit(0)
})

const port = env.PORT ?? 3001
console.log(`[Boot] Starting Kortix API on port ${port}`)

serve({
	fetch: app.fetch,
	port,
})

console.log(`[Boot] Kortix API listening on http://localhost:${port}`)
