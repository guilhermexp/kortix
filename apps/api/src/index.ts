import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })
loadEnv()

import { serve } from "@hono/node-server"
import { zValidator } from "@hono/zod-validator"
import {
	CreateProjectSchema,
	DeleteProjectSchema,
	DocumentsWithMemoriesQuerySchema,
	ListMemoriesQuerySchema,
	MemoryAddSchema,
	MigrateMCPRequestSchema,
	SearchRequestSchema,
	SettingsRequestSchema,
} from "@repo/validation/api"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { z } from "zod"
import { env } from "./env"
import { requireAuth } from "./middleware/auth"
import { CreateApiKeySchema, createApiKeyHandler } from "./routes/api-keys"
import {
	getSession as getSessionInfo,
	signIn,
	signOut,
	signUp,
} from "./routes/auth"
import { generateChatTitle, handleChat } from "./routes/chat"
import {
	createConnection,
	createConnectionInputSchema,
	deleteConnection,
	getConnection,
	listConnections,
} from "./routes/connections"
import {
	addDocument,
	DocumentsByIdsSchema,
	deleteDocument,
	getDocument,
	listDocuments,
	listDocumentsWithMemories,
	listDocumentsWithMemoriesByIds,
	migrateMcpDocuments,
} from "./routes/documents"
import { healthHandler } from "./routes/health"
import { registerMcpRoutes } from "./routes/mcp"
import {
	completePasswordReset,
	requestPasswordReset,
	updatePassword,
	updatePasswordValidator,
} from "./routes/password"
import { createProject, deleteProject, listProjects } from "./routes/projects"
import { searchDocuments } from "./routes/search"
import { getSettings, updateSettings } from "./routes/settings"
import { getWaitlistStatus } from "./routes/waitlist"
import type { SessionContext } from "./session"
import { createScopedSupabase } from "./supabase"

const app = new Hono<{ Variables: { session: SessionContext } }>()

const allowedOrigins = new Set(env.ALLOWED_ORIGINS)

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
			"X-Supermemory-Organization",
			"X-Supermemory-User",
		],
		exposeHeaders: ["Set-Cookie"],
	}),
)

app.get("/health", healthHandler)

app.get("/", (c) =>
	c.json({
		message: "Supermemory API",
		docs: "Pending",
	}),
)

app.post("/api/auth/sign-up", async (c) => signUp(c))
app.post("/api/auth/sign-in", async (c) => signIn(c))
app.post("/api/auth/sign-out", async (c) => signOut(c))
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

registerMcpRoutes(app)

app.use("/v3/*", requireAuth)
app.use("/chat", requireAuth)
app.use("/chat/*", requireAuth)

app.get("/v3/projects", async (c) => {
	const { organizationId, userId } = c.var.session
	const supabase = createScopedSupabase(organizationId, userId)

	try {
		const projects = await listProjects(supabase, organizationId)
		return c.json({ projects })
	} catch (error) {
		console.error("Failed to list projects", error)
		return c.json({ error: { message: "Failed to list projects" } }, 500)
	}
})

