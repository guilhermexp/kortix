/**
 * NotebookLM Chat API
 * Ask questions about notebook sources with citations.
 */

import type { NotebookLMClient } from "../client"
import { decodeChatResponse } from "../rpc"
import type { AskResult } from "../types"

export class ChatAPI {
	/** Local cache of conversation history for follow-up questions */
	private static readonly MAX_CACHED_CONVERSATIONS = 100
	private conversationCache = new Map<
		string,
		Array<[string, string]> // [answer, question] pairs
	>()

	constructor(private client: NotebookLMClient) {}

	/**
	 * Ask a question about the notebook's sources.
	 * Supports follow-up questions within the same conversation.
	 */
	async ask(
		notebookId: string,
		question: string,
		options: {
			sourceIds?: string[]
			conversationId?: string | null
		} = {},
	): Promise<AskResult> {
		const sourceIds =
			options.sourceIds ?? (await this.client.getSourceIds(notebookId))

		// Build conversation history for follow-ups
		const convId = options.conversationId ?? null
		const history = convId ? this.getConversationHistory(convId) : []

		const rawResponse = await this.client.chatRequest(
			notebookId,
			question,
			sourceIds,
			history,
			convId,
		)

		const parsed = decodeChatResponse(rawResponse)

		const conversationId = parsed.conversationId ?? convId
		const isFollowUp = history.length > 0

		// Cache conversation for follow-ups
		if (conversationId) {
			// Evict oldest conversation if at capacity
			if (
				!this.conversationCache.has(conversationId) &&
				this.conversationCache.size >= ChatAPI.MAX_CACHED_CONVERSATIONS
			) {
				const oldestKey = this.conversationCache.keys().next().value
				if (oldestKey) this.conversationCache.delete(oldestKey)
			}
			const existing = this.conversationCache.get(conversationId) ?? []
			existing.unshift([parsed.answer, question])
			// Keep only last 20 turns
			if (existing.length > 20) existing.length = 20
			this.conversationCache.set(conversationId, existing)
		}

		return {
			answer: parsed.answer,
			conversationId,
			turnNumber: isFollowUp ? history.length / 2 + 1 : 1,
			isFollowUp,
			references: parsed.references,
		}
	}

	/**
	 * Get conversation history in the format expected by the chat RPC.
	 * Returns: [[answer, null, 2], [question, null, 1], ...] reverse-chronological
	 */
	private getConversationHistory(conversationId: string): unknown[] {
		const cached = this.conversationCache.get(conversationId) ?? []
		const history: unknown[] = []
		for (const [answer, question] of cached) {
			history.push([answer, null, 2])
			history.push([question, null, 1])
		}
		return history
	}
}
