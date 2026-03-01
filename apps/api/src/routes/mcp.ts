import { createHash, randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Context } from "hono"
import { Hono } from "hono"
import {
	bridge,
	describePrompt,
	describeTool,
	muppet,
	type PromptResponseType,
	type ToolResponseType,
} from "muppet"
import { SSEHonoTransport, streamSSE } from "muppet/streaming"
import { z } from "zod"

import { env } from "../env"
import {
	applyCanvasCreateView,
	autoArrangeCanvasForAgent,
	CANVAS_READ_ME_TEXT,
	clearCanvasForAgent,
	createFlowchartCanvasForAgent,
	createMindmapCanvasForAgent,
	listCanvasCheckpointsForAgent,
	readCanvasSceneForAgent,
	summarizeCanvasSceneForAgent,
} from "../services/canvas-agent-service"
import {
	executeStructuredSearch,
	formatStructuredSearchForHumans,
	type SearchToolResult,
} from "../services/search-tool"
import { createScopedSupabase, supabaseAdmin } from "../supabase"
import { createCanvas, getCanvas, listCanvases } from "./canvas"
import { addDocument, ensureSpace } from "./documents"

type McpAuthContext = {
	organizationId: string
	actorUserId: string
	apiKeyId: string
}

type McpSession = {
	transport: SSEHonoTransport
	organizationId: string
	actorUserId: string
	apiKeyId: string
	userHandle: string
	projectSlug: string
	containerTag: string
}

const sessions = new Map<string, McpSession>()

const addToolSchema = z.object({
	thingToRemember: z.string().min(1).max(6000),
})

const searchToolSchema = z.object({
	informationToGet: z.string().min(1).max(4000),
	limit: z.number().int().min(1).max(50).optional().default(8),
	responseFormat: z.enum(["json", "human"]).optional().default("json"),
})

const mcpCanvasCreateSchema = z.object({
	name: z.string().min(1).max(120).optional().default("Untitled Canvas"),
	projectId: z.string().uuid().optional(),
	content: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
})

const mcpCanvasListSchema = z.object({
	projectId: z.string().uuid().optional(),
})

const mcpCanvasIdSchema = z.object({
	canvasId: z.string().uuid(),
})

const mcpCanvasReadSceneSchema = z.object({
	canvasId: z.string().uuid(),
	elementLimit: z.number().int().min(1).max(1000).optional().default(200),
	includeRaw: z.boolean().optional().default(false),
})

const mcpCanvasCreateViewSchema = z.object({
	canvasId: z.string().uuid(),
	input: z.string().min(2),
	checkpointId: z.string().uuid().optional(),
	mode: z.enum(["append", "replace"]).optional().default("append"),
	baseVersion: z.number().int().min(1).optional(),
})

const mcpCanvasListCheckpointsSchema = z.object({
	canvasId: z.string().uuid(),
	limit: z.number().int().min(1).max(100).optional().default(20),
})

const mcpCanvasRestoreCheckpointSchema = z.object({
	canvasId: z.string().uuid(),
	checkpointId: z.string().uuid(),
	baseVersion: z.number().int().min(1).optional(),
})

const mcpCanvasAutoArrangeSchema = z.object({
	canvasId: z.string().uuid(),
	columns: z.number().int().min(1).max(12).optional(),
	gapX: z.number().int().min(16).max(600).optional(),
	gapY: z.number().int().min(16).max(600).optional(),
	padding: z.number().int().min(0).max(2000).optional(),
	baseVersion: z.number().int().min(1).optional(),
})

const mcpCanvasFlowchartSchema = z.object({
	canvasId: z.string().uuid(),
	title: z.string().max(200).optional(),
	steps: z.array(z.string().min(1).max(240)).min(1).max(20),
	direction: z.enum(["vertical", "horizontal"]).optional().default("vertical"),
	mode: z.enum(["append", "replace"]).optional().default("append"),
	baseVersion: z.number().int().min(1).optional(),
})

