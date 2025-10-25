import { google } from "@ai-sdk/google"
import { xai } from "@ai-sdk/xai"
import { generateText } from "ai"
import { env } from "../env"
import { CONDENSE_SYSTEM_PROMPT } from "../prompts/chat"

export type CondenseMessage = {
	role: "user" | "assistant"
	content: string
}

function formatHistory(messages: CondenseMessage[]) {
	return messages
		.map(
			(message) =>
				`${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`,
		)
		.join("\n")
}

export async function condenseUserQuery(
	messages: CondenseMessage[],
	question: string,
): Promise<string> {
	const trimmedQuestion = question.trim()
	if (messages.length === 0 || !trimmedQuestion) {
		return trimmedQuestion
	}

	const history = formatHistory(messages.slice(-10))

	const provider = env.AI_PROVIDER
	const model =
		provider === "xai"
			? xai(env.CHAT_MODEL)
			: google(env.CHAT_MODEL)

	try {
		const response = await generateText({
			model,
			system: CONDENSE_SYSTEM_PROMPT,
			prompt: `Conversation History:\n${history}\n\nFollow-up question:\n${trimmedQuestion}\n\nRewrite the follow-up question as a standalone query:`,
			temperature: 0.2,
			maxOutputTokens: 256,
		})

		const condensed = response.text.trim()
		if (condensed.length === 0) {
			return trimmedQuestion
		}
		return condensed
	} catch (error) {
		console.warn("condenseUserQuery fallback", error)
		return trimmedQuestion
	}
}
