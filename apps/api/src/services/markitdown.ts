const MARKITDOWN_INTERNAL_URL =
	process.env.MARKITDOWN_INTERNAL_URL ||
	"http://markitdown.railway.internal:5000"
const MARKITDOWN_PUBLIC_URL = process.env.MARKITDOWN_PUBLIC_URL || ""

const REQUEST_TIMEOUT = 60_000 // 60 seconds
const MAX_RETRIES = 2
const HEALTH_CHECK_TTL = 30_000 // 30 seconds

let lastHealthCheck: { healthy: boolean; timestamp: number } | null = null

type MarkItDownResponse = {
	markdown: string
	metadata: {
		filename?: string
		title?: string
		size_bytes?: number
		markdown_length?: number
		url?: string
	}
}

type ConversionError = {
	error: string
	message: string
	type?: string
}

function isMarkItDownError(data: unknown): data is ConversionError {
	return typeof data === "object" && data !== null && "error" in data
}

async function fetchWithTimeout(
	url: string,
	options: RequestInit,
	timeout: number,
): Promise<Response> {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), timeout)

	try {
		const response = await fetch(url, {
			...options,
			signal: controller.signal,
		})
		clearTimeout(timeoutId)
		return response
	} catch (error) {
		clearTimeout(timeoutId)
		throw error
	}
}

async function tryConvert(
	url: string,
	body: FormData | string,
	headers: Record<string, string>,
	endpoint: "/convert" | "/convert/url" = "/convert",
): Promise<MarkItDownResponse> {
	const response = await fetchWithTimeout(
		`${url}${endpoint}`,
		{
			method: "POST",
			headers,
			body,
		},
		REQUEST_TIMEOUT,
	)

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}))
		if (isMarkItDownError(errorData)) {
			throw new Error(
				`MarkItDown conversion failed: ${errorData.message} (${errorData.type || "unknown"})`,
			)
		}
		throw new Error(`MarkItDown returned status ${response.status}`)
	}

	return await response.json()
}

export async function convertWithMarkItDown(
	buffer: Buffer,
	filename?: string,
): Promise<MarkItDownResponse> {
	const formData = new FormData()
	formData.append("file", new Blob([buffer]), filename || "document")

	const headers: Record<string, string> = {}
	if (filename) {
		headers["X-Filename"] = filename
	}

	let lastError: Error | null = null

	// Try internal URL first (Railway private network)
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			return await tryConvert(MARKITDOWN_INTERNAL_URL, formData, headers)
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))
			console.warn(
				`MarkItDown internal URL attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
				lastError.message,
			)

			if (attempt < MAX_RETRIES) {
				// Exponential backoff
				await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000))
			}
		}
	}

	// Try public URL as fallback
	if (MARKITDOWN_PUBLIC_URL) {
		try {
			console.log("Falling back to MarkItDown public URL")
			return await tryConvert(MARKITDOWN_PUBLIC_URL, formData, headers)
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))
			console.error("MarkItDown public URL also failed:", lastError.message)
		}
	}

	throw lastError || new Error("MarkItDown conversion failed after all retries")
}

export async function convertUrlWithMarkItDown(
	url: string,
): Promise<MarkItDownResponse> {
	const body = JSON.stringify({ url })
	const headers = {
		"Content-Type": "application/json",
	}

	let lastError: Error | null = null

	// Try internal URL first
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			return await tryConvert(
				MARKITDOWN_INTERNAL_URL,
				body,
				headers,
				"/convert/url",
			)
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))
			console.warn(
				`MarkItDown URL conversion attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
				lastError.message,
			)

			if (attempt < MAX_RETRIES) {
				await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000))
			}
		}
	}

	// Try public URL as fallback
	if (MARKITDOWN_PUBLIC_URL) {
		try {
			console.log("Falling back to MarkItDown public URL for URL conversion")
			return await tryConvert(
				MARKITDOWN_PUBLIC_URL,
				body,
				headers,
				"/convert/url",
			)
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))
			console.error("MarkItDown public URL also failed:", lastError.message)
		}
	}

	throw (
		lastError || new Error("MarkItDown URL conversion failed after all retries")
	)
}

async function probeHealth(url: string): Promise<boolean> {
	try {
		const response = await fetchWithTimeout(
			`${url}/health`,
			{ method: "GET" },
			5_000,
		)
		return response.ok
	} catch {
		return false
	}
}

export async function checkMarkItDownHealth(force = false): Promise<boolean> {
	const now = Date.now()
	if (
		!force &&
		lastHealthCheck &&
		now - lastHealthCheck.timestamp < HEALTH_CHECK_TTL
	) {
		return lastHealthCheck.healthy
	}

	const urls = [MARKITDOWN_INTERNAL_URL, MARKITDOWN_PUBLIC_URL].filter(
		(value): value is string => Boolean(value),
	)

	for (const url of urls) {
		const healthy = await probeHealth(url)
		if (healthy) {
			lastHealthCheck = { healthy: true, timestamp: now }
			return true
		}
	}

	lastHealthCheck = { healthy: false, timestamp: now }
	return false
}
