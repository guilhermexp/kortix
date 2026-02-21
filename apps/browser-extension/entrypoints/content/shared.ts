import { DOMAINS, MESSAGE_TYPES, STORAGE_KEYS } from "../../utils/constants"
import { DOMUtils } from "../../utils/ui-components"

export async function saveMemory() {
	try {
		DOMUtils.showToast("loading")

		const highlightedText = window.getSelection()?.toString() || ""
		const url = window.location.href
		const html = document.documentElement.outerHTML

		const response = await browser.runtime.sendMessage({
			action: MESSAGE_TYPES.SAVE_MEMORY,
			data: {
				html,
				highlightedText,
				url,
			},
			actionSource: "context_menu",
		})

		console.log("Response from enxtension:", response)
		if (response.success) {
			DOMUtils.showToast("success")
		} else {
			DOMUtils.showToast("error")
		}
	} catch (error) {
		console.error("Error saving memory:", error)
		DOMUtils.showToast("error")
	}
}

export function setupGlobalKeyboardShortcut() {
	document.addEventListener("keydown", async (event) => {
		if (
			(event.ctrlKey || event.metaKey) &&
			event.shiftKey &&
			event.key === "m"
		) {
			event.preventDefault()
			await saveMemory()
		}
	})
}

export function setupStorageListener() {
	window.addEventListener("message", (event) => {
		// Do NOT check event.source === window here. In Chrome MV3, content scripts
		// run in an isolated world where event.source from the main world is a
		// different reference than the content script's window object.
		// Security is enforced by the hostname check below.
		if (!event.data || typeof event.data !== "object") {
			return
		}
		const bearerToken = event.data.token
		const refreshToken = event.data.refreshToken
		const userData = event.data.userData
		if (bearerToken && userData) {
			if (!DOMAINS.KORTIX.includes(window.location.hostname)) {
				return
			}

			chrome.storage.local.set(
				{
					[STORAGE_KEYS.BEARER_TOKEN]: bearerToken,
					[STORAGE_KEYS.USER_DATA]: userData,
					...(refreshToken && {
						[STORAGE_KEYS.REFRESH_TOKEN]: refreshToken,
					}),
				},
				() => {},
			)
		}
	})
}
