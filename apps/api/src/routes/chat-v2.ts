import { google } from "@ai-sdk/google"
import { xai } from "@ai-sdk/xai"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { LanguageModel } from "ai"
import { streamText, tool } from "ai"
import { z } from "zod"
import { env } from "../env"
import {
	ENHANCED_SYSTEM_PROMPT,
	formatSearchResultsForSystemMessage,
} from "../prompts/chat"
import { agenticSearch } from "../services/agentic-search"
import { condenseUserQuery } from "../services/condense-query"
import { searchDocuments } from "./search"

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
	metadata: z.record(z.string(), z.any()).optional(),
	// Allow client to specify model (e.g., "google/gemini-2.5-flash" or "xai/grok-4-fast")
	model: z.string().optional(),
})

// Tools are defined inline in the streamText configuration below

type ChatRequestPayload = z.infer<typeof chatRequestSchema>

type ChatMode = "simple" | "agentic" | "deep"

export async function handleChatV2({
	orgId,
	client,
	body,
}: {
	orgId: string
	client: SupabaseClient
	body: unknown
}) {
	let payload: ChatRequestPayload
	try {
		payload = chatRequestSchema.parse(body ?? {})
	} catch (error) {
		console.error("Chat V2 payload validation failed", error)
		return new Response("Invalid chat payload", { status: 400 })
	}
	const { messages: inputMessages } = payload
	const metadata = payload.metadata ?? {}

	const resolveMode = (raw: unknown): ChatMode | null => {
		if (raw === "agentic" || raw === "deep" || raw === "simple") {
			return raw
		}
		return null
	}

	const metadataMode = resolveMode(metadata.mode)
	const mode = metadataMode ?? payload.mode

	// Optional project scoping (via metadata.projectId coming from UI)
	const rawProjectId = metadata.projectId
	const activeProjectTag =
		typeof rawProjectId === "string" ? rawProjectId : undefined
	const rawExpandContext = metadata.expandContext
	const expandContext =
		typeof rawExpandContext === "boolean" ? rawExpandContext : false

	// Normalize incoming messages to simple {role, content} format
	const messages = inputMessages
		.map((message) => {
			let text = typeof message.content === "string" ? message.content : ""
			if ((!text || text.trim().length === 0) && Array.isArray(message.parts)) {
				text = message.parts
					.map((part) => part.text ?? "")
					.join(" ")
					.trim()
			}
			return { role: message.role, content: text as string }
		})
		.filter((m) => m.content.length > 0)

	// Get last user message for initial context search
	const lastUserMessage = messages
		.slice()
		.reverse()
		.find((m) => m.role === "user")

	let retrievalQuery = lastUserMessage?.content ?? ""
	let condensed = false
	if (lastUserMessage) {
		let lastUserIndex = -1
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i]?.role === "user") {
				lastUserIndex = i
				break
			}
		}

		if (lastUserIndex > 0) {
			const historyForCondense = messages
				.slice(0, lastUserIndex)
				.filter((m) => m.role === "user" || m.role === "assistant")
				.map((m) => ({ role: m.role, content: m.content }))

			if (historyForCondense.length > 0) {
				try {
					const condensedQuery = await condenseUserQuery(
						historyForCondense,
						lastUserMessage.content,
					)
					if (condensedQuery && condensedQuery.length > 0) {
						retrievalQuery = condensedQuery
						condensed = condensedQuery !== lastUserMessage.content
					}
				} catch (error) {
					console.warn("Chat V2 condensation failed", error)
				}
			}
		}
	}

	let initialContext = ""
	const contextInfo: { count: number; titles: string[] } = {
		count: 0,
		titles: [],
	}

	// Log incoming request mode and query (trim to keep logs tidy)
	try {
		const qPreview =
			typeof lastUserMessage?.content === "string"
				? lastUserMessage.content.slice(0, 160)
				: ""
		console.info("Chat V2 request", {
			mode,
			projectTag: activeProjectTag ?? "ALL",
			queryPreview: qPreview,
			condensed,
			retrievalPreview: retrievalQuery.slice(0, 160),
		})
	} catch {}

	if (lastUserMessage && typeof lastUserMessage.content === "string") {
		const userQuery = lastUserMessage.content
		const enumerative =
			/\b(todos|todas|listar|liste|lista|quais s[ãa]o|quais sao|list\s+all|show\s+all|o que (eu|n[oó]s)?\s*tenho)\b/i.test(
				userQuery,
			) || expandContext

		try {
			const useAgenticPipeline =
				(mode === "agentic" || mode === "deep") && env.ENABLE_AGENTIC_MODE

			if (useAgenticPipeline) {
				const agenticOutcome = await agenticSearch(
					client,
					orgId,
					retrievalQuery || userQuery,
					{
						maxEvals: mode === "deep" ? 4 : 3,
						tokenBudget: mode === "deep" ? 6144 : 4096,
						limit: enumerative ? 30 : mode === "deep" ? 20 : 15,
						containerTags: activeProjectTag ? [activeProjectTag] : undefined,
						enableWebSearch: true,
						webResultsLimit: mode === "deep" ? 12 : 6,
						webQueriesLimit: mode === "deep" ? 3 : 2,
					},
				)

				const sortedResults = agenticOutcome.results
					.slice()
					.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
					.slice(0, enumerative ? 12 : mode === "deep" ? 10 : 5)

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
					})
					contextInfo.count = sortedResults.length
					contextInfo.titles = sortedResults
						.slice(0, 3)
						.map((r) => r.title ?? r.documentId)
				}

				try {
					console.info("Chat V2 agentic", {
						mode,
						queries: agenticOutcome.queries.slice(0, 5),
						canAnswer: agenticOutcome.evaluation?.canAnswer ?? null,
						webResults: agenticOutcome.webResults.length,
					})
				} catch {}
			} else {
				const searchResponse = await searchDocuments(client, orgId, {
					q: retrievalQuery || userQuery,
					limit: enumerative ? 30 : mode === "deep" ? 15 : 10,
					includeSummary: true,
					includeFullDocs: mode === "deep",
					chunkThreshold: 0.1,
					documentThreshold: 0.1,
					onlyMatchingChunks: false,
					containerTags: activeProjectTag ? [activeProjectTag] : undefined,
				})

				const sortedResults = searchResponse.results
					.slice()
					.sort((a, b) => b.score - a.score)
					.slice(0, enumerative ? 12 : mode === "deep" ? 10 : 5)
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
					})
					contextInfo.count = sortedResults.length
					contextInfo.titles = sortedResults
						.slice(0, 3)
						.map((r) => r.title ?? r.documentId)
				}
			}
		} catch (error) {
			console.warn("Initial context build failed", error)
		}
	}

	// Prepare system message
	const systemMessage = initialContext
		? `${ENHANCED_SYSTEM_PROMPT}\n\n${initialContext}`
		: ENHANCED_SYSTEM_PROMPT

	// Log final context summary
	try {
		console.info("Chat V2 context", {
			mode,
			resultsUsed: contextInfo.count,
			topTitles: contextInfo.titles,
		})
	} catch {}

	// Parse model from request (format: "provider/model-name" or just "model-name")
	const requestedModel = payload.model
	let selectedModel: LanguageModel
	let provider: "google" | "xai"
	let modelName: string

	if (requestedModel) {
		// Client specified a model (e.g., "xai/grok-4-fast" or "google/gemini-2.5-flash")
		if (requestedModel.startsWith("xai/")) {
			modelName = requestedModel.replace("xai/", "")
			selectedModel = xai(modelName)
			provider = "xai"
		} else if (requestedModel.startsWith("google/")) {
			modelName = requestedModel.replace("google/", "")
			selectedModel = google(modelName)
			provider = "google"
		} else {
			// Default to google if no provider prefix
			modelName = requestedModel
			selectedModel = google(requestedModel)
			provider = "google"
		}
	} else {
		// Use default provider and model from env
		provider = env.AI_PROVIDER
		if (provider === "xai") {
			modelName = env.CHAT_MODEL
			selectedModel = xai(modelName)
		} else {
			modelName = env.CHAT_MODEL
			selectedModel = google(modelName)
		}
	}

	// Log selected model
	console.info("Chat V2 model", { provider, model: modelName })

	// Configure maxTokens and temperature based on mode
	const modeConfig = {
		simple: { maxTokens: 4096, temperature: 0.7 },
		agentic: { maxTokens: 8192, temperature: 0.6 },
		deep: { maxTokens: 16384, temperature: 0.5 },
	}

	const config = {
		model: selectedModel,
		...modeConfig[mode],
	}

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
								const fallbackQuery = (
									typeof query === "string" && query.trim().length > 0
										? query
										: retrievalQuery || lastUserMessage?.content || ""
								).trim()

								if (!fallbackQuery) {
									return { count: 0, results: [] }
								}

								const response = await searchDocuments(client, orgId, {
									q: fallbackQuery,
									limit,
									includeSummary: true,
									includeFullDocs: false,
									chunkThreshold: 0.1,
									documentThreshold: 0.1,
									containerTags: activeProjectTag
										? [activeProjectTag]
										: undefined,
								})

								const results = response.results.map((r) => {
									const metadata = r.metadata ?? undefined
									const urlValue =
										typeof metadata?.url === "string"
											? (metadata.url as string)
											: typeof metadata?.source_url === "string"
												? (metadata.source_url as string)
												: undefined

									return {
										documentId: r.documentId,
										title: r.title ?? undefined,
										content: undefined,
										url: urlValue,
										score: r.score,
									}
								})

								return { count: response.total, results }
							} catch (err) {
								console.warn("searchMemories tool failed", err)
								return { count: 0, results: [] }
							}
						},
					}),
				}
			: {}

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
			onFinish: ({ usage, finishReason }) => {
				console.info("Chat stream completed", {
					mode,
					provider,
					model: modelName,
					tokensUsed: usage.totalTokens,
					finishReason,
				})
			},
		})

		return result.toUIMessageStreamResponse()
	} catch (error) {
		console.error("Chat V2 failed", error)

		// Fallback to simple mode with configured provider and model
		const fallbackModel = env.AI_PROVIDER === "xai" ? xai(env.CHAT_MODEL) : google(env.CHAT_MODEL)
		const fallback = streamText({
			model: fallbackModel,
			messages,
			system: ENHANCED_SYSTEM_PROMPT,
			maxTokens: 2048,
			temperature: 0.7,
		})

		return fallback.toUIMessageStreamResponse()
	}
}
