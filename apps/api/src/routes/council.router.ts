import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import type { SessionContext } from "../session"
import {
	addCouncilAssistantMessage,
	addCouncilUserMessage,
	beginCouncilRun,
	cancelCouncilRun,
	createCouncilConversation,
	endCouncilRun,
	generateCouncilConversationTitle,
	getAvailableOpenRouterModels,
	getCouncilConversation,
	listCouncilConversations,
	queryCouncilSingleModel,
	runCouncilQuery,
	runCouncilStage1,
	runCouncilStage2,
	runCouncilStage3,
	updateCouncilConversationTitle,
} from "../services/council"

export const councilRouter = new Hono<{
	Variables: { session: SessionContext }
}>()

councilRouter.get("/health", async (c) => {
	return c.json({ status: "ok", service: "council-internal" })
})

councilRouter.get("/conversations", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	return c.json(listCouncilConversations(organizationId, internalUserId))
})

councilRouter.post("/conversations", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	return c.json(createCouncilConversation(organizationId, internalUserId))
})

councilRouter.get("/conversations/:conversationId", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const conversationId = c.req.param("conversationId")
	const conversation = getCouncilConversation(conversationId, organizationId, internalUserId)
	if (!conversation) {
		return c.json({ error: "Conversation not found" }, 404)
	}
	return c.json(conversation)
})

councilRouter.post("/conversations/:conversationId/message", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const conversationId = c.req.param("conversationId")
	const conversation = getCouncilConversation(conversationId, organizationId, internalUserId)
	if (!conversation) {
		return c.json({ error: "Conversation not found" }, 404)
	}

	const body = await c.req.json<{ content?: string }>()
	const content = body.content?.trim()
	if (!content) {
		return c.json({ error: "Missing or invalid content" }, 400)
	}

	addCouncilUserMessage(conversationId, content)
	if (conversation.messages.length === 0) {
		const title = await generateCouncilConversationTitle(content)
		updateCouncilConversationTitle(conversationId, title)
	}

	const runSignal = beginCouncilRun(conversationId)
	try {
		const { stage1, stage2, stage3, metadata } = await runCouncilQuery(
			content,
			runSignal,
		)
		addCouncilAssistantMessage(conversationId, { stage1, stage2, stage3, metadata })
		return c.json({ stage1, stage2, stage3, metadata })
	} finally {
		endCouncilRun(conversationId)
	}
})

councilRouter.post("/conversations/:conversationId/message/stream", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const conversationId = c.req.param("conversationId")
	const conversation = getCouncilConversation(conversationId, organizationId, internalUserId)
	if (!conversation) {
		return c.json({ error: "Conversation not found" }, 404)
	}

	const body = await c.req.json<{ content?: string }>()
	const content = body.content?.trim()
	if (!content) {
		return c.json({ error: "Missing or invalid content" }, 400)
	}

	const isFirstMessage = conversation.messages.length === 0

	return streamSSE(c, async (stream) => {
		const runSignal = beginCouncilRun(conversationId)
		try {
			addCouncilUserMessage(conversationId, content)

			const titlePromise = isFirstMessage
				? generateCouncilConversationTitle(content, runSignal).catch(
						() => "New Conversation",
					)
				: null

			await stream.writeSSE({ data: JSON.stringify({ type: "stage1_start" }) })
			const stage1 = await runCouncilStage1(content, runSignal)
			await stream.writeSSE({
				data: JSON.stringify({ type: "stage1_complete", data: stage1 }),
			})
			await stream.writeSSE({ data: JSON.stringify({ type: "stage2_start" }) })
			const stage2 = await runCouncilStage2(content, stage1, runSignal)
			await stream.writeSSE({
				data: JSON.stringify({
					type: "stage2_complete",
					data: stage2.stage2Results,
					metadata: {
						label_to_model: stage2.labelToModel,
						aggregate_rankings: stage2.aggregateRankings,
					},
				}),
			})
			await stream.writeSSE({ data: JSON.stringify({ type: "stage3_start" }) })
			const stage3 = await runCouncilStage3(
				content,
				stage1,
				stage2.stage2Results,
				runSignal,
			)
			await stream.writeSSE({
				data: JSON.stringify({ type: "stage3_complete", data: stage3 }),
			})

			if (titlePromise) {
				const title = await titlePromise
				updateCouncilConversationTitle(conversationId, title)
				await stream.writeSSE({
					data: JSON.stringify({
						type: "title_complete",
						data: { title },
					}),
				})
			}

			addCouncilAssistantMessage(conversationId, {
				stage1,
				stage2: stage2.stage2Results,
				stage3,
				metadata: {
					label_to_model: stage2.labelToModel,
					aggregate_rankings: stage2.aggregateRankings,
				},
			})

			await stream.writeSSE({ data: JSON.stringify({ type: "complete" }) })
		} catch (error) {
			const isCancelled =
				error instanceof Error &&
				error.message.toLowerCase().includes("cancelled")
			if (isCancelled) {
				await stream.writeSSE({ data: JSON.stringify({ type: "cancelled" }) })
				return
			}
			await stream.writeSSE({
				data: JSON.stringify({
					type: "error",
					message: error instanceof Error ? error.message : "Unknown council error",
				}),
			})
		} finally {
			endCouncilRun(conversationId)
		}
	})
})

