export function normalizeForHeuristic(value: string): string {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.trim()
}

export function extractExactTerms(query: string): string[] {
	const terms = new Set<string>()
	const regex = /"([^"]+)"|'([^']+)'|`([^`]+)`/g
	for (const match of query.matchAll(regex)) {
		const raw = match[1] ?? match[2] ?? match[3] ?? ""
		const normalized = normalizeForHeuristic(raw)
		if (normalized.length > 0) {
			terms.add(normalized)
		}
	}
	return Array.from(terms)
}

export function includesNormalizedTerm(
	text: string | null | undefined,
	normalizedTerm: string,
): boolean {
	if (!text) return false
	return normalizeForHeuristic(text).includes(normalizedTerm)
}

export function isExploratoryQuery(query: string): boolean {
	const normalized = normalizeForHeuristic(query)
	if (!normalized) return false

	// Generic "show me what's available" patterns where broad fallback helps.
	const exploratoryPatterns = [
		"o que eu tenho",
		"o que tem",
		"quais documentos",
		"mostre meus documentos",
		"listar documentos",
		"lista de documentos",
		"show my documents",
		"list documents",
		"what do i have",
		"recent documents",
		"latest documents",
	]

	return exploratoryPatterns.some((pattern) => normalized.includes(pattern))
}
