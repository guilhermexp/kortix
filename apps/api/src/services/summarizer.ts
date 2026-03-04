import { TEXT_LIMITS } from "../config/constants"
import { grokChat } from "./grok"
import { summarizeWithGrok } from "./summarizer-fallback"

export async function generateSummary(
	text: string,
	context?: { title?: string | null; url?: string | null },
): Promise<string | null> {
	const trimmed = text.trim()
	if (!trimmed) return null
	return summarizeWithGrok(trimmed, context)
}

/**
 * Generate short category tags for a document using Grok.
 * Fallback: simple keyword extraction from title + text.
 */
export async function generateCategoryTags(
	text: string,
	context?: { title?: string | null; url?: string | null },
	opts?: { maxTags?: number; locale?: "pt-BR" | "en-US" },
): Promise<string[]> {
	const MAX_TAGS = Math.max(3, Math.min(opts?.maxTags ?? 6, 12))
	const trimmed = (context?.title ? `${context.title}\n` : "") + (text || "")
	const snippet = trimmed.slice(0, TEXT_LIMITS.ANALYSIS_MAX_CHARS)

	const fallback = (): string[] => {
		try {
			const source = (context?.title ? `${context.title}. ` : "") + snippet
			const words = source
				.toLowerCase()
				.replace(/[^a-zà-ú0-9\s_-]/gi, " ")
				.split(/\s+/)
				.filter((w) => w.length >= 4 && w.length <= 28)
			const stop = new Set([
				"sobre",
				"with",
				"para",
				"from",
				"this",
				"that",
				"como",
				"onde",
				"quando",
				"porque",
				"the",
				"and",
				"for",
				"com",
				"uma",
				"não",
				"dos",
				"das",
				"nos",
				"nas",
				"entre",
				"sobre",
				"mais",
				"less",
				"http",
				"https",
				"www",
				"github",
				"readme",
				"document",
				"summary",
				"resumo",
				"executivo",
				"executive",
				"overview",
				"introduction",
				"intro",
				"video",
				"image",
				"webpage",
				"pagina",
				"página",
				"file",
			])
			const freq = new Map<string, number>()
			for (const w of words) {
				if (stop.has(w)) continue
				freq.set(w, (freq.get(w) || 0) + 1)
			}
			const sorted = Array.from(freq.entries())
				.sort((a, b) => b[1] - a[1])
				.map(([w]) => w)
			const uniq: string[] = []
			for (const w of sorted) {
				if (uniq.includes(w)) continue
				uniq.push(w)
				if (uniq.length >= MAX_TAGS) break
			}
			return uniq.map((t) => t.trim()).filter(Boolean)
		} catch {
			return []
		}
	}

	try {
		const langHint = opts?.locale === "en-US" ? "English" : "Portuguese (pt-BR)"
		const prompt = [
			`Generate between 3 and ${MAX_TAGS} short, descriptive tags for the content below.`,
			"- Output only the tags, comma-separated.",
			"- No #, no sentences, all lowercase.",
			"- Use topical/category terms, not IDs.",
			context?.title ? `Title: ${context.title}` : null,
			"\nContent:",
			snippet,
			"\nRespond ONLY with the tags.",
			`Language: ${langHint}`,
		]
			.filter(Boolean)
			.join("\n")

		const raw =
			(
				await grokChat(
					[
						{ role: "system", content: "You generate concise topical tags." },
						{ role: "user", content: prompt },
					],
					{ maxTokens: 160, timeoutMs: 8_000 },
				)
			)?.trim() || ""
		if (!raw) return fallback()

		const parts = raw
			.replace(/^[-*•]\s*/gm, "")
			.split(/[,\n]+/)
			.map((s) => s.toLowerCase().trim())
			.map((s) => s.replace(/^#+/, "").trim())
			.map((s) => s.replace(/\s{2,}/g, " "))
			.filter(Boolean)

		const isValidTag = (tag: string): boolean => {
			if (!tag || tag.length < 2 || tag.length > 30) return false
			if (tag.startsWith("/") || tag.endsWith(":") || tag.endsWith("/"))
				return false
			if (/^[^a-z0-9]+$/i.test(tag)) return false
			if (
				/^(http|https|www|com|org|io|github|google|hugging|huggingface)$/i.test(
					tag,
				)
			)
				return false
			if (/^[a-z0-9-]+\.(com|org|io|net|co|ai)$/i.test(tag)) return false
			return true
		}

		const uniq: string[] = []
		for (const p of parts) {
			if (!p) continue
			if (!isValidTag(p)) continue
			if (uniq.includes(p)) continue
			uniq.push(p)
			if (uniq.length >= MAX_TAGS) break
		}

		return uniq.length > 0 ? uniq : fallback()
	} catch (err) {
		console.warn(
			"generateCategoryTags via Grok failed; using heuristic fallback",
			err,
		)
		return fallback()
	}
}
