import { createUIMessageStreamResponse } from "ai"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { searchDocuments } from "./search"
import { env } from "../env"

const googleApiKey = env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY

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
        parts: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      }),
    )
    .optional(),
  metadata: z.record(z.any()).optional(),
})

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
  const messages = inputMessages.map((msg) => {
    let content = ""
    if (typeof msg.content === "string") {
      content = msg.content
    } else if (Array.isArray(msg.parts)) {
      content = msg.parts.map((part) => part.text ?? "").join(" ")
    } else if (Array.isArray((msg as any)?.content)) {
      content = ((msg as any).content as any[])
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join(" ")
    }

    return {
      role: msg.role === "assistant" ? "assistant" : msg.role === "system" ? "system" : "user",
      content: content.trim(),
    }
  }).filter((msg) => msg.content.length > 0)

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
        systemMessage = formatSearchResultsForSystemMessage(searchResponse.results)
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
                  controller.enqueue({ type: "text-delta", id: messageId, delta })
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
      controller.enqueue({ type: "text-delta", id: fallbackId, delta: fallbackText })
      controller.enqueue({ type: "text-end", id: fallbackId })
      controller.close()
    },
  })

  return createUIMessageStreamResponse({ stream: fallbackStream })
}

function formatSearchResultsForSystemMessage(results: Awaited<ReturnType<typeof searchDocuments>>["results"]) {
  if (!Array.isArray(results) || results.length === 0) {
    return ""
  }

  const topResults = results.slice(0, 3)
  const formatted = topResults.map((result, index) => {
    const lines: string[] = []
    const title = result.title ?? result.metadata?.title ?? result.metadata?.name ?? result.documentId
    const score = Number.isFinite(result.score) ? result.score.toFixed(3) : "n/a"
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

function extractChunkText(chunk: unknown): string | null {
  if (!chunk || typeof chunk !== "object") return null

  // The SDK exposes a text() helper on streamed chunks
  if (typeof (chunk as any).text === "function") {
    const value = (chunk as any).text()
    if (typeof value === "string" && value.length > 0) {
      return value
    }
  }

  const candidates = (chunk as any).candidates
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts
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
