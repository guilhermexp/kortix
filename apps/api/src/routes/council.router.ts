/**
 * Council Router - SSE proxy to llm-council backend
 *
 * Proxies requests to the llm-council Python/FastAPI backend
 * and forwards SSE events to the frontend.
 */

import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { env } from "../env"
import type { SessionContext } from "../session"

// Use env-validated LLM_COUNCIL_URL
const LLM_COUNCIL_URL = env.LLM_COUNCIL_URL

export const councilRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

/**
 * POST /stream
 *
 * Creates a conversation in llm-council and streams the response.
 * The frontend sends a query, and this endpoint:
 * 1. Creates a new conversation in llm-council
 * 2. Sends the message to that conversation
 * 3. Proxies SSE events back to the frontend
 */
councilRouter.post("/stream", async (c) => {
	const body = await c.req.json<{ query: string }>()
	const { query } = body

	if (!query || typeof query !== "string") {
		return c.json({ error: "Missing or invalid query" }, 400)
	}

	console.log(
		"[council] Starting council session for query:",
		query.slice(0, 50),
	)

	try {
		// Step 1: Create a new conversation
		const createConvResponse = await fetch(
			`${LLM_COUNCIL_URL}/api/conversations`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({}),
			},
		)

		if (!createConvResponse.ok) {
			const errorText = await createConvResponse.text()
			console.error("[council] Failed to create conversation:", errorText)
			return c.json(
				{ error: "Failed to create council conversation" },
				createConvResponse.status,
			)
		}

		const { id: conversationId } = await createConvResponse.json()
		console.log("[council] Created conversation:", conversationId)

		// Step 2: Send message and stream response
		return streamSSE(c, async (stream) => {
			try {
				const messageResponse = await fetch(
					`${LLM_COUNCIL_URL}/api/conversations/${conversationId}/message/stream`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Accept: "text/event-stream",
						},
						// llm-council expects { content: string } per SendMessageRequest
						body: JSON.stringify({ content: query }),
					},
				)

				if (!messageResponse.ok) {
					const errorText = await messageResponse.text()
					console.error("[council] Failed to send message:", errorText)
					await stream.writeSSE({
						data: JSON.stringify({
							type: "error",
							message: "Failed to start council session",
						}),
					})
					return
				}

				const reader = messageResponse.body?.getReader()
				if (!reader) {
					await stream.writeSSE({
						data: JSON.stringify({
							type: "error",
							message: "No response body from council",
						}),
					})
					return
				}

				const decoder = new TextDecoder()
				let buffer = ""

				// Read and proxy SSE events
				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					buffer += decoder.decode(value, { stream: true })

					// Process complete lines
					const lines = buffer.split("\n")
					buffer = lines.pop() || "" // Keep incomplete line in buffer

					for (const line of lines) {
						const trimmedLine = line.trim()

						// Handle SSE format
						if (trimmedLine.startsWith("data: ")) {
							const data = trimmedLine.slice(6)

							try {
								// Parse and re-emit the event
								// The llm-council backend sends events in a specific format
								// We transform them to our frontend-expected format
								const event = JSON.parse(data)
								await stream.writeSSE({ data: JSON.stringify(event) })
							} catch (e) {
								// If parsing fails, forward as-is
								console.warn("[council] Failed to parse event:", data)
								await stream.writeSSE({ data })
							}
						} else if (trimmedLine.startsWith("event: ")) {
							// Some SSE implementations use event: field
							// We can log or handle these if needed
							console.log("[council] SSE event type:", trimmedLine.slice(7))
						}
						// Skip empty lines (SSE event separators)
					}
				}

				console.log(
					"[council] Stream completed for conversation:",
					conversationId,
				)
			} catch (streamError) {
				console.error("[council] Stream error:", streamError)
				await stream.writeSSE({
					data: JSON.stringify({
						type: "error",
						message:
							streamError instanceof Error
								? streamError.message
								: "Stream error",
					}),
				})
			}
		})
	} catch (error) {
		console.error("[council] Error:", error)
		return c.json(
			{
				error: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		)
	}
})

/**
 * GET /health
 *
 * Check if the llm-council backend is available
 */
councilRouter.get("/health", async (c) => {
	try {
		const response = await fetch(`${LLM_COUNCIL_URL}/health`, {
			method: "GET",
			signal: AbortSignal.timeout(5000), // 5 second timeout
		})

		if (response.ok) {
			return c.json({ status: "ok", councilUrl: LLM_COUNCIL_URL })
		}

		return c.json({ status: "unhealthy", councilUrl: LLM_COUNCIL_URL }, 503)
	} catch {
		return c.json({ status: "unavailable", councilUrl: LLM_COUNCIL_URL }, 503)
	}
})

/**
 * GET /models
 *
 * List available models from OpenRouter (cached)
 */
councilRouter.get("/models", async (c) => {
	try {
		const response = await fetch(`${LLM_COUNCIL_URL}/api/models`, {
			method: "GET",
			headers: { "Content-Type": "application/json" },
			signal: AbortSignal.timeout(30000), // 30 second timeout
		})

		if (!response.ok) {
			console.error("[council] Failed to fetch models:", response.status)
			return c.json({ error: "Failed to fetch models" }, response.status)
		}

		const data = await response.json()
		return c.json(data)
	} catch (error) {
		console.error("[council] Error fetching models:", error)
		return c.json({ error: "Failed to fetch models" }, 500)
	}
})

/**
 * POST /model/query
 *
 * Query a single model with a given prompt
 */
councilRouter.post("/model/query", async (c) => {
	const body = await c.req.json<{ model: string; query: string }>()
	const { model, query } = body

	if (!model || !query) {
		return c.json({ error: "Missing model or query" }, 400)
	}

	try {
		const response = await fetch(`${LLM_COUNCIL_URL}/api/model/query`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model, query }),
		})

		if (!response.ok) {
			console.error("[council] Failed to query model:", response.status)
			return c.json({ error: "Failed to query model" }, response.status)
		}

		const data = await response.json()
		return c.json(data)
	} catch (error) {
		console.error("[council] Error querying model:", error)
		return c.json({ error: "Failed to query model" }, 500)
	}
})
