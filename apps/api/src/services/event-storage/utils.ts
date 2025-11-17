export class ConversationStorageUnavailableError extends Error {
	constructor(message = "Conversation storage tables are not available") {
		super(message)
		this.name = "ConversationStorageUnavailableError"
	}
}

export function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

export function isTableMissingError(error: unknown, table: string): boolean {
	if (!error || typeof error !== "object") return false
	const code = (error as { code?: string }).code
	if (code === "42P01") return true
	if (code === "42501") return true
	const message = String((error as { message?: string }).message ?? "")
	if (!message) return false
	const normalizedTable = table.startsWith("public.")
		? table
		: `public.${table}`
	return (
		message.includes("does not exist") ||
		message.includes(`Could not find the table '${normalizedTable}'`) ||
		message.includes(`Could not find the table '${table}'`)
	)
}

export function handleTableMissing(error: unknown, table: string): never {
	if (isTableMissingError(error, table)) {
		throw new ConversationStorageUnavailableError(
			`Supabase table ${table} não existe. Execute a migration das conversas antes de habilitar o histórico.`,
		)
	}
	throw error
}

export function parseToolUseContent(
	value: unknown,
): { id?: string; name?: string; input?: unknown } | null {
	if (!isPlainObject(value)) return null
	const type = (value as { type?: string }).type
	if (type && type !== "tool_use") return null
	return {
		id:
			typeof (value as { id?: unknown }).id === "string"
				? (value as { id: string }).id
				: undefined,
		name:
			typeof (value as { name?: unknown }).name === "string"
				? (value as { name: string }).name
				: undefined,
		input:
			"input" in (value as Record<string, unknown>)
				? (value as { input: unknown }).input
				: undefined,
	}
}

export function parseToolResultContent(
	value: unknown,
): { tool_use_id?: string; content?: unknown; is_error?: boolean } | null {
	if (!isPlainObject(value)) return null
	const type = (value as { type?: string }).type
	if (type && type !== "tool_result") return null
	return {
		tool_use_id:
			typeof (value as { tool_use_id?: unknown }).tool_use_id === "string"
				? (value as { tool_use_id: string }).tool_use_id
				: undefined,
		content:
			"content" in (value as Record<string, unknown>)
				? (value as { content: unknown }).content
				: undefined,
		is_error:
			typeof (value as { is_error?: unknown }).is_error === "boolean"
				? (value as { is_error: boolean }).is_error
				: undefined,
	}
}

export function extractTextFromContent(content: unknown): string {
	if (typeof content === "string") return content
	if (typeof content === "object" && content !== null) {
		if (
			"text" in (content as Record<string, unknown>) &&
			typeof (content as { text: unknown }).text === "string"
		) {
			return (content as { text: string }).text
		}
		if (Array.isArray(content)) {
			const textParts: string[] = []
			for (const item of content) {
				if (typeof item === "string") textParts.push(item)
				else if (
					typeof item === "object" &&
					item !== null &&
					"text" in (item as Record<string, unknown>)
				) {
					const text = (item as { text: unknown }).text
					if (typeof text === "string") textParts.push(text)
				}
			}
			return textParts.join(" ")
		}
	}
	return ""
}
