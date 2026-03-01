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
const originalInfo = console.info
const originalDebug = console.debug
console.log = (...args: unknown[]) => {
	if (level >= 4) originalLog(...args)
}
console.debug = (...args: unknown[]) => {
	if (level >= 4) originalDebug(...args)
}
console.info = (...args: unknown[]) => {
	if (level >= 3) originalInfo(...args)
}
console.warn = (...args: unknown[]) => {
	if (level >= 2) originalWarn(...args)
}

import { createServer } from "node:http"
import { serve } from "@hono/node-server"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { env } from "./env"
import { requireAuth } from "./middleware/auth"
import { rateLimiter } from "./middleware/rate-limiter"
import { CreateApiKeySchema, createApiKeyHandler } from "./routes/api-keys"
// Auth routes (kept inline since they're simple)
import {
	getSession as getSessionInfo,
	refreshSession,
	signIn,
	signOut,
	signUp,
} from "./routes/auth"
import { canvasRouter } from "./routes/canvas.router"
import { chatRouter } from "./routes/chat.router"
import { connectionsRouter } from "./routes/connections.router"
import { conversationsRouter } from "./routes/conversations.router"
import { councilRouter } from "./routes/council.router"
import { documentConnectionsRouter } from "./routes/document-connections.router"
import { documentsRouter } from "./routes/documents.router"
import { featureFlagsRouter } from "./routes/feature-flags.router"
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
import { skillsRouter } from "./routes/skills.router"
import { getWaitlistStatus } from "./routes/waitlist"

// Services
import {
	startDocumentTimeoutMonitor,
	stopDocumentTimeoutMonitor,
} from "./services/document-timeout-monitor"
import type { SessionContext } from "./session"
import { setupCanvasCollaboration } from "./socket/canvas-collaboration"

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

// Diagnostic endpoint to debug agent setup in production
app.get("/debug/agent", async (c) => {
	const { execSync } = await import("node:child_process")
	const { access } = await import("node:fs/promises")
	const { resolve: resolvePath } = await import("node:path")
	const { fileURLToPath } = await import("node:url")

	const checks: Record<string, unknown> = {}

	// Check node availability
	try {
		const nodeVersion = execSync("node --version", { timeout: 5000 })
			.toString()
			.trim()
		checks.nodeAvailable = true
		checks.nodeVersion = nodeVersion
		checks.nodePath = execSync("which node", { timeout: 5000 })
			.toString()
			.trim()
	} catch (e) {
		checks.nodeAvailable = false
		checks.nodeError = e instanceof Error ? e.message : String(e)
	}

	// Check bun availability
	try {
		checks.bunVersion = execSync("bun --version", { timeout: 5000 })
			.toString()
			.trim()
	} catch {
		checks.bunVersion = "not available"
	}

	// Check CLI path resolution
	try {
		const moduleDir = fileURLToPath(new URL(".", import.meta.url))
		const candidateBases = [
			process.cwd(),
			resolvePath(process.cwd(), ".."),
			moduleDir,
			resolvePath(moduleDir, ".."),
			resolvePath(moduleDir, "..", ".."),
			resolvePath(moduleDir, "..", "..", ".."),
			resolvePath(moduleDir, "..", "..", "..", ".."),
		]
		const candidatePaths = Array.from(
			new Set(
				candidateBases.map((base) =>
					resolvePath(
						base,
						"node_modules/@anthropic-ai/claude-agent-sdk/cli.js",
					),
				),
			),
		)

		const results: { path: string; exists: boolean }[] = []
		for (const candidate of candidatePaths) {
			try {
				await access(candidate)
				results.push({ path: candidate, exists: true })
			} catch {
				results.push({ path: candidate, exists: false })
			}
		}
		checks.cliPathCandidates = results
		checks.cliPathResolved = results.find((r) => r.exists)?.path || null
	} catch (e) {
		checks.cliPathError = e instanceof Error ? e.message : String(e)
	}

	// Check environment
	checks.cwd = process.cwd()
	checks.nodeEnv = process.env.NODE_ENV
	checks.hasKimiKey = !!process.env.KIMI_API_KEY
	checks.hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY

	// Check CLAUDE.md
	try {
		const claudeMdPath = resolvePath(process.cwd(), ".claude", "CLAUDE.md")
		await access(claudeMdPath)
		checks.claudeMdExists = true
		checks.claudeMdPath = claudeMdPath
	} catch {
		checks.claudeMdExists = false
	}

	// Quick SDK test (spawn node with cli.js to check if it starts)
	try {
		const cliPath = (checks as any).cliPathResolved
		if (cliPath) {
			const result = execSync(`node -e "require('${cliPath}')" 2>&1 || true`, {
				timeout: 5000,
				env: { ...process.env, CLAUDECODE: undefined },
			})
				.toString()
				.trim()
			checks.cliLoadTest = result || "loaded OK (no output)"
		}
	} catch (e) {
		checks.cliLoadTest = e instanceof Error ? e.message : String(e)
	}

	// Test actual SDK query if ?test=true
	if (c.req.query("test") === "true") {
		try {
			const { query: sdkQuery } = await import("@anthropic-ai/claude-agent-sdk")
			const { getDefaultProvider, getProviderConfig } = await import(
				"./config/providers"
			)

			const providerId = getDefaultProvider()
			const providerConfig = getProviderConfig(providerId)
			const cliPath = (checks as any).cliPathResolved

			const stderrOutput: string[] = []
			const sdkEnv: Record<string, string | undefined> = {
				...process.env,
				CLAUDECODE: undefined,
				ANTHROPIC_API_KEY: providerConfig.apiKey,
				ANTHROPIC_AUTH_TOKEN: providerConfig.apiKey,
				ANTHROPIC_BASE_URL: providerConfig.baseURL,
				ANTHROPIC_MODEL: providerConfig.models.default,
			}

			const events: unknown[] = []
			const iter = sdkQuery({
				prompt: "Say exactly: OK",
				options: {
					model: providerConfig.models.default,
					maxTurns: 1,
					env: sdkEnv,
					pathToClaudeCodeExecutable: cliPath,
					executable: "node",
					permissionMode: "bypassPermissions",
					allowDangerouslySkipPermissions: true,
					persistSession: false,
					systemPrompt:
						"You are a test. Reply with exactly 'OK' and nothing else.",
					cwd: process.cwd(),
					stderr: (data: string) => {
						stderrOutput.push(data.trim())
					},
				},
			})

			const timeout = new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error("SDK query timed out after 30s")),
					30000,
				),
			)

			try {
				const iterPromise = (async () => {
					for await (const event of iter) {
						events.push(event)
						if (events.length > 20) break
					}
				})()
				await Promise.race([iterPromise, timeout])
			} catch (e) {
				checks.sdkQueryError = e instanceof Error ? e.message : String(e)
			}

			checks.sdkQueryEvents = events.length
			checks.sdkQueryEventTypes = events
				.filter(
					(e): e is Record<string, unknown> =>
						!!e && typeof e === "object" && "type" in e,
				)
				.map((e) => e.type)
			checks.sdkStderr = stderrOutput.filter((s) => s.length > 0).slice(0, 10)

			// Extract text from response
			const textBlocks: string[] = []
			for (const event of events) {
				if (event && typeof event === "object" && "type" in event) {
					const ev = event as Record<string, unknown>
					if (
						ev.type === "assistant" &&
						ev.message &&
						typeof ev.message === "object"
					) {
						const msg = ev.message as Record<string, unknown>
						if (Array.isArray(msg.content)) {
							for (const block of msg.content) {
								if (
									block &&
									typeof block === "object" &&
									(block as any).type === "text"
								) {
									textBlocks.push((block as any).text)
								}
							}
						}
					}
				}
			}
			checks.sdkQueryText = textBlocks.join("") || null
		} catch (e) {
			checks.sdkTestError =
				e instanceof Error ? `${e.message}\n${e.stack}` : String(e)
		}
	}

	return c.json(checks)
})

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

