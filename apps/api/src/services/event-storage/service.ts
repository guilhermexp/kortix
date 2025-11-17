import type {
	ClaudeMessage,
	Conversation,
	ConversationEvent,
	StoreEventInput,
	StoreToolResultInput,
	Supabase,
	ToolResult,
} from "./types"
import {
	extractTextFromContent,
	handleTableMissing,
	parseToolResultContent,
	parseToolUseContent,
} from "./utils"

export class EventStorageService {
	constructor(private readonly client: Supabase) {}

	async createConversation(
		orgId: string,
		userId?: string,
		title?: string,
		metadata?: Record<string, unknown>,
		sdkSessionId?: string,
	): Promise<Conversation> {
		const { data, error } = await this.client
			.from("conversations")
			.insert({
				org_id: orgId,
				user_id: userId,
				title,
				sdk_session_id: sdkSessionId,
				metadata: metadata ?? {},
			})
			.select()
			.single()
		if (error) handleTableMissing(error, "conversations")
		if (!data) throw new Error("No conversation data returned after creation")
		return data as Conversation
	}

	async getConversation(conversationId: string): Promise<Conversation | null> {
		const { data, error } = await this.client
			.from("conversations")
			.select()
			.eq("id", conversationId)
			.maybeSingle()
		if (error) handleTableMissing(error, "conversations")
		return data as Conversation | null
	}

	async updateSdkSessionId(
		conversationId: string,
		sdkSessionId: string,
	): Promise<void> {
		const { error } = await this.client
			.from("conversations")
			.update({ sdk_session_id: sdkSessionId })
			.eq("id", conversationId)
		if (error) handleTableMissing(error, "conversations")
	}

	async storeEvent(input: StoreEventInput): Promise<ConversationEvent> {
		const { conversationId, type, role, content, metadata } = input
		if (!conversationId || typeof conversationId !== "string")
			throw new Error("Invalid conversation ID")
		if (
			!type ||
			!["user", "assistant", "tool_use", "tool_result", "error"].includes(type)
		)
			throw new Error(`Invalid event type: ${type}`)
		if (content === undefined || content === null)
			throw new Error("Event content is required")
		const { data, error } = await this.client
			.from("conversation_events")
			.insert({
				conversation_id: conversationId,
				type,
				role,
				content,
				metadata: metadata ?? {},
			})
			.select()
			.single()
		if (error) handleTableMissing(error, "conversation_events")
		if (!data) throw new Error("No event data returned after storage")
		return data as ConversationEvent
	}

	async storeToolResult(input: StoreToolResultInput): Promise<ToolResult> {
		const {
			eventId,
			toolName,
			toolUseId,
			input: toolInput,
			output,
			isError,
			errorMessage,
			durationMs,
		} = input
		if (!eventId || typeof eventId !== "string")
			throw new Error("Invalid event ID")
		if (!toolName || typeof toolName !== "string")
			throw new Error("Invalid tool name")
		const { data, error } = await this.client
			.from("tool_results")
			.insert({
				event_id: eventId,
				tool_name: toolName,
				tool_use_id: toolUseId,
				input: toolInput,
				output,
				is_error: isError ?? false,
				error_message: errorMessage,
				duration_ms: durationMs,
			})
			.select()
			.single()
		if (error) handleTableMissing(error, "tool_results")
		if (!data) throw new Error("No tool result data returned after storage")
		return data as ToolResult
	}

	async getConversationEvents(
		conversationId: string,
	): Promise<ConversationEvent[]> {
		const { data, error } = await this.client
			.from("conversation_events")
			.select()
			.eq("conversation_id", conversationId)
			.order("created_at", { ascending: true })
		if (error) handleTableMissing(error, "conversation_events")
		return (data ?? []) as ConversationEvent[]
	}

	async getToolResults(eventIds: string[]): Promise<ToolResult[]> {
		if (!eventIds || eventIds.length === 0) return []
		const { data, error } = await this.client
			.from("tool_results")
			.select()
			.in("event_id", eventIds)
		if (error) handleTableMissing(error, "tool_results")
		return (data ?? []) as ToolResult[]
	}

