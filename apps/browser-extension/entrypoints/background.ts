import { saveMemory, searchMemories } from "../utils/api"
import {
	CONTEXT_MENU_IDS,
	getContainerTagForUrl,
	MESSAGE_TYPES,
} from "../utils/constants"
import { captureAndSendNlmCookies } from "../utils/notebooklm-auth"
import { captureTwitterTokens } from "../utils/twitter-auth"
import {
	type ImportResult,
	type TwitterImportConfig,
	TwitterImporter,
} from "../utils/twitter-import"
import type {
	ExtensionMessage,
	MemoryData,
	MemoryPayload,
} from "../utils/types"

export default defineBackground(() => {
	let twitterImporter: TwitterImporter | null = null

	browser.runtime.onInstalled.addListener(async (details) => {
		browser.contextMenus.create({
			id: CONTEXT_MENU_IDS.SAVE_TO_KORTIX,
			title: "sync to Kortix",
			contexts: ["selection", "page", "link"],
		})

		if (details.reason === "install") {
			browser.tabs.create({
				url: browser.runtime.getURL("/welcome.html"),
			})
		}
	})

	// Handle Cmd+K / Ctrl+K keyboard shortcut via chrome.commands API.
	browser.commands.onCommand.addListener(async (command) => {
		if (command === "save-to-kortix") {
			const tabs = await browser.tabs.query({
				active: true,
				currentWindow: true,
			})
			if (tabs[0]?.id) {
				try {
					await browser.tabs.sendMessage(tabs[0].id, {
						action: MESSAGE_TYPES.SAVE_MEMORY,
						actionSource: "keyboard_shortcut",
					})
				} catch (error) {
					console.error("Failed to trigger save via shortcut:", error)
				}
			}
		}
	})

	// Intercept Twitter requests to capture authentication headers.
	browser.webRequest.onBeforeSendHeaders.addListener(
		(details) => {
			captureTwitterTokens(details)
			return {}
		},
		{ urls: ["*://x.com/*", "*://twitter.com/*"] },
		["requestHeaders", "extraHeaders"],
	)


	// Handle context menu clicks.
	browser.contextMenus.onClicked.addListener(async (info, tab) => {
		if (info.menuItemId === CONTEXT_MENU_IDS.SAVE_TO_KORTIX) {
			if (tab?.id) {
				try {
					await browser.tabs.sendMessage(tab.id, {
						action: MESSAGE_TYPES.SAVE_MEMORY,
						actionSource: "context_menu",
					})
				} catch (error) {
					console.error("Failed to send message to content script:", error)
				}
			}
		}
	})

	// Send message to current active tab.
	const sendMessageToCurrentTab = async (message: string) => {
		const tabs = await browser.tabs.query({
			active: true,
			currentWindow: true,
		})
		if (tabs.length > 0 && tabs[0].id) {
			await browser.tabs.sendMessage(tabs[0].id, {
				type: MESSAGE_TYPES.IMPORT_UPDATE,
				importedMessage: message,
			})
		}
	}

	/**
	 * Send import completion message with breakdown
	 */
	const sendImportDoneMessage = async (result: ImportResult) => {
		const tabs = await browser.tabs.query({
			active: true,
			currentWindow: true,
		})
		if (tabs.length > 0 && tabs[0].id) {
			await browser.tabs.sendMessage(tabs[0].id, {
				type: MESSAGE_TYPES.IMPORT_DONE,
				totalImported: result.created,
				totalSkipped: result.skipped,
				totalFailed: result.failed,
			})
		}
	}

	/**
	 * Save memory to Kortix API.
	 * Routes to the correct project based on the page URL:
	 *   youtube.com  → YouTube
	 *   x.com/twitter → Twitter Bookmarks
	 *   github.com   → GitHub
	 *   everything else → Digitalmemory
	 */
	const saveMemoryToKortix = async (
		data: MemoryData,
		actionSource: string,
	): Promise<{ success: boolean; data?: unknown; error?: string }> => {
		try {
			const containerTag = getContainerTagForUrl(data.url)

			let content: string
			if (data.content) {
				content = data.content
			} else if (data.isLink && data.url) {
				content = data.url
			} else {
				content = [data.highlightedText, data.url].filter(Boolean).join("\n\n")
			}

			const metadata: MemoryPayload["metadata"] = {
				sm_source: "consumer",
			}
			if (data.html) {
				metadata.html = data.html
			}
			if (data.title) {
				metadata.title = data.title
			}

			const payload: MemoryPayload = {
				containerTags: [containerTag],
				content,
				metadata,
			}

			const responseData = await saveMemory(payload)

			return { success: true, data: responseData }
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			}
		}
	}

	const getRelatedMemories = async (
		data: string,
		eventSource: string,
	): Promise<{ success: boolean; data?: unknown; error?: string }> => {
		try {
			const responseData = await searchMemories(data)
			const response = responseData as {
				results?: Array<{ memory?: string }>
			}
			const memories: string[] = []
			response.results?.forEach((result, index) => {
				memories.push(`${index + 1}. ${result.memory} \n`)
			})
			return { success: true, data: memories }
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			}
		}
	}

	/**
	 * Handle extension messages
	 */
	browser.runtime.onMessage.addListener(
		(message: ExtensionMessage, _sender, sendResponse) => {
			// Handle NotebookLM cookie capture
			if (message.type === MESSAGE_TYPES.NLM_START_CAPTURE) {
				captureAndSendNlmCookies()
					.then((result) => sendResponse(result))
					.catch((error) => {
						console.error("[NLM] Cookie capture failed:", error)
						sendResponse({ success: false, error: String(error) })
					})
				return true
			}

			// Handle Twitter import request
			if (message.type === MESSAGE_TYPES.BATCH_IMPORT_ALL) {
				const importConfig: TwitterImportConfig = {
					onProgress: sendMessageToCurrentTab,
					onComplete: sendImportDoneMessage,
					onError: async (error: Error) => {
						await sendMessageToCurrentTab(`Error: ${error.message}`)
					},
				}

				twitterImporter = new TwitterImporter(importConfig)
				twitterImporter.startImport().catch(console.error)
				sendResponse({ success: true })
				return true
			}

			// Handle regular memory save request
			if (message.action === MESSAGE_TYPES.SAVE_MEMORY) {
				;(async () => {
					try {
						const result = await saveMemoryToKortix(
							message.data as MemoryData,
							message.actionSource || "unknown",
						)
						sendResponse(result)
					} catch (error) {
						sendResponse({
							success: false,
							error: error instanceof Error ? error.message : "Unknown error",
						})
					}
				})()
				return true
			}

			if (message.action === MESSAGE_TYPES.GET_RELATED_MEMORIES) {
				;(async () => {
					try {
						const result = await getRelatedMemories(
							message.data as string,
							message.actionSource || "unknown",
						)
						sendResponse(result)
					} catch (error) {
						sendResponse({
							success: false,
							error: error instanceof Error ? error.message : "Unknown error",
						})
					}
				})()
				return true
			}

			if (message.action === MESSAGE_TYPES.CAPTURE_PROMPT) {
				;(async () => {
					try {
						const messageData = message.data as {
							prompt: string
							platform: string
							source: string
						}
						console.log("=== PROMPT CAPTURED ===")
						console.log(messageData)
						console.log("========================")

						const memoryData: MemoryData = {
							content: messageData.prompt,
						}

						const result = await saveMemoryToKortix(
							memoryData,
							`prompt_capture_${messageData.platform}`,
						)
						sendResponse(result)
					} catch (error) {
						sendResponse({
							success: false,
							error: error instanceof Error ? error.message : "Unknown error",
						})
					}
				})()
				return true
			}
		},
	)
})
