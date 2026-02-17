import { mkdir, writeFile } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { env } from "../env"
import { openRouterChat } from "./openrouter"

export type CouncilStage1Result = {
	model: string
	response: string
}

export type CouncilStage2Result = {
	model: string
	ranking: string
	parsed_ranking: string[]
}

export type CouncilStage3Result = {
	model: string
	response: string
}

export type CouncilAssistantMessage = {
	role: "assistant"
	stage1: CouncilStage1Result[]
	stage2: CouncilStage2Result[]
	stage3: CouncilStage3Result
	metadata: {
		label_to_model: Record<string, string>
		aggregate_rankings: Array<{
			model: string
			average_rank: number
			rankings_count: number
		}>
	}
	created_at: string
}

export type CouncilUserMessage = {
	role: "user"
	content: string
	created_at: string
}

export type CouncilMessage = CouncilUserMessage | CouncilAssistantMessage

export type CouncilConversation = {
	id: string
	created_at: string
	title: string
	messages: CouncilMessage[]
	owner_org_id: string
	owner_user_id: string
}

const DEFAULT_COUNCIL_MODELS = [
	"openai/gpt-5.1",
	"google/gemini-3-pro-preview",
	"anthropic/claude-sonnet-4.5",
	"x-ai/grok-4",
]

const DEFAULT_CHAIRMAN_MODEL = "google/gemini-3-pro-preview"
const TITLE_MODEL = "google/gemini-2.5-flash"

const councilModels = (
	env.COUNCIL_MODELS
		?.split(",")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0) ?? DEFAULT_COUNCIL_MODELS
).slice(0, 8)

const chairmanModel = env.COUNCIL_CHAIRMAN_MODEL || DEFAULT_CHAIRMAN_MODEL

const DATA_DIR = resolve(process.cwd(), "data", "council")
const DATA_FILE = resolve(DATA_DIR, "conversations.json")

const MAX_CONVERSATIONS = 500
const CONVERSATION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const conversations = new Map<string, CouncilConversation>()
const activeRuns = new Map<string, AbortController>()
let persistTimer: ReturnType<typeof setTimeout> | null = null

function nowIso(): string {
	return new Date().toISOString()
}

function createConversationRecord(orgId: string, userId: string): CouncilConversation {
	return {
		id: crypto.randomUUID(),
		created_at: nowIso(),
		title: "Greeting",
		messages: [],
		owner_org_id: orgId,
		owner_user_id: userId,
	}
}

function hydrateFromDisk() {
	try {
		if (!existsSync(DATA_FILE)) return
		const raw = readFileSync(DATA_FILE, "utf-8")
		const parsed = JSON.parse(raw) as { conversations?: CouncilConversation[] }
		const list = Array.isArray(parsed.conversations) ? parsed.conversations : []
		for (const conversation of list) {
			if (!conversation?.id) continue
			conversations.set(conversation.id, conversation)
		}
	} catch (error) {
		console.warn("[council] Failed to hydrate conversations", error)
	}
}

function stripMetadataForStorage(conversation: CouncilConversation): CouncilConversation {
	return {
		...conversation,
		messages: conversation.messages.map((msg) => {
			if (msg.role === "assistant") {
				const { metadata: _metadata, ...rest } = msg
				return { ...rest, metadata: null }
			}
			return msg
		}),
	}
}

function evictStaleConversations() {
	if (conversations.size <= MAX_CONVERSATIONS) return
	const now = Date.now()
	const entries = Array.from(conversations.entries())
		.map(([id, conv]) => {
			const lastMsg = conv.messages[conv.messages.length - 1]
			const ts = lastMsg?.created_at ?? conv.created_at
			return { id, ts: new Date(ts).getTime() }
		})
		.sort((a, b) => a.ts - b.ts)

	for (const entry of entries) {
		if (conversations.size <= MAX_CONVERSATIONS) break
		if (now - entry.ts > CONVERSATION_TTL_MS) {
			conversations.delete(entry.id)
		}
	}
	// If still over limit, remove oldest
	for (const entry of entries) {
		if (conversations.size <= MAX_CONVERSATIONS) break
		conversations.delete(entry.id)
	}
}