	async buildClaudeMessages(conversationId: string): Promise<ClaudeMessage[]> {
		const events = await this.getConversationEvents(conversationId)
		if (events.length === 0) return []
		const toolEventIds = events
			.filter((e) => e.type === "tool_use" || e.type === "tool_result")
			.map((e) => e.id)
		const toolResults = await this.getToolResults(toolEventIds)
		const toolResultsByEventId = new Map(
			toolResults.map((tr) => [tr.event_id, tr]),
		)
		const toolResultsByToolUseId = new Map<string, ToolResult>()
		for (const result of toolResults) {
			if (result.tool_use_id)
				toolResultsByToolUseId.set(result.tool_use_id, result)
		}
		const messages: ClaudeMessage[] = []
		let currentMessage: ClaudeMessage | null = null
		for (const event of events) {
			if (
				!currentMessage ||
				(event.role && event.role !== currentMessage.role)
			) {
				if (currentMessage) messages.push(currentMessage)
				currentMessage = { role: event.role ?? "user", content: [] }
			}
			switch (event.type) {
				case "user":
				case "assistant": {
					const text = extractTextFromContent(event.content)
					if (text) currentMessage.content.push({ type: "text", text })
					break
				}
				case "tool_use": {
					const parsed = parseToolUseContent(event.content)
					const fallback =
						(parsed?.id && toolResultsByToolUseId.get(parsed.id)) ??
						toolResultsByToolUseId.get(event.id)
					const id = parsed?.id ?? fallback?.tool_use_id ?? event.id
					const name = parsed?.name ?? fallback?.tool_name ?? "tool"
					const input =
						parsed && Object.hasOwn(parsed, "input")
							? parsed.input
							: (fallback?.input ?? null)
					currentMessage.content.push({ type: "tool_use", id, name, input })
					break
				}
				case "tool_result": {
					const toolResult = toolResultsByEventId.get(event.id)
					const parsed = parseToolResultContent(event.content)
					const toolUseId =
						parsed?.tool_use_id ?? toolResult?.tool_use_id ?? event.id
					const content =
						parsed && Object.hasOwn(parsed, "content")
							? parsed.content
							: (toolResult?.output ?? null)
					const isError =
						parsed && Object.hasOwn(parsed, "is_error")
							? Boolean(parsed.is_error)
							: (toolResult?.is_error ?? false)
					currentMessage.content.push({
						type: "tool_result",
						tool_use_id: toolUseId,
						content,
						is_error: isError ? true : undefined,
					})
					break
				}
				case "error": {
					const errorText = extractTextFromContent(event.content)
					if (errorText)
						currentMessage.content.push({
							type: "text",
							text: `Error: ${errorText}`,
						})
					break
				}
			}
		}
		if (currentMessage && currentMessage.content.length > 0)
			messages.push(currentMessage)
		return messages
	}

	async deleteConversation(conversationId: string): Promise<void> {
		const { error } = await this.client
			.from("conversations")
			.delete()
			.eq("id", conversationId)
		if (error) handleTableMissing(error, "conversations")
	}

	async updateConversation(
		conversationId: string,
		updates: { title?: string; metadata?: Record<string, unknown> },
	): Promise<Conversation> {
		const { data, error } = await this.client
			.from("conversations")
			.update(updates)
			.eq("id", conversationId)
			.select()
			.single()
		if (error) handleTableMissing(error, "conversations")
		if (!data) throw new Error("No conversation data returned after update")
		return data as Conversation
	}

	async listConversations(
		orgId: string,
		options?: { userId?: string; limit?: number; offset?: number },
	): Promise<Conversation[]> {
		let query = this.client
			.from("conversations")
			.select()
			.eq("org_id", orgId)
			.order("updated_at", { ascending: false })
		if (options?.userId) query = query.eq("user_id", options.userId)
		if (options?.limit) query = query.limit(options.limit)
		if (options?.offset)
			query = query.range(
				options.offset,
				options.offset + (options.limit ?? 50) - 1,
			)
		const { data, error } = await query
		if (error) handleTableMissing(error, "conversations")
		return (data ?? []) as Conversation[]
	}
}
