import { DOMAINS, ELEMENT_IDS, MESSAGE_TYPES } from "../../utils/constants"
import { createTwitterImportButton, DOMUtils } from "../../utils/ui-components"

export function initializeTwitter() {
	if (!DOMUtils.isOnDomain(DOMAINS.TWITTER)) {
		return
	}

	// Initial setup
	if (window.location.pathname === "/i/bookmarks") {
		setTimeout(() => {
			addTwitterImportButton()
		}, 2000)
	} else {
		// Remove button if not on bookmarks page
		if (DOMUtils.elementExists(ELEMENT_IDS.TWITTER_IMPORT_BUTTON)) {
			DOMUtils.removeElement(ELEMENT_IDS.TWITTER_IMPORT_BUTTON)
		}
	}
}

function addTwitterImportButton() {
	// Only show the import button on the bookmarks page
	if (window.location.pathname !== "/i/bookmarks") {
		return
	}

	if (DOMUtils.elementExists(ELEMENT_IDS.TWITTER_IMPORT_BUTTON)) {
		return
	}

	const button = createTwitterImportButton(async () => {
		try {
			await browser.runtime.sendMessage({
				type: MESSAGE_TYPES.BATCH_IMPORT_ALL,
			})
		} catch (error) {
			console.error("Error starting import:", error)
		}
	})

	document.body.appendChild(button)
}

export function updateTwitterImportUI(message: {
	type: string
	importedMessage?: string
	totalImported?: number
	totalSkipped?: number
	totalFailed?: number
}) {
	const importButton = document.getElementById(
		ELEMENT_IDS.TWITTER_IMPORT_BUTTON,
	)
	if (!importButton) return

	const iconUrl = browser.runtime.getURL("/icon-16.png")

	if (message.type === MESSAGE_TYPES.IMPORT_UPDATE) {
		importButton.innerHTML = `
			<img src="${iconUrl}" width="20" height="20" alt="Save to Memory" style="border-radius: 4px;" />
			<span style="font-weight: 500; font-size: 14px;">${message.importedMessage}</span>
		`
		importButton.style.cursor = "default"
	}

	if (message.type === MESSAGE_TYPES.IMPORT_DONE) {
		const created = message.totalImported ?? 0
		const skipped = message.totalSkipped ?? 0

		let statusText: string
		let statusColor: string

		if (created === 0 && skipped > 0) {
			statusText = `All ${skipped} tweets were already saved`
			statusColor = "#d97706" // amber
		} else if (created > 0 && skipped > 0) {
			statusText = `✓ ${created} new tweets imported, ${skipped} already saved`
			statusColor = "#059669" // green
		} else {
			statusText = `✓ ${created} new tweets imported`
			statusColor = "#059669" // green
		}

		importButton.innerHTML = `
			<img src="${iconUrl}" width="20" height="20" alt="Save to Memory" style="border-radius: 4px;" />
			<span style="font-weight: 500; font-size: 14px; color: ${statusColor};">${statusText}</span>
		`

		setTimeout(() => {
			importButton.innerHTML = `
				<img src="${iconUrl}" width="20" height="20" alt="Save to Memory" style="border-radius: 4px;" />
				<span style="font-weight: 500; font-size: 14px;">Import Bookmarks</span>
			`
			importButton.style.cursor = "pointer"
		}, 5000)
	}
}

export function handleTwitterNavigation() {
	if (!DOMUtils.isOnDomain(DOMAINS.TWITTER)) {
		return
	}

	if (window.location.pathname === "/i/bookmarks") {
		addTwitterImportButton()
	} else {
		if (DOMUtils.elementExists(ELEMENT_IDS.TWITTER_IMPORT_BUTTON)) {
			DOMUtils.removeElement(ELEMENT_IDS.TWITTER_IMPORT_BUTTON)
		}
	}
}
