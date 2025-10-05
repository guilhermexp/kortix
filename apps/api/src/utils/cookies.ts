export type CookieOptions = {
	maxAge?: number
	path?: string
	domain?: string
	secure?: boolean
	httpOnly?: boolean
	sameSite?: "lax" | "strict" | "none"
}

export function serializeCookie(
	name: string,
	value: string,
	options: CookieOptions = {},
) {
	const segments = [`${name}=${encodeURIComponent(value)}`]
	if (options.maxAge !== undefined)
		segments.push(`Max-Age=${Math.floor(options.maxAge)}`)
	if (options.domain) segments.push(`Domain=${options.domain}`)
	segments.push(`Path=${options.path ?? "/"}`)
	if (options.secure) segments.push("Secure")
	if (options.httpOnly !== false) segments.push("HttpOnly")
	if (options.sameSite) {
		segments.push(
			`SameSite=${options.sameSite.charAt(0).toUpperCase()}${options.sameSite.slice(1)}`,
		)
	}
	return segments.join("; ")
}

export function parseCookies(header: string | null): Record<string, string> {
	if (!header) return {}
	const out: Record<string, string> = {}
	const pairs = header.split(/; */)
	for (const pair of pairs) {
		const index = pair.indexOf("=")
		if (index < 0) continue
		const key = pair.slice(0, index).trim()
		const value = pair.slice(index + 1).trim()
		if (!key) continue
		out[key] = decodeURIComponent(value)
	}
	return out
}
