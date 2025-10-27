import { google } from "@ai-sdk/google"
import { xai } from "@ai-sdk/xai"
import type { SupabaseClient } from "@supabase/supabase-js"
import { streamText } from "ai"
import { z } from "zod"
import { env } from "../env"
import {
	ENHANCED_SYSTEM_PROMPT,
	formatSearchResultsForSystemMessage,
} from "../prompts/chat"
import { searchDocuments } from "./search"

// Using AI SDK Google provider; API key is read from env by the provider

const chatRequestSchema = z.object({
	messages: z
		.array(
			z.object({
				id: z.string().optional(),
				role: z.string(),
				content: z.any().optional(),
				parts: z
					.array(z.object({ type: z.string(), text: z.string().optional() }))
					.optional(),
			}),
		)
		.optional(),
	metadata: z.record(z.string(), z.any()).optional(),
})

type LegacyContentPart = { text?: string }

function isLegacyContentParts(value: unknown): value is LegacyContentPart[] {
	return (
		Array.isArray(value) &&
		value.every(
			(part) =>
				part !== null &&
				typeof part === "object" &&
				("text" in part
					? typeof (part as LegacyContentPart).text === "string" ||
						typeof (part as LegacyContentPart).text === "undefined"
					: true),
		)
	)
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

	// Convert to AI SDK format
	const messages = inputMessages
		.map((msg) => {
			let content = ""
			if (typeof msg.content === "string") {
				content = msg.content
			} else if (Array.isArray(msg.parts)) {
				content = msg.parts.map((part) => part.text ?? "").join(" ")
			} else if (isLegacyContentParts(msg.content)) {
				content = msg.content
					.map((part) => (typeof part.text === "string" ? part.text : ""))
					.join(" ")
			}

			return {
				role:
					msg.role === "assistant"
						? "assistant"
						: msg.role === "system"
							? "system"
							: "user",
				content: content.trim(),
			}
		})
		.filter((msg) => msg.content.length > 0)

	// Get last user message for context search
	const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")
	let systemMessage = ""

	if (lastUserMessage) {
		try {
			const searchResponse = await searchDocuments(client, orgId, {
				q: lastUserMessage.content,
				limit: 10,
				includeSummary: true,
				includeFullDocs: false,
				chunkThreshold: 0.1,
				documentThreshold: 0.1,
				onlyMatchingChunks: false,
			})

			if (searchResponse.results.length > 0) {
				systemMessage = formatSearchResultsForSystemMessage(
					searchResponse.results,
				)
				try {
					const titles = searchResponse.results
						.slice(0, 3)
						.map((r) => r.title ?? r.documentId)
					console.info("Chat v1 context", {
						resultsUsed: Math.min(5, searchResponse.results.length),
						topTitles: titles,
					})
				} catch {}
			}
		} catch (error) {
			console.warn("handleChat search fallback", error)
		}
	}

	const systemPrompt = systemMessage
		? `${ENHANCED_SYSTEM_PROMPT}\n\n${systemMessage}`
		: ENHANCED_SYSTEM_PROMPT

	// Use AI SDK streamText with configured provider and model
	const selectedModel =
		env.AI_PROVIDER === "xai" ? xai(env.CHAT_MODEL) : google(env.CHAT_MODEL)

	try {
		const result = streamText({
			model: selectedModel,
			system: systemPrompt,
			messages: messages.map((m) => ({ role: m.role, content: m.content })),
			maxTokens: 8192,
			temperature: 0.7,
			onFinish: ({ usage, finishReason }) => {
				console.info("Chat v1 stream completed", {
					tokensUsed: usage.totalTokens,
					finishReason,
					provider: env.AI_PROVIDER,
					model: env.CHAT_MODEL,
				})
			},
		})
		return result.toUIMessageStreamResponse()
	} catch (error) {
		console.error("Chat v1 failed", error)
		const err =
			error instanceof Error && error.message
				? error.message
				: "Modelo de chat indisponível no momento"
		const fallback = streamText({
			model: selectedModel,
			system: ENHANCED_SYSTEM_PROMPT,
			messages: messages.map((m) => ({ role: m.role, content: m.content })),
			maxTokens: 1024,
			temperature: 0.7,
		})
		return fallback.toUIMessageStreamResponse()
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

type ChunkWithTextHelper = { text: () => string | undefined }

type CandidatePart = { text?: string }
type CandidateContent = { parts?: CandidatePart[] }
type ChunkCandidate = { content?: CandidateContent }

function hasTextHelper(value: unknown): value is ChunkWithTextHelper {
	return (
		value !== null &&
		typeof value === "object" &&
		typeof (value as ChunkWithTextHelper).text === "function"
	)
}

function isChunkCandidates(value: unknown): value is ChunkCandidate[] {
	return (
		Array.isArray(value) &&
		value.every(
			(candidate) =>
				candidate !== null &&
				typeof candidate === "object" &&
				(candidate.content === undefined ||
					candidate.content === null ||
					(typeof candidate.content === "object" &&
						(candidate.content.parts === undefined ||
							candidate.content.parts === null ||
							(Array.isArray(candidate.content.parts) &&
								candidate.content.parts.every(
									(part) =>
										part === undefined ||
										part === null ||
										(typeof part === "object" &&
											("text" in part
												? typeof part.text === "string" ||
													typeof part.text === "undefined"
												: true)),
								))))),
		)
	)
}

function extractChunkText(chunk: unknown): string | null {
	if (!chunk || typeof chunk !== "object") return null

	if (hasTextHelper(chunk)) {
		const value = chunk.text()
		if (typeof value === "string" && value.length > 0) {
			return value
		}
	}

	const possibleCandidates = (chunk as { candidates?: unknown }).candidates
	if (isChunkCandidates(possibleCandidates)) {
		for (const candidate of possibleCandidates) {
			const parts = candidate.content?.parts
			if (Array.isArray(parts)) {
				for (const part of parts) {
					if (typeof part?.text === "string" && part.text.length > 0) {
						return part.text
					}
				}
			}
		}
	}

	return null
}

function normalizeModelId(modelId?: string): string | undefined {
	if (!modelId || modelId.length === 0) return undefined
	if (modelId.startsWith("models/")) return modelId
	return `models/${modelId}`
}