const mcpMindmapBranchSchema = z.union([
	z.string().min(1).max(240),
	z.object({
		label: z.string().min(1).max(240),
		children: z.array(z.string().min(1).max(240)).max(12).optional(),
	}),
])

const mcpCanvasMindmapSchema = z.object({
	canvasId: z.string().uuid(),
	center: z.string().min(1).max(240),
	branches: z.array(mcpMindmapBranchSchema).min(1).max(24),
	mode: z.enum(["append", "replace"]).optional().default("append"),
	baseVersion: z.number().int().min(1).optional(),
})

const MCP_MAX_MEMORIES = 2000

function zodIssuesToMessage(error: unknown): string {
	if (error instanceof z.ZodError) {
		return error.issues.map((issue) => issue.message).join(", ")
	}
	return "Invalid payload"
}

function toolText(text: string): ToolResponseType {
	return [{ type: "text", text }]
}

function toolJson(payload: unknown): ToolResponseType {
	return [{ type: "text", text: JSON.stringify(payload, null, 2) }]
}

function extractApiKey(c: Context): string | null {
	const authHeader =
		c.req.header("authorization") ?? c.req.header("Authorization")
	if (authHeader && authHeader.trim().length > 0) {
		if (authHeader.toLowerCase().startsWith("bearer ")) {
			return authHeader.slice(7).trim()
		}
		return authHeader.trim()
	}

	const urlKey = c.req.query("apiKey")
	if (urlKey && urlKey.trim().length > 0) {
		return urlKey.trim()
	}

	return null
}

async function authenticateApiKey(
	secret: string,
): Promise<McpAuthContext | null> {
	const tokenHash = createHash("sha256").update(secret).digest("hex")

	const { data, error } = await supabaseAdmin
		.from("api_keys")
		.select("id, org_id, user_id, revoked_at, expires_at")
		.eq("secret_hash", tokenHash)
		.maybeSingle()

	if (error || !data) {
		return null
	}

	if (data.revoked_at) {
		return null
	}

	if (data.expires_at && new Date(data.expires_at) < new Date()) {
		return null
	}

	if (!data.user_id) {
		return null
	}

	void supabaseAdmin
		.from("api_keys")
		.update({ last_used_at: new Date().toISOString() })
		.eq("id", data.id)

	return {
		organizationId: data.org_id,
		actorUserId: data.user_id,
		apiKeyId: data.id,
	}
}

function normalizeIdentifier(raw: string, fallback: string): string {
	const trimmed = raw.trim().toLowerCase()
	const normalized = trimmed
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-_]+|[-_]+$/g, "")
	return normalized.length > 0 ? normalized.slice(0, 64) : fallback
}

async function countMemoriesForUser(
	client: SupabaseClient,
	organizationId: string,
	userHandle: string,
	projectSlug: string,
) {
	const { count } = await client
		.from("documents")
		.select("id", { count: "exact", head: true })
		.eq("org_id", organizationId)
		.contains("metadata", { mcpUserId: userHandle, mcpProject: projectSlug })

	return count ?? 0
}

function filterSearchResultsForMcp(
	payload: SearchToolResult,
	userHandle: string,
	projectSlug: string,
): SearchToolResult {
	const relevant = payload.results.filter((result) => {
		const metadata = (result.metadata ?? {}) as Record<string, unknown>
		const belongsToUser = metadata.mcpUserId === userHandle
		const belongsToProject = metadata.mcpProject === projectSlug
		return belongsToUser && belongsToProject
	})

	return {
		...payload,
		total: relevant.length,
		returned: relevant.length,
		results: relevant,
	}
}

