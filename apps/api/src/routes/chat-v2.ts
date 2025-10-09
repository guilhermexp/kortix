import { google } from "@ai-sdk/google";
import type { SupabaseClient } from "@supabase/supabase-js";
import { streamText, tool } from "ai";
import { z } from "zod";
import { env } from "../env";
import { searchDocuments } from "./search";
import {
  ENHANCED_SYSTEM_PROMPT,
  formatSearchResultsForSystemMessage,
} from "../prompts/chat";
import { agenticSearch } from "../services/agentic-search";

const chatRequestSchema = z.object({
  messages: z.array(
    z
      .object({
        id: z.string().optional(),
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().optional(),
        parts: z
          .array(z.object({ type: z.string(), text: z.string().optional() }))
          .optional(),
      })
      .refine(
        (m) =>
          (typeof m.content === "string" && m.content.length > 0) ||
          Array.isArray(m.parts),
        { message: "content or parts is required" },
      ),
  ),
  mode: z.enum(["simple", "agentic", "deep"]).default("simple"),
  metadata: z.record(z.any()).optional(),
});

// Tools are defined inline in the streamText configuration below

export async function handleChatV2({
  orgId,
  client,
  body,
}: {
  orgId: string;
  client: SupabaseClient;
  body: unknown;
}) {
  let payload: z.infer<typeof chatRequestSchema>;
  try {
    payload = chatRequestSchema.parse(body ?? {});
  } catch (error) {
    console.error("Chat V2 payload validation failed", error);
    return new Response("Invalid chat payload", { status: 400 });
  }
  const { messages: inputMessages } = payload;
  let requestedMode: any = (payload as any).mode ?? (payload.metadata as any)?.mode ?? "simple";
  if (requestedMode !== "simple" && requestedMode !== "agentic" && requestedMode !== "deep") {
    requestedMode = "simple";
  }
  const mode = requestedMode as "simple" | "agentic" | "deep";

  // Optional project scoping (via metadata.projectId coming from UI)
  const activeProjectTag =
    payload.metadata && typeof (payload.metadata as any).projectId === "string"
      ? ((payload.metadata as any).projectId as string)
      : undefined;

  // Normalize incoming messages to simple {role, content} format
  const messages = inputMessages
    .map((m) => {
      let text = typeof m.content === "string" ? m.content : "";
      if ((!text || text.trim().length === 0) && Array.isArray((m as any).parts)) {
        const parts = (m as any).parts as Array<{ type: string; text?: string }>;
        text = parts.map((p) => p.text ?? "").join(" ").trim();
      }
      return { role: m.role, content: text } as const;
    })
    .filter((m) => m.content.length > 0);

  // Get last user message for initial context search
  const lastUserMessage = messages
    .slice()
    .reverse()
    .find((m) => m.role === "user");

  let initialContext = "";
  const contextInfo: { count: number; titles: string[] } = {
    count: 0,
    titles: [],
  };

  // Log incoming request mode and query (trim to keep logs tidy)
  try {
    const qPreview =
      typeof lastUserMessage?.content === "string"
        ? lastUserMessage.content.slice(0, 160)
        : "";
    console.info("Chat V2 request", { mode, queryPreview: qPreview });
  } catch {}

  if (lastUserMessage && typeof lastUserMessage.content === "string") {
    const userQuery = lastUserMessage.content;
    const enumerative = /\b(todos|todas|listar|liste|quais s[ãa]o|quais sao|list\s+all|show\s+all)\b/i.test(
      userQuery,
    );

    try {
      if (mode === "agentic" && env.ENABLE_AGENTIC_MODE) {
        const results = await agenticSearch(client, orgId, userQuery, {
          maxEvals: 3,
          tokenBudget: 4096,
          limit: enumerative ? 25 : 15,
          containerTags: activeProjectTag ? [activeProjectTag] : undefined,
        });
        const sortedResults = results
          .slice()
          .sort((a, b) => b.score - a.score)
          .slice(0, enumerative ? 12 : 5);
        if (sortedResults.length > 0) {
          initialContext = formatSearchResultsForSystemMessage(sortedResults, {
            maxResults: enumerative ? Math.min(12, sortedResults.length) : 5,
            includeScore: true,
            includeSummary: true,
            includeChunks: true,
            maxChunkLength: 300,
          });
          contextInfo.count = sortedResults.length;
          contextInfo.titles = sortedResults
            .slice(0, 3)
            .map((r) => r.title ?? r.documentId);
        }
      } else {
        const searchResponse = await searchDocuments(client, orgId, {
          q: userQuery,
          limit: enumerative ? 30 : mode === "deep" ? 15 : 10,
          includeSummary: true,
          includeFullDocs: mode === "deep",
          chunkThreshold: 0.1,
          documentThreshold: 0.1,
          onlyMatchingChunks: false,
          containerTags: activeProjectTag ? [activeProjectTag] : undefined,
        });

        const sortedResults = searchResponse.results
          .slice()
          .sort((a, b) => b.score - a.score)
          .slice(0, enumerative ? 12 : mode === "deep" ? 10 : 5);
        if (sortedResults.length > 0) {
          initialContext = formatSearchResultsForSystemMessage(sortedResults, {
            maxResults: enumerative
              ? Math.min(12, sortedResults.length)
              : mode === "deep"
                ? 10
                : 5,
            includeScore: true,
            includeSummary: true,
            includeChunks: true,
            maxChunkLength: mode === "deep" ? 500 : 300,
          });
          contextInfo.count = sortedResults.length;
          contextInfo.titles = sortedResults
            .slice(0, 3)
            .map((r) => r.title ?? r.documentId);
        }
      }
    } catch (error) {
      console.warn("Initial context build failed", error);
    }
  }

  // Prepare system message
  const systemMessage = initialContext
    ? `${ENHANCED_SYSTEM_PROMPT}\n\n${initialContext}`
    : ENHANCED_SYSTEM_PROMPT;

  // Log final context summary
  try {
    console.info("Chat V2 context", {
      mode,
      resultsUsed: contextInfo.count,
      topTitles: contextInfo.titles,
    });
  } catch {}

  // Configure model based on mode (all using 2.5 flash preview)
  const modelConfig = {
    simple: {
      model: google("models/gemini-2.5-flash-preview-09-2025"),
      maxTokens: 4096,
      temperature: 0.7,
    },
    agentic: {
      model: google("models/gemini-2.5-flash-preview-09-2025"),
      maxTokens: 8192,
      temperature: 0.6,
    },
    deep: {
      model: google("models/gemini-2.5-flash-preview-09-2025"),
      maxTokens: 16384,
      temperature: 0.5,
    },
  };

  const config = modelConfig[mode];

  // Define tools for agentic modes
  const tools =
    mode === "agentic" || mode === "deep"
      ? {
          // Align with UI expectation: tool-searchMemories
          searchMemories: tool({
            description:
              "Search the user's personal knowledge base for relevant information",
            parameters: z.object({
              query: z.string().describe("The search query"),
              limit: z.number().min(1).max(20).default(10),
            }),
            execute: async ({ query, limit }) => {
              try {
                // Fallback to last user message when query is missing/empty
                const fallbackQuery =
                  (typeof query === "string" && query.trim().length > 0
                    ? query
                    : (lastUserMessage?.content ?? "")).trim();

                if (!fallbackQuery) {
                  return { count: 0, results: [] };
                }

                const response = await searchDocuments(client, orgId, {
                  q: fallbackQuery,
                  limit,
                  includeSummary: true,
                  includeFullDocs: false,
                  chunkThreshold: 0.1,
                  documentThreshold: 0.1,
                  containerTags: activeProjectTag ? [activeProjectTag] : undefined,
                });

                const results = response.results.map((r) => ({
                  documentId: r.documentId,
                  title: r.title ?? undefined,
                  content: undefined,
                  url:
                    (r.metadata &&
                      (typeof (r.metadata as any).url === "string"
                        ? (r.metadata as any).url
                        : typeof (r.metadata as any).source_url === "string"
                          ? (r.metadata as any).source_url
                          : undefined)) || undefined,
                  score: r.score,
                }));

                return { count: response.total, results };
              } catch (err) {
                console.warn("searchMemories tool failed", err);
                return { count: 0, results: [] };
              }
            },
          }),
        }
      : {};

  try {
    // Stream the response
    const result = streamText({
      model: config.model,
      messages,
      system: systemMessage,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      tools,
      toolChoice: mode === "agentic" ? "auto" : undefined,
      onFinish: ({ text, usage, finishReason }) => {
        console.info("Chat stream completed", {
          mode,
          model: config.model.modelId,
          tokensUsed: usage.totalTokens,
          finishReason,
        });
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat V2 failed", error);

    // Fallback to simple mode with flash model
    const fallback = streamText({
      model: google("models/gemini-2.5-flash-preview-09-2025"),
      messages,
      system: ENHANCED_SYSTEM_PROMPT,
      maxTokens: 2048,
      temperature: 0.7,
    });

    return fallback.toUIMessageStreamResponse();
  }
}
