/**
 * NotebookLM Authentication
 * Manages Google session cookies, CSRF token (SNlM0e), and session ID (FdrFJe).
 */

import { AuthError, NOTEBOOKLM_HOME } from "./types"

// Cookie domains to capture from Google login
const GOOGLE_COOKIE_DOMAINS = [
	".google.com",
	"notebooklm.google.com",
	".googleusercontent.com",
	".google.com.sg",
	".google.co.uk",
	".google.de",
	".google.fr",
	".google.co.jp",
	".google.com.br",
	".google.com.au",
]

// Minimum required cookie for authentication
const REQUIRED_COOKIE = "SID"

export interface StoredCookies {
	/** Raw cookie string for Cookie header (e.g. "SID=xxx; HSID=yyy; ...") */
	cookieHeader: string
	/** Individual cookies as key-value pairs */
	cookies: Record<string, string>
}

export interface AuthTokens {
	cookies: StoredCookies
	csrfToken: string
	sessionId: string
}

/**
 * Extract CSRF token (SNlM0e) from NotebookLM homepage HTML.
 * The token is embedded in WIZ_global_data JavaScript object.
 */
export function extractCsrfToken(html: string): string {
	const match = html.match(/"SNlM0e"\s*:\s*"([^"]+)"/)
	if (!match?.[1]) {
		throw new AuthError(
			"Failed to extract CSRF token (SNlM0e) from NotebookLM page. Session may have expired.",
		)
	}
	return match[1]
}

/**
 * Extract session ID (FdrFJe) from NotebookLM homepage HTML.
 */
export function extractSessionId(html: string): string {
	const match = html.match(/"FdrFJe"\s*:\s*"([^"]+)"/)
	if (!match?.[1]) {
		throw new AuthError(
			"Failed to extract session ID (FdrFJe) from NotebookLM page. Session may have expired.",
		)
	}
	return match[1]
}

/**
 * Parse Playwright-format storage_state.json into cookie header string.
 * Playwright stores cookies as: { cookies: [{ name, value, domain, ... }] }
 */
export function parsePlaywrightCookies(storageState: {
	cookies: Array<{ name: string; value: string; domain: string }>
}): StoredCookies {
	const cookies: Record<string, string> = {}

	for (const cookie of storageState.cookies) {
		const isGoogleDomain = GOOGLE_COOKIE_DOMAINS.some(
			(domain) =>
				cookie.domain === domain || cookie.domain.endsWith(domain),
		)
		if (isGoogleDomain) {
			// .google.com domain takes priority over regional domains
			if (
				cookie.domain === ".google.com" ||
				!cookies[cookie.name]
			) {
				cookies[cookie.name] = cookie.value
			}
		}
	}

	if (!cookies[REQUIRED_COOKIE]) {
		throw new AuthError(
			`Missing required cookie: ${REQUIRED_COOKIE}. Please re-authenticate with Google.`,
		)
	}

	const cookieHeader = Object.entries(cookies)
		.map(([name, value]) => `${name}=${value}`)
		.join("; ")

	return { cookieHeader, cookies }
}

/**
 * Parse raw cookies from browser (document.cookie format or key=value pairs).
 */
export function parseRawCookies(raw: string): StoredCookies {
	const cookies: Record<string, string> = {}

	for (const part of raw.split(";")) {
		const [name, ...rest] = part.trim().split("=")
		if (name && rest.length > 0) {
			cookies[name.trim()] = rest.join("=").trim()
		}
	}

	if (!cookies[REQUIRED_COOKIE]) {
		throw new AuthError(
			`Missing required cookie: ${REQUIRED_COOKIE}. Please re-authenticate with Google.`,
		)
	}

	const cookieHeader = Object.entries(cookies)
		.map(([name, value]) => `${name}=${value}`)
		.join("; ")

	return { cookieHeader, cookies }
}

/**
 * Fetch CSRF token and session ID from NotebookLM homepage using stored cookies.
 */
export async function fetchTokens(cookies: StoredCookies): Promise<{
	csrfToken: string
	sessionId: string
}> {
	const response = await fetch(NOTEBOOKLM_HOME, {
		headers: {
			Cookie: cookies.cookieHeader,
			"User-Agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
			Accept:
				"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": "en-US,en;q=0.9",
		},
		redirect: "follow",
	})

	if (!response.ok) {
		throw new AuthError(
			`Failed to access NotebookLM (HTTP ${response.status}). Cookies may have expired.`,
		)
	}

	const html = await response.text()
	const csrfToken = extractCsrfToken(html)
	const sessionId = extractSessionId(html)

	return { csrfToken, sessionId }
}

/**
 * Build full AuthTokens from stored cookies.
 * Fetches the NotebookLM homepage to extract CSRF token and session ID.
 */
export async function buildAuthTokens(
	cookies: StoredCookies,
): Promise<AuthTokens> {
	const { csrfToken, sessionId } = await fetchTokens(cookies)
	return { cookies, csrfToken, sessionId }
}

/**
 * Refresh tokens by re-fetching the NotebookLM homepage.
 * Called when a request fails with auth error.
 */
export async function refreshAuthTokens(
	current: AuthTokens,
): Promise<AuthTokens> {
	const { csrfToken, sessionId } = await fetchTokens(current.cookies)
	return {
		cookies: current.cookies,
		csrfToken,
		sessionId,
	}
}
