export type Chunk = {
	content: string
	position: number
}

export function chunkText(
	content: string,
	options?: { size?: number; overlap?: number },
): Chunk[] {
	const size = options?.size ?? 800
	const overlap = Math.min(options?.overlap ?? 120, size - 1)

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