async function persistNow() {
	try {
		await mkdir(DATA_DIR, { recursive: true })
		const payload = {
			conversations: Array.from(conversations.values()).map(stripMetadataForStorage),
		}
		await writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8")
	} catch (error) {
		console.warn("[council] Failed to persist conversations", error)
	}
}

function schedulePersist() {
	if (persistTimer) clearTimeout(persistTimer)
	persistTimer = setTimeout(async () => {
		persistTimer = null
		await persistNow()
	}, 120)
}

function assertNotAborted(signal?: AbortSignal) {
	if (!signal) return
	if (signal.aborted) {
		throw new Error("Council run cancelled")
	}
}

function parseRankingFromText(rankingText: string): string[] {
	if (rankingText.includes("FINAL RANKING:")) {
		const parts = rankingText.split("FINAL RANKING:")
		if (parts.length >= 2) {
			const rankingSection = parts[1] || ""
			const numberedMatches = rankingSection.match(/\d+\.\s*Response [A-Z]/g)
			if (numberedMatches && numberedMatches.length > 0) {
				return numberedMatches
					.map((line) => line.match(/Response [A-Z]/)?.[0])
					.filter((item): item is string => Boolean(item))
			}
			const fallbackMatches = rankingSection.match(/Response [A-Z]/g)
			if (fallbackMatches) {
				return fallbackMatches
			}
		}
	}
	return rankingText.match(/Response [A-Z]/g) ?? []
}

function calculateAggregateRankings(
	stage2Results: CouncilStage2Result[],
	labelToModel: Record<string, string>,
): Array<{
	model: string
	average_rank: number
	rankings_count: number
}> {
	const positions = new Map<string, number[]>()

	for (const ranking of stage2Results) {
		for (const [index, label] of ranking.parsed_ranking.entries()) {
			const modelName = labelToModel[label]
			if (!modelName) continue
			const existing = positions.get(modelName) ?? []
			existing.push(index + 1)
			positions.set(modelName, existing)
		}
	}

	return Array.from(positions.entries())
		.map(([model, values]) => {
			const avg = values.reduce((sum, item) => sum + item, 0) / values.length
			return {
				model,
				average_rank: Number(avg.toFixed(2)),
				rankings_count: values.length,
			}
		})
		.sort((a, b) => a.average_rank - b.average_rank)
}

async function queryCouncilModel(
	model: string,
	prompt: string,
	signal?: AbortSignal,
): Promise<string | null> {
	assertNotAborted(signal)
	const response = await openRouterChat(
		[{ role: "user", content: prompt }],
		{
			model,
			temperature: 0.2,
			maxTokens: 4_096,
			timeoutMs: 120_000,
			reasoningEffort: "low",
			signal,
		},
	)
	assertNotAborted(signal)
	return response
}

export async function runCouncilStage1(
	userQuery: string,
	signal?: AbortSignal,
): Promise<CouncilStage1Result[]> {
	assertNotAborted(signal)
	const settled = await Promise.allSettled(
		councilModels.map(async (model) => {
			const response = await queryCouncilModel(model, userQuery, signal)
			if (!response) return null
			return { model, response }
		}),
	)
	assertNotAborted(signal)

	return settled
		.map((entry) => (entry.status === "fulfilled" ? entry.value : null))
		.filter((entry): entry is CouncilStage1Result => Boolean(entry))
}