app.post("/v3/projects", zValidator("json", CreateProjectSchema), async (c) => {
	const { organizationId, userId } = c.var.session
	const body = c.req.valid("json")
	const supabase = createScopedSupabase(organizationId, userId)

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

app.delete(
	"/v3/projects/:projectId",
	zValidator("json", DeleteProjectSchema.optional()),
	async (c) => {
		const { organizationId } = c.var.session
		const projectId = c.req.param("projectId")
		const body = c.req.valid("json") ?? { action: "delete" as const }
		const supabase = createScopedSupabase(organizationId, c.var.session.userId)

		try {
			await deleteProject(supabase, {
				organizationId,
				projectId,
				mode: body,
			})
			return c.json({ ok: true })
		} catch (error) {
			console.error("Failed to delete project", error)
			return c.json({ error: { message: "Failed to delete project" } }, 400)
		}
	},
)

app.post("/v3/documents", zValidator("json", MemoryAddSchema), async (c) => {
	const { organizationId, userId } = c.var.session
	const payload = c.req.valid("json")
	const supabase = createScopedSupabase(organizationId, userId)

	try {
		const doc = await addDocument({
			organizationId,
			userId,
			payload,
			client: supabase,
		})
		return c.json(doc, 201)
	} catch (error) {
		console.error("Failed to add document", error)
		return c.json(
			{
				error: {
					message:
						error instanceof Error ? error.message : "Failed to add document",
				},
			},
			400,
		)
	}
})

app.post("/v3/documents/file", async (c) => {
	const { organizationId, userId } = c.var.session

	try {
		const body = await c.req.parseBody()
		const file = body.file

		if (!file || !(file instanceof File)) {
			return c.json({ error: { message: "No file uploaded" } }, 400)
		}

		const arrayBuffer = await file.arrayBuffer()
		const buffer = Buffer.from(arrayBuffer)
		const filename = file.name || "uploaded-file"
		const mimeType = file.type || "application/octet-stream"

		let containerTags: string[] | undefined
		const rawContainerTags = body.containerTags
		if (Array.isArray(rawContainerTags)) {
			containerTags = rawContainerTags
				.map((value) => String(value))
				.filter(Boolean)
		} else if (
			typeof rawContainerTags === "string" &&
			rawContainerTags.trim().length > 0
		) {
			try {
				const parsed = JSON.parse(rawContainerTags)
				if (Array.isArray(parsed)) {
					containerTags = parsed.map((value) => String(value)).filter(Boolean)
				} else {
					containerTags = [rawContainerTags]
				}
			} catch {
				containerTags = [rawContainerTags]
			}
		}

		const rawMetadata = body.metadata
		let extraMetadata: Record<string, unknown> | undefined
		if (typeof rawMetadata === "string" && rawMetadata.trim().length > 0) {
			try {
				const parsed = JSON.parse(rawMetadata)
				if (parsed && typeof parsed === "object") {
					extraMetadata = parsed as Record<string, unknown>
				}
			} catch {
				extraMetadata = undefined
			}
		}

		const base64Content = buffer.toString("base64")
		const dataUrl = `data:${mimeType};base64,${base64Content}`

		const payload = {
			content: dataUrl,
			containerTags,
			metadata: {
				...(extraMetadata ?? {}),
				filename,
				mimeType,
				size: file.size,
				type: "file",
				source: "upload",
			},
		}

		const supabase = createScopedSupabase(organizationId, userId)
		const doc = await addDocument({
			organizationId,
			userId,
			payload,
			client: supabase,
		})

		return c.json(doc, 201)
	} catch (error) {
		console.error("File upload failed", error)
		return c.json(
			{
				error: {
					message:
						error instanceof Error ? error.message : "File upload failed",
				},
			},
			500,
		)
	}
})

app.post(
	"/v3/documents/list",
	zValidator("json", ListMemoriesQuerySchema.partial().optional()),
	async (c) => {
		const { organizationId } = c.var.session
		const filters = c.req.valid("json") ?? {}
		const supabase = createScopedSupabase(organizationId, c.var.session.userId)

		try {
			const response = await listDocuments(supabase, organizationId, filters)
			return c.json(response)
		} catch (error) {
			console.error("Failed to list documents", error)
			return c.json(
				{
					error: {
						message:
							error instanceof Error
								? error.message
								: "Failed to list documents",
					},
				},
				500,
			)
		}
	},
)

app.post(
	"/v3/documents/documents",
	zValidator("json", DocumentsWithMemoriesQuerySchema),
	async (c) => {
		const { organizationId } = c.var.session
		const query = c.req.valid("json")
		const supabase = createScopedSupabase(organizationId, c.var.session.userId)

		try {
			const docs = await listDocumentsWithMemories(
				supabase,
				organizationId,
				query,
			)
			return c.json(docs)
		} catch (error) {
			console.error("Failed to fetch documents with memories:", error)
			console.error("Error details:", {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				organizationId,
				query,
			})
			return c.json(
				{
					error: {
						message:
							error instanceof Error
								? error.message
								: "Failed to fetch documents",
						details:
							process.env.NODE_ENV === "development"
								? error instanceof Error
									? error.stack
									: String(error)
								: undefined,
					},
				},
				500,
			)
		}
	},
)

app.get("/v3/documents/:id", async (c) => {
	const { organizationId } = c.var.session
	const documentId = c.req.param("id")
	const supabase = createScopedSupabase(organizationId, c.var.session.userId)

	try {
		const document = await getDocument(supabase, organizationId, documentId)
		if (!document) {
			return c.json({ error: { message: "Document not found" } }, 404)
		}
		return c.json(document)
	} catch (error) {
		console.error("Failed to fetch document", error)
		return c.json(
			{
				error: {
					message:
						error instanceof Error ? error.message : "Failed to fetch document",
				},
			},
			500,
		)
	}
})

app.post(
	"/v3/documents/documents/by-ids",
	zValidator("json", DocumentsByIdsSchema),
	async (c) => {
		const { organizationId } = c.var.session
		const query = c.req.valid("json")
		const supabase = createScopedSupabase(organizationId, c.var.session.userId)

		try {
			const docs = await listDocumentsWithMemoriesByIds(
				supabase,
				organizationId,
				query,
			)
			return c.json(docs)
		} catch (error) {
			console.error("Failed to fetch documents by ids", error)
			return c.json({ error: { message: "Failed to fetch documents" } }, 500)
		}
	},
)

app.post(
	"/v3/documents/migrate-mcp",
	zValidator("json", MigrateMCPRequestSchema),
	async (c) => {
		const { organizationId } = c.var.session
		const payload = c.req.valid("json")

		try {
			const response = await migrateMcpDocuments(organizationId, payload)
			return c.json(response)
		} catch (error) {
			console.error("Failed to migrate MCP documents", error)
			return c.json({ error: { message: "Failed to migrate documents" } }, 500)
		}
	},
)

app.delete("/v3/documents/:id", async (c) => {
	const { organizationId } = c.var.session
	const documentId = c.req.param("id")
	const supabase = createScopedSupabase(organizationId, c.var.session.userId)

	try {
		await deleteDocument(supabase, { organizationId, documentId })
		return c.body(null, 204)
	} catch (error) {
		console.error("Failed to delete document", error)
		return c.json({ error: { message: "Failed to delete document" } }, 400)
	}
})

app.post("/v3/search", zValidator("json", SearchRequestSchema), async (c) => {
	const { organizationId } = c.var.session
	const body = c.req.valid("json")
	const supabase = createScopedSupabase(organizationId, c.var.session.userId)

	try {
		const response = await searchDocuments(supabase, organizationId, body)
		return c.json(response)
	} catch (error) {
		console.error("Search failed", error)
		return c.json({ error: { message: "Search failed" } }, 500)
	}
})

app.post(
	"/v3/connections/:provider",
	zValidator("json", createConnectionInputSchema),
	async (c) => {
		const { organizationId, userId } = c.var.session
		const provider = c.req.param("provider")
		const payload = c.req.valid("json")
		const supabase = createScopedSupabase(organizationId, userId)

		try {
			const response = await createConnection(supabase, {
				organizationId,
				userId,
				provider,
				payload,
			})
			return c.json(response, 201)
		} catch (error) {
			console.error("Failed to create connection", error)
			return c.json({ error: { message: "Failed to create connection" } }, 400)
		}
	},
)

app.post(
	"/v3/connections/list",
	zValidator(
		"json",
		z.object({ containerTags: z.array(z.string()).optional() }).optional(),
	),
	async (c) => {
		const { organizationId } = c.var.session
		const payload = c.req.valid("json")
		const supabase = createScopedSupabase(organizationId, c.var.session.userId)

		try {
			const connections = await listConnections(
				supabase,
				organizationId,
				payload?.containerTags,
			)
			return c.json(connections)
		} catch (error) {
			console.error("Failed to list connections", error)
			return c.json({ error: { message: "Failed to list connections" } }, 500)
		}
	},
)

app.get("/v3/connections", async (c) => {
	const { organizationId } = c.var.session
	const supabase = createScopedSupabase(organizationId, c.var.session.userId)
	try {
		const connections = await listConnections(supabase, organizationId)
		return c.json(connections)
	} catch (error) {
		console.error("Failed to fetch connections", error)
		return c.json({ error: { message: "Failed to fetch connections" } }, 500)
	}
})

app.get("/v3/connections/:connectionId", async (c) => {
	const { organizationId } = c.var.session
	const connectionId = c.req.param("connectionId")
	const supabase = createScopedSupabase(organizationId, c.var.session.userId)
	try {
		const connection = await getConnection(
			supabase,
			organizationId,
			connectionId,
		)
		if (!connection) {
			return c.json({ error: { message: "Connection not found" } }, 404)
		}
		return c.json(connection)
	} catch (error) {
		console.error("Failed to fetch connection", error)
		return c.json({ error: { message: "Failed to fetch connection" } }, 500)
	}
})

app.delete("/v3/connections/:connectionId", async (c) => {
	const { organizationId } = c.var.session
	const connectionId = c.req.param("connectionId")
	const supabase = createScopedSupabase(organizationId, c.var.session.userId)
	try {
		const connection = await getConnection(
			supabase,
			organizationId,
			connectionId,
		)
		if (!connection) {
			return c.json({ error: { message: "Connection not found" } }, 404)
		}
		await deleteConnection(supabase, organizationId, connectionId)
		return c.json({ id: connectionId, provider: connection.provider })
	} catch (error) {
		console.error("Failed to delete connection", error)
		return c.json({ error: { message: "Failed to delete connection" } }, 400)
	}
})

app.get("/v3/settings", async (c) => {
	const { organizationId } = c.var.session
	const supabase = createScopedSupabase(organizationId, c.var.session.userId)
	try {
		const settings = await getSettings(supabase, organizationId)
		return c.json(settings)
	} catch (error) {
		console.error("Failed to fetch settings", error)
		return c.json({ error: { message: "Failed to fetch settings" } }, 500)
	}
})

app.patch(
	"/v3/settings",
	zValidator("json", SettingsRequestSchema.partial().optional()),
	async (c) => {
		const { organizationId } = c.var.session
		const payload = c.req.valid("json") ?? {}
		const supabase = createScopedSupabase(organizationId, c.var.session.userId)

		try {
			const response = await updateSettings(supabase, organizationId, payload)
			return c.json(response)
		} catch (error) {
			console.error("Failed to update settings", error)
			return c.json({ error: { message: "Failed to update settings" } }, 400)
		}
	},
)

app.get("/v3/waitlist/status", (c) => c.json(getWaitlistStatus()))

app.post("/chat", async (c) => {
	const { organizationId } = c.var.session
	const body = await c.req.json()
	const supabase = createScopedSupabase(organizationId, c.var.session.userId)
	return handleChat({ orgId: organizationId, client: supabase, body })
})

app.post("/chat/title", async (c) => {
	const body = await c.req.json()
	try {
		const title = generateChatTitle(body)
		return c.text(title)
	} catch (error) {
		console.error("Failed to generate chat title", error)
		return c.text("Untitled conversation", 400)
	}
})

serve({
	fetch: app.fetch,
	port: env.PORT,
	hostname: "0.0.0.0",
})

console.log(`API server running on http://0.0.0.0:${env.PORT}`)