// Backward-compatible shortcut: create conversation + stream message
councilRouter.post("/stream", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const body = await c.req.json<{ query?: string }>()
	const query = body.query?.trim()
	if (!query) {
		return c.json({ error: "Missing or invalid query" }, 400)
	}

	const conversation = createCouncilConversation(organizationId, internalUserId)

	return streamSSE(c, async (stream) => {
		const runSignal = beginCouncilRun(conversation.id)
		try {
			addCouncilUserMessage(conversation.id, query)
			const titlePromise = generateCouncilConversationTitle(query, runSignal).catch(
				() => "New Conversation",
			)

			await stream.writeSSE({ data: JSON.stringify({ type: "stage1_start" }) })
			const stage1 = await runCouncilStage1(query, runSignal)
			await stream.writeSSE({
				data: JSON.stringify({ type: "stage1_complete", data: stage1 }),
			})
			await stream.writeSSE({ data: JSON.stringify({ type: "stage2_start" }) })
			const stage2 = await runCouncilStage2(query, stage1, runSignal)
			await stream.writeSSE({
				data: JSON.stringify({
					type: "stage2_complete",
					data: stage2.stage2Results,
					metadata: {
						label_to_model: stage2.labelToModel,
						aggregate_rankings: stage2.aggregateRankings,
					},
				}),
			})
			await stream.writeSSE({ data: JSON.stringify({ type: "stage3_start" }) })
			const stage3 = await runCouncilStage3(
				query,
				stage1,
				stage2.stage2Results,
				runSignal,
			)
			await stream.writeSSE({
				data: JSON.stringify({ type: "stage3_complete", data: stage3 }),
			})

			const title = await titlePromise
			updateCouncilConversationTitle(conversation.id, title)
			await stream.writeSSE({
				data: JSON.stringify({
					type: "title_complete",
					data: { title },
				}),
			})

			addCouncilAssistantMessage(conversation.id, {
				stage1,
				stage2: stage2.stage2Results,
				stage3,
				metadata: {
					label_to_model: stage2.labelToModel,
					aggregate_rankings: stage2.aggregateRankings,
				},
			})

			await stream.writeSSE({
				data: JSON.stringify({ type: "conversation_created", data: { id: conversation.id } }),
			})
			await stream.writeSSE({ data: JSON.stringify({ type: "complete" }) })
		} catch (error) {
			const isCancelled =
				error instanceof Error &&
				error.message.toLowerCase().includes("cancelled")
			if (isCancelled) {
				await stream.writeSSE({ data: JSON.stringify({ type: "cancelled" }) })
				return
			}
			await stream.writeSSE({
				data: JSON.stringify({
					type: "error",
					message: error instanceof Error ? error.message : "Unknown council error",
				}),
			})
		} finally {
			endCouncilRun(conversation.id)
		}
	})
})

councilRouter.post("/conversations/:conversationId/cancel", async (c) => {
	const { organizationId, internalUserId } = c.var.session
	const conversationId = c.req.param("conversationId")
	const conversation = getCouncilConversation(conversationId, organizationId, internalUserId)
	if (!conversation) {
		return c.json({ error: "Conversation not found" }, 404)
	}
	const cancelled = cancelCouncilRun(conversationId)
	return c.json({ cancelled })
})

councilRouter.get("/models", async (c) => {
	try {
		const models = await getAvailableOpenRouterModels()
		return c.json({ models })
	} catch (error) {
		console.error("[council] Failed to fetch models", error)
		return c.json({ error: "Failed to fetch models" }, 500)
	}
})

councilRouter.post("/model/query", async (c) => {
	const body = await c.req.json<{ model?: string; query?: string }>()
	const model = body.model?.trim()
	const query = body.query?.trim()
	if (!model || !query) {
		return c.json({ error: "Missing model or query" }, 400)
	}

	try {
		const result = await queryCouncilSingleModel(model, query)
		return c.json(result)
	} catch (error) {
		console.error("[council] Failed to query model", error)
		return c.json({ error: "Failed to query model" }, 500)
	}
})