function buildMcpApp(context: {
	organizationId: string
	actorUserId: string
	apiKeyId: string
	containerTag: string
	userHandle: string
	projectSlug: string
}) {
	const { organizationId, actorUserId, containerTag, userHandle, projectSlug } =
		context

	const app = new Hono<{ Variables: { supabase: SupabaseClient } }>()

	app.use(async (c, next) => {
		const supabase = createScopedSupabase(organizationId, actorUserId)
		c.set("supabase", supabase)
		await next()
	})

	app.post(
		"/kortix-prompt",
		describePrompt({
			name: "Kortix Prompt",
			description: "Instructional prompt for MCP clients",
			completion: () => ["kortix", "memory", "kortix api"],
		}),
		(c) => {
			const prompt: PromptResponseType = [
				{
					role: "user",
					content: {
						type: "text",
						text: "IMPORTANT: You MUST use Kortix tools proactively to be an effective assistant.\n\n1. ALWAYS search Kortix before answering when the user references past conversations, preferences, or setup details.\n2. AUTOMATICALLY store new preferences, constraints, project facts, and opinions after every relevant user message.\n3. Think of Kortix as the source of truth for this assistant—keep it updated.",
					},
				},
			]
			return c.json(prompt)
		},
	)

	app.post(
		"/add",
		describeTool({
			name: "addToKortix",
			description:
				"Store user information, preferences, and behaviors gathered during the conversation. Use this whenever you detect context worth remembering.",
		}),
		async (c) => {
			const supabase = c.get("supabase")

			let body: z.infer<typeof addToolSchema>
			try {
				body = addToolSchema.parse(await c.req.json())
			} catch (error) {
				const message =
					error instanceof z.ZodError
						? error.issues.map((issue) => issue.message).join(", ")
						: "Invalid payload"
				const response: ToolResponseType = [{ type: "text", text: message }]
				return c.json(response, 400)
			}

			const existingCount = await countMemoriesForUser(
				supabase,
				organizationId,
				userHandle,
				projectSlug,
			)
			if (existingCount >= MCP_MAX_MEMORIES) {
				const response: ToolResponseType = [
					{
						type: "text",
						text: `Memory limit of ${MCP_MAX_MEMORIES} entries reached for this user/project. Please remove older memories before adding new ones.`,
					},
				]
				return c.json(response, 400)
			}

			const metadata = {
				mcpSource: "mcp",
				mcpUserId: userHandle,
				mcpProject: projectSlug,
			} satisfies Record<string, string>

			try {
				await ensureSpace(supabase, organizationId, containerTag)

				await addDocument({
					organizationId,
					userId: actorUserId,
					payload: {
						content: body.thingToRemember,
						metadata,
						containerTags: [containerTag],
					},
					client: supabase,
				})
			} catch (error) {
				console.error("Failed to add MCP memory", error)
				const response: ToolResponseType = [
					{ type: "text", text: "Failed to store memory. Please try again." },
				]
				return c.json(response, 500)
			}

			const response: ToolResponseType = [
				{ type: "text", text: "Memory stored successfully." },
			]
			return c.json(response)
		},
	)

	app.post(
		"/search",
		describeTool({
			name: "searchKortix",
			description:
				"Search previously stored memories for relevant information about the current user or project context.",
		}),
		async (c) => {
			const supabase = c.get("supabase")

			let body: z.infer<typeof searchToolSchema>
			try {
				body = searchToolSchema.parse(await c.req.json())
			} catch (error) {
				const message =
					error instanceof z.ZodError
						? error.issues.map((issue) => issue.message).join(", ")
						: "Invalid payload"
				const response: ToolResponseType = [{ type: "text", text: message }]
				return c.json(response, 400)
			}

			try {
				const structured = await executeStructuredSearch(
					supabase,
					organizationId,
					{
						query: body.informationToGet,
						limit: body.limit,
						containerTags: [containerTag],
						includeSummary: true,
						includeFullDocs: false,
						chunkThreshold: 0,
						documentThreshold: 0,
						onlyMatchingChunks: false,
					},
				)

				const scoped = filterSearchResultsForMcp(
					structured,
					userHandle,
					projectSlug,
				)

				const responseText =
					body.responseFormat === "human"
						? scoped.results.length === 0
							? `No memories found for ${userHandle} in project ${projectSlug}.`
							: formatStructuredSearchForHumans(scoped, {
									maxResults: Math.min(5, body.limit),
								})
						: JSON.stringify(scoped, null, 2)

				const response: ToolResponseType = [
					{ type: "text", text: responseText },
				]
				return c.json(response)
			} catch (error) {
				console.error("Failed to search MCP memories", error)
				const response: ToolResponseType = [
					{ type: "text", text: "Search failed. Please try again." },
				]
				return c.json(response, 500)
			}
		},
	)

	if (env.CANVAS_AGENT_TOOLS_ENABLED === "true") {
		app.post(
			"/canvas-read-me",
			describeTool({
				name: "canvasReadMe",
				description:
					"Read the operating guide for Canvas tools and recommended sequencing.",
			}),
			async (c) => c.json(toolText(CANVAS_READ_ME_TEXT)),
		)

		app.post(
			"/canvas-list",
			describeTool({
				name: "canvasList",
				description:
					"List canvases available to the authenticated MCP API key user.",
			}),
			async (c) => {
				const supabase = c.get("supabase")

				let body: z.infer<typeof mcpCanvasListSchema>
				try {
					body = mcpCanvasListSchema.parse(await c.req.json().catch(() => ({})))
				} catch (error) {
					return c.json(toolText(zodIssuesToMessage(error)), 400)
				}

				try {
					const canvases = await listCanvases(
						supabase,
						actorUserId,
						body.projectId,
					)
					const compact = canvases.map((canvas) => ({
						id: canvas.id,
						name: canvas.name,
						projectId: canvas.projectId ?? null,
						version: canvas.version,
						updatedAt: canvas.updatedAt,
					}))
					return c.json(toolJson({ total: compact.length, canvases: compact }))
				} catch (error) {
					console.error("Failed to list canvases over MCP", error)
					return c.json(toolText("Failed to list canvases."), 500)
				}
			},
		)

		app.post(
			"/canvas-get",
			describeTool({
				name: "canvasGet",
				description:
					"Fetch one canvas by ID including current serialized content and metadata.",
			}),
			async (c) => {
				const supabase = c.get("supabase")

				let body: z.infer<typeof mcpCanvasIdSchema>
				try {
					body = mcpCanvasIdSchema.parse(await c.req.json().catch(() => ({})))
				} catch (error) {
					return c.json(toolText(zodIssuesToMessage(error)), 400)
				}

				try {
					const canvas = await getCanvas(supabase, body.canvasId, actorUserId)
					return c.json(toolJson(canvas))
				} catch (error) {
					console.error("Failed to fetch canvas over MCP", error)
					return c.json(toolText("Canvas not found or access denied."), 404)
				}
			},
		)

		app.post(
			"/canvas-create",
			describeTool({
				name: "canvasCreate",
				description:
					"Create a new canvas. Optionally provide a projectId and initial content.",
			}),
			async (c) => {
				const supabase = c.get("supabase")

				let body: z.infer<typeof mcpCanvasCreateSchema>
				try {
					body = mcpCanvasCreateSchema.parse(
						await c.req.json().catch(() => ({})),
					)
				} catch (error) {
					return c.json(toolText(zodIssuesToMessage(error)), 400)
				}

				try {
					const created = await createCanvas(supabase, actorUserId, body)
					return c.json(toolJson(created))
				} catch (error) {
					console.error("Failed to create canvas over MCP", error)
					return c.json(toolText("Failed to create canvas."), 500)
				}
			},
		)

		app.post(
			"/canvas-read-scene",
			describeTool({
				name: "canvasReadScene",
				description:
					"Read scene statistics, bounds, text snippets and normalized elements from a canvas.",
			}),
			async (c) => {
				const supabase = c.get("supabase")

				let body: z.infer<typeof mcpCanvasReadSceneSchema>
				try {
					body = mcpCanvasReadSceneSchema.parse(
						await c.req.json().catch(() => ({})),
					)
				} catch (error) {
					return c.json(toolText(zodIssuesToMessage(error)), 400)
				}

				try {
					const result = await readCanvasSceneForAgent({
						client: supabase,
						userId: actorUserId,
						canvasId: body.canvasId,
						elementLimit: body.elementLimit,
						includeRaw: body.includeRaw,
					})
					return c.json(toolJson(result))
				} catch (error) {
					console.error("Failed to read canvas scene over MCP", error)
					return c.json(toolText("Failed to read canvas scene."), 500)
				}
			},
		)

		app.post(
			"/canvas-create-view",
			describeTool({
				name: "canvasCreateView",
				description:
					"Apply Excalidraw ops JSON to a canvas (append/replace), with optional checkpoint and baseVersion conflict control.",
			}),
			async (c) => {
				const supabase = c.get("supabase")

				let body: z.infer<typeof mcpCanvasCreateViewSchema>
				try {
					body = mcpCanvasCreateViewSchema.parse(
						await c.req.json().catch(() => ({})),
					)
				} catch (error) {
					return c.json(toolText(zodIssuesToMessage(error)), 400)
				}

				try {
					const result = await applyCanvasCreateView({
						client: supabase,
						userId: actorUserId,
						canvasId: body.canvasId,
						input: body.input,
						checkpointId: body.checkpointId,
						mode: body.mode,
						baseVersion: body.baseVersion,
						source: "mcp:external",
					})
					return c.json(toolJson(result))
				} catch (error) {
					console.error("Failed to apply canvas create view over MCP", error)
					return c.json(toolText("Failed to apply canvas operations."), 500)
				}
			},
		)

		app.post(
			"/canvas-list-checkpoints",
			describeTool({
				name: "canvasListCheckpoints",
				description:
					"List recent checkpoints for a given canvas so clients can restore safely.",
			}),
			async (c) => {
				const supabase = c.get("supabase")

				let body: z.infer<typeof mcpCanvasListCheckpointsSchema>
				try {
					body = mcpCanvasListCheckpointsSchema.parse(
						await c.req.json().catch(() => ({})),
					)
				} catch (error) {
					return c.json(toolText(zodIssuesToMessage(error)), 400)
				}

				try {
					const result = await listCanvasCheckpointsForAgent({
						client: supabase,
						userId: actorUserId,
						canvasId: body.canvasId,
						limit: body.limit,
					})
					return c.json(toolJson(result))
				} catch (error) {
					console.error("Failed to list canvas checkpoints over MCP", error)
					return c.json(toolText("Failed to list checkpoints."), 500)
				}
			},
		)

		app.post(
			"/canvas-restore-checkpoint",
			describeTool({
				name: "canvasRestoreCheckpoint",
				description:
					"Restore a canvas to a checkpoint ID. Uses optimistic concurrency when baseVersion is provided.",
			}),
			async (c) => {
				const supabase = c.get("supabase")

				let body: z.infer<typeof mcpCanvasRestoreCheckpointSchema>
				try {
					body = mcpCanvasRestoreCheckpointSchema.parse(
						await c.req.json().catch(() => ({})),
					)
				} catch (error) {
					return c.json(toolText(zodIssuesToMessage(error)), 400)
				}

				try {
					const result = await applyCanvasCreateView({
						client: supabase,
						userId: actorUserId,
						canvasId: body.canvasId,
						input: "[]",
						checkpointId: body.checkpointId,
						mode: "append",
						baseVersion: body.baseVersion,
						source: "mcp:restore",
					})
					return c.json(toolJson(result))
				} catch (error) {
					console.error("Failed to restore canvas checkpoint over MCP", error)
					return c.json(toolText("Failed to restore checkpoint."), 500)
				}
			},
		)

		app.post(
			"/canvas-auto-arrange",
			describeTool({
				name: "canvasAutoArrange",
				description:
					"Auto-arrange eligible canvas elements in a grid while preserving container child relationships.",
			}),
			async (c) => {
				const supabase = c.get("supabase")

				let body: z.infer<typeof mcpCanvasAutoArrangeSchema>
				try {
					body = mcpCanvasAutoArrangeSchema.parse(
						await c.req.json().catch(() => ({})),
					)
				} catch (error) {
					return c.json(toolText(zodIssuesToMessage(error)), 400)
				}

				try {
					const result = await autoArrangeCanvasForAgent({
						client: supabase,
						userId: actorUserId,
						canvasId: body.canvasId,
						columns: body.columns,
						gapX: body.gapX,
						gapY: body.gapY,
						padding: body.padding,
						baseVersion: body.baseVersion,
					})
					return c.json(toolJson(result))
				} catch (error) {
					console.error("Failed to auto-arrange canvas over MCP", error)
					return c.json(toolText("Failed to auto-arrange canvas."), 500)
				}
			},
		)

		app.post(
			"/canvas-summarize-scene",
			describeTool({
				name: "canvasSummarizeScene",
				description:
					"Generate a structured summary of the canvas (stats, inferred kind, text preview and prose summary).",
			}),
			async (c) => {
				const supabase = c.get("supabase")

				let body: z.infer<typeof mcpCanvasIdSchema>
				try {
					body = mcpCanvasIdSchema.parse(await c.req.json().catch(() => ({})))
				} catch (error) {
					return c.json(toolText(zodIssuesToMessage(error)), 400)
				}

				try {
					const result = await summarizeCanvasSceneForAgent({
						client: supabase,
						userId: actorUserId,
						canvasId: body.canvasId,
					})
					return c.json(toolJson(result))
				} catch (error) {
					console.error("Failed to summarize canvas scene over MCP", error)
					return c.json(toolText("Failed to summarize canvas."), 500)
				}
			},
		)

		app.post(
			"/canvas-create-flowchart",
			describeTool({
				name: "canvasCreateFlowchart",
				description:
					"Create a flowchart in the target canvas from an ordered steps list.",
			}),
			async (c) => {
				const supabase = c.get("supabase")

				let body: z.infer<typeof mcpCanvasFlowchartSchema>
				try {
					body = mcpCanvasFlowchartSchema.parse(
						await c.req.json().catch(() => ({})),
					)
				} catch (error) {
					return c.json(toolText(zodIssuesToMessage(error)), 400)
				}

				try {
					const result = await createFlowchartCanvasForAgent({
						client: supabase,
						userId: actorUserId,
						canvasId: body.canvasId,
						title: body.title,
						steps: body.steps,
						direction: body.direction,
						mode: body.mode,
						baseVersion: body.baseVersion,
					})
					return c.json(toolJson(result))
				} catch (error) {
					console.error("Failed to create canvas flowchart over MCP", error)
					return c.json(toolText("Failed to create flowchart in canvas."), 500)
				}
			},
		)

		app.post(
			"/canvas-create-mindmap",
			describeTool({
				name: "canvasCreateMindmap",
				description:
					"Create a mindmap in the target canvas from a center topic and branches.",
			}),
			async (c) => {
				const supabase = c.get("supabase")

				let body: z.infer<typeof mcpCanvasMindmapSchema>
				try {
					body = mcpCanvasMindmapSchema.parse(
						await c.req.json().catch(() => ({})),
					)
				} catch (error) {
					return c.json(toolText(zodIssuesToMessage(error)), 400)
				}

				try {
					const result = await createMindmapCanvasForAgent({
						client: supabase,
						userId: actorUserId,
						canvasId: body.canvasId,
						center: body.center,
						branches: body.branches,
						mode: body.mode,
						baseVersion: body.baseVersion,
					})
					return c.json(toolJson(result))
				} catch (error) {
					console.error("Failed to create canvas mindmap over MCP", error)
					return c.json(toolText("Failed to create mindmap in canvas."), 500)
				}
			},
		)

		app.post(
			"/canvas-clear",
			describeTool({
				name: "canvasClear",
				description: "Clear all elements from a canvas in a single operation.",
			}),
			async (c) => {
				const supabase = c.get("supabase")

				let body: z.infer<typeof mcpCanvasIdSchema>
				try {
					body = mcpCanvasIdSchema.parse(await c.req.json().catch(() => ({})))
				} catch (error) {
					return c.json(toolText(zodIssuesToMessage(error)), 400)
				}

				try {
					const result = await clearCanvasForAgent({
						client: supabase,
						userId: actorUserId,
						canvasId: body.canvasId,
					})
					return c.json(toolJson(result))
				} catch (error) {
					console.error("Failed to clear canvas over MCP", error)
					return c.json(toolText("Failed to clear canvas."), 500)
				}
			},
		)
	}

	return app
}