// ============================================
// Protected Routes (require auth)
// ============================================

app.use("/v3/*", requireAuth)
app.use("/chat", requireAuth)
app.use("/chat/*", requireAuth)

// Mount modular routers
app.route("/v3/projects", projectsRouter)
app.route("/v3/documents", documentsRouter)
app.route("/v3/search", searchRouter)
app.route("/v3/connections", connectionsRouter)
app.route("/v3/document-connections", documentConnectionsRouter)
app.route("/v3/feature-flags", featureFlagsRouter)
app.route("/v3/settings", settingsRouter)
app.route("/v3/skills", skillsRouter)
app.route("/v3/conversations", conversationsRouter)
app.route("/v3/council", councilRouter)
app.route("/v3/canvas", canvasRouter)
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

// Create HTTP server for Socket.IO integration
const httpServer = createServer((req, res) => {
	const requestUrl = `http://localhost:${port}${req.url ?? "/"}`
	const method = req.method ?? "GET"
	const requestInit: RequestInit = {
		method,
		headers: req.headers as HeadersInit,
	}
	if (method !== "GET" && method !== "HEAD") {
		requestInit.body = req as unknown as BodyInit
	}

	Promise.resolve(app.fetch(new Request(requestUrl, requestInit)))
		.then((response: Response) => {
			res.writeHead(response.status, Object.fromEntries(response.headers))
			if (response.body) {
				const reader = response.body.getReader()
				const pump = () => {
					reader
						.read()
						.then(({ done, value }: ReadableStreamReadResult<Uint8Array>) => {
							if (done) {
								res.end()
								return
							}
							res.write(value)
							pump()
						})
						.catch((err: unknown) => {
							console.error("[HTTP] Stream read error:", err)
							res.end()
						})
				}
				pump()
			} else {
				res.end()
			}
		})
		.catch((err: unknown) => {
			console.error("[HTTP] Request error:", err)
			res.writeHead(500)
			res.end("Internal Server Error")
		})
})

// Setup Socket.IO for canvas collaboration
setupCanvasCollaboration(httpServer)

httpServer.listen(port, () => {
	console.log(`[Boot] Kortix API listening on http://localhost:${port}`)
	console.log(`[Boot] Socket.IO enabled for canvas collaboration`)
})