export async function runCouncilStage2(
	userQuery: string,
	stage1Results: CouncilStage1Result[],
	signal?: AbortSignal,
): Promise<{
	stage2Results: CouncilStage2Result[]
	labelToModel: Record<string, string>
	aggregateRankings: Array<{
		model: string
		average_rank: number
		rankings_count: number
	}>
}> {
	assertNotAborted(signal)
	const labels = stage1Results.map((_, index) => String.fromCharCode(65 + index))
	const labelToModel: Record<string, string> = {}

	for (const [index, result] of stage1Results.entries()) {
		labelToModel[`Response ${labels[index]}`] = result.model
	}

	const responsesText = stage1Results
		.map((result, index) => `Response ${labels[index]}:\n${result.response}`)
		.join("\n\n")

	const rankingPrompt = `You are evaluating different responses to the following question:\n\nQuestion: ${userQuery}\n\nHere are the responses from different models (anonymized):\n\n${responsesText}\n\nYour task:\n1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.\n2. Then, at the very end of your response, provide a final ranking.\n\nIMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:\n- Start with the line "FINAL RANKING:" (all caps, with colon)\n- Then list the responses from best to worst as a numbered list\n- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")\n- Do not add any other text or explanations in the ranking section\n\nNow provide your evaluation and ranking:`

	const settled = await Promise.allSettled(
		councilModels.map(async (model) => {
			const ranking = await queryCouncilModel(model, rankingPrompt, signal)
			if (!ranking) return null
			return {
				model,
				ranking,
				parsed_ranking: parseRankingFromText(ranking),
			}
		}),
	)
	assertNotAborted(signal)

	const stage2Results = settled
		.map((entry) => (entry.status === "fulfilled" ? entry.value : null))
		.filter((entry): entry is CouncilStage2Result => Boolean(entry))

	return {
		stage2Results,
		labelToModel,
		aggregateRankings: calculateAggregateRankings(stage2Results, labelToModel),
	}
}

export async function runCouncilStage3(
	userQuery: string,
	stage1Results: CouncilStage1Result[],
	stage2Results: CouncilStage2Result[],
	signal?: AbortSignal,
): Promise<CouncilStage3Result> {
	assertNotAborted(signal)
	const stage1Text = stage1Results
		.map((result) => `Model: ${result.model}\nResponse: ${result.response}`)
		.join("\n\n")

	const stage2Text = stage2Results
		.map((result) => `Model: ${result.model}\nRanking: ${result.ranking}`)
		.join("\n\n")

	const chairmanPrompt = `You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.\n\nOriginal Question: ${userQuery}\n\nSTAGE 1 - Individual Responses:\n${stage1Text}\n\nSTAGE 2 - Peer Rankings:\n${stage2Text}\n\nYour task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:\n- The individual responses and their insights\n- The peer rankings and what they reveal about response quality\n- Any patterns of agreement or disagreement\n\nProvide a clear, well-reasoned final answer that represents the council's collective wisdom:`

	const response = await queryCouncilModel(chairmanModel, chairmanPrompt, signal)
	assertNotAborted(signal)
	return {
		model: chairmanModel,
		response: response ?? "Error: Unable to generate final synthesis.",
	}
}

