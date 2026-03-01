import {
	ensureVectorSize,
	generateDeterministicEmbedding,
	VECTOR_SIZE,
} from "./embedding"
import {
	generateVoyageEmbedding,
	generateVoyageEmbeddingsBatch,
	isVoyageAvailable,
} from "./voyage-provider"

/**
 * Generate a single embedding. Uses Voyage AI (voyage-3-large via 302.ai)
 * with deterministic fallback.
 *
 * @param inputType - "query" for search queries, "document" for indexing (default)
 */
export async function generateEmbedding(
	text: string,
	options?: { inputType?: "query" | "document" },
): Promise<number[]> {
	const normalizedText = text.trim()
	if (!normalizedText) {
		return new Array<number>(VECTOR_SIZE).fill(0)
	}

	if (isVoyageAvailable()) {
		try {
			return await generateVoyageEmbedding(normalizedText, {
				inputType: options?.inputType ?? "document",
				truncation: true,
			})
		} catch (error) {
			console.warn(
				"[embedding] Voyage AI failed, falling back to deterministic",
				error instanceof Error ? error.message : error,
			)
		}
	}

	return ensureVectorSize(generateDeterministicEmbedding(normalizedText))
}

/**
 * Generate embeddings for multiple texts using Voyage's native batch API.
 * Falls back to one-by-one deterministic if Voyage is unavailable.
 */
export async function generateEmbeddingsBatch(
	texts: string[],
	options?: { inputType?: "query" | "document" },
): Promise<number[][]> {
	if (texts.length === 0) return []

	const inputType = options?.inputType ?? "document"

	// Sanitize: replace undefined/null with empty string
	const safeTexts = texts.map((t) => t ?? "")

	if (isVoyageAvailable()) {
		try {
			return await generateVoyageEmbeddingsBatch(safeTexts, {
				inputType,
				truncation: true,
			})
		} catch (error) {
			console.warn(
				"[embedding] Voyage batch failed, falling back to deterministic",
				error instanceof Error ? error.message : error,
			)
		}
	}

	// Deterministic fallback
	return safeTexts.map((text) => {
		const normalized = text.trim()
		if (!normalized) return new Array<number>(VECTOR_SIZE).fill(0)
		return ensureVectorSize(generateDeterministicEmbedding(normalized))
	})
}
