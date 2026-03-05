type SearchToolResultItem = {
	documentId?: string
	title?: string
	type?: string
	score?: number
	url?: string
	createdAt?: string
	updatedAt?: string
	summary?: string
	content?: string
	metadata?: Record<string, unknown>
	chunks?: Array<{ content?: string; score?: number }>
}

function normalize(value: string): string {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.trim()
}

const STOP_WORDS = new Set([
	"a",
	"o",
	"os",
	"as",
	"de",
	"da",
	"do",
	"das",
	"dos",
	"e",
	"em",
	"para",
	"por",
	"com",
	"sem",
	"na",
	"no",
	"nas",
	"nos",
	"um",
	"uma",
	"uns",
	"umas",
	"the",
	"and",
	"for",
	"with",
	"from",
	"into",
	"that",
	"this",
	"your",
	"you",
	"about",
	"in",
	"on",
	"to",
	"of",
])

function extractExactTerms(query: string): string[] {
	const terms = new Set<string>()
	const regex = /"([^"]+)"|'([^']+)'|`([^`]+)`/g
	for (const match of query.matchAll(regex)) {
		const raw = (match[1] ?? match[2] ?? match[3] ?? "").trim()
		if (raw.length > 0) terms.add(raw)
	}
	return Array.from(terms)
}

function tokenizeQuery(query: string): string[] {
	const normalized = normalize(query)
	return normalized
		.split(/[^a-z0-9_]+/g)
		.map((token) => token.trim())
		.filter(
			(token) => token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+$/.test(token),
		)
}

export function buildSearchVariants(
	query: string,
): Array<{ query: string; weight: number }> {
	const variants = new Map<string, number>()
	const add = (q: string, weight: number) => {
		const cleaned = q.trim()
		if (!cleaned) return
		const current = variants.get(cleaned)
		if (current === undefined || weight > current) {
			variants.set(cleaned, weight)
		}
	}

	add(query, 1)

	const exactTerms = extractExactTerms(query)
	for (const term of exactTerms.slice(0, 3)) {
		add(`"${term}"`, 1.25)
		add(term, 1.15)
	}

	const tokens = tokenizeQuery(query).slice(0, 8)
	if (tokens.length >= 2) {
		add(tokens.join(" "), 1.05)
	}
	for (let i = 0; i < Math.min(tokens.length, 6); i++) {
		const window2 = tokens.slice(i, i + 2)
		if (window2.length === 2) add(window2.join(" "), 0.92)
		const window3 = tokens.slice(i, i + 3)
		if (window3.length === 3) add(window3.join(" "), 0.96)
	}

	return Array.from(variants.entries())
		.map(([q, weight]) => ({ query: q, weight }))
		.sort((a, b) => b.weight - a.weight)
		.slice(0, 6)
}

type SearchPass = {
	query: string
	weight: number
	results: SearchToolResultItem[]
}

export function fuseSearchPasses(
	passes: SearchPass[],
	limit: number,
): SearchToolResultItem[] {
	const byDoc = new Map<
		string,
		{
			item: SearchToolResultItem
			score: number
			hits: number
			bestRawScore: number
		}
	>()

	for (const pass of passes) {
		for (let rank = 0; rank < pass.results.length; rank++) {
			const result = pass.results[rank]
			const docId = result.documentId
			if (!docId) continue
			const rankScore = pass.weight * (1 / (rank + 10))
			const semanticScore =
				typeof result.score === "number" ? result.score * 0.35 * pass.weight : 0
			const combined = rankScore + semanticScore

			const current = byDoc.get(docId)
			if (!current) {
				byDoc.set(docId, {
					item: result,
					score: combined,
					hits: 1,
					bestRawScore: typeof result.score === "number" ? result.score : 0,
				})
				continue
			}

			current.score += combined
			current.hits += 1
			if (typeof result.score === "number") {
				current.bestRawScore = Math.max(current.bestRawScore, result.score)
			}
			if (!current.item.summary && result.summary) current.item.summary = result.summary
			if ((!current.item.chunks || current.item.chunks.length === 0) && result.chunks) {
				current.item.chunks = result.chunks
			}
			if (!current.item.url && result.url) current.item.url = result.url
		}
	}

	return Array.from(byDoc.values())
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score
			if (b.hits !== a.hits) return b.hits - a.hits
			return b.bestRawScore - a.bestRawScore
		})
		.slice(0, limit)
		.map((entry) => ({
			...entry.item,
			score: entry.bestRawScore > 0 ? entry.bestRawScore : entry.score,
			metadata: {
				...(entry.item.metadata ?? {}),
				searchSignals: {
					fusedScore: entry.score,
					passHits: entry.hits,
				},
			},
		}))
}
