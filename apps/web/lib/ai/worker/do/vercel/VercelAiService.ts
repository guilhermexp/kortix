// ============================================================
// Vercel AI Service for TLDraw
// Uses Vercel AI SDK for structured object generation
// ============================================================

import { type CoreMessage, generateObject, streamObject, generateText, streamText } from "ai"
import type {
	TLAiChange,
	TLAiResult,
	TLAiSerializedPrompt,
} from "@/lib/ai/tldraw-ai-types"
import { getModel, type ModelId } from "../../models"
import {
	formatSimpleContentForPrompt,
	getSimpleContentFromCanvasContent,
} from "../../simple/getSimpleContentFromCanvasContent"
import { getTldrawAiChangesFromSimpleEvents } from "../../simple/getTldrawAiChangesFromSimpleEvents"
import {
	type ModelResponse,
	ModelResponseSchema,
	type SimpleEvent,
} from "../../simple/schema"
import { getSystemPrompt } from "../../simple/system-prompt"
import { TldrawAiBaseService } from "../../TldrawAiBaseService"
import type { Environment } from "../../types"
import { asMessage, toRichText } from "../../utils"

export class VercelAiService extends TldrawAiBaseService {
	private modelId: ModelId

	constructor(env: Environment, modelId?: ModelId) {
		super(env)
		this.validateEnv()
		this.modelId = modelId || (this.getBestAvailableModel() as ModelId)
	}

	// Build messages from prompt
	private buildMessages(prompt: TLAiSerializedPrompt): CoreMessage[] {
		const messages: CoreMessage[] = []

		// Add system prompt
		messages.push(asMessage("user", toRichText(getSystemPrompt())))
		messages.push(
			asMessage(
				"assistant",
				toRichText("I understand. I'll help manipulate the canvas."),
			),
		)

		// Add canvas content if available
		if (prompt.canvasContent) {
			const simpleContent = getSimpleContentFromCanvasContent(
				prompt.canvasContent,
			)
			const contentDesc = formatSimpleContentForPrompt(simpleContent)
			messages.push(
				asMessage("user", toRichText(`Current canvas state:\n${contentDesc}`)),
			)
			messages.push(
				asMessage(
					"assistant",
					toRichText(
						"I can see the current canvas state. What would you like me to do?",
					),
				),
			)
		}

		// Add screenshot if available
		if (prompt.image) {
			messages.push(
				asMessage(
					"user",
					toRichText("Here's a screenshot of the current canvas:"),
					{
						type: "image" as const,
						image: prompt.image,
					},
				),
			)
		}

		// Add the user's message
		if (prompt.message) {
			const userParts: any[] = []

			if (typeof prompt.message === "string") {
				userParts.push(toRichText(prompt.message))
			} else if (Array.isArray(prompt.message)) {
				for (const msg of prompt.message) {
					if (msg.type === "text") {
						userParts.push(toRichText(msg.text))
					} else if (msg.type === "image") {
						userParts.push({
							type: "image" as const,
							image: msg.src,
						})
					}
				}
			}

			if (userParts.length > 0) {
				messages.push(asMessage("user", ...userParts))
			}
		}

		return messages
	}

	// Generate complete response
	async generate(prompt: TLAiSerializedPrompt): Promise<TLAiResult> {
		try {
			const messages = this.buildMessages(prompt)
			const model = getModel(this.modelId, this.env)

			// Simple check if we are using OpenRouter
			const isOpenRouter = this.modelId.startsWith("openrouter/")

			if (isOpenRouter) {
				console.log("[VercelAiService] Using generateText fallback for OpenRouter")
				const { text } = await generateText({
					model,
					messages,
					system: "Always respond with VALID JSON representing the canvas events. Format: { \"events\": [...] }",
				})

				// Try to extract JSON from text
				try {
					const jsonMatch = text.match(/\{[\s\S]*\}/)
					const jsonStr = jsonMatch ? jsonMatch[0] : text
					const modelResponse = JSON.parse(jsonStr) as ModelResponse
					const changes = getTldrawAiChangesFromSimpleEvents(modelResponse.events)
					return { changes }
				} catch (e) {
					console.error("[VercelAiService] Failed to parse JSON from text:", text)
					return { changes: [] }
				}
			}

			const result = await generateObject({
				model,
				schema: ModelResponseSchema,
				output: "object", // Use object mode for reliable structured data
				messages,
			})

			const modelResponse = result.object as ModelResponse
			const changes = getTldrawAiChangesFromSimpleEvents(modelResponse.events)

			return {
				changes,
			}
		} catch (error) {
			console.error("Error generating response:", error)
			// Return empty changes on error - errors should be handled at a higher level
			return {
				changes: [],
			}
		}
	}

