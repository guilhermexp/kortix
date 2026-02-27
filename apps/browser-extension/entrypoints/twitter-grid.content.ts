/**
 * X/Twitter grid mode content script (MAIN world)
 * Grid-only experience for tweet browsing.
 */

export default defineContentScript({
	matches: ["*://x.com/*", "*://twitter.com/*"],
	world: "MAIN",
	main() {
		const TWC_VERSION = "2.0.0"

		type TwcSettings = {
			version: string
			autoStart: boolean
		}

		const TWC_SETTINGS: TwcSettings = {
			version: TWC_VERSION,
			autoStart: false,
		}

		const GRID_CONTAINER_CLASS = "twc-grid-container"
		const GRID_ITEM_CLASS = "twc-grid-item"
		const GRID_MEDIA_MAX_HEIGHT_PX = 460
		const ADDED_TWEET_IDS = new Set<string>()

		let twcInitialized = false
		let gameInterval = -1
		let gridScrollSetup = false
		let timelineObserver: MutationObserver | null = null

		const twcCss = `
body[data-twc-started][data-twc-grid-mode] {
	overflow: hidden !important;
}

body[data-twc-started][data-twc-grid-mode] header[role="banner"],
body[data-twc-started][data-twc-grid-mode] [data-testid="sidebarColumn"],
body[data-twc-started][data-twc-grid-mode] [data-testid="DMDrawer"],
body[data-twc-started][data-twc-grid-mode] [data-testid="GrokDrawer"] {
	display: none !important;
}

body[data-twc-started][data-twc-grid-mode] main {
	position: fixed !important;
	inset: 0 !important;
	opacity: 0 !important;
	pointer-events: none !important;
	z-index: -1 !important;
}

body[data-twc-started][data-twc-grid-mode] .${GRID_CONTAINER_CLASS} {
	display: grid !important;
	position: fixed;
	top: 56px;
	left: 0;
	right: 0;
	bottom: 0;
	overflow: auto;
	padding: 16px;
	gap: 16px;
	grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
	align-content: start;
	background: #000;
	z-index: 2147483646;
}

body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} {
	min-width: 0;
}

body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweet"] {
	width: 100% !important;
	max-width: none !important;
	margin: 0 !important;
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 16px;
	overflow: hidden;
	background: #000;
}

body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweet"] * {
	max-width: 100%;
}

body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweetPhoto"] img,
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="videoPlayer"] video,
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="videoPlayer"] img,
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="videoComponent"] video {
	width: 100% !important;
	height: auto !important;
	max-height: ${GRID_MEDIA_MAX_HEIGHT_PX}px !important;
	object-fit: cover !important;
}

body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="videoPlayer"],
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="videoComponent"] {
	max-height: ${GRID_MEDIA_MAX_HEIGHT_PX}px !important;
	overflow: hidden !important;
	border-radius: 12px;
}

body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="videoPlayer"] div[style*="padding-bottom"] {
	padding-bottom: 56.25% !important;
}

.twc-start {
	width: 40px;
	height: 40px;
	border: none;
	border-radius: 10px;
	position: fixed;
	bottom: 16px;
	left: 16px;
	cursor: pointer;
	transition: opacity 0.2s, transform 0.2s;
	background: #000;
	color: #fff;
	display: flex;
	align-items: center;
	justify-content: center;
	opacity: 0.7;
	z-index: 2147483647;
}

.twc-start:hover {
	opacity: 1;
	transform: scale(1.05);
}

.twc-txt-btn {
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
	background: none;
	border: none;
	color: #8b98a5;
	transition: color 0.2s;
	z-index: 2147483647;
}

.twc-txt-btn:hover {
	color: #fff;
}

body[data-twc-started] .twc-start {
	display: none;
}

@media (max-width: 900px) {
	body[data-twc-started][data-twc-grid-mode] .${GRID_CONTAINER_CLASS} {
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
	}
}

@media (max-width: 560px) {
	body[data-twc-started][data-twc-grid-mode] .${GRID_CONTAINER_CLASS} {
		grid-template-columns: 1fr;
		padding: 10px;
		gap: 10px;
	}
}
`

		function setStyle(styleText: string): void {
			let styleEl = document.querySelector<HTMLStyleElement>(".twc-style")
			if (!styleEl) {
				styleEl = document.createElement("style")
				styleEl.classList.add("twc-style")
				document.head.appendChild(styleEl)
			}
			styleEl.textContent = styleText
		}

		function loadTwcSettings(): void {
			let loadedSettings: Partial<TwcSettings> = {}
			try {
				loadedSettings = JSON.parse(localStorage.getItem("twc-settings") || "{}")
			} catch {
				localStorage.removeItem("twc-settings")
			}

			if (typeof loadedSettings.autoStart === "boolean") {
				TWC_SETTINGS.autoStart = loadedSettings.autoStart
			}
		}

		function saveTwcSettings(): void {
			TWC_SETTINGS.version = TWC_VERSION
			localStorage.setItem("twc-settings", JSON.stringify(TWC_SETTINGS))
		}

		function isTwcRunning(): boolean {
			return "twcStarted" in document.body.dataset
		}

		function getTimelineRoot(): HTMLElement | null {
			return document.querySelector<HTMLElement>('[aria-label="Home timeline"]')
		}

		function getTweetId(tweetEl: HTMLElement): string | null {
			const link = tweetEl.querySelector<HTMLAnchorElement>('a[href*="/status/"]')
			if (!link) {
				return null
			}

			const match = link.href.match(/\/status\/(\d+)/)
			return match ? match[1] : null
		}

		function getNextTweets(limit: number): HTMLElement[] {
			const timelineRoot = getTimelineRoot()
			if (!timelineRoot) {
				return []
			}

			const candidates = Array.from(
				timelineRoot.querySelectorAll<HTMLElement>(
					"[data-testid='tweet']:not([data-twc-used])",
				),
			)

			const filtered = candidates.filter((tweetEl) => {
				const cell = tweetEl.closest<HTMLElement>("[data-testid='cellInnerDiv']")
				if (!cell) {
					return false
				}
				if (cell.querySelector(".HiddenTweet")) {
					return false
				}
				if (cell.querySelector("div[role='progressbar']")) {
					return false
				}
				return true
			})

			const result = filtered.slice(0, limit)
			result.forEach((tweetEl) => {
				tweetEl.dataset.twcUsed = "true"
			})
			return result
		}

		function normalizeGridTweet(tweetEl: HTMLElement): void {
			tweetEl.dataset.twcCard = "true"
			delete tweetEl.dataset.twcGone
			delete tweetEl.dataset.twcPick

			tweetEl.style.removeProperty("position")
			tweetEl.style.removeProperty("top")
			tweetEl.style.removeProperty("left")
			tweetEl.style.removeProperty("transform")
			tweetEl.style.removeProperty("translate")
			tweetEl.style.removeProperty("rotate")
			tweetEl.style.removeProperty("width")

			const richText = tweetEl.querySelector<HTMLElement>('[data-testid="tweetText"]')
			if (richText) {
				richText.style.filter = "none"
			}

			const photo = tweetEl.querySelector<HTMLElement>('[data-testid="tweetPhoto"]')
			if (photo) {
				photo.style.filter = "none"
			}
		}

		function autoPopulateGrid(limit = 12): void {
			const gridContainer = document.querySelector<HTMLElement>(
				`.${GRID_CONTAINER_CLASS}`,
			)
			if (!gridContainer) {
				return
			}

			const tweets = getNextTweets(limit)
			if (tweets.length === 0) {
				return
			}

			for (const tweetEl of tweets) {
				const tweetId = getTweetId(tweetEl)
				if (tweetId && ADDED_TWEET_IDS.has(tweetId)) {
					continue
				}

				if (tweetId) {
					ADDED_TWEET_IDS.add(tweetId)
				}

				normalizeGridTweet(tweetEl)

				const wrapper = document.createElement("article")
				wrapper.classList.add(GRID_ITEM_CLASS)
				wrapper.appendChild(tweetEl)
				gridContainer.appendChild(wrapper)
			}
		}

		function triggerLoadMore(): void {
			const timelineRoot = getTimelineRoot()
			if (timelineRoot) {
				timelineRoot.scrollTop = timelineRoot.scrollHeight
			}

			window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" })
		}

		function setupTimelineObserver(): void {
			if (timelineObserver) {
				return
			}

			const timelineRoot = getTimelineRoot()
			if (!timelineRoot) {
				return
			}

			timelineObserver = new MutationObserver(() => {
				if (isTwcRunning()) {
					autoPopulateGrid(8)
				}
			})

			timelineObserver.observe(timelineRoot, { childList: true, subtree: true })
		}

		function teardownTimelineObserver(): void {
			if (!timelineObserver) {
				return
			}
			timelineObserver.disconnect()
			timelineObserver = null
		}

		function setupGridScroll(): void {
			if (gridScrollSetup) {
				return
			}

			const gridContainer = document.querySelector<HTMLElement>(
				`.${GRID_CONTAINER_CLASS}`,
			)
			if (!gridContainer) {
				return
			}

			gridScrollSetup = true
			let isLoading = false

			gridContainer.addEventListener("scroll", () => {
				const nearBottom =
					gridContainer.scrollTop + gridContainer.clientHeight >=
					gridContainer.scrollHeight - 700

				if (!nearBottom || isLoading) {
					return
				}

				isLoading = true
				autoPopulateGrid(20)
				triggerLoadMore()

				window.setTimeout(() => {
					autoPopulateGrid(20)
					isLoading = false
				}, 700)
			})
		}

		function ensureGridContainer(): void {
			if (document.querySelector(`.${GRID_CONTAINER_CLASS}`)) {
				return
			}

			const container = document.createElement("div")
			container.classList.add(GRID_CONTAINER_CLASS)
			document.body.appendChild(container)
			setupGridScroll()
		}

		function startGame(): void {
			if (isTwcRunning()) {
				return
			}

			document.body.dataset.twcStarted = "true"
			document.body.dataset.twcGridMode = "true"
			ensureGridContainer()
			autoPopulateGrid(30)
			setupTimelineObserver()

			if (gameInterval !== -1) {
				window.clearInterval(gameInterval)
			}

			gameInterval = window.setInterval(() => {
				autoPopulateGrid(12)
				triggerLoadMore()
			}, 1500)
		}

		function stopGame(reloadPage = false): void {
			if (gameInterval !== -1) {
				window.clearInterval(gameInterval)
				gameInterval = -1
			}

			teardownTimelineObserver()
			gridScrollSetup = false

			delete document.body.dataset.twcStarted
			delete document.body.dataset.twcGridMode

			const gridContainer = document.querySelector(`.${GRID_CONTAINER_CLASS}`)
			if (gridContainer) {
				gridContainer.remove()
			}

			ADDED_TWEET_IDS.clear()

			// We move live tweet nodes out of timeline; reload restores original X layout cleanly.
			if (reloadPage) {
				window.location.reload()
			}
		}

		function toggleTwcGrid(): boolean {
			if (isTwcRunning()) {
				stopGame(true)
				return false
			}

			ensureTwcSetup()
			startGame()
			return true
		}

		function addTwcControls(): void {
			const twcButton = document.createElement("button")
			twcButton.classList.add("twc-start")
			twcButton.innerHTML =
				'<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="7" height="7" rx="1.5"/><rect x="12" y="1" width="7" height="7" rx="1.5"/><rect x="1" y="12" width="7" height="7" rx="1.5"/><rect x="12" y="12" width="7" height="7" rx="1.5"/></svg>'
			twcButton.title = "X Grid"
			twcButton.onclick = startGame
			document.body.appendChild(twcButton)

			const twcStop = document.createElement("button")
			twcStop.classList.add("twc-txt-btn")
			twcStop.innerText = "X"
			twcStop.style.position = "fixed"
			twcStop.style.top = "16px"
			twcStop.style.right = "16px"
			twcStop.style.cursor = "pointer"
			twcStop.onclick = () => stopGame(true)
			document.body.appendChild(twcStop)

			const twcSettings = document.createElement("details")
			const twcSettingsSum = document.createElement("summary")
			twcSettingsSum.innerText = "Settings"
			twcSettingsSum.style.cursor = "pointer"
			twcSettings.appendChild(twcSettingsSum)
			twcSettings.classList.add("twc-txt-btn")
			twcSettings.style.position = "fixed"
			twcSettings.style.top = "16px"
			twcSettings.style.left = "16px"

			const autoStartLabel = document.createElement("label")
			autoStartLabel.innerText = "Autostart: "
			const autoStartInput = document.createElement("input")
			autoStartInput.type = "checkbox"
			autoStartInput.checked = TWC_SETTINGS.autoStart
			autoStartInput.oninput = () => {
				TWC_SETTINGS.autoStart = autoStartInput.checked
				saveTwcSettings()
			}
			autoStartLabel.appendChild(autoStartInput)
			twcSettings.appendChild(autoStartLabel)

			const info = document.createElement("p")
			info.innerHTML = `X Grid v${TWC_VERSION}<br>Single view mode (grid)`
			twcSettings.appendChild(info)

			document.body.appendChild(twcSettings)
		}

		function setupTwc(): void {
			loadTwcSettings()
			setStyle(twcCss)
			addTwcControls()
			if (TWC_SETTINGS.autoStart) {
				startGame()
			}
		}

		function ensureTwcSetup(): void {
			if (twcInitialized) {
				return
			}
			twcInitialized = true
			setupTwc()
		}

		document.addEventListener("kortix-grid-request", (event) => {
			const detail = (event as CustomEvent).detail ?? {}
			const requestId = detail.requestId
			const command = detail.command

			let active = isTwcRunning()
			if (command === "toggle") {
				active = toggleTwcGrid()
			} else if (command === "state") {
				active = isTwcRunning()
			}

			document.dispatchEvent(
				new CustomEvent("kortix-grid-response", {
					detail: { requestId, active },
				}),
			)
		})

		document.addEventListener("kortix-toggle-grid", () => {
			toggleTwcGrid()
		})
	},
})
