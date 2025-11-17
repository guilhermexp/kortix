export type JsonRecord = Record<string, unknown>

export function sanitizeString(value: string): string {
	return value.replace(
		/([\uD800-\uDBFF])(?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])([\uDC00-\uDFFF])/g,
		"\uFFFD",
	)
}

export function sanitizeJson(value: unknown): unknown {
	if (value == null) return value
	if (typeof value === "string") return sanitizeString(value)
	if (typeof value === "number" || typeof value === "boolean") return value
	if (value instanceof Date) return value.toISOString()
	if (Array.isArray(value)) {
		return value
			.map((item) => sanitizeJson(item))
			.filter((item) => item !== undefined)
	}
	if (typeof value === "object") {
		const out: Record<string, unknown> = {}
		for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
			if (val === undefined || typeof val === "function") continue
			out[key] = sanitizeJson(val)
		}
		return out
	}
	return null
}

export function isJsonRecord(value: unknown): value is JsonRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function mergeRecords(
	...records: Array<JsonRecord | null | undefined>
): JsonRecord {
	const out: JsonRecord = {}
	for (const record of records) {
		if (!isJsonRecord(record)) continue
		for (const [key, val] of Object.entries(record)) {
			if (val === undefined) continue
			out[key] = val
		}
	}
	return out
}

export function sanitizeProcessingMetadata(
	metadata?: Record<string, unknown> | null,
): Record<string, unknown> | null {
	if (!metadata) return null
	const { extractionResult, ...rest } = metadata
	const sanitized: Record<string, unknown> = { ...rest }
	const processingDate = sanitized.processingDate
	if (processingDate instanceof Date) {
		sanitized.processingDate = processingDate.toISOString()
	}
	return sanitized
}
