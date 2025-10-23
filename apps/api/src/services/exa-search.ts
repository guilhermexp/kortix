import { randomUUID } from "node:crypto"
import { env } from "../env"

export type ExaWebResult = {
	id: string
	title: string | null
	url: string | null
	snippet: string | null
	score: number | null
	publishedAt?: string | null
}

export type ExaSearchOptions = {
	limit?: number
	query?: string
	boostRecency?: boolean
	includeDomains?: string[]
}

export async function searchWebWithExa(
	query: string,
	options: ExaSearchOptions = {},
): Promise<ExaWebResult[]> {
	if (!env.EXA_API_KEY) {
		return []
	}

	const limit = Math.max(1, Math.min(options.limit ?? 5, 20))

	const payload: Record<string, unknown> = {
		query,
		numResults: limit,
		type: "neural",
		useAutoprompt: true,
	}

	if (
		Array.isArray(options.includeDomains) &&
		options.includeDomains.length > 0
	) {
		payload.includeDomains = options.includeDomains
	}

	if (options.boostRecency) {
		payload.useAutoprompt = false
		payload.dateRange = "past_year"
	}

	try {
		const response = await fetch("https://api.exa.ai/search", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.EXA_API_KEY}`,
			},
			body: JSON.stringify(payload),
		})

		if (!response.ok) {
			console.warn(
				"searchWebWithExa failed",
				response.status,
				response.statusText,
			)
			return []
		}

		const data = (await response.json()) as Record<string, unknown>
		const rawResults: Record<string, unknown>[] = Array.isArray(data.results)
			? (data.results as Record<string, unknown>[])
			: Array.isArray(data.data)
				? (data.data as Record<string, unknown>[])
				: []

		return rawResults.map((item) => {
			const summary = extractSummary(item)
			const scoreCandidate =
				typeof item.score === "number"
					? (item.score as number)
					: typeof item.relevanceScore === "number"
						? (item.relevanceScore as number)
						: undefined

			return {
				id:
					typeof item.id === "string"
						? (item.id as string)
						: typeof item.url === "string"
							? (item.url as string)
							: randomUUID(),
				title: typeof item.title === "string" ? (item.title as string) : null,
				url: typeof item.url === "string" ? (item.url as string) : null,
				snippet: summary,
				score: normalizeScore(scoreCandidate),
				publishedAt:
					typeof item.publishedDate === "string"
						? (item.publishedDate as string)
						: typeof item.published_at === "string"
							? (item.published_at as string)
							: null,
			}
		})
	} catch (error) {
		console.warn("searchWebWithExa error", error)
		return []
	}
}

function extractSummary(
	item: Record<string, unknown> | null | undefined,
): string | null {
	if (!item) return null

	if (typeof item.summary === "string") {
		return item.summary as string
	}
	const summaryObject = item.summary as Record<string, unknown> | undefined
	if (summaryObject && typeof summaryObject.text === "string") {
		return summaryObject.text as string
	}
	const highlights = item.highlights
	if (Array.isArray(highlights) && highlights.length > 0) {
		return highlights
			.map((highlight) =>
				typeof highlight === "string"
					? highlight
					: highlight &&
							typeof highlight === "object" &&
							typeof (highlight as Record<string, unknown>).text === "string"
						? ((highlight as Record<string, unknown>).text as string)
						: "",
			)
			.filter((text) => text.length > 0)
			.join(" ")
	}
	if (typeof item.snippet === "string") return item.snippet as string
	return null
}

function normalizeScore(rawScore: unknown): number | null {
	if (typeof rawScore === "number" && Number.isFinite(rawScore)) {
		return Math.max(0, Math.min(1, rawScore))
	}
	return null
}
