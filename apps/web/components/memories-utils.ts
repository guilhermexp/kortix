import type { DocumentWithMemories } from "@ui/memory-graph/types"

/**
 * Formats a date in a human-readable format.
 * Shows just "Month Day" for current year, or "Month Day, Year" for other years.
 */
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

/**
 * Gets the appropriate source URL for a document.
 * Handles special cases like Google Docs/Sheets/Slides.
 */
export const getSourceUrl = (document: DocumentWithMemories) => {
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
	return document.url
}

/**
 * Generates a consistent pastel background color for a given seed string.
 * Uses a simple hash function to ensure the same string always produces the same color.
 */
export const getPastelBackgroundColor = (seed: string): string => {
	// Simple hash function to convert string to number
	let hash = 0
	for (let i = 0; i < seed.length; i++) {
		const char = seed.charCodeAt(i)
		hash = (hash << 5) - hash + char
		hash = hash & hash // Convert to 32-bit integer
	}

	// Use hash to generate pastel colors
	// Pastel colors have high lightness and moderate saturation
	const hue = Math.abs(hash % 360)
	const saturation = 25 + (Math.abs(hash) % 20) // 25-45% saturation
	const lightness = 15 + (Math.abs(hash >> 8) % 10) // 15-25% lightness for dark mode

	return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}