export function registerMcpRoutes<E extends object>(app: Hono<E>) {
	app.get("/mcp", (c) =>
		c.json({
			status: "ok",
			message: "Kortix MCP endpoint",
		}),
	)

	app.get("/mcp/:userId/sse", async (c) => {
		const apiKey = extractApiKey(c)
		if (!apiKey) {
			return c.json({ error: { message: "Missing API key" } }, 401)
		}

		const auth = await authenticateApiKey(apiKey)
		if (!auth) {
			return c.json({ error: { message: "Invalid or expired API key" } }, 401)
		}

		const userIdParam = c.req.param("userId")
		if (!userIdParam || userIdParam.trim().length === 0) {
			return c.json({ error: { message: "User identifier is required" } }, 400)
		}

		const normalizedUser = normalizeIdentifier(userIdParam, "default")

		const projectHeader =
			c.req.header("x-sm-project") ?? c.req.query("project") ?? "default"
		const projectSlug = normalizeIdentifier(projectHeader, "default")
		const containerTag = `sm_project_${projectSlug}`

		const sessionId = c.req.query("sessionId") ?? randomUUID()
		const transport = new SSEHonoTransport(
			`/mcp/${encodeURIComponent(userIdParam)}/messages`,
			sessionId,
		)

		const sessionInfo: McpSession = {
			transport,
			organizationId: auth.organizationId,
			actorUserId: auth.actorUserId,
			apiKeyId: auth.apiKeyId,
			userHandle: normalizedUser,
			projectSlug,
			containerTag,
		}

		transport.onclose = () => {
			sessions.delete(sessionId)
		}
		transport.onerror = (error) => {
			console.error("MCP transport error", error)
		}

		sessions.set(sessionId, sessionInfo)

		return streamSSE(c, async (stream) => {
			transport.connectWithStream(stream)

			const mcpApp = await muppet(
				buildMcpApp({
					organizationId: auth.organizationId,
					actorUserId: auth.actorUserId,
					apiKeyId: auth.apiKeyId,
					containerTag,
					userHandle: normalizedUser,
					projectSlug,
				}),
				{
					name: "Kortix MCP",
					version: "1.0.0",
				},
			)

			await bridge({
				mcp: mcpApp,
				transport,
			})
		})
	})

	app.post("/mcp/:userId/messages", async (c) => {
		const sessionId = c.req.query("sessionId") ?? c.req.header("x-mcp-session")
		if (!sessionId) {
			return c.json({ error: { message: "Missing session identifier" } }, 400)
		}

		const session = sessions.get(sessionId)
		if (!session) {
			return c.json({ error: { message: "Session not found" } }, 404)
		}

		try {
			await session.transport.handlePostMessage(c)
			return c.text("ok")
		} catch (error) {
			console.error("Failed to handle MCP message", error)
			return c.json({ error: { message: "Failed to process message" } }, 500)
		}
	})
}
