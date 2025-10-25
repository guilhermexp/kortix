import { google } from "@ai-sdk/google"
import type { SupabaseClient } from "@supabase/supabase-js"
import { generateObject } from "ai"
import { z } from "zod"
import { env } from "../env"
import { searchDocuments } from "../routes/search"
import { searchWebWithExa } from "./exa-search"

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
})

const evaluationSchema = z.object({
	canAnswer: z.boolean(),
	reasoning: z.string().optional(),
})

export type AgenticSearchOptions = {
	maxEvals?: number // Max iterative cycles (default: 3)
	tokenBudget?: number // Max tokens to spend (default: 4096)
	limit?: number // Results per query (default: 15)
	containerTags?: string[] // Optional project/container scoping
	enableWebSearch?: boolean
	webResultsLimit?: number
	webQueriesLimit?: number
}

type SearchResult = Awaited<
	ReturnType<typeof searchDocuments>
>["results"][number]

type EvaluationResult = z.infer<typeof evaluationSchema>

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
): Promise<{
	results: SearchResult[]
	evaluation: EvaluationResult | null
	queries: string[]
	totalTokens: number
	webResults: SearchResult[]
}> {
	const maxEvals = options.maxEvals ?? 3
	const tokenBudget = options.tokenBudget ?? 4096
	const limit = options.limit ?? 15
	const enableWebSearch = Boolean(options.enableWebSearch)
	const webResultsLimit = Math.max(1, options.webResultsLimit ?? 6)
	const webQueriesLimit = Math.max(1, options.webQueriesLimit ?? 2)

	const allResults = new Map<string, SearchResult>()
	const usedQueries = new Set<string>()
	const executedQueries: string[] = []
	const webResults: SearchResult[] = []
	let totalTokens = 0
	let lastEvaluation: EvaluationResult | null = null

	for (let iteration = 0; iteration < maxEvals; iteration++) {
		if (iteration === 0 && !usedQueries.has(userQuery)) {
			usedQueries.add(userQuery)
		}
		// 1) Generate queries
		const queries = await generateQueries(userQuery, Array.from(usedQueries))
		totalTokens += queries.usage?.totalTokens ?? 0

		if (queries.data.length === 0) break

		// 2) Search in parallel
		const queriesToRun = [
			...(iteration === 0
				? [
						{
							query: userQuery,
							markUsed: false,
						},
					]
				: []),
			...queries.data.map((q) => ({ query: q.query, markUsed: true })),
		]

		const searches = await Promise.all(
			queriesToRun.map(async ({ query, markUsed }) => {
				const trimmedQuery = query.trim()
				if (!trimmedQuery) return null
				if (markUsed) {
					usedQueries.add(trimmedQuery)
				}
				executedQueries.push(trimmedQuery)
				return searchDocuments(client, orgId, {
					q: trimmedQuery,
					limit,
					includeSummary: true,
					includeFullDocs: false,
					chunkThreshold: 0.1,
					documentThreshold: 0.1,
					onlyMatchingChunks: false,
					containerTags: options.containerTags,
				}).catch(() => null)
			}),
		)

		// 3) Merge and deduplicate
		for (const result of searches) {
			if (!result) continue
			for (const doc of result.results) {
				const prev = allResults.get(doc.documentId)
				if (!prev || prev.score < doc.score) {
					allResults.set(doc.documentId, doc)
				}
			}
		}

		// 4) Early-stop guard: if no results after repeated attempts, break
		const currentCount = allResults.size
		if (iteration > 0 && currentCount === 0) {
			break
		}

		// 5) Evaluate completeness
		const evaluation = await evaluateCompleteness(
			userQuery,
			Array.from(allResults.values()),
		)
		totalTokens += evaluation.usage?.totalTokens ?? 0
		lastEvaluation = evaluation.data

		if (evaluation.data.canAnswer || totalTokens >= tokenBudget) {
			break
		}
	}

	// Optional Exa web search enrichment
	if (
		enableWebSearch &&
		(!lastEvaluation?.canAnswer || allResults.size === 0)
	) {
		const queriesForWeb = Array.from(
			new Set([userQuery, ...executedQueries]),
		).slice(0, webQueriesLimit)

		const perQueryLimit = Math.max(
			1,
			Math.floor(webResultsLimit / queriesForWeb.length) || webResultsLimit,
		)

		for (const query of queriesForWeb) {
			const trimmed = query.trim()
			if (!trimmed) continue
			const results = await searchWebWithExa(trimmed, {
				limit: perQueryLimit,
				boostRecency: true,
			})

			for (const item of results) {
				const docId = `web:${item.id}`
				if (allResults.has(docId)) continue
				const webResult = convertExaToSearchResult(item)
				allResults.set(docId, webResult)
				webResults.push(webResult)
			}
		}
	}

	const combinedResults = Array.from(allResults.values()).sort(
		(a, b) => (b.score ?? 0) - (a.score ?? 0),
	)

	return {
		results: combinedResults,
		evaluation: lastEvaluation,
		queries: Array.from(usedQueries),
		totalTokens,
		webResults,
	}
}

function convertExaToSearchResult(
	item: import("./exa-search").ExaWebResult,
): SearchResult {
	const nowIso = new Date().toISOString()
	const chunkContent = item.snippet?.trim()
	return {
		documentId: `web:${item.id}`,
		createdAt: item.publishedAt ?? nowIso,
		updatedAt: item.publishedAt ?? null,
		metadata: {
			source: "web",
			url: item.url ?? undefined,
		},
		title: item.title ?? item.url ?? `Web Result ${item.id}`,
		type: "web",
		score: item.score ?? 0.4,
		summary: chunkContent,
		content: null,
		chunks: chunkContent
			? [
					{
						content: chunkContent,
						isRelevant: true,
						score: item.score ?? 0.4,
					},
				]
			: [],
	}
}

async function generateQueries(
	userQuery: string,
	alreadyUsed: string[],
): Promise<{
	data: Array<{ type: "semantic"; query: string }>
	usage: { totalTokens?: number } | undefined
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
`.trim()

	const result = await generateObject({
		model: google(env.CHAT_MODEL),
		schema: queriesSchema,
		prompt,
		temperature: 0.3,
	})

	return {
		data: result.object.queries,
		usage: { totalTokens: result.usage?.totalTokens },
	}
}

async function evaluateCompleteness(
	userQuery: string,
	results: SearchResult[],
): Promise<{
	data: { canAnswer: boolean; reasoning?: string }
	usage: { totalTokens?: number } | undefined
}> {
	const context = results
		.slice(0, 10)
		.map((r, i) => `[$${i + 1}] ${r.title ?? r.documentId}`)
		.join("\n")

	const prompt = `
Given the user's question and the list of retrieved sources, decide if there is enough information to answer confidently.

Return strict JSON with {"canAnswer": boolean, "reasoning"?: string}

User question: ${userQuery}
Sources:\n${context}
`.trim()

	const result = await generateObject({
		model: google(env.CHAT_MODEL),
		schema: evaluationSchema,
		prompt,
		temperature: 0,
	})

	return {
		data: result.object,
		usage: { totalTokens: result.usage?.totalTokens },
	}
}
