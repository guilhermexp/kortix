/**
 * NotebookLM Authentication Module
 * Uses chrome.cookies API to read Google session cookies
 * and returns them to the caller (web app).
 *
 * The web app is responsible for sending the cookies to the Kortix API
 * (it already has a valid session — no need for extension to authenticate).
 */
import { STORAGE_KEYS } from "./constants"

const REQUIRED_NLM_COOKIE_NAMES = new Set([
	"SID",
	"__Secure-1PSID",
	"__Secure-3PSID",
	"SAPISID",
])

function hasRequiredNlmCookie(cookieHeader: string): boolean {
	return [...REQUIRED_NLM_COOKIE_NAMES].some((name) =>
		cookieHeader.includes(`${name}=`),
	)
}

export async function getStoredNlmCookies(): Promise<string | null> {
	const result = await chrome.storage.local.get([
		STORAGE_KEYS.NLM_COOKIE_HEADER,
		STORAGE_KEYS.NLM_CAPTURED_AT,
	])
	const cookieHeader = result[STORAGE_KEYS.NLM_COOKIE_HEADER] as
		| string
		| undefined
	if (!cookieHeader || !hasRequiredNlmCookie(cookieHeader)) {
		return null
	}
	return cookieHeader
}

export function captureNlmCookiesFromRequest(
	details: { url: string; requestHeaders?: Array<{ name: string; value?: string }> },
): void {
	if (!details.url.includes("notebooklm.google.com")) return
	const cookieHeader = details.requestHeaders?.find(
		(h: { name: string; value?: string }) => h.name.toLowerCase() === "cookie",
	)?.value
	if (!cookieHeader || !hasRequiredNlmCookie(cookieHeader)) return
	void chrome.storage.local.set({
		[STORAGE_KEYS.NLM_COOKIE_HEADER]: cookieHeader,
		[STORAGE_KEYS.NLM_CAPTURED_AT]: Date.now(),
	})
}

/**
 * Capture NotebookLM cookies and return them.
 * Uses chrome.cookies.getAll() to get all cookies (including HttpOnly)
 * for notebooklm.google.com.
 */
export async function captureNlmCookies(): Promise<{
	success: boolean
	cookies?: string
	error?: string
}> {
	try {
		const stored = await getStoredNlmCookies()
		if (stored) {
			return { success: true, cookies: stored }
		}

		const requiredNames = new Set([
			"SID",
			"__Secure-1PSID",
			"__Secure-3PSID",
			"SAPISID",
		])
		const maxAttempts = 15

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			// Keep polling for a while to allow real login completion in the popup.
			// This avoids the flaky one-shot capture.
			await new Promise((r) => setTimeout(r, 2000))

			const [nlmCookies, googleCookies] = await Promise.all([
				chrome.cookies.getAll({
					url: "https://notebooklm.google.com",
				}),
				chrome.cookies.getAll({
					domain: ".google.com",
				}),
			])

			const unique = new Map<string, chrome.cookies.Cookie>()
			for (const cookie of [...nlmCookies, ...googleCookies]) {
				unique.set(`${cookie.domain}|${cookie.path}|${cookie.name}`, cookie)
			}
			const cookies = Array.from(unique.values())

			if (!cookies.length) {
				continue
			}

			const hasRequired = cookies.some((c) => requiredNames.has(c.name))
			if (!hasRequired) {
				continue
			}

			const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join("; ")
			await chrome.storage.local.set({
				[STORAGE_KEYS.NLM_COOKIE_HEADER]: cookieString,
				[STORAGE_KEYS.NLM_CAPTURED_AT]: Date.now(),
			})
			console.log(
				`[NLM] Captured ${cookies.length} cookies on attempt ${attempt}/${maxAttempts}`,
			)
			return { success: true, cookies: cookieString }
		}

		return {
			success: false,
			error:
				"Could not capture Google session cookies from NotebookLM. Confirm login in popup and try again.",
		}
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error)
		console.error("[NLM] captureNlmCookies failed:", msg)
		return { success: false, error: msg }
	}
}
