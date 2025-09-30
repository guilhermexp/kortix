import { GoogleGenerativeAI } from "@google/generative-ai"
import { env } from "../env"

const chatClient = env.GOOGLE_API_KEY
  ? new GoogleGenerativeAI(env.GOOGLE_API_KEY).getGenerativeModel({ model: env.CHAT_MODEL })
  : null

export type ChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export async function generateChatReply(messages: ChatMessage[], context?: string): Promise<string> {
  if (!chatClient) {
    throw new Error("Chat model not configured")
  }

  const contents = [] as Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>

  if (context && context.trim().length > 0) {
    contents.push({
      role: "user",
      parts: [{ text: `Context:
${context.trim()}` }],
    })
  }

  for (const message of messages) {
    const text = message.content.trim()
    if (!text) continue

    if (message.role === "assistant") {
      contents.push({ role: "model", parts: [{ text }] })
    } else {
      contents.push({ role: "user", parts: [{ text }] })
    }
  }

  if (contents.length === 0) {
    throw new Error("No content provided to chat model")
  }

  const result = await chatClient.generateContent({ contents })
  const responseText = result?.response?.text()?.trim()
  if (!responseText) {
    throw new Error("Chat model returned empty response")
  }
  return responseText
}
