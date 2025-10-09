import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchDocuments } from "../routes/search";

const queriesSchema = z.object({
  queries: z
    .array(
      z.object({
        type: z.enum(["semantic"]).default("semantic"),
        query: z.string().min(1),
      }),
    )
    .min(1)
    .max(5),
});

const evaluationSchema = z.object({
  canAnswer: z.boolean(),
  reasoning: z.string().optional(),
});

export type AgenticSearchOptions = {
  maxEvals?: number; // Max iterative cycles (default: 3)
  tokenBudget?: number; // Max tokens to spend (default: 4096)
  limit?: number; // Results per query (default: 15)
  containerTags?: string[]; // Optional project/container scoping
};

type SearchResult = Awaited<
  ReturnType<typeof searchDocuments>
>["results"][number];

/**
 * Agentic search pipeline:
 * 1. Generate initial queries
 * 2. Search in parallel
 * 3. Evaluate if can answer
 * 4. If not, generate new queries and repeat
 * 5. Return deduplicated results
 */
export async function agenticSearch(
  client: SupabaseClient,
  orgId: string,
  userQuery: string,
  options: AgenticSearchOptions = {},
): Promise<SearchResult[]> {
  const maxEvals = options.maxEvals ?? 3;
  const tokenBudget = options.tokenBudget ?? 4096;
  const limit = options.limit ?? 15;

  const allResults = new Map<string, SearchResult>();
  const usedQueries = new Set<string>();
  let totalTokens = 0;
  let prevResultCount = 0;

  for (let iteration = 0; iteration < maxEvals; iteration++) {
    // 1) Generate queries
    const queries = await generateQueries(userQuery, Array.from(usedQueries));
    totalTokens += queries.usage?.totalTokens ?? 0;

    if (queries.data.length === 0) break;

    // 2) Search in parallel
    const searches = await Promise.all(
      queries.data.map(async (q) => {
        usedQueries.add(q.query);
        return searchDocuments(client, orgId, {
          q: q.query,
          limit,
          includeSummary: true,
          includeFullDocs: false,
          chunkThreshold: 0.1,
          documentThreshold: 0.1,
          onlyMatchingChunks: false,
          containerTags: options.containerTags,
        }).catch(() => null);
      }),
    );

    // 3) Merge and deduplicate
    for (const result of searches) {
      if (!result) continue;
      for (const doc of result.results) {
        const prev = allResults.get(doc.documentId);
        if (!prev || prev.score < doc.score) {
          allResults.set(doc.documentId, doc);
        }
      }
    }

    // 4) Early-stop guard: if no results after repeated attempts, break
    const currentCount = allResults.size;
    if (iteration > 0 && currentCount === 0) {
      break;
    }
    prevResultCount = currentCount;

    // 5) Evaluate completeness
    const evaluation = await evaluateCompleteness(
      userQuery,
      Array.from(allResults.values()),
    );
    totalTokens += evaluation.usage?.totalTokens ?? 0;

    if (evaluation.data.canAnswer || totalTokens >= tokenBudget) {
      break;
    }
  }

  return Array.from(allResults.values());
}

async function generateQueries(
  userQuery: string,
  alreadyUsed: string[],
): Promise<{
  data: Array<{ type: "semantic"; query: string }>;
  usage: { totalTokens?: number } | undefined;
}> {
  const prompt = `
You will propose 2-3 semantic search queries to find relevant information in the user's knowledge base.

Rules:
- Queries must be specific and focused
- Avoid queries already tried: ${
    alreadyUsed.length > 0 ? alreadyUsed.join(", ") : "none"
  }
- Use natural language (no boolean operators)
- Return JSON strictly matching the schema

User question: ${userQuery}
`.trim();

  const result = await generateObject({
    model: google("models/gemini-2.5-flash-preview-09-2025"),
    schema: queriesSchema,
    prompt,
    temperature: 0.3,
  });

  return { data: result.object.queries, usage: { totalTokens: result.usage?.totalTokens } };
}

async function evaluateCompleteness(
  userQuery: string,
  results: SearchResult[],
): Promise<{
  data: { canAnswer: boolean; reasoning?: string };
  usage: { totalTokens?: number } | undefined;
}> {
  const context = results
    .slice(0, 10)
    .map((r, i) => `[$${i + 1}] ${r.title ?? r.documentId}`)
    .join("\n");

  const prompt = `
Given the user's question and the list of retrieved sources, decide if there is enough information to answer confidently.

Return strict JSON with {"canAnswer": boolean, "reasoning"?: string}

User question: ${userQuery}
Sources:\n${context}
`.trim();

  const result = await generateObject({
    model: google("models/gemini-2.5-flash-preview-09-2025"),
    schema: evaluationSchema,
    prompt,
    temperature: 0,
  });

  return {
    data: result.object,
    usage: { totalTokens: result.usage?.totalTokens },
  };
}
