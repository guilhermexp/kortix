import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import {
	ENHANCED_SYSTEM_PROMPT,
	formatSearchResultsForSystemMessage,
} from "../prompts/chat"
import { executeClaudeAgent, type AgentMessage } from "../services/claude-agent"
import { searchDocuments } from "./search"

const chatRequestSchema = z.object({
	messages: z
		.array(
			z.object({
				id: z.string().optional(),
				role: z.enum(["user", "assistant", "system"]),
				content: z.any().optional(),
				parts: z
					.array(z.object({ type: z.string(), text: z.string().optional() }))
					.optional(),
			}),
		)
		.optional(),
})

type IncomingMessage = z.infer<typeof chatRequestSchema>[
	"messages"
][number]

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

export async function handleChat({
	orgId,
	client,
	body,
}: {
	orgId: string
	client: SupabaseClient
	body: unknown
}) {
	const payload = chatRequestSchema.parse(body ?? {})
	const inputMessages = payload.messages ?? []

	const { items: agentMessages, extraSystem } = buildAgentMessages(inputMessages)
	const lastUserMessage = [...agentMessages]
		.reverse()
		.find((message) => message.role === "user")

	let contextualPrompt = ENHANCED_SYSTEM_PROMPT
	if (extraSystem) {
		contextualPrompt = `${contextualPrompt}\n\n${extraSystem}`
	}

	if (lastUserMessage) {
		try {
			const searchResponse = await searchDocuments(client, orgId, {
				q: lastUserMessage.content,
				limit: 8,
				includeSummary: true,
				includeFullDocs: false,
				chunkThreshold: 0.1,
				documentThreshold: 0.1,
				onlyMatchingChunks: false,
			})
			if (searchResponse.results.length > 0) {
				const formatted = formatSearchResultsForSystemMessage(
					searchResponse.results,
				)
				contextualPrompt = `${contextualPrompt}\n\n${formatted}`
			}
		} catch (error) {
			console.warn("handleChat search failed", error)
		}
	}

	try {
		const { events, text, parts } = await executeClaudeAgent({
			message: lastUserMessage?.content ?? "",
			client,
			orgId,
			systemPrompt: contextualPrompt,
		})

		return new Response(
			JSON.stringify({
				message: {
					role: "assistant",
					content: text,
					parts,
				},
				events,
			}),
			{
				headers: {
					"Content-Type": "application/json",
				},
			},
		)
	} catch (error) {
		console.error("Chat handler failed", error)
		return new Response(
			JSON.stringify({
				error: "Chat unavailable",
			}),
			{
				status: 500,
				headers: {
					"Content-Type": "application/json",
				},
			},
		)
	}
}

const chatTitleSchema = z.object({
	prompt: z.string().min(1),
})

export function generateChatTitle(body: unknown) {
	const payload = chatTitleSchema.parse(body ?? {})
	const base = payload.prompt.trim().slice(0, 42)
	return `${base || "Conversation"}`
}
