import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { ErrorHandler } from "../services/error-handler"
import { EventStorageService } from "../services/event-storage"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function validateConversationId(conversationId: unknown): string {
	if (!conversationId || typeof conversationId !== "string") {
		throw ErrorHandler.validation("Invalid conversation ID")
	}
	// Reject non-UUID IDs (e.g. "claude-1234567890" from local cache)
	if (!UUID_RE.test(conversationId)) {
		throw ErrorHandler.notFound("Conversation", conversationId)
	}
	return conversationId
}

// Validation schemas
const createConversationSchema = z.object({
	title: z.string().min(1).max(500).optional(),
	metadata: z.record(z.string(), z.any()).optional(),
})

const updateConversationSchema = z.object({
	title: z.string().min(1).max(500).optional(),
	metadata: z.record(z.string(), z.any()).optional(),
})

const listConversationsSchema = z.object({
	userId: z.string().uuid().optional(),
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).default(0),
})

/**
 * Create a new conversation
 * POST /api/conversations
 */
export async function handleCreateConversation({
	client,
	orgId,
	userId,
	body,
}: {
	client: SupabaseClient
	orgId: string
	userId?: string
	body: unknown
}) {
	try {
		const payload = createConversationSchema.parse(body ?? {})
		const eventStorage = new EventStorageService(client)

		const conversation = await eventStorage.createConversation(
			orgId,
			userId,
			payload.title,
			payload.metadata,
		)

		return new Response(JSON.stringify({ conversation }), {
			status: 201,
			headers: {
				"Content-Type": "application/json",
			},
		})
	} catch (error) {
		if (error instanceof z.ZodError) {
			return ErrorHandler.validation("Invalid conversation data", {
				errors: error.issues,
			}).toResponse()
		}
		return ErrorHandler.handleError(error)
	}
}

/**
 * Get a conversation by ID
 * GET /api/conversations/:id
 */
export async function handleGetConversation({
	client,
	orgId,
	conversationId,
}: {
	client: SupabaseClient
	orgId: string
	conversationId: string
}) {
	try {
		validateConversationId(conversationId)

		const eventStorage = new EventStorageService(client)
		const conversation = await eventStorage.getConversation(conversationId)

		if (!conversation) {
			throw ErrorHandler.notFound("Conversation", conversationId)
		}
		if (conversation.org_id !== orgId) {
			throw ErrorHandler.authorization("conversation", "access")
		}

		return new Response(JSON.stringify({ conversation }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		})
	} catch (error) {
		return ErrorHandler.handleError(error)
	}
}

/**
 * Get conversation events (history)
 * GET /api/conversations/:id/events
 */
export async function handleGetConversationEvents({
	client,
	orgId,
	conversationId,
}: {
	client: SupabaseClient
	orgId: string
	conversationId: string
}) {
	try {
		validateConversationId(conversationId)

		const eventStorage = new EventStorageService(client)

		// Verify conversation exists
		const conversation = await eventStorage.getConversation(conversationId)
		if (!conversation) {
			throw ErrorHandler.notFound("Conversation", conversationId)
		}
		if (conversation.org_id !== orgId) {
			throw ErrorHandler.authorization("conversation", "access")
		}

		const events = await eventStorage.getConversationEvents(conversationId)

		return new Response(JSON.stringify({ events, count: events.length }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		})
	} catch (error) {
		return ErrorHandler.handleError(error)
	}
}

/**
 * Get conversation history as Claude messages
 * GET /api/conversations/:id/history
 */
export async function handleGetConversationHistory({
	client,
	orgId,
	conversationId,
}: {
	client: SupabaseClient
	orgId: string
	conversationId: string
}) {
	try {
		validateConversationId(conversationId)

		const eventStorage = new EventStorageService(client)

		// Verify conversation exists
		const conversation = await eventStorage.getConversation(conversationId)
		if (!conversation) {
			throw ErrorHandler.notFound("Conversation", conversationId)
		}
		if (conversation.org_id !== orgId) {
			throw ErrorHandler.authorization("conversation", "access")
		}

		const messages = await eventStorage.buildClaudeMessages(conversationId)

		return new Response(JSON.stringify({ messages, count: messages.length }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		})
	} catch (error) {
		return ErrorHandler.handleError(error)
	}
}

/**
 * Update a conversation
 * PATCH /api/conversations/:id
 */
export async function handleUpdateConversation({
	client,
	orgId,
	conversationId,
	body,
}: {
	client: SupabaseClient
	orgId: string
	conversationId: string
	body: unknown
}) {
	try {
		validateConversationId(conversationId)

		const payload = updateConversationSchema.parse(body ?? {})
		const eventStorage = new EventStorageService(client)
		const existing = await eventStorage.getConversation(conversationId)
		if (!existing) {
			throw ErrorHandler.notFound("Conversation", conversationId)
		}
		if (existing.org_id !== orgId) {
			throw ErrorHandler.authorization("conversation", "update")
		}

		const conversation = await eventStorage.updateConversation(
			conversationId,
			payload,
		)

		return new Response(JSON.stringify({ conversation }), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		})
	} catch (error) {
		if (error instanceof z.ZodError) {
			return ErrorHandler.validation("Invalid conversation data", {
				errors: error.issues,
			}).toResponse()
		}
		return ErrorHandler.handleError(error)
	}
}

/**
 * Delete a conversation
 * DELETE /api/conversations/:id
 */
export async function handleDeleteConversation({
	client,
	orgId,
	conversationId,
}: {
	client: SupabaseClient
	orgId: string
	conversationId: string
}) {
	try {
		validateConversationId(conversationId)

		const eventStorage = new EventStorageService(client)
		const existing = await eventStorage.getConversation(conversationId)
		if (!existing) {
			throw ErrorHandler.notFound("Conversation", conversationId)
		}
		if (existing.org_id !== orgId) {
			throw ErrorHandler.authorization("conversation", "delete")
		}
		await eventStorage.deleteConversation(conversationId)

		return new Response(
			JSON.stringify({ success: true, message: "Conversation deleted" }),
			{
				status: 200,
				headers: {
					"Content-Type": "application/json",
				},
			},
		)
	} catch (error) {
		return ErrorHandler.handleError(error)
	}
}

/**
 * List conversations for an organization
 * GET /api/conversations
 */
export async function handleListConversations({
	client,
	orgId,
	searchParams,
}: {
	client: SupabaseClient
	orgId: string
	searchParams: URLSearchParams
}) {
	try {
		const queryParams = {
			userId: searchParams.get("userId") || undefined,
			limit: searchParams.get("limit")
				? Number.parseInt(searchParams.get("limit")!, 10)
				: 50,
			offset: searchParams.get("offset")
				? Number.parseInt(searchParams.get("offset")!, 10)
				: 0,
		}

		const validated = listConversationsSchema.parse(queryParams)
		const eventStorage = new EventStorageService(client)

		const conversations = await eventStorage.listConversations(orgId, {
			userId: validated.userId,
			limit: validated.limit,
			offset: validated.offset,
		})

		return new Response(
			JSON.stringify({
				conversations,
				count: conversations.length,
				limit: validated.limit,
				offset: validated.offset,
			}),
			{
				status: 200,
				headers: {
					"Content-Type": "application/json",
				},
			},
		)
	} catch (error) {
		if (error instanceof z.ZodError) {
			return ErrorHandler.validation("Invalid query parameters", {
				errors: error.issues,
			}).toResponse()
		}
		return ErrorHandler.handleError(error)
	}
}