export async function generateCouncilConversationTitle(
	query: string,
	signal?: AbortSignal,
): Promise<string> {
	const prompt = `Generate a very short title (3-5 words maximum) that summarizes the following question.\nThe title should be concise and descriptive. Do not use quotes or punctuation in the title.\n\nQuestion: ${query}\n\nTitle:`
	const response = await queryCouncilModel(TITLE_MODEL, prompt, signal)
	if (!response) {
		return "New Conversation"
	}
	const sanitized = response.trim().replace(/^['"]+|['"]+$/g, "")
	return sanitized.length > 50 ? `${sanitized.slice(0, 47)}...` : sanitized
}

export async function runCouncilQuery(
	query: string,
	signal?: AbortSignal,
): Promise<{
	stage1: CouncilStage1Result[]
	stage2: CouncilStage2Result[]
	stage3: CouncilStage3Result
	metadata: {
		label_to_model: Record<string, string>
		aggregate_rankings: Array<{
			model: string
			average_rank: number
			rankings_count: number
		}>
	}
}> {
	const stage1 = await runCouncilStage1(query, signal)
	const { stage2Results, labelToModel, aggregateRankings } = await runCouncilStage2(
		query,
		stage1,
		signal,
	)
	const stage3 = await runCouncilStage3(query, stage1, stage2Results, signal)

	return {
		stage1,
		stage2: stage2Results,
		stage3,
		metadata: {
			label_to_model: labelToModel,
			aggregate_rankings: aggregateRankings,
		},
	}
}

export function beginCouncilRun(conversationId: string): AbortSignal {
	cancelCouncilRun(conversationId)
	const controller = new AbortController()
	activeRuns.set(conversationId, controller)
	return controller.signal
}

export function endCouncilRun(conversationId: string) {
	activeRuns.delete(conversationId)
}

export function cancelCouncilRun(conversationId: string): boolean {
	const controller = activeRuns.get(conversationId)
	if (!controller) return false
	controller.abort("cancelled")
	activeRuns.delete(conversationId)
	return true
}

export function createCouncilConversation(orgId: string, userId: string): CouncilConversation {
	evictStaleConversations()
	const conversation = createConversationRecord(orgId, userId)
	conversations.set(conversation.id, conversation)
	schedulePersist()
	return structuredClone(conversation)
}

export function listCouncilConversations(orgId: string, userId: string): Array<{
	id: string
	created_at: string
	title: string
	message_count: number
	updated_at: string
}> {
	return Array.from(conversations.values())
		.filter((c) => c.owner_org_id === orgId && c.owner_user_id === userId)
		.map((conversation) => {
			const lastMessage = conversation.messages[conversation.messages.length - 1]
			return {
				id: conversation.id,
				created_at: conversation.created_at,
				title: conversation.title,
				message_count: conversation.messages.length,
				updated_at: lastMessage?.created_at ?? conversation.created_at,
			}
		})
		.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
}

export function getCouncilConversation(
	conversationId: string,
	orgId?: string,
	userId?: string,
): CouncilConversation | null {
	const record = conversations.get(conversationId)
	if (!record) return null
	if (orgId && record.owner_org_id !== orgId) return null
	if (userId && record.owner_user_id !== userId) return null
	return structuredClone(record)
}

export function addCouncilUserMessage(
	conversationId: string,
	content: string,
): CouncilConversation | null {
	const record = conversations.get(conversationId)
	if (!record) return null
	record.messages.push({ role: "user", content, created_at: nowIso() })
	schedulePersist()
	return structuredClone(record)
}

export function addCouncilAssistantMessage(
	conversationId: string,
	message: Omit<CouncilAssistantMessage, "role" | "created_at">,
): CouncilConversation | null {
	const record = conversations.get(conversationId)
	if (!record) return null
	record.messages.push({ ...message, role: "assistant", created_at: nowIso() })
	schedulePersist()
	return structuredClone(record)
}

export function updateCouncilConversationTitle(
	conversationId: string,
	title: string,
): CouncilConversation | null {
	const record = conversations.get(conversationId)
	if (!record) return null
	record.title = title || record.title
	schedulePersist()
	return structuredClone(record)
}

export async function getAvailableOpenRouterModels(): Promise<
	Array<{
		id: string
		name: string
		description: string
		context_length?: number
		pricing: Record<string, unknown>
	}>
> {
	const apiKey = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
	if (!apiKey) return []

	const response = await fetch("https://openrouter.ai/api/v1/models", {
		method: "GET",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		signal: AbortSignal.timeout(30_000),
	})

	if (!response.ok) {
		throw new Error(`OpenRouter models failed with status ${response.status}`)
	}

	const payload = (await response.json()) as {
		data?: Array<Record<string, unknown>>
	}

	return (payload.data ?? [])
		.map((item) => {
			const id = typeof item.id === "string" ? item.id : ""
			if (!id) return null
			return {
				id,
				name: typeof item.name === "string" ? item.name : id,
				description:
					typeof item.description === "string" ? item.description : "",
				context_length:
					typeof item.context_length === "number"
						? item.context_length
						: undefined,
				pricing:
					typeof item.pricing === "object" && item.pricing !== null
						? (item.pricing as Record<string, unknown>)
						: {},
			}
		})
		.filter((item): item is NonNullable<typeof item> => Boolean(item))
}

export async function queryCouncilSingleModel(
	model: string,
	query: string,
): Promise<{ model: string; response: string }> {
	const response = await queryCouncilModel(model, query)
	return {
		model,
		response: response ?? `Error: Unable to get response from ${model}`,
	}
}

hydrateFromDisk()

function handleProcessExit() {
	if (persistTimer) {
		clearTimeout(persistTimer)
		persistTimer = null
	}
	try {
		const fs = require("node:fs") as typeof import("node:fs")
		fs.mkdirSync(DATA_DIR, { recursive: true })
		const payload = {
			conversations: Array.from(conversations.values()).map(stripMetadataForStorage),
		}
		fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8")
	} catch {
		// Best-effort on exit
	}
}

process.on("SIGTERM", handleProcessExit)
process.on("SIGINT", handleProcessExit)
