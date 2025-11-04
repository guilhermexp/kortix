export type Chunk = {
	content: string
	position: number
}

export function chunkText(
	content: string,
	options?: { size?: number; overlap?: number },
): Chunk[] {
	// Increased to 1000 chars to reduce total chunks for large documents
	// Gemini embedding API can handle this safely (~20K token limit)
	// This reduces API calls and prevents timeouts on large spreadsheets
	const size = options?.size ?? 1000
	const overlap = Math.min(options?.overlap ?? 200, size - 1)

	if (content.length <= size) {
		return [{ content, position: 0 }]
	}

	const chunks: Chunk[] = []
	let index = 0
	let position = 0

	while (index < content.length) {
		const end = Math.min(content.length, index + size)
		const slice = content.slice(index, end)
		chunks.push({ content: slice, position })
		index += size - overlap
		position += 1
	}

	return chunks
}
