import {
	DOMAINS,
	ELEMENT_IDS,
	MESSAGE_TYPES,
	STORAGE_KEYS,
} from "../../utils/constants"
import { createSavePageButton, DOMUtils } from "../../utils/ui-components"
import { initializeChatGPT } from "./chatgpt"
import { initializeClaude } from "./claude"
import {
	saveMemory,
	setupGlobalKeyboardShortcut,
	setupStorageListener,
} from "./shared"
import { initializeT3 } from "./t3"
import {
	handleTwitterNavigation,
	initializeTwitter,
	updateTwitterImportUI,
} from "./twitter"

export default defineContentScript({
	matches: ["<all_urls>"],
	main() {
		const bridgeTwitterGridCommand = async (command: "toggle" | "state") => {
			const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`

			return await new Promise<{ active: boolean }>((resolve) => {
				const responseEventName = "kortix-grid-response"
				const requestEventName = "kortix-grid-request"

				const handler = (event: Event) => {
					const detail = (event as CustomEvent).detail
					if (!detail || detail.requestId !== requestId) {
						return
					}

					cleanup()
					resolve({ active: Boolean(detail.active) })
				}

				const cleanup = () => {
					document.removeEventListener(
						responseEventName,
						handler as EventListener,
					)
					window.clearTimeout(timeoutId)
				}

				const timeoutId = window.setTimeout(() => {
					cleanup()
					resolve({ active: "twcStarted" in document.body.dataset })
				}, 1200)

				document.addEventListener(responseEventName, handler as EventListener)
				document.dispatchEvent(
					new CustomEvent(requestEventName, {
						detail: { requestId, command },
					}),
				)
			})
		}

		// Listen for NLM_START_CAPTURE from the Kortix web app via postMessage.
		// Extension only captures cookies and returns them — web app calls the API.
		window.addEventListener("message", async (event) => {
			if (event.data?.type === "KORTIX_NLM_START_CAPTURE") {
				try {
					const response = await browser.runtime.sendMessage({
						type: MESSAGE_TYPES.NLM_START_CAPTURE,
					})
					window.postMessage(
						{
							type: response?.success
								? "KORTIX_NLM_COOKIES"
								: "KORTIX_NLM_ERROR",
							data: response,
						},
						"*",
					)
				} catch (error) {
					window.postMessage(
						{
							type: "KORTIX_NLM_ERROR",
							data: {
								success: false,
								error: error instanceof Error ? error.message : String(error),
							},
						},
						"*",
					)
				}
			}
		})

		// Setup global event listeners
		browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
			if (message.action === MESSAGE_TYPES.SHOW_TOAST) {
				DOMUtils.showToast(message.state)
			} else if (message.action === MESSAGE_TYPES.SAVE_MEMORY) {
				saveMemory()
					.then(() => sendResponse({ success: true }))
					.catch(() => sendResponse({ success: false }))
				return true
			} else if (
				message.action === MESSAGE_TYPES.TOGGLE_X_GRID ||
				message.action === MESSAGE_TYPES.GET_X_GRID_STATE
			) {
				if (!DOMUtils.isOnDomain(DOMAINS.TWITTER)) {
					sendResponse({ active: false })
					return
				}

				const command =
					message.action === MESSAGE_TYPES.TOGGLE_X_GRID ? "toggle" : "state"

				bridgeTwitterGridCommand(command)
					.then(sendResponse)
					.catch((error) => {
						console.error("Failed to bridge Twitter grid action:", error)
						sendResponse({ active: false })
					})
				return true
			} else if (message.type === MESSAGE_TYPES.IMPORT_UPDATE) {
				updateTwitterImportUI(message)
			} else if (message.type === MESSAGE_TYPES.IMPORT_DONE) {
				updateTwitterImportUI(message)
			}
		})

		// Setup global keyboard shortcuts
		setupGlobalKeyboardShortcut()

		// Setup storage listener
		setupStorageListener()

		// Observer for dynamic content changes
		const observeForDynamicChanges = () => {
			const observer = new MutationObserver(() => {
				if (DOMUtils.isOnDomain(DOMAINS.CHATGPT)) {
					initializeChatGPT()
				}
				if (DOMUtils.isOnDomain(DOMAINS.CLAUDE)) {
					initializeClaude()
				}
				if (DOMUtils.isOnDomain(DOMAINS.T3)) {
					initializeT3()
				}
				if (DOMUtils.isOnDomain(DOMAINS.TWITTER)) {
					handleTwitterNavigation()
				}
			})

			observer.observe(document.body, {
				childList: true,
				subtree: true,
			})
		}

		// Initialize platform-specific functionality
		initializeChatGPT()
		initializeClaude()
		initializeT3()
		initializeTwitter()

		// Save Page overlay button — visible on all pages except Kortix app and Twitter
		const isSavePageExcluded =
			DOMUtils.isOnDomain(DOMAINS.KORTIX) ||
			DOMUtils.isOnDomain(DOMAINS.TWITTER)

		const addSavePageButton = () => {
			if (isSavePageExcluded) return
			if (DOMUtils.elementExists(ELEMENT_IDS.SAVE_PAGE_BUTTON)) return
			const btn = createSavePageButton(() => saveMemory())
			document.body.appendChild(btn)
		}

		const removeSavePageButton = () => {
			DOMUtils.removeElement(ELEMENT_IDS.SAVE_PAGE_BUTTON)
		}

		// Check initial state and show/hide button
		chrome.storage.local
			.get(STORAGE_KEYS.SAVE_PAGE_BUTTON_ENABLED)
			.then((result) => {
				if (result[STORAGE_KEYS.SAVE_PAGE_BUTTON_ENABLED]) {
					addSavePageButton()
				}
			})

		// React to toggle changes from popup in real-time
		chrome.storage.onChanged.addListener((changes, area) => {
			if (area !== "local") return
			const change = changes[STORAGE_KEYS.SAVE_PAGE_BUTTON_ENABLED]
			if (!change) return
			if (change.newValue) {
				addSavePageButton()
			} else {
				removeSavePageButton()
			}
		})

		// Start observing for dynamic changes
		if (document.readyState === "loading") {
			document.addEventListener("DOMContentLoaded", observeForDynamicChanges)
		} else {
			observeForDynamicChanges()
		}
	},
})
