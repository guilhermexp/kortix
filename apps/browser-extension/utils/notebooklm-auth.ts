/**
 * NotebookLM Authentication Module
 * Captures cookies from notebooklm.google.com via webRequest
 * and sends them to the Kortix API for connection.
 *
 * Same pattern as twitter-auth.ts.
 */
import { API_ENDPOINTS, STORAGE_KEYS } from "./constants"

const NLM_COOKIE_KEY = "nlm-cookie-header"
const NLM_CAPTURING_KEY = "nlm-capturing"

/**
 * Capture NotebookLM cookies from web request headers.
 * Called by the webRequest.onBeforeSendHeaders listener in background.ts.
 */
export function captureNotebookLMCookies(
	details: chrome.webRequest.WebRequestDetails & {
		requestHeaders?: chrome.webRequest.HttpHeader[]
	},
): boolean {
	if (!details.url.includes("notebooklm.google.com")) return false

	const cookieHeader = details.requestHeaders?.find(
		(header) => header.name.toLowerCase() === "cookie",
	)

	if (!cookieHeader?.value || cookieHeader.value.length < 20) return false

	// Store the full Cookie header (includes HttpOnly cookies)
	chrome.storage.session.set({ [NLM_COOKIE_KEY]: cookieHeader.value })

	// If we're in "capturing" mode, auto-send to API
	chrome.storage.session.get([NLM_CAPTURING_KEY], (result) => {
		if (result[NLM_CAPTURING_KEY]) {
			sendNlmCookiesToApi(cookieHeader.value).catch((err) => {
				console.error("[NLM] Failed to auto-send cookies:", err)
			})
		}
	})

	return true
}

/**
 * Start capturing mode — the next NLM cookie capture will be sent to API.
 */
export async function startNlmCapture(): Promise<void> {
	await chrome.storage.session.set({ [NLM_CAPTURING_KEY]: true })

	// If we already have captured cookies, send them immediately
	const result = await chrome.storage.session.get([NLM_COOKIE_KEY])
	const existing = result[NLM_COOKIE_KEY] as string | undefined
	if (existing && existing.length > 20) {
		await sendNlmCookiesToApi(existing)
	}
}

/**
 * Stop capturing mode.
 */
export async function stopNlmCapture(): Promise<void> {
	await chrome.storage.session.set({ [NLM_CAPTURING_KEY]: false })
}

/**
 * Send captured NLM cookies to the Kortix API for validation and storage.
 */
async function sendNlmCookiesToApi(cookieString: string): Promise<boolean> {
	try {
		// Get bearer token for authenticated API call
		const tokenResult = await chrome.storage.local.get([STORAGE_KEYS.BEARER_TOKEN])
		const bearerToken = tokenResult[STORAGE_KEYS.BEARER_TOKEN] as string | undefined

		if (!bearerToken) {
			console.warn("[NLM] No bearer token — user not logged into Kortix")
			return false
		}

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
			return false
		}

		const data = await response.json()
		console.log("[NLM] Connected successfully:", data)

		// Stop capturing mode
		await stopNlmCapture()

		// Notify all Kortix tabs that NLM is connected
		notifyKortixTabs(data.data)

		return true
	} catch (error) {
		console.error("[NLM] Failed to send cookies to API:", error)
		return false
	}
}

/**
 * Notify Kortix web app tabs that NotebookLM was connected.
 */
async function notifyKortixTabs(data: unknown): Promise<void> {
	try {
		const tabs = await chrome.tabs.query({})
		const kortixHost = new URL(API_ENDPOINTS.KORTIX_WEB).hostname

		for (const tab of tabs) {
			if (!tab.id || !tab.url) continue
			try {
				const tabHost = new URL(tab.url).hostname
				if (tabHost === kortixHost || tabHost === "localhost") {
					chrome.tabs.sendMessage(tab.id, {
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
