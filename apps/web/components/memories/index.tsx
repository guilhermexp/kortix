type SourceDocumentLike = {
	type?: string | null
	customId?: string | null
	url?: string | null
}

type MemoryDocumentLike = {
	summary?: string | null
	content?: string | null
	metadata?: Record<string, unknown> | null
	raw?: Record<string, unknown> | null
	memoryEntries?: Array<{ isForgotten?: boolean; memory?: string | null }>
	[key: string]: unknown
}

export const formatDate = (date: string | Date) => {
	const dateObj = new Date(date)
	const now = new Date()
	const currentYear = now.getFullYear()
	const dateYear = dateObj.getFullYear()

	const monthNames = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	]
	const month = monthNames[dateObj.getMonth()]
	const day = dateObj.getDate()

	const getOrdinalSuffix = (n: number) => {
		const suffixes = ["th", "st", "nd", "rd"] as const
		const v = n % 100
		const suffix = suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]
		return `${n}${suffix}`
	}

	const formattedDay = getOrdinalSuffix(day)

	if (dateYear !== currentYear) {
		return `${month} ${formattedDay}, ${dateYear}`
	}

	return `${month} ${formattedDay}`
}

export const getSourceUrl = (document: SourceDocumentLike): string | undefined => {
	if (document.type === "google_doc" && document.customId) {
		return `https://docs.google.com/document/d/${document.customId}`
	}
	if (document.type === "google_sheet" && document.customId) {
		return `https://docs.google.com/spreadsheets/d/${document.customId}`
	}
	if (document.type === "google_slide" && document.customId) {
		return `https://docs.google.com/presentation/d/${document.customId}`
	}
	// Fallback to existing URL for all other document types
	return document.url ?? undefined
}

