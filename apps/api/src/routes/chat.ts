import { GoogleGenerativeAI } from "@google/generative-ai"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createUIMessageStreamResponse } from "ai"
import { z } from "zod"
import { env } from "../env"
import { searchDocuments } from "./search"

const googleApiKey =
	env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY

if (googleApiKey && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
	process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleApiKey
}

const googleClient = googleApiKey ? new GoogleGenerativeAI(googleApiKey) : null

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
	metadata: z.record(z.any()).optional(),
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
	if (!googleClient) {
		throw new Error("Google Generative AI API key is not configured")
	}

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
				limit: 5,
				includeSummary: true,
				includeFullDocs: false,
				chunkThreshold: 0,
				documentThreshold: 0,
				onlyMatchingChunks: false,
			})

			if (searchResponse.results.length > 0) {
				systemMessage = formatSearchResultsForSystemMessage(
					searchResponse.results,
				)
			}
		} catch (error) {
			console.warn("handleChat search fallback", error)
		}
	}

	const systemInstruction = systemMessage
		? { role: "system" as const, parts: [{ text: systemMessage }] }
		: undefined

	const candidateModels = Array.from(
		new Set(
			[
				normalizeModelId(env.CHAT_MODEL),
				"models/gemini-2.5-pro",
				"models/gemini-2.5-flash",
				"models/gemini-2.0-flash",
			].filter(Boolean),
		),
	)

	const buildFallbackMessage = (error?: unknown) => {
		const errorMessage =
			error instanceof Error && error.message
				? error.message
				: "Modelo de chat indisponível no momento"

		console.error("Chat model fallback", { error: errorMessage })

		return [
			"⚠️  Não consegui gerar uma resposta com o modelo configurado.",
			`Detalhes: ${errorMessage}`,
			systemMessage ? `\nContexto pesquisado:\n${systemMessage}` : "",
		]
			.filter(Boolean)
			.join("\n")
	}

	let lastError: unknown

	for (const modelId of candidateModels) {
		try {
			const model = googleClient.getGenerativeModel({ model: modelId })

			const contents = messages.map((msg) => ({
				role: msg.role === "assistant" ? "model" : "user",
				parts: [{ text: msg.content }],
			}))

			if (contents.length === 0) {
				throw new Error("No user messages provided")
			}

			const response = await model.generateContentStream({
				contents,
				systemInstruction,
				generationConfig: {
					maxOutputTokens: 8192,
				},
			})

			const stream = new ReadableStream({
				start(controller) {
					const messageId = `chat-${Date.now()}`
					controller.enqueue({ type: "text-start", id: messageId })

					;(async () => {
						try {
							for await (const chunk of response.stream) {
								const delta = extractChunkText(chunk)
								if (delta) {
									controller.enqueue({
										type: "text-delta",
										id: messageId,
										delta,
									})
								}
							}

							controller.enqueue({ type: "text-end", id: messageId })
							controller.close()
						} catch (error) {
							controller.error(error)
						}
					})()
				},
			})

			console.info("Chat streaming with model", modelId)
			return createUIMessageStreamResponse({ stream })
		} catch (error) {
			console.error(`Chat generation failed for model ${modelId}`, error)
			lastError = error
		}
	}

	const fallbackText = buildFallbackMessage(lastError)
	console.warn("CHAT fallback after all models", { error: fallbackText })

	const fallbackId = `fallback-${Date.now()}`
	const fallbackStream = new ReadableStream({
		start(controller) {
			controller.enqueue({ type: "text-start", id: fallbackId })
			controller.enqueue({
				type: "text-delta",
				id: fallbackId,
				delta: fallbackText,
			})
			controller.enqueue({ type: "text-end", id: fallbackId })
			controller.close()
		},
	})

	return createUIMessageStreamResponse({ stream: fallbackStream })
}

function formatSearchResultsForSystemMessage(
	results: Awaited<ReturnType<typeof searchDocuments>>["results"],
) {
	if (!Array.isArray(results) || results.length === 0) {
		return ""
	}

	const topResults = results.slice(0, 3)
	const formatted = topResults.map((result, index) => {
		const lines: string[] = []
		const title =
			result.title ??
			result.metadata?.title ??
			result.metadata?.name ??
			result.documentId
		const score = Number.isFinite(result.score)
			? result.score.toFixed(3)
			: "n/a"
		lines.push(`${index + 1}. ${title} (score: ${score})`)

		const url =
			typeof result.metadata?.url === "string"
				? result.metadata.url
				: typeof result.metadata?.source_url === "string"
					? result.metadata.source_url
					: null
		if (url) {
			lines.push(`   URL: ${url}`)
		}

		if (result.summary) {
			lines.push(`   Resumo: ${result.summary}`)
		}

		const chunkSnippets = (result.chunks ?? []).slice(0, 2)
		if (chunkSnippets.length > 0) {
			lines.push("   Trechos:")
			for (const chunk of chunkSnippets) {
				const snippet = chunk.content?.replace(/\s+/g, " ").trim()
				if (!snippet) continue
				lines.push(`     • ${snippet}`)
			}
		}

		return lines.join("\n")
	})

	return `Contexto recuperado das suas memórias:
${formatted.join("\n\n")}

Use apenas se for relevante para responder.`
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
