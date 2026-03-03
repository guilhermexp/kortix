/**
 * NotebookLM Authentication Module
 * Uses chrome.cookies API to read Google session cookies
 * and sends them to the Kortix API for connection.
 */
import { API_ENDPOINTS, STORAGE_KEYS } from "./constants"

/**
 * Capture NotebookLM cookies and send to Kortix API.
 * Uses chrome.cookies.getAll() to get all cookies (including HttpOnly)
 * for notebooklm.google.com, then posts to our auth endpoint.
 */
export async function captureAndSendNlmCookies(): Promise<{
	success: boolean
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
			return { success: false, error: "No Google cookies found. Are you logged in?" }
		}

		// Build cookie header string: "name=value; name2=value2; ..."
		const cookieString = cookies
			.map((c) => `${c.name}=${c.value}`)
			.join("; ")

		console.log(`[NLM] Captured ${cookies.length} cookies, sending to API...`)

		// Get bearer token for authenticated API call
		const tokenResult = await chrome.storage.local.get([STORAGE_KEYS.BEARER_TOKEN])
		const bearerToken = tokenResult[STORAGE_KEYS.BEARER_TOKEN] as string | undefined

		if (!bearerToken) {
			return { success: false, error: "Not logged into Kortix" }
		}

		// Send cookies to Kortix API
		const response = await fetch(
			`${API_ENDPOINTS.KORTIX_API}/v3/notebooklm/auth`,
			{
				method: "POST",
				credentials: "omit",
				headers: {
					Authorization: `Bearer ${bearerToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ cookies: cookieString }),
			},
		)

		if (!response.ok) {
			const text = await response.text()
			console.error("[NLM] Auth API error:", response.status, text)
			return { success: false, error: `API error: ${response.status}` }
		}

		const data = await response.json()
		console.log("[NLM] Connected successfully:", data)

		// Notify all Kortix tabs
		await notifyKortixTabs(data.data)

		return { success: true }
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error)
		console.error("[NLM] captureAndSendNlmCookies failed:", msg)
		return { success: false, error: msg }
	}
}

/**
 * Notify Kortix web app tabs that NotebookLM was connected.
 */
async function notifyKortixTabs(data: unknown): Promise<void> {
	try {
		const tabs = await browser.tabs.query({})
		const kortixHost = new URL(API_ENDPOINTS.KORTIX_WEB).hostname

		for (const tab of tabs) {
			if (!tab.id || !tab.url) continue
			try {
				const tabHost = new URL(tab.url).hostname
				if (tabHost === kortixHost || tabHost === "localhost") {
					browser.tabs.sendMessage(tab.id, {
						type: "NLM_CONNECTED",
						data,
					}).catch(() => {
						// Tab might not have content script loaded
					})
				}
			} catch {
				// Invalid URL
			}
		}
	} catch (error) {
		console.error("[NLM] Failed to notify Kortix tabs:", error)
	}
}
