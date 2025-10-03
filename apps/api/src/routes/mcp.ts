import { createHash, randomUUID } from "node:crypto"
import { Hono } from "hono"
import type { Context } from "hono"
import { z } from "zod"
import {
  bridge,
  describePrompt,
  describeTool,
  muppet,
  type PromptResponseType,
  type ToolResponseType,
} from "muppet"
import { SSEHonoTransport, streamSSE } from "muppet/streaming"
import type { SupabaseClient } from "@supabase/supabase-js"

import { supabaseAdmin, createScopedSupabase } from "../supabase"
import { addDocument, ensureSpace } from "./documents"
import { searchDocuments } from "./search"

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
})

const MCP_MAX_MEMORIES = 2000

function extractApiKey(c: Context): string | null {
  const authHeader = c.req.header("authorization") ?? c.req.header("Authorization")
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

async function authenticateApiKey(secret: string): Promise<McpAuthContext | null> {
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
  const normalized = trimmed.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^[-_]+|[-_]+$/g, "")
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

function formatSearchResults(
  results: Awaited<ReturnType<typeof searchDocuments>>["results"],
  userHandle: string,
  projectSlug: string,
): string {
  const relevant = results.filter((result) => {
    const metadata = (result.metadata ?? {}) as Record<string, unknown>
    const belongsToUser = metadata.mcpUserId === userHandle
    const belongsToProject = metadata.mcpProject === projectSlug
    return belongsToUser && belongsToProject
  })

  if (relevant.length === 0) {
    return `No memories found for ${userHandle} in project ${projectSlug}.`
  }

  const top = relevant.slice(0, 3)

  return top
    .map((result, index) => {
      const title = result.title ?? result.metadata?.title ?? `Memory ${index + 1}`
      const summary = result.summary ?? ""
      const chunkSnippets = (result.chunks ?? [])
        .slice(0, 2)
        .map((chunk) => chunk.content?.trim())
        .filter((chunk): chunk is string => Boolean(chunk && chunk.length > 0))

      const lines: string[] = []
      lines.push(`${index + 1}. ${title}`)
      if (summary) {
        lines.push(`   Summary: ${summary}`)
      }
      for (const snippet of chunkSnippets) {
        lines.push(`   • ${snippet}`)
      }
      return lines.join("\n")
    })
    .join("\n\n")
}

function buildMcpApp(context: {
  organizationId: string
  actorUserId: string
  apiKeyId: string
  containerTag: string
  userHandle: string
  projectSlug: string
}) {
  const { organizationId, actorUserId, containerTag, userHandle, projectSlug } = context

  const app = new Hono<{ Variables: { supabase: SupabaseClient } }>()

  app.use(async (c, next) => {
    const supabase = createScopedSupabase(organizationId, actorUserId)
    c.set("supabase", supabase)
    await next()
  })

  app.post(
    "/supermemory-prompt",
    describePrompt({
      name: "Supermemory Prompt",
      description: "Instructional prompt for MCP clients",
      completion: () => ["supermemory", "memory", "supermemory api"],
    }),
    (c) => {
      const prompt: PromptResponseType = [
        {
          role: "user",
          content: {
            type: "text",
            text: "IMPORTANT: You MUST use Supermemory tools proactively to be an effective assistant.\n\n1. ALWAYS search Supermemory before answering when the user references past conversations, preferences, or setup details.\n2. AUTOMATICALLY store new preferences, constraints, project facts, and opinions after every relevant user message.\n3. Think of Supermemory as the source of truth for this assistant—keep it updated.",
          },
        },
      ]
      return c.json(prompt)
    },
  )

  app.post(
    "/add",
    describeTool({
      name: "addToSupermemory",
      description:
        "Store user information, preferences, and behaviors gathered during the conversation. Use this whenever you detect context worth remembering.",
    }),
    async (c) => {
      const supabase = c.get("supabase")

      let body: z.infer<typeof addToolSchema>
      try {
        body = addToolSchema.parse(await c.req.json())
      } catch (error) {
        const message = error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join(", ") : "Invalid payload"
        const response: ToolResponseType = [{ type: "text", text: message }]
        return c.json(response, 400)
      }

      const existingCount = await countMemoriesForUser(supabase, organizationId, userHandle, projectSlug)
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
      name: "searchSupermemory",
      description:
        "Search previously stored memories for relevant information about the current user or project context.",
    }),
    async (c) => {
      const supabase = c.get("supabase")

      let body: z.infer<typeof searchToolSchema>
      try {
        body = searchToolSchema.parse(await c.req.json())
      } catch (error) {
        const message = error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join(", ") : "Invalid payload"
        const response: ToolResponseType = [{ type: "text", text: message }]
        return c.json(response, 400)
      }

      try {
        const searchResponse = await searchDocuments(supabase, organizationId, {
          q: body.informationToGet,
          limit: 8,
          containerTags: [containerTag],
          includeSummary: true,
          includeFullDocs: false,
          chunkThreshold: 0,
          documentThreshold: 0,
          onlyMatchingChunks: false,
        })

        const formatted = formatSearchResults(searchResponse.results, userHandle, projectSlug)

        const response: ToolResponseType = [{ type: "text", text: formatted }]
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

  return app
}

export function registerMcpRoutes(app: Hono) {
  app.get("/mcp", (c) =>
    c.json({
      status: "ok",
      message: "Supermemory MCP endpoint",
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

    const projectHeader = c.req.header("x-sm-project") ?? c.req.query("project") ?? "default"
    const projectSlug = normalizeIdentifier(projectHeader, "default")
    const containerTag = `sm_project_${projectSlug}`

    const sessionId = c.req.query("sessionId") ?? randomUUID()
    const transport = new SSEHonoTransport(`/mcp/${encodeURIComponent(userIdParam)}/messages`, sessionId)

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
          name: "Supermemory MCP",
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
