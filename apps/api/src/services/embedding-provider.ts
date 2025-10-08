import { env } from "../env"
import {
	ensureVectorSize,
	generateDeterministicEmbedding,
	VECTOR_SIZE,
} from "./embedding"
import { aiClient } from "./ai-provider"

const embeddingModel = aiClient?.getGenerativeModel({
	model: env.EMBEDDING_MODEL,
})

export async function generateEmbedding(text: string): Promise<number[]> {
	const normalizedText = text.trim()
	if (!normalizedText) {
		return new Array<number>(VECTOR_SIZE).fill(0)
	}

	if (!embeddingModel) {
		return ensureVectorSize(generateDeterministicEmbedding(normalizedText))
	}

	try {
		const result = await embeddingModel.embedContent({
			content: {
				parts: [{ text: normalizedText }],
			},
		})
		const values = result?.embedding?.values
		if (Array.isArray(values) && values.length > 0) {
			return ensureVectorSize(values, VECTOR_SIZE)
		}
	} catch (error) {
		console.warn(
			"Embedding provider failed, falling back to deterministic vector",
			error,
		)
	}

	return ensureVectorSize(generateDeterministicEmbedding(normalizedText))
}

export async function generateEmbeddingsBatch(
	texts: string[],
): Promise<number[][]> {
	const results: number[][] = []
	for (const text of texts) {
		// Process sequentially to respect provider rate limits.
		// Adjust to parallel batches if higher throughput is required later.
		// eslint-disable-next-line no-await-in-loop
		const embedding = await generateEmbedding(text)
		results.push(embedding)
	}
	return results
}
