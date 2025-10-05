import { env } from "../env"

export const VECTOR_SIZE = env.EMBEDDING_DIMENSION

export function generateDeterministicEmbedding(text: string): number[] {
	const bytes = new TextEncoder().encode(text)
	if (bytes.length === 0) {
		return Array(VECTOR_SIZE).fill(0)
	}

	const result = new Array<number>(VECTOR_SIZE)
	let accumulator = 0

	for (let i = 0; i < VECTOR_SIZE; i++) {
		const value = bytes[i % bytes.length]
		accumulator = (accumulator + value + i) % 512
		result[i] = accumulator / 256 - 1 // Normalize to roughly [-1, 1]
	}

	return result
}

export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error("Embedding vectors must have the same length")
	}

	let dot = 0
	let normA = 0
	let normB = 0

	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}

	const denominator = Math.sqrt(normA) * Math.sqrt(normB)
	if (denominator === 0) return 0
	return Math.max(-1, Math.min(1, dot / denominator))
}

export function ensureVectorSize(
	values: number[],
	size: number = VECTOR_SIZE,
): number[] {
	if (values.length === 0) {
		return new Array(size).fill(0)
	}
	if (values.length === size) return values.slice()

	if (values.length > size) {
		return values.slice(0, size)
	}

	const result = new Array<number>(size).fill(0)
	for (let i = 0; i < size; i++) {
		result[i] = values[i % values.length]
	}
	return result
}
