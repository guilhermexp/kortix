import { createHash } from "node:crypto";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { CanvasCreateViewInputSchema } from "@repo/validation/api";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { env } from "../env";
import { getCacheService } from "./cache";
import {
  applyCanvasCreateView,
  autoArrangeCanvasForAgent,
  CANVAS_READ_ME_TEXT,
  clearCanvasForAgent,
  createFlowchartCanvasForAgent,
  createMindmapCanvasForAgent,
  getCanvasPreviewForAgent,
  listCanvasCheckpointsForAgent,
  readCanvasSceneForAgent,
  resolveCanvasToolTarget,
  summarizeCanvasSceneForAgent,
} from "./canvas-agent-service";
import { executeStructuredSearch } from "./search-tool";

type ToolContext = {
  containerTags?: string[];
  scopedDocumentIds?: string[];
  canvasId?: string;
  userId?: string;
};

function safeString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function createKortixTools(
  client: SupabaseClient,
  orgId: string,
  context: ToolContext = {},
) {
  const baseContainerTags = Array.isArray(context.containerTags)
    ? context.containerTags
    : undefined;
  const baseScopedIds = Array.isArray(context.scopedDocumentIds)
    ? context.scopedDocumentIds
    : undefined;
  const contextCanvasId = safeString(context.canvasId);
  const contextUserId = safeString(context.userId);
  const canvasToolsEnabled = env.CANVAS_AGENT_TOOLS_ENABLED === "true";

  const cache = getCacheService();
  const CACHE_TTL = 3600; // 1 hour

  // Helper function to generate cache key
  function generateCacheKey(params: Record<string, unknown>): string {
    const normalized = JSON.stringify(params, Object.keys(params).sort());
    const hash = createHash("sha256").update(normalized).digest("hex");
    return `search:${orgId}:${hash}`;
  }

  return createSdkMcpServer({
    name: "kortix-tools",
    version: "1.0.0",
    tools: [
      tool(
        "searchDatabase",
        "Search documents and memories in the user's knowledge base. Returns document titles, summaries, URLs, and relevant excerpts. Use this tool whenever the user asks about their saved content, documents, or memories.",
        {
          query: z
            .string()
            .min(1)
            .describe(
              "Search query text - can be keywords, questions, or topics",
            ),
          limit: z
            .number()
            .min(1)
            .max(50)
            .default(20)
            .describe("Maximum number of results to return"),
          includeSummary: z
            .boolean()
            .default(true)
            .describe("Include document summaries in results"),
          includeFullDocs: z
            .boolean()
            .default(false)
            .describe(
              "Include full document content (use only when specifically needed, as it increases response size)",
            ),
          containerTags: z
            .array(z.string())
            .optional()
            .describe("Filter by project/container tags"),
          scopedDocumentIds: z
            .array(z.string())
            .optional()
            .describe("Limit search to specific document IDs"),
        },
        async ({
          query,
          limit,
          includeSummary,
          includeFullDocs,
          containerTags,
          scopedDocumentIds,
        }) => {
          const startTime = Date.now();

          // Generate cache key from search parameters
          const cacheKey = generateCacheKey({
            query,
            limit,
            includeSummary,
            includeFullDocs,
            containerTags: containerTags || baseContainerTags,
            scopedDocumentIds: scopedDocumentIds || baseScopedIds,
          });

          // Try to get from cache
          const cached = await cache.get<unknown>(cacheKey);
          if (cached) {
            const duration = Date.now() - startTime;
            console.log(
              `[searchDatabase] Cache hit for query "${query}" (${duration}ms)`,
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(cached, null, 2),
                },
              ],
            };
          }

          console.log(`[searchDatabase] Cache miss for query "${query}"`);
          try {
            const result = await executeStructuredSearch(client, orgId, {
              query,
              limit,
              includeSummary,
              includeFullDocs,
              chunkThreshold: 0.1,
              documentThreshold: 0.15,
              onlyMatchingChunks: false,
              containerTags:
                containerTags && containerTags.length > 0
                  ? containerTags
                  : baseContainerTags,
              scopedDocumentIds:
                scopedDocumentIds && scopedDocumentIds.length > 0
                  ? scopedDocumentIds
                  : baseScopedIds,
            });
            const duration = Date.now() - startTime;
            console.log(
              `[searchDatabase] Found ${result.total} results (${duration}ms)`,
            );

            // Store in cache (fire and forget)
            await cache.set(cacheKey, result, { ttl: CACHE_TTL });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            console.error("[searchDatabase] Tool error:", error);
            return {
              content: [
                {
                  type: "text",
                  text: `searchDatabase failed: ${message}`,
                },
              ],
              isError: true as const,
            };
          }
        },
      ),
      ...(canvasToolsEnabled
        ? [
            tool(
              "canvas_get_preview",
              "Get a visual preview (screenshot-like image) of the current canvas so you can inspect layout visually. Returns an image content block when a saved preview is available.",
              {
                canvasId: z
                  .string()
                  .uuid()
                  .optional()
                  .describe(
                    "Canvas ID. Optional in Canvas page context where active canvas is already known.",
                  ),
              },
              async ({ canvasId }) => {
                if (!contextUserId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_get_preview failed: missing authenticated user context",
                      },
                    ],
                    isError: true as const,
                  };
                }

                const resolvedCanvasId = resolveCanvasToolTarget({
                  requestedCanvasId: safeString(canvasId),
                  contextCanvasId,
                });
                if (!resolvedCanvasId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_get_preview requires canvasId. No active canvas context found.",
                      },
                    ],
                    isError: true as const,
                  };
                }

                try {
                  const result = await getCanvasPreviewForAgent({
                    client,
                    userId: contextUserId,
                    canvasId: resolvedCanvasId,
                  });

                  if (!result.hasPreview || !result.dataBase64 || !result.mimeType) {
                    return {
                      content: [
                        {
                          type: "text",
                          text: JSON.stringify(
                            {
                              ...result,
                              message:
                                "No saved canvas preview available yet. Ask the user to wait a few seconds after edits, or use canvas_read_scene/canvas_summarize_scene.",
                            },
                            null,
                            2,
                          ),
                        },
                      ],
                    };
                  }

                  return {
                    content: [
                      {
                        type: "text",
                        text: JSON.stringify(
                          {
                            canvasId: result.canvasId,
                            name: result.name,
                            canvasVersion: result.canvasVersion,
                            updatedAt: result.updatedAt,
                            mimeType: result.mimeType,
                            note: "Visual preview attached below. Use it to inspect layout/spatial arrangement.",
                          },
                          null,
                          2,
                        ),
                      },
                      {
                        type: "image",
                        data: result.dataBase64,
                        mimeType: result.mimeType,
                      } as const,
                    ],
                  };
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Unknown error";
                  console.error("[canvas_get_preview] Tool error:", error);
                  return {
                    content: [
                      {
                        type: "text",
                        text: `canvas_get_preview failed: ${message}`,
                      },
                    ],
                    isError: true as const,
                  };
                }
              },
            ),
            tool(
              "canvas_read_me",
              "Read the canvas manipulation cheat sheet with element format, pseudo-elements (cameraUpdate, restoreCheckpoint, delete), and best practices.",
              {},
              async () => {
                return {
                  content: [
                    {
                      type: "text",
                      text: CANVAS_READ_ME_TEXT,
                    },
                  ],
                };
              },
            ),
            tool(
              "canvas_create_view",
              "Create or update Excalidraw canvas content from a JSON array string. Supports regular elements and pseudo-elements cameraUpdate, restoreCheckpoint, and delete.",
              {
                canvasId: CanvasCreateViewInputSchema.shape.canvasId.describe(
                  "Canvas ID. Optional in Canvas page context where active canvas is already known.",
                ),
                input: CanvasCreateViewInputSchema.shape.input.describe(
                  "JSON array string containing Excalidraw elements and pseudo-elements.",
                ),
                checkpointId:
                  CanvasCreateViewInputSchema.shape.checkpointId.describe(
                    "Optional checkpoint id to restore before applying operations.",
                  ),
                mode: CanvasCreateViewInputSchema.shape.mode.describe(
                  "append (default) or replace",
                ),
                baseVersion:
                  CanvasCreateViewInputSchema.shape.baseVersion.describe(
                    "Optional optimistic concurrency base version.",
                  ),
              },
              async ({ canvasId, input, checkpointId, mode, baseVersion }) => {
                if (!contextUserId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_create_view failed: missing authenticated user context",
                      },
                    ],
                    isError: true as const,
                  };
                }

                const resolvedCanvasId = resolveCanvasToolTarget({
                  requestedCanvasId: safeString(canvasId),
                  contextCanvasId,
                });
                if (!resolvedCanvasId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_create_view requires canvasId. No active canvas context found.",
                      },
                    ],
                    isError: true as const,
                  };
                }

                try {
                  const result = await applyCanvasCreateView({
                    client,
                    userId: contextUserId,
                    canvasId: resolvedCanvasId,
                    input,
                    checkpointId,
                    mode,
                    baseVersion,
                    source: "agent",
                  });
                  return {
                    content: [
                      {
                        type: "text",
                        text: JSON.stringify(result, null, 2),
                      },
                    ],
                  };
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : "Unknown error";
                  console.error("[canvas_create_view] Tool error:", error);
                  return {
                    content: [
                      {
                        type: "text",
                        text: `canvas_create_view failed: ${message}`,
                      },
                    ],
                    isError: true as const,
                  };
                }
              },
            ),
            tool(
              "canvas_read_scene",
              "Read and inspect the current Excalidraw canvas. Returns structured scene stats, element list, text snippets, and bounds. Use before editing, summarizing, or organizing a canvas.",
              {
                canvasId: z
                  .string()
                  .uuid()
                  .optional()
                  .describe(
                    "Canvas ID. Optional in Canvas page context where active canvas is already known.",
                  ),
                elementLimit: z
                  .number()
                  .int()
                  .min(1)
                  .max(1000)
                  .default(200)
                  .describe("Maximum number of elements to include in the returned element list."),
                includeRaw: z
                  .boolean()
                  .default(false)
                  .describe("Include raw Excalidraw scene JSON (elements/appState/files). Use only when needed."),
              },
              async ({ canvasId, elementLimit, includeRaw }) => {
                if (!contextUserId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_read_scene failed: missing authenticated user context",
                      },
                    ],
                    isError: true as const,
                  };
                }

                const resolvedCanvasId = resolveCanvasToolTarget({
                  requestedCanvasId: safeString(canvasId),
                  contextCanvasId,
                });
                if (!resolvedCanvasId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_read_scene requires canvasId. No active canvas context found.",
                      },
                    ],
                    isError: true as const,
                  };
                }

                try {
                  const result = await readCanvasSceneForAgent({
                    client,
                    userId: contextUserId,
                    canvasId: resolvedCanvasId,
                    elementLimit,
                    includeRaw,
                  });
                  return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                  };
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Unknown error";
                  console.error("[canvas_read_scene] Tool error:", error);
                  return {
                    content: [
                      {
                        type: "text",
                        text: `canvas_read_scene failed: ${message}`,
                      },
                    ],
                    isError: true as const,
                  };
                }
              },
            ),
            tool(
              "canvas_list_checkpoints",
              "List recent canvas checkpoints for the active canvas. Useful before restore/undo-like operations.",
              {
                canvasId: z
                  .string()
                  .uuid()
                  .optional()
                  .describe(
                    "Canvas ID. Optional in Canvas page context where active canvas is already known.",
                  ),
                limit: z
                  .number()
                  .int()
                  .min(1)
                  .max(100)
                  .default(20)
                  .describe("How many recent checkpoints to return."),
              },
              async ({ canvasId, limit }) => {
                if (!contextUserId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_list_checkpoints failed: missing authenticated user context",
                      },
                    ],
                    isError: true as const,
                  };
                }

                const resolvedCanvasId = resolveCanvasToolTarget({
                  requestedCanvasId: safeString(canvasId),
                  contextCanvasId,
                });
                if (!resolvedCanvasId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_list_checkpoints requires canvasId. No active canvas context found.",
                      },
                    ],
                    isError: true as const,
                  };
                }

                try {
                  const result = await listCanvasCheckpointsForAgent({
                    client,
                    userId: contextUserId,
                    canvasId: resolvedCanvasId,
                    limit,
                  });
                  return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                  };
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Unknown error";
                  console.error("[canvas_list_checkpoints] Tool error:", error);
                  return {
                    content: [
                      {
                        type: "text",
                        text: `canvas_list_checkpoints failed: ${message}`,
                      },
                    ],
                    isError: true as const,
                  };
                }
              },
            ),
            tool(
              "canvas_restore_checkpoint",
              "Restore the canvas to a previous checkpoint by checkpointId. Creates a new checkpoint for the restored state.",
              {
                canvasId: z
                  .string()
                  .uuid()
                  .optional()
                  .describe(
                    "Canvas ID. Optional in Canvas page context where active canvas is already known.",
                  ),
                checkpointId: z
                  .string()
                  .uuid()
                  .describe("Checkpoint ID obtained from canvas_list_checkpoints."),
                baseVersion: z
                  .number()
                  .int()
                  .min(1)
                  .optional()
                  .describe("Optional optimistic concurrency version."),
              },
              async ({ canvasId, checkpointId, baseVersion }) => {
                if (!contextUserId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_restore_checkpoint failed: missing authenticated user context",
                      },
                    ],
                    isError: true as const,
                  };
                }

                const resolvedCanvasId = resolveCanvasToolTarget({
                  requestedCanvasId: safeString(canvasId),
                  contextCanvasId,
                });
                if (!resolvedCanvasId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_restore_checkpoint requires canvasId. No active canvas context found.",
                      },
                    ],
                    isError: true as const,
                  };
                }

                try {
                  const result = await applyCanvasCreateView({
                    client,
                    userId: contextUserId,
                    canvasId: resolvedCanvasId,
                    input: JSON.stringify([{ type: "restoreCheckpoint", id: checkpointId }]),
                    checkpointId,
                    mode: "append",
                    baseVersion,
                    source: "agent:restore",
                  });
                  return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                  };
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Unknown error";
                  console.error("[canvas_restore_checkpoint] Tool error:", error);
                  return {
                    content: [
                      {
                        type: "text",
                        text: `canvas_restore_checkpoint failed: ${message}`,
                      },
                    ],
                    isError: true as const,
                  };
                }
              },
            ),
            tool(
              "canvas_auto_arrange",
              "Auto-organize canvas elements into a readable grid layout (keeps container-bound children together, e.g. labels). Best for cleaning up messy diagrams before reviewing.",
              {
                canvasId: z
                  .string()
                  .uuid()
                  .optional()
                  .describe(
                    "Canvas ID. Optional in Canvas page context where active canvas is already known.",
                  ),
                columns: z.number().int().min(1).max(12).default(3),
                gapX: z.number().int().min(16).max(1000).default(120),
                gapY: z.number().int().min(16).max(1000).default(100),
                padding: z.number().int().min(0).max(1000).default(80),
                baseVersion: z
                  .number()
                  .int()
                  .min(1)
                  .optional()
                  .describe("Optional optimistic concurrency version."),
              },
              async ({ canvasId, columns, gapX, gapY, padding, baseVersion }) => {
                if (!contextUserId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_auto_arrange failed: missing authenticated user context",
                      },
                    ],
                    isError: true as const,
                  };
                }

                const resolvedCanvasId = resolveCanvasToolTarget({
                  requestedCanvasId: safeString(canvasId),
                  contextCanvasId,
                });
                if (!resolvedCanvasId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_auto_arrange requires canvasId. No active canvas context found.",
                      },
                    ],
                    isError: true as const,
                  };
                }

                try {
                  const result = await autoArrangeCanvasForAgent({
                    client,
                    userId: contextUserId,
                    canvasId: resolvedCanvasId,
                    columns,
                    gapX,
                    gapY,
                    padding,
                    baseVersion,
                  });
                  return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                  };
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Unknown error";
                  console.error("[canvas_auto_arrange] Tool error:", error);
                  return {
                    content: [
                      {
                        type: "text",
                        text: `canvas_auto_arrange failed: ${message}`,
                      },
                    ],
                    isError: true as const,
                  };
                }
              },
            ),
            tool(
              "canvas_clear",
              "Clear/delete ALL elements from the canvas. Use when user asks to clear, reset, or delete everything from the canvas.",
              {
                canvasId: z
                  .string()
                  .uuid()
                  .optional()
                  .describe(
                    "Canvas ID. Optional in Canvas page context where active canvas is already known.",
                  ),
              },
              async ({ canvasId }) => {
                if (!contextUserId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_clear failed: missing authenticated user context",
                      },
                    ],
                    isError: true as const,
                  };
                }

                const resolvedCanvasId = resolveCanvasToolTarget({
                  requestedCanvasId: safeString(canvasId),
                  contextCanvasId,
                });
                if (!resolvedCanvasId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_clear requires canvasId. No active canvas context found.",
                      },
                    ],
                    isError: true as const,
                  };
                }

                try {
                  const result = await clearCanvasForAgent({
                    client,
                    userId: contextUserId,
                    canvasId: resolvedCanvasId,
                  });
                  return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                  };
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Unknown error";
                  console.error("[canvas_clear] Tool error:", error);
                  return {
                    content: [
                      {
                        type: "text",
                        text: `canvas_clear failed: ${message}`,
                      },
                    ],
                    isError: true as const,
                  };
                }
              },
            ),
            tool(
              "canvas_summarize_scene",
              "Summarize what exists on the current canvas (diagram type, counts, labels/text snippets, bounds). Use this when the user asks what is on the canvas or asks for a summary.",
              {
                canvasId: z
                  .string()
                  .uuid()
                  .optional()
                  .describe(
                    "Canvas ID. Optional in Canvas page context where active canvas is already known.",
                  ),
              },
              async ({ canvasId }) => {
                if (!contextUserId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_summarize_scene failed: missing authenticated user context",
                      },
                    ],
                    isError: true as const,
                  };
                }

                const resolvedCanvasId = resolveCanvasToolTarget({
                  requestedCanvasId: safeString(canvasId),
                  contextCanvasId,
                });
                if (!resolvedCanvasId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_summarize_scene requires canvasId. No active canvas context found.",
                      },
                    ],
                    isError: true as const,
                  };
                }

                try {
                  const result = await summarizeCanvasSceneForAgent({
                    client,
                    userId: contextUserId,
                    canvasId: resolvedCanvasId,
                  });
                  return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                  };
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Unknown error";
                  console.error("[canvas_summarize_scene] Tool error:", error);
                  return {
                    content: [
                      {
                        type: "text",
                        text: `canvas_summarize_scene failed: ${message}`,
                      },
                    ],
                    isError: true as const,
                  };
                }
              },
            ),
            tool(
              "canvas_create_flowchart",
              "Create a flowchart from a list of steps. Generates boxes and connecting arrows on the current canvas.",
              {
                canvasId: z
                  .string()
                  .uuid()
                  .optional()
                  .describe(
                    "Canvas ID. Optional in Canvas page context where active canvas is already known.",
                  ),
                title: z.string().optional().describe("Optional flowchart title shown above the steps."),
                steps: z
                  .array(z.string().min(1))
                  .min(1)
                  .max(20)
                  .describe("Ordered list of flow steps."),
                direction: z
                  .enum(["vertical", "horizontal"])
                  .default("vertical")
                  .describe("Primary layout direction."),
                mode: z
                  .enum(["append", "replace"])
                  .default("append")
                  .describe("Append to current canvas or replace its content."),
                baseVersion: z
                  .number()
                  .int()
                  .min(1)
                  .optional()
                  .describe("Optional optimistic concurrency version."),
              },
              async ({ canvasId, title, steps, direction, mode, baseVersion }) => {
                if (!contextUserId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_create_flowchart failed: missing authenticated user context",
                      },
                    ],
                    isError: true as const,
                  };
                }

                const resolvedCanvasId = resolveCanvasToolTarget({
                  requestedCanvasId: safeString(canvasId),
                  contextCanvasId,
                });
                if (!resolvedCanvasId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_create_flowchart requires canvasId. No active canvas context found.",
                      },
                    ],
                    isError: true as const,
                  };
                }

                try {
                  const result = await createFlowchartCanvasForAgent({
                    client,
                    userId: contextUserId,
                    canvasId: resolvedCanvasId,
                    title: safeString(title),
                    steps,
                    direction,
                    mode,
                    baseVersion,
                  });
                  return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                  };
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Unknown error";
                  console.error("[canvas_create_flowchart] Tool error:", error);
                  return {
                    content: [
                      {
                        type: "text",
                        text: `canvas_create_flowchart failed: ${message}`,
                      },
                    ],
                    isError: true as const,
                  };
                }
              },
            ),
            tool(
              "canvas_create_mindmap",
              "Create a mindmap from a central topic and branches (optionally with child items). Generates nodes and connecting arrows on the current canvas.",
              {
                canvasId: z
                  .string()
                  .uuid()
                  .optional()
                  .describe(
                    "Canvas ID. Optional in Canvas page context where active canvas is already known.",
                  ),
                center: z.string().min(1).describe("Central topic of the mindmap."),
                branches: z
                  .array(
                    z.union([
                      z.string().min(1),
                      z.object({
                        label: z.string().min(1),
                        children: z.array(z.string().min(1)).max(8).optional(),
                      }),
                    ]),
                  )
                  .min(1)
                  .max(16)
                  .describe(
                    "Branch labels or objects with label + children for second-level nodes.",
                  ),
                mode: z
                  .enum(["append", "replace"])
                  .default("append")
                  .describe("Append to current canvas or replace its content."),
                baseVersion: z
                  .number()
                  .int()
                  .min(1)
                  .optional()
                  .describe("Optional optimistic concurrency version."),
              },
              async ({ canvasId, center, branches, mode, baseVersion }) => {
                if (!contextUserId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_create_mindmap failed: missing authenticated user context",
                      },
                    ],
                    isError: true as const,
                  };
                }

                const resolvedCanvasId = resolveCanvasToolTarget({
                  requestedCanvasId: safeString(canvasId),
                  contextCanvasId,
                });
                if (!resolvedCanvasId) {
                  return {
                    content: [
                      {
                        type: "text",
                        text: "canvas_create_mindmap requires canvasId. No active canvas context found.",
                      },
                    ],
                    isError: true as const,
                  };
                }

                try {
                  const result = await createMindmapCanvasForAgent({
                    client,
                    userId: contextUserId,
                    canvasId: resolvedCanvasId,
                    center,
                    branches: branches as Array<string | { label: string; children?: string[] }>,
                    mode,
                    baseVersion,
                  });
                  return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                  };
                } catch (error) {
                  const message = error instanceof Error ? error.message : "Unknown error";
                  console.error("[canvas_create_mindmap] Tool error:", error);
                  return {
                    content: [
                      {
                        type: "text",
                        text: `canvas_create_mindmap failed: ${message}`,
                      },
                    ],
                    isError: true as const,
                  };
                }
              },
            ),
          ]
        : []),
    ],
  });
}
