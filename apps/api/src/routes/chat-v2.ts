import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { env } from "../env"
import { ENHANCED_SYSTEM_PROMPT } from "../prompts/chat"
import { executeClaudeDirect, type AgentMessage } from "../services/claude-direct"

const chatRequestSchema = z.object({
	messages: z.array(
		z.object({
			id: z.string().optional(),
			role: z.enum(["user", "assistant", "system"]),
			content: z.any().optional(),
			parts: z
				.array(z.object({ type: z.string(), text: z.string().optional() }))
				.optional(),
		}),
	),
	mode: z.enum(["simple", "agentic", "deep"]).default("simple"),
	metadata: z.record(z.string(), z.any()).optional(),
	model: z.string().optional(),
	scopedDocumentIds: z.array(z.string()).optional(),
})

type IncomingMessage = z.infer<typeof chatRequestSchema>["messages"][number]

type ChatMode = z.infer<typeof chatRequestSchema>["mode"]

type MetadataPayload = {
	projectId?: string
	expandContext?: boolean
	forceRawDocs?: boolean
	preferredTone?: string
}

type LegacyContentPart = { text?: string }

function isLegacyContent(value: unknown): value is LegacyContentPart[] {
	return (
		Array.isArray(value) &&
		value.every((part) =>
			part !== null &&
			typeof part === "object" &&
			("text" in part
				? typeof part.text === "string" || typeof part.text === "undefined"
				: true),
		)
	)
}

function extractText(message: IncomingMessage): string {
	if (typeof message.content === "string") {
		return message.content
	}
	if (Array.isArray(message.parts)) {
		return message.parts
			.map((part) => (typeof part.text === "string" ? part.text : ""))
			.join(" ")
	}
	if (isLegacyContent(message.content)) {
		return message.content
			.map((part) => (typeof part.text === "string" ? part.text : ""))
			.join(" ")
	}
	return ""
}

function buildAgentMessages(messages: IncomingMessage[]): {
	items: AgentMessage[]
	extraSystem: string
} {
	const normalized: AgentMessage[] = []
	const systemParts: string[] = []

	for (const message of messages) {
		const text = extractText(message).trim()
		if (!text) continue

		if (message.role === "system") {
			systemParts.push(text)
			continue
		}

		const role = message.role === "assistant" ? "assistant" : "user"
		normalized.push({ role, content: text })
	}

	return {
		items: normalized,
		extraSystem: systemParts.join("\n\n"),
	}
}

function buildModeInstruction(mode: ChatMode): string {
	switch (mode) {
		case "agentic":
			return "Mode: agentic. Prioritize using the searchDatabase tool to gather supporting evidence before responding. Explain reasoning and cite retrieved documents when applicable."
		case "deep":
			return "Mode: deep. Perform comprehensive multi-step reasoning. Use searchDatabase repeatedly if needed, compare sources, and deliver structured, in-depth answers."
		default:
			return "Mode: simple. Provide concise answers while using the searchDatabase tool when helpful."
	}
}

function normalizeModel(requested: string | undefined, fallback: string): string {
	if (!requested) return fallback
	const trimmed = requested.trim()
	if (!trimmed) return fallback
	if (trimmed.startsWith("claude")) {
		return trimmed
	}
	return fallback
}

export async function handleChatV2({
	orgId,
	client,
	body,
}: {
	orgId: string
	client: SupabaseClient
	body: unknown
}) {
	let payload: z.infer<typeof chatRequestSchema>
	try {
		payload = chatRequestSchema.parse(body ?? {})
	} catch (error) {
		console.error("Chat V2 validation failed", error)
		return new Response("Invalid chat payload", { status: 400 })
	}

	const { items: agentMessages, extraSystem } = buildAgentMessages(
		payload.messages,
	)

	const metadata = (payload.metadata ?? {}) as MetadataPayload
	const projectId =
		typeof metadata.projectId === "string" && metadata.projectId.trim().length > 0
			? metadata.projectId.trim()
			: undefined
	const expandContext = Boolean(metadata.expandContext)
	const preferredTone =
		typeof metadata.preferredTone === "string"
			? metadata.preferredTone.trim()
			: undefined

	const scopedDocumentIds = Array.isArray(payload.scopedDocumentIds)
		? payload.scopedDocumentIds.filter((id) => typeof id === "string" && id.length > 0)
		: undefined

	const lastUserMessage = [...agentMessages]
		.reverse()
		.find((message) => message.role === "user")

	const instructions: string[] = [buildModeInstruction(payload.mode)]
	if (projectId) {
		instructions.push(
			`Active project tag: ${projectId}. Limit searches to this project unless the user explicitly requests otherwise.`,
		)
	}
	if (expandContext) {
		instructions.push(
			"Expand the context by summarizing key references and suggesting follow-up actions when relevant.",
		)
	}
	if (preferredTone) {
		instructions.push(`Adopt a ${preferredTone} tone in the reply.`)
	}

	let systemPrompt = ENHANCED_SYSTEM_PROMPT
	if (extraSystem) {
		systemPrompt = `${systemPrompt}\n\n${extraSystem}`
	}
	if (instructions.length > 0) {
		systemPrompt = `${systemPrompt}\n\n${instructions.join("\n")}`
	}
	if (lastUserMessage) {
		systemPrompt = `${systemPrompt}\n\nRecent user query: ${lastUserMessage.content.slice(
			0,
			200,
		)}...`
	}

	const resolvedModel = normalizeModel(payload.model, env.CHAT_MODEL)

	const toolContext = {
		containerTags:
			projectId && projectId !== "__ALL__" ? [projectId] : undefined,
		scopedDocumentIds,
	}

	const maxTurns = payload.mode === "deep" ? 12 : payload.mode === "agentic" ? 10 : 6

	try {
		const { text, toolCalls } = await executeClaudeDirect({
			messages: agentMessages,
			client,
			orgId,
			systemPrompt,
			model: resolvedModel,
			context: toolContext,
			maxTurns,
		})

		return new Response(
			JSON.stringify({
				message: { role: "assistant", content: text },
				toolCalls,
			}),
			{
				headers: {
					"Content-Type": "application/json",
				},
			},
		)
	} catch (error) {
		console.error("Chat V2 execution failed", error)
		return new Response(
			JSON.stringify({ error: "Chat unavailable" }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		)
	}
}