// Strip common Markdown syntax to show clean previews in cards
export const stripMarkdown = (input: string): string => {
	try {
		let text = input
		// Normalize line endings
		text = text.replace(/\r\n?/g, "\n")
		// Remove code fences (keep inner content)
		text = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ""))
		// Inline code - unwrap backticks
		text = text.replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
		// Images ![alt](url) -> alt
		text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
		// Links [text](url) -> text
		text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
		// Remove standalone URLs (to prevent remarkGfm autolinks)
		text = text.replace(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi, "")
		// Remove reference-style links [text][id] and their definitions [id]: url
		text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
		text = text.replace(/^\[[^\]]+\]:\s*.*$/gm, "")
		// Bold/italic **text** *text* __text__ _text_
		text = text.replace(/(\*\*|__)(.*?)\1/g, "$2")
		text = text.replace(/(\*|_)(.*?)\1/g, "$2")
		// Headings starting with # - AGGRESSIVE REMOVAL
		text = text.replace(/^#+\s*/gm, "") // Remove # at start of lines (any count)
		text = text.replace(/#+\s+/g, " ") // Replace # followed by space with just space
		text = text.replace(/^#+/gm, "") // Remove any remaining # at start of lines
		text = text.replace(/#/g, "") // Remove ALL remaining # characters
		// Blockquotes >
		text = text.replace(/^>\s?/gm, "")
		// Lists (-, *, +, 1.)
		text = text.replace(/^\s*([-*+]\s+)/gm, "")
		text = text.replace(/^\s*\d+\.\s+/gm, "")
		// Horizontal rules
		text = text.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, "")
		// Strip simple HTML tags
		text = text.replace(/<[^>]+>/g, "")
		// Collapse whitespace
		text = text.replace(/[ \t\f\v]+/g, " ")
		text = text.replace(/\n{2,}/g, "\n")
		return text.trim()
	} catch {
		return input
	}
}

// Get the full formatted summary WITH markdown (for expanded dialog view)
export const getDocumentSummaryFormatted = (
	document: MemoryDocumentLike,
): string | null => {
	try {
		const anyDoc = document as any
		const raw =
			anyDoc?.raw && typeof anyDoc.raw === "object" ? anyDoc.raw : null
		const extraction =
			raw?.extraction && typeof raw.extraction === "object"
				? raw.extraction
				: null
		const metadata =
			anyDoc?.metadata && typeof anyDoc.metadata === "object"
				? anyDoc.metadata
				: null

		const firstActiveMemory = Array.isArray(anyDoc?.memoryEntries)
			? anyDoc.memoryEntries.find(
					(m: any) => !m?.isForgotten && typeof m?.memory === "string",
				)?.memory
			: undefined

		const candidates = [
			typeof anyDoc?.summary === "string" ? anyDoc.summary : undefined,
			typeof metadata?.description === "string"
				? metadata.description
				: undefined,
			typeof raw?.description === "string" ? raw.description : undefined,
			typeof extraction?.description === "string"
				? extraction.description
				: undefined,
			typeof extraction?.analysis === "string"
				? extraction.analysis
				: undefined,
			typeof raw?.analysis === "string" ? raw.analysis : undefined,
			firstActiveMemory,
			typeof anyDoc?.content === "string" ? anyDoc.content : undefined,
		].filter(Boolean) as string[]

		if (candidates.length === 0) return null

		// Return the summary WITH markdown formatting intact
		// Just clean up extra whitespace but preserve ## headers and bullets
		const firstCandidate = candidates[0]
		if (!firstCandidate) return null
		const text = firstCandidate.trim().replace(/\n{3,}/g, "\n\n") // Collapse multiple newlines

		return text || null
	} catch {
		return null
	}
}

// Build a more diverse snippet preferring summary > analysis > first memory > content
// This strips markdown for card previews
export const getDocumentSnippet = (
	document: MemoryDocumentLike,
): string | null => {
	try {
		const anyDoc = document as any
		const raw =
			anyDoc?.raw && typeof anyDoc.raw === "object" ? anyDoc.raw : null
		const extraction =
			raw?.extraction && typeof raw.extraction === "object"
				? raw.extraction
				: null
		const metadata =
			anyDoc?.metadata && typeof anyDoc.metadata === "object"
				? anyDoc.metadata
				: null

		const firstActiveMemory = Array.isArray(anyDoc?.memoryEntries)
			? anyDoc.memoryEntries.find(
					(m: any) => !m?.isForgotten && typeof m?.memory === "string",
				)?.memory
			: undefined

		const candidates = [
			typeof anyDoc?.summary === "string" ? anyDoc.summary : undefined,
			typeof metadata?.description === "string"
				? metadata.description
				: undefined,
			typeof raw?.description === "string" ? raw.description : undefined,
			typeof extraction?.description === "string"
				? extraction.description
				: undefined,
			typeof extraction?.analysis === "string"
				? extraction.analysis
				: undefined,
			typeof raw?.analysis === "string" ? raw.analysis : undefined,
			firstActiveMemory,
			typeof anyDoc?.content === "string" ? anyDoc.content : undefined,
		].filter(Boolean) as string[]

		if (candidates.length === 0) return null
		const firstCandidate = candidates[0]
		if (!firstCandidate) return null
		const cleaned = stripMarkdown(firstCandidate)

		// Remove generic heading lines like "RESUMO EXECUTIVO --" at the start
		const sanitizeHeading = (text: string): string => {
			const GENERIC = new Set([
				"RESUMO EXECUTIVO",
				"RESUMO",
				"EXECUTIVE SUMMARY",
				"SUMMARY",
				"OVERVIEW",
				"INTRODUÇÃO",
				"INTRODUCTION",
			])
			const lines = text.split(/\n+/)
			let i = 0
			while (i < lines.length) {
				const original = lines[i]
				if (!original) {
					i++
					continue
				}
				const trimmed = original.trim()
				if (!trimmed) {
					i++
					continue
				}
				// Remove leading bullet/dashes and trailing separators for heading detection
				const head = trimmed
					.replace(/^[-–—•*+>\s]+/, "")
					.replace(/[-–—•:\s]+$/, "")
				const upper = head.toUpperCase()
				const isGeneric =
					GENERIC.has(upper) ||
					upper.startsWith("RESUMO EXECUTIVO") ||
					upper.startsWith("EXECUTIVE SUMMARY") ||
					upper === "RESUMO" ||
					upper === "SUMMARY"
				if (isGeneric && head.length <= 40) {
					i++
					continue
				}
				break
			}
			const rest = lines.slice(i).join("\n").trim()
			return rest || text
		}

		const body = sanitizeHeading(cleaned)
		const trimmed = body
			.replace(/^['"“”‘’`]+/, "")
			.replace(/['"“”‘’`]+$/, "")
			.trim()
		return trimmed || null
	} catch {
		return null
	}
}
