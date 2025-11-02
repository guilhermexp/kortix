import type { SupabaseClient } from "@supabase/supabase-js";
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createHash } from "node:crypto";
import { searchDocuments } from "../routes/search";
import { getCacheService } from "./cache";
import { searchWebWithExa, getContentsWithExa } from "./exa-search";
import { AnalysisService } from "./analysis-service";

type ToolContext = {
  containerTags?: string[];
  scopedDocumentIds?: string[];
};

function safeString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export function createSupermemoryTools(
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

  const cache = getCacheService();
  const CACHE_TTL = 3600; // 1 hour

  // Helper function to generate cache key
  function generateCacheKey(params: Record<string, unknown>): string {
    const normalized = JSON.stringify(params, Object.keys(params).sort());
    const hash = createHash("sha256").update(normalized).digest("hex");
    return `search:${orgId}:${hash}`;
  }

  return createSdkMcpServer({
    name: "supermemory-tools",
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
            const response = await searchDocuments(client, orgId, {
              q: query,
              limit,
              includeSummary,
              includeFullDocs,
              chunkThreshold: 0.0, // Accept all chunks, let ranking decide
              documentThreshold: 0.0, // Accept all documents, let ranking decide
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
              `[searchDatabase] Found ${response.total} results (${duration}ms)`,
            );

            const result = {
              count: response.total,
              results: response.results.map((item) => ({
                documentId: safeString(item.documentId),
                title: safeString(item.title),
                type: safeString(item.type),
                score: item.score ?? undefined,
                url: safeString(
                  item.metadata && typeof item.metadata === "object"
                    ? (item.metadata as Record<string, unknown>).url
                    : undefined,
                ),
                createdAt: safeString(item.createdAt),
                updatedAt: safeString(item.updatedAt),
                summary: safeString(item.summary),
                content:
                  includeFullDocs && typeof item.content === "string"
                    ? item.content
                    : undefined,
                metadata:
                  item.metadata && typeof item.metadata === "object"
                    ? (item.metadata as Record<string, unknown>)
                    : undefined,
                chunks: Array.isArray(item.chunks)
                  ? item.chunks.map((chunk) => ({
                      content: chunk.content,
                      score: chunk.score,
                    }))
                  : undefined,
              })),
            };

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
      tool(
        "searchWeb",
        "Search the internet for current information, research, or topics not in the user's knowledge base. Use this when searchDatabase returns insufficient results or when the user asks about recent events, current information, or topics they haven't saved. Returns web page titles, URLs, and snippets.",
        {
          query: z
            .string()
            .min(1)
            .describe("Search query - be specific and clear"),
          limit: z
            .number()
            .min(1)
            .max(20)
            .default(5)
            .describe("Maximum number of results to return"),
          boostRecency: z
            .boolean()
            .default(false)
            .describe(
              "Prioritize recent results (use for news, current events)",
            ),
          includeDomains: z
            .array(z.string())
            .optional()
            .describe(
              "Optional: limit search to specific domains (e.g., ['github.com', 'stackoverflow.com'])",
            ),
          getFullContent: z
            .boolean()
            .default(false)
            .describe(
              "Fetch full page content in markdown format (slower, use only when needed for detailed analysis)",
            ),
        },
        async ({
          query,
          limit,
          boostRecency,
          includeDomains,
          getFullContent,
        }) => {
          const startTime = Date.now();

          // Generate cache key for web search
          const cacheKey = generateCacheKey({
            type: "web",
            query,
            limit,
            boostRecency,
            includeDomains,
            getFullContent,
          });

          // Try cache first
          const cached = await cache.get<unknown>(cacheKey);
          if (cached) {
            const duration = Date.now() - startTime;
            console.log(
              `[searchWeb] Cache hit for query "${query}" (${duration}ms)`,
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

          console.log(`[searchWeb] Cache miss for query "${query}"`);
          try {
            const results = await searchWebWithExa(query, {
              limit,
              boostRecency,
              includeDomains,
            });

            const duration = Date.now() - startTime;
            console.log(
              `[searchWeb] Found ${results.length} results (${duration}ms)`,
            );

            let enrichedResults = results.map((item) => ({
              title: item.title,
              url: item.url,
              snippet: item.snippet,
              score: item.score,
              publishedAt: item.publishedAt,
              fullContent: undefined as string | null | undefined,
            }));

            // Optionally fetch full content if requested
            if (getFullContent && results.length > 0) {
              const urls = results
                .map((r) => r.url)
                .filter((url): url is string => typeof url === "string");

              if (urls.length > 0) {
                console.log(
                  `[searchWeb] Fetching full content for ${urls.length} URLs`,
                );
                const contents = await getContentsWithExa(urls, {
                  livecrawl: "preferred",
                });

                // Merge full content with results
                enrichedResults = enrichedResults.map((result) => {
                  const contentMatch = contents.find(
                    (c) => c.url === result.url,
                  );
                  return {
                    ...result,
                    fullContent: contentMatch?.text || null,
                  };
                });
              }
            }

            const result = {
              count: enrichedResults.length,
              query,
              results: enrichedResults,
            };

            // Cache for 1 hour
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
            console.error("[searchWeb] Tool error:", error);
            return {
              content: [
                {
                  type: "text",
                  text: `searchWeb failed: ${message}. The web search service may be unavailable or the EXA_API_KEY may not be configured.`,
                },
              ],
              isError: true as const,
            };
          }
        },
      ),
      tool(
        "analyzeVideo",
        "Analyze YouTube videos or web content using Google Gemini with multimodal capabilities. For YouTube videos, this performs deep analysis of both audio (spoken content, topics, arguments) and visual elements (scenes, people, objects, text on screen, actions, clothing colors, etc.) with timestamps. For websites and GitHub repositories, extracts and analyzes content. Use this when you need to understand video content, get detailed transcriptions with visual descriptions, or analyze web pages/repositories that the user mentions.",
        {
          url: z
            .string()
            .url()
            .describe(
              "URL to analyze - YouTube video, website, or GitHub repository",
            ),
          title: z
            .string()
            .optional()
            .describe("Optional title for the content being analyzed"),
          mode: z
            .enum(["auto", "youtube", "web", "repository"])
            .default("auto")
            .describe(
              "Analysis mode: 'auto' detects type automatically, 'youtube' for videos, 'web' for websites, 'repository' for GitHub repos",
            ),
          useExa: z
            .boolean()
            .default(true)
            .describe(
              "Use Exa for enhanced web search and content extraction (recommended)",
            ),
        },
        async ({ url, title, mode, useExa }) => {
          const startTime = Date.now();

          // Generate cache key
          const cacheKey = generateCacheKey({
            type: "analyzeVideo",
            url,
            mode,
            useExa,
          });

          // Try cache first (30 min TTL for video analysis since it's expensive)
          const ANALYSIS_CACHE_TTL = 1800;
          const cached = await cache.get<unknown>(cacheKey);
          if (cached) {
            const duration = Date.now() - startTime;
            console.log(
              `[analyzeVideo] Cache hit for "${url}" (${duration}ms)`,
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

          console.log(`[analyzeVideo] Cache miss for "${url}"`);
          console.log(`[analyzeVideo] Starting ${mode} analysis`);

          try {
            const service = new AnalysisService("gemini-2.5-flash", useExa);

            let result;
            if (mode === "auto") {
              result = await service.analyzeAuto(url, title, undefined, {
                useExa,
              });
            } else if (mode === "youtube") {
              result = await service.analyzeYouTubeUrl(url, title);
            } else if (mode === "web") {
              result = await service.analyzeWebUrl(url, { useExa });
            } else if (mode === "repository") {
              result = await service.analyzeGithubRepository(url, undefined, {
                useExa,
              });
            } else {
              throw new Error(`Invalid mode: ${mode}`);
            }

            const duration = Date.now() - startTime;
            console.log(
              `[analyzeVideo] Analysis completed in ${duration}ms (mode: ${result.mode})`,
            );

            const response = {
              url,
              mode: result.mode,
              title: result.title || title || "Untitled",
              summary: result.summary,
              previewMetadata: result.previewMetadata || {},
              analyzedAt: new Date().toISOString(),
            };

            // Cache for 30 minutes
            await cache.set(cacheKey, response, { ttl: ANALYSIS_CACHE_TTL });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown error";
            console.error("[analyzeVideo] Analysis error:", error);
            return {
              content: [
                {
                  type: "text",
                  text: `analyzeVideo failed: ${message}. Make sure GOOGLE_API_KEY is configured for Gemini analysis. For YouTube videos, the URL must be valid. For repositories, check the URL format.`,
                },
              ],
              isError: true as const,
            };
          }
        },
      ),
    ],
  });
}
