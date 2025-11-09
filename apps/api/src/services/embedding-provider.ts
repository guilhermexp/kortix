import { env } from "../env"
import { getGoogleModel } from "./google-genai"
import {
	ensureVectorSize,
	generateDeterministicEmbedding,
	VECTOR_SIZE,
} from "./embedding"
import {
	generateVoyageEmbedding,
	isVoyageAvailable,
} from "./voyage-provider"

const embeddingModel = getGoogleModel(env.EMBEDDING_MODEL)

export async function generateEmbedding(text: string): Promise<number[]> {
	const normalizedText = text.trim()
	if (!normalizedText) {
		return new Array<number>(VECTOR_SIZE).fill(0)
	}

	// Priority 1: Try Voyage AI (best quality, 100M tokens/month free)
	if (isVoyageAvailable()) {
		try {
			const embedding = await generateVoyageEmbedding(normalizedText, {
				inputType: "document",
				truncation: true,
			})
			return embedding
		} catch (error) {
			console.warn(
				"[embedding] Voyage AI failed, falling back to Gemini",
				error instanceof Error ? error.message : error
			)
		}
	}

	// Priority 2: Try Gemini (fallback)
	if (embeddingModel) {
		try {
			// Gemini API has ~36KB limit. Truncate if needed to prevent errors
			const maxBytes = 30000 // Safety margin below 36KB limit
			const textBytes = Buffer.byteLength(normalizedText, "utf8")
			const safeText =
				textBytes > maxBytes
					? normalizedText.slice(
							0,
							Math.floor((normalizedText.length * maxBytes) / textBytes),
						)
					: normalizedText

			const result = await embeddingModel.embedContent({
				content: {
					parts: [{ text: safeText }],
				},
			})
			const values = result?.embedding?.values
			if (Array.isArray(values) && values.length > 0) {
				return ensureVectorSize(values, VECTOR_SIZE)
			}
		} catch (error) {
			console.warn(
				"[embedding] Gemini failed, falling back to deterministic vector",
				error instanceof Error ? error.message : error
			)
		}
	}

	// Priority 3: Deterministic fallback (always works)
	return ensureVectorSize(generateDeterministicEmbedding(normalizedText))
}

/**
 * Helper function to delay execution
 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Generate embedding with retry logic for rate limiting
 */
async function generateEmbeddingWithRetry(
	text: string,
	maxRetries = 3,
): Promise<number[]> {
	let lastError: Error | null = null

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const embedding = await generateEmbedding(text)
			return embedding
		} catch (error) {
			lastError = error as Error
			const isRateLimit =
				error instanceof Error &&
				(error.message.includes("rate") ||
				 error.message.includes("quota") ||
				 error.message.includes("429"))

			if (isRateLimit && attempt < maxRetries - 1) {
				// Exponential backoff: 1s, 2s, 4s
				const delayMs = 1000 * Math.pow(2, attempt)
				console.warn(
					`[embedding] Rate limit hit, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
				)
				await delay(delayMs)
				continue
			}

			// Not a rate limit error or final attempt
			console.error(
				`[embedding] Failed to generate embedding (attempt ${attempt + 1}/${maxRetries}):`,
				error,
			)

			if (attempt === maxRetries - 1) {
				break
			}
		}
	}

	// All retries failed - return deterministic embedding
	console.warn(
		"[embedding] All retry attempts failed, using deterministic fallback",
		lastError,
	)
	return ensureVectorSize(generateDeterministicEmbedding(text))
}

export async function generateEmbeddingsBatch(
	texts: string[],
): Promise<number[][]> {
	const BATCH_SIZE = 3 // Process 3 embeddings at a time (reduced to prevent memory issues)
	const DELAY_BETWEEN_BATCHES = 2000 // 2s delay between batches (increased to prevent rate limiting)

	const results: number[][] = []
	const totalChunks = texts.length

	console.info(`[embedding] Starting batch processing: ${totalChunks} chunks`)

	for (let i = 0; i < texts.length; i += BATCH_SIZE) {
		const batchNumber = Math.floor(i / BATCH_SIZE) + 1
		const totalBatches = Math.ceil(texts.length / BATCH_SIZE)
		const batch = texts.slice(i, i + BATCH_SIZE)

		console.info(
			`[embedding] Processing batch ${batchNumber}/${totalBatches} (chunks ${i + 1}-${Math.min(i + BATCH_SIZE, totalChunks)})`,
		)

		// Process batch sequentially with retry logic
		for (const text of batch) {
			// eslint-disable-next-line no-await-in-loop
			const embedding = await generateEmbeddingWithRetry(text)
			results.push(embedding)
		}

		// Delay between batches to avoid rate limiting
		if (i + BATCH_SIZE < texts.length) {
			// eslint-disable-next-line no-await-in-loop
			await delay(DELAY_BETWEEN_BATCHES)

			// Force garbage collection every 3 batches to prevent memory buildup
			if (typeof global.gc === 'function' && batchNumber % 3 === 0) {
				global.gc()
			}
		}
	}

	console.info(`[embedding] Batch processing complete: ${results.length} embeddings generated`)
	return results
}
