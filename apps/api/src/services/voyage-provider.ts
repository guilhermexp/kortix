/**
 * Voyage AI Embeddings Provider
 *
 * High-quality embeddings optimized for RAG (Retrieval Augmented Generation)
 * Free tier: 100M tokens/month
 *
 * Documentation: https://docs.voyageai.com/docs/embeddings
 */

import { env } from "../env"
import { ensureVectorSize, VECTOR_SIZE } from "./embedding"

// ============================================================================
// Constants
// ============================================================================

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings"
const VOYAGE_MODEL = "voyage-3.5-lite" // Fastest, most cost-effective
const VOYAGE_DIMENSION = 1024 // Default dimension for voyage-3.5-lite
const MAX_BATCH_SIZE = 128 // Maximum texts per request
const MAX_RETRIES = 3
const RETRY_DELAY_BASE = 1000 // 1 second base delay

// ============================================================================
// Types
// ============================================================================

interface VoyageEmbeddingRequest {
	input: string | string[]
	model: string
	input_type?: "query" | "document" | null
	truncation?: boolean
}

interface VoyageEmbeddingResponse {
	object: "list"
	data: Array<{
		object: "embedding"
		embedding: number[]
		index: number
	}>
	model: string
	usage: {
		total_tokens: number
	}
}

interface VoyageErrorResponse {
	detail?: string
	message?: string
}

// ============================================================================
// Voyage AI Client
// ============================================================================

/**
 * Generate embeddings using Voyage AI
 */
export async function generateVoyageEmbedding(
	text: string,
	options?: {
		inputType?: "query" | "document"
		truncation?: boolean
	}
): Promise<number[]> {
	const apiKey = env.VOYAGE_API_KEY

	if (!apiKey) {
		throw new Error("VOYAGE_API_KEY not configured")
	}

	const normalizedText = text.trim()
	if (!normalizedText) {
		return new Array<number>(VECTOR_SIZE).fill(0)
	}

	try {
		const requestBody: VoyageEmbeddingRequest = {
			input: normalizedText,
			model: VOYAGE_MODEL,
			input_type: options?.inputType || "document", // Default to "document" for indexing
			truncation: options?.truncation !== false, // Default to true
		}

		const response = await fetch(VOYAGE_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(requestBody),
		})

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({}))) as VoyageErrorResponse
			const errorMessage =
				errorData.detail || errorData.message || response.statusText

			throw new Error(
				`Voyage AI API error (${response.status}): ${errorMessage}`
			)
		}

		const data = (await response.json()) as VoyageEmbeddingResponse

		if (!data.data || data.data.length === 0) {
			throw new Error("No embeddings returned from Voyage AI")
		}

		const embedding = data.data[0].embedding

		// Ensure embedding matches expected dimension
		return ensureVectorSize(embedding, VECTOR_SIZE)
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Voyage AI embedding failed: ${error.message}`)
		}
		throw error
	}
}

/**
 * Generate multiple embeddings in batch
 */
export async function generateVoyageEmbeddingsBatch(
	texts: string[],
	options?: {
		inputType?: "query" | "document"
		truncation?: boolean
	}
): Promise<number[][]> {
	const apiKey = env.VOYAGE_API_KEY

	if (!apiKey) {
		throw new Error("VOYAGE_API_KEY not configured")
	}

	if (texts.length === 0) {
		return []
	}

	// Handle batch size limit
	if (texts.length > MAX_BATCH_SIZE) {
		const batches: string[][] = []
		for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
			batches.push(texts.slice(i, i + MAX_BATCH_SIZE))
		}

		const results = await Promise.all(
			batches.map((batch) => generateVoyageEmbeddingsBatch(batch, options))
		)

		return results.flat()
	}

	const normalizedTexts = texts.map((t) => t.trim()).filter((t) => t.length > 0)

	if (normalizedTexts.length === 0) {
		return texts.map(() => new Array<number>(VECTOR_SIZE).fill(0))
	}

	try {
		const requestBody: VoyageEmbeddingRequest = {
			input: normalizedTexts,
			model: VOYAGE_MODEL,
			input_type: options?.inputType || "document",
			truncation: options?.truncation !== false,
		}

		const response = await fetch(VOYAGE_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify(requestBody),
		})

		if (!response.ok) {
			const errorData = (await response.json().catch(() => ({}))) as VoyageErrorResponse
			const errorMessage =
				errorData.detail || errorData.message || response.statusText

			throw new Error(
				`Voyage AI API error (${response.status}): ${errorMessage}`
			)
		}

		const data = (await response.json()) as VoyageEmbeddingResponse

		if (!data.data || data.data.length === 0) {
			throw new Error("No embeddings returned from Voyage AI")
		}

		// Sort by index to ensure correct order
		const sortedEmbeddings = data.data.sort((a, b) => a.index - b.index)

		// Ensure all embeddings match expected dimension
		return sortedEmbeddings.map((item) =>
			ensureVectorSize(item.embedding, VECTOR_SIZE)
		)
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Voyage AI batch embedding failed: ${error.message}`)
		}
		throw error
	}
}

/**
 * Generate embedding with retry logic for rate limiting
 */
export async function generateVoyageEmbeddingWithRetry(
	text: string,
	options?: {
		inputType?: "query" | "document"
		truncation?: boolean
		maxRetries?: number
	}
): Promise<number[]> {
	const maxRetries = options?.maxRetries ?? MAX_RETRIES
	let lastError: Error | null = null

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await generateVoyageEmbedding(text, options)
		} catch (error) {
			lastError = error as Error
			const isRateLimit =
				error instanceof Error &&
				(error.message.includes("rate") ||
				 error.message.includes("quota") ||
				 error.message.includes("429"))

			if (isRateLimit && attempt < maxRetries - 1) {
				// Exponential backoff: 1s, 2s, 4s
				const delayMs = RETRY_DELAY_BASE * Math.pow(2, attempt)
				console.warn(
					`[voyage] Rate limit hit, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`
				)
				await new Promise((resolve) => setTimeout(resolve, delayMs))
				continue
			}

			// Not a rate limit error or final attempt
			if (attempt === maxRetries - 1) {
				break
			}
		}
	}

	// All retries failed
	throw lastError || new Error("Failed to generate Voyage embedding")
}

/**
 * Check if Voyage AI is available
 */
export function isVoyageAvailable(): boolean {
	return !!env.VOYAGE_API_KEY
}