	// Stream changes as they are generated
	async *stream(prompt: TLAiSerializedPrompt): AsyncGenerator<TLAiChange> {
		try {
			const messages = this.buildMessages(prompt)
			const isOpenRouter = this.modelId.startsWith("openrouter/")

			console.log("[VercelAiService] Stream starting with model:", this.modelId)
			console.log("[VercelAiService] Is OpenRouter:", isOpenRouter)
			console.log("[VercelAiService] Messages count:", messages.length)

			const model = getModel(this.modelId, this.env)

			if (isOpenRouter) {
				console.log("[VercelAiService] Using streamText for OpenRouter model:", this.modelId)
				try {
					const { textStream } = await streamText({
						model,
						messages,
						system: "OUTPUT ONLY VALID JSON. Format: { \"events\": [...] }. Do not include any other text.",
					})

					let accumulatedText = ""
					let lastEventCount = 0

					for await (const textPart of textStream) {
						accumulatedText += textPart

						// Try to parse partial JSON
						try {
							// Simple partial JSON parsing for events
							const jsonMatch = accumulatedText.match(/\"events\"\s*:\s*\[([\s\S]*?)\]/)
							if (jsonMatch && jsonMatch[1]) {
								const eventsText = "[" + jsonMatch[1] + "]"
								// Add closing brace to make it valid if it's currently incomplete
								const validEventsText = eventsText.endsWith("]") ? eventsText : eventsText + "}]"

								try {
									const events = JSON.parse(validEventsText) as any[]
									if (events.length > lastEventCount) {
										for (let i = lastEventCount; i < events.length; i++) {
											const event = events[i]
											if (this.isEventComplete(event)) {
												lastEventCount = i + 1

												if (event.type === "think" || event.type === "message") {
													yield { type: event.type, text: event.text } as any
												} else {
													const changes = getTldrawAiChangesFromSimpleEvents([event as SimpleEvent])
													for (const change of changes) yield change
												}
											}
										}
									}
								} catch (e) {
									// Partial parsing failed, skip and wait for more text
								}
							}
						} catch (e) {
							// Ignore regex errors
						}
					}

					console.log("[VercelAiService] OpenRouter stream complete. Final text length:", accumulatedText.length)
					console.log("[VercelAiService] Events processed:", lastEventCount)
					return
				} catch (error) {
					console.error("[VercelAiService] OpenRouter streamText error:", error)
					console.error("[VercelAiService] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
					throw error // Re-throw for higher-level handling
				}
			}

			const stream = streamObject({
				model,
				schema: ModelResponseSchema,
				output: "object", // Use object mode for reliable structured data
				messages,
			})

			const processedEvents = new Set<number>()
			let chunkCount = 0

			for await (const chunk of stream.partialObjectStream) {
				chunkCount++
				console.log(
					`[VercelAiService] Chunk ${chunkCount}:`,
					JSON.stringify(chunk, null, 2),
				)

				if (chunk && typeof chunk === "object" && "events" in chunk && Array.isArray(chunk.events)) {
					console.log(
						`[VercelAiService] Found ${chunk.events.length} events in chunk`,
					)

					// Check ALL events each time - previous events may now be complete
					for (let i = 0; i < chunk.events.length; i++) {
						// Skip already processed events
						if (processedEvents.has(i)) continue

						const event = chunk.events[i]
						if (!event) continue

						// Check if event is complete enough to process
						const isComplete = this.isEventComplete(event)
						console.log(
							`[VercelAiService] Event ${i} complete:`,
							isComplete,
							JSON.stringify(event, null, 2),
						)

						if (isComplete) {
							processedEvents.add(i)

							// Handle think and message events specially - send them directly
							// These are conversational events that don't map to TLAiChange
							if (event.type === "think" || event.type === "message") {
								console.log(
									`[VercelAiService] Event ${i} is ${event.type}, sending directly:`,
									JSON.stringify(event, null, 2),
								)
								// Send as custom event for frontend handling
								yield {
									type: event.type,
									text: event.text,
								} as any
								continue
							}

							const changes = getTldrawAiChangesFromSimpleEvents([
								event as SimpleEvent,
							])
							console.log(
								`[VercelAiService] Event ${i} converted to ${changes.length} changes:`,
								JSON.stringify(changes, null, 2),
							)

							for (const change of changes) {
								yield change
							}
						}
					}
				}
			}

			console.log(
				`[VercelAiService] Stream complete. Total chunks: ${chunkCount}, Processed events: ${processedEvents.size}`,
			)
		} catch (error) {
			console.error("[VercelAiService] Error streaming response:", error)
			// Errors are handled at a higher level - just stop streaming
		}
	}

	// Check if an event has all required fields
	private isEventComplete(event: any): boolean {
		if (!event || !event.type) return false

		switch (event.type) {
			case "create": {
				// Check for shape object with required fields
				// The schema defines shape with: id, type, x, y as required
				const hasShape = event.shape && typeof event.shape === "object"
				const hasShapeType = hasShape && event.shape.type !== undefined
				const hasShapeId = hasShape && event.shape.id !== undefined
				const hasPosition =
					hasShape && event.shape.x !== undefined && event.shape.y !== undefined
				const isComplete = hasShape && hasShapeType && hasShapeId && hasPosition
				console.log("[isEventComplete] create check:", {
					hasShape,
					hasShapeType,
					hasShapeId,
					hasPosition,
					isComplete,
				})
				return isComplete
			}
			case "update":
				return event.id !== undefined && event.changes !== undefined
			case "move":
				return (
					event.id !== undefined &&
					event.x !== undefined &&
					event.y !== undefined
				)
			case "label":
				return event.id !== undefined && event.label !== undefined
			case "delete":
				return event.id !== undefined
			case "think":
			case "message":
				return event.text !== undefined
			default:
				console.log("[isEventComplete] unknown type:", event.type)
				return false
		}
	}
}
