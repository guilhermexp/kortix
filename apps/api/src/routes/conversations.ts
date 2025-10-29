import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { EventStorageService } from "../services/event-storage"
import { ErrorHandler } from "../services/error-handler"
import { supabaseAdmin } from "../supabase"

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
		// Use admin client to bypass RLS when creating conversations
		const eventStorage = new EventStorageService(supabaseAdmin)

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
			return ErrorHandler.validation(
				"Invalid conversation data",
				{ errors: error.errors }
			).toResponse()
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
	conversationId,
}: {
	client: SupabaseClient
	conversationId: string
}) {
	try {
		if (!conversationId || typeof conversationId !== "string") {
			throw ErrorHandler.validation("Invalid conversation ID")
		}

		const eventStorage = new EventStorageService(client)
		const conversation = await eventStorage.getConversation(conversationId)

		if (!conversation) {
			throw ErrorHandler.notFound("Conversation", conversationId)
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
	conversationId,
}: {
	client: SupabaseClient
	conversationId: string
}) {
	try {
		if (!conversationId || typeof conversationId !== "string") {
			throw ErrorHandler.validation("Invalid conversation ID")
		}

		const eventStorage = new EventStorageService(client)
		
		// Verify conversation exists
		const conversation = await eventStorage.getConversation(conversationId)
		if (!conversation) {
			throw ErrorHandler.notFound("Conversation", conversationId)
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
	conversationId,
}: {
	client: SupabaseClient
	conversationId: string
}) {
	try {
		if (!conversationId || typeof conversationId !== "string") {
			throw ErrorHandler.validation("Invalid conversation ID")
		}

		const eventStorage = new EventStorageService(client)
		
		// Verify conversation exists
		const conversation = await eventStorage.getConversation(conversationId)
		if (!conversation) {
			throw ErrorHandler.notFound("Conversation", conversationId)
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
	conversationId,
	body,
}: {
	client: SupabaseClient
	conversationId: string
	body: unknown
}) {
	try {
		if (!conversationId || typeof conversationId !== "string") {
			throw ErrorHandler.validation("Invalid conversation ID")
		}

		const payload = updateConversationSchema.parse(body ?? {})
		// Use admin client to bypass RLS when updating conversations
		const eventStorage = new EventStorageService(supabaseAdmin)

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
			return ErrorHandler.validation(
				"Invalid conversation data",
				{ errors: error.errors }
			).toResponse()
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
	conversationId,
}: {
	client: SupabaseClient
	conversationId: string
}) {
	try {
		if (!conversationId || typeof conversationId !== "string") {
			throw ErrorHandler.validation("Invalid conversation ID")
		}

		// Use admin client to bypass RLS when deleting conversations
		const eventStorage = new EventStorageService(supabaseAdmin)
		await eventStorage.deleteConversation(conversationId)

		return new Response(
			JSON.stringify({ success: true, message: "Conversation deleted" }),
			{
				status: 200,
				headers: {
					"Content-Type": "application/json",
				},
			}
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
			}
		)
	} catch (error) {
		if (error instanceof z.ZodError) {
			return ErrorHandler.validation(
				"Invalid query parameters",
				{ errors: error.errors }
			).toResponse()
		}
		return ErrorHandler.handleError(error)
	}
}
