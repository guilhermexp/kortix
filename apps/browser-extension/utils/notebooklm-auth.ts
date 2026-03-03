/**
 * NotebookLM Authentication Module
 * Uses chrome.cookies API to read Google session cookies
 * and returns them to the caller (web app).
 *
 * The web app is responsible for sending the cookies to the Kortix API
 * (it already has a valid session — no need for extension to authenticate).
 */

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
		// Small delay to let the NLM popup load and set any cookies
		await new Promise((r) => setTimeout(r, 2000))

		// Get ALL cookies for notebooklm.google.com (includes .google.com parent cookies)
		const cookies = await chrome.cookies.getAll({
			url: "https://notebooklm.google.com",
		})

		if (!cookies.length) {
			console.warn("[NLM] No cookies found for notebooklm.google.com")
			return {
				success: false,
				error: "No Google cookies found. Are you logged in to NotebookLM?",
			}
		}

		// Build cookie header string: "name=value; name2=value2; ..."
		const cookieString = cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ")

		console.log(`[NLM] Captured ${cookies.length} cookies`)

		return { success: true, cookies: cookieString }
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error)
		console.error("[NLM] captureNlmCookies failed:", msg)
		return { success: false, error: msg }
	}
}
