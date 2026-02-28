/**
 * X/Twitter grid mode content script (MAIN world)
 *
 * Architecture: "Shadow Grid" approach
 * - The original timeline stays in the document flow (invisible) so Twitter's
 *   virtual scroller keeps working and loading more tweets via infinite scroll.
 * - We CLONE tweet nodes into a fixed grid overlay — originals are never moved.
 * - window.scrollBy() drives the hidden timeline forward; IntersectionObserver
 *   on the sentinel triggers Twitter's API calls for more data.
 * - MutationObserver on the timeline picks up newly rendered tweets.
 */

export default defineContentScript({
	matches: ["*://x.com/*", "*://twitter.com/*"],
	world: "MAIN",
	main() {
		const TWC_VERSION = "3.0.0"

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
		let isPopulating = false

		const twcCss = `
/* Body scroll stays enabled — Twitter's virtualizer needs real window scroll
   to trigger IntersectionObserver on its sentinel and load more tweets.
   Hide the scrollbar since the grid overlay covers the viewport. */
body[data-twc-started][data-twc-grid-mode] {
	scrollbar-width: none !important;
}

body[data-twc-started][data-twc-grid-mode]::-webkit-scrollbar {
	display: none !important;
}

body[data-twc-started][data-twc-grid-mode] header[role="banner"],
body[data-twc-started][data-twc-grid-mode] [data-testid="sidebarColumn"],
body[data-twc-started][data-twc-grid-mode] [data-testid="DMDrawer"],
body[data-twc-started][data-twc-grid-mode] [data-testid="GrokDrawer"] {
	display: none !important;
}

/* main stays in document flow (NOT position:fixed) so it contributes to
   document.scrollHeight. The virtualizer uses window scroll position to
   decide which items to render and when to fetch more. */
body[data-twc-started][data-twc-grid-mode] main {
	opacity: 0 !important;
	pointer-events: none !important;
	z-index: -1 !important;
	position: relative !important;
}

body[data-twc-started][data-twc-grid-mode] .${GRID_CONTAINER_CLASS} {
	display: grid !important;
	position: fixed;
	top: 56px;
	left: 0;
	right: 0;
	bottom: 0;
	overflow-y: auto;
	overflow-x: hidden;
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

		// ================================================================
		// Helpers
		// ================================================================

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

		// ================================================================
		// Timeline discovery — works on Home, Profile, Search, Lists, etc.
		// ================================================================

		function getTimelineRoot(): HTMLElement | null {
			// Try multiple aria-label patterns for different X pages/locales
			return (
				document.querySelector<HTMLElement>('[aria-label="Timeline: Your Home Timeline"]') ||
				document.querySelector<HTMLElement>('[aria-label="Home timeline"]') ||
				document.querySelector<HTMLElement>(
					'[data-testid="primaryColumn"] section > h1 + div[aria-label] > div',
				) ||
				document.querySelector<HTMLElement>(
					'[data-testid="primaryColumn"] section [aria-label]',
				)
			)
		}

		function getTweetId(tweetEl: HTMLElement): string | null {
			const link = tweetEl.querySelector<HTMLAnchorElement>('a[href*="/status/"]')
			if (!link) return null
			const match = link.href.match(/\/status\/(\d+)/)
			return match ? match[1] : null
		}

		// ================================================================
		// Tweet harvesting — reads from timeline, NEVER moves nodes
		// ================================================================

		function getNextTweets(limit: number): HTMLElement[] {
			const timelineRoot = getTimelineRoot()
			if (!timelineRoot) return []

			const candidates = Array.from(
				timelineRoot.querySelectorAll<HTMLElement>(
					"[data-testid='tweet']:not([data-twc-cloned])",
				),
			)

			const filtered = candidates.filter((tweetEl) => {
				const cell = tweetEl.closest<HTMLElement>("[data-testid='cellInnerDiv']")
				if (!cell) return false
				if (cell.querySelector("div[role='progressbar']")) return false
				return true
			})

			return filtered.slice(0, limit)
		}

		// ================================================================
		// Grid population — CLONE tweets, never move
		// ================================================================

		/**
		 * Fix media in cloned tweet nodes.
		 *
		 * Twitter uses React Native for Web (RNW). The VISIBLE image is a CSS
		 * `background-image` on a <div>, applied via atomic CSS classes (r-xxxxx).
		 * The <img> tag is hidden (opacity:0, position:absolute) for accessibility.
		 *
		 * cloneNode copies class names but RNW's dynamically-generated CSS rules
		 * may not carry the background-image to the clone. We fix this by:
		 * 1. Copying computed background-image from ALL original divs to clones
		 * 2. Making the hidden <img> visible as fallback
		 * 3. Removing dark placeholder backgrounds
		 */
		/**
		 * Media container selectors — only images/divs inside these get
		 * aggressive size overrides. Everything else (profile pics, icons,
		 * action buttons) is left alone.
		 */
		const MEDIA_SELECTORS = [
			"[data-testid='tweetPhoto']",
			"[data-testid='card.wrapper']",
			"[data-testid='videoPlayer']",
			"[data-testid='videoComponent']",
		]

		function isInsideMedia(el: HTMLElement): boolean {
			return MEDIA_SELECTORS.some((sel) => el.closest(sel) !== null)
		}

		function fixClonedMedia(clone: HTMLElement, original: HTMLElement): void {
			// 1. Copy background-image ONLY inside media containers.
			//    Twitter's RNW Image component renders the visible image as
			//    background-image on a div via atomic CSS classes. We only need
			//    to fix this inside tweet photos / cards — NOT profile pics or icons.
			for (const sel of MEDIA_SELECTORS) {
				const cloneContainers = Array.from(clone.querySelectorAll<HTMLElement>(sel))
				const origContainers = Array.from(original.querySelectorAll<HTMLElement>(sel))

				for (let c = 0; c < cloneContainers.length && c < origContainers.length; c++) {
					const cloneDivs = Array.from(cloneContainers[c].querySelectorAll<HTMLElement>("div"))
					const origDivs = Array.from(origContainers[c].querySelectorAll<HTMLElement>("div"))

					for (let i = 0; i < cloneDivs.length && i < origDivs.length; i++) {
						const computed = window.getComputedStyle(origDivs[i])
						const bg = computed.backgroundImage
						if (bg && bg !== "none") {
							cloneDivs[i].style.backgroundImage = bg
							cloneDivs[i].style.backgroundSize = computed.backgroundSize || "cover"
							cloneDivs[i].style.backgroundPosition = computed.backgroundPosition || "center"
							cloneDivs[i].style.backgroundRepeat = "no-repeat"
						}

						// Remove dark placeholder backgrounds (black boxes)
						const bgColor = computed.backgroundColor
						if (
							bgColor === "rgb(32, 35, 39)" ||
							bgColor === "rgb(21, 24, 28)" ||
							bgColor === "rgb(39, 44, 48)"
						) {
							cloneDivs[i].style.backgroundColor = "transparent"
						}
					}
				}
			}

			// 2. Fix <img> elements — scope aggressive overrides to media only.
			const cloneImgs = clone.querySelectorAll<HTMLImageElement>("img")
			const originalImgs = original.querySelectorAll<HTMLImageElement>("img")

			cloneImgs.forEach((img, i) => {
				const origImg = originalImgs[i]

				// Force eager loading for all images
				img.removeAttribute("loading")
				img.setAttribute("loading", "eager")

				// Copy the resolved src from the original
				if (origImg?.currentSrc) {
					img.src = origImg.currentSrc
				}
				if (origImg?.srcset) {
					img.srcset = origImg.srcset
				}

				// Make opacity visible (RNW hides <img> via CSS class)
				img.style.setProperty("opacity", "1", "important")

				// Only apply size/position overrides to images INSIDE media containers
				// (tweet photos, cards, video players). Leave profile pics and icons alone.
				if (isInsideMedia(img)) {
					img.style.setProperty("position", "relative", "important")
					img.style.setProperty("z-index", "auto", "important")
					img.style.setProperty("width", "100%", "important")
					img.style.setProperty("height", "100%", "important")
					img.style.setProperty("object-fit", "cover", "important")
				}
			})

			// 3. Fix profile images — copy background-image for avatar circles.
			//    Twitter renders avatars as background-image on a div inside the
			//    [data-testid="Tweet-User-Avatar"] container.
			const cloneAvatars = clone.querySelectorAll<HTMLElement>('[data-testid="Tweet-User-Avatar"] div')
			const origAvatars = original.querySelectorAll<HTMLElement>('[data-testid="Tweet-User-Avatar"] div')
			for (let i = 0; i < cloneAvatars.length && i < origAvatars.length; i++) {
				const computed = window.getComputedStyle(origAvatars[i])
				const bg = computed.backgroundImage
				if (bg && bg !== "none") {
					cloneAvatars[i].style.backgroundImage = bg
					cloneAvatars[i].style.backgroundSize = computed.backgroundSize || "cover"
					cloneAvatars[i].style.backgroundPosition = computed.backgroundPosition || "center"
				}
			}

			// 4. Fix videos — copy poster, pause playback
			const cloneVideos = clone.querySelectorAll<HTMLVideoElement>("video")
			const originalVideos = original.querySelectorAll<HTMLVideoElement>("video")
			cloneVideos.forEach((video, i) => {
				const origVideo = originalVideos[i]
				if (origVideo?.poster) video.poster = origVideo.poster
				video.style.setProperty("object-fit", "cover", "important")
				video.preload = "none"
				try { video.pause() } catch {}
			})
		}

		function autoPopulateGrid(limit = 12): void {
			if (isPopulating) return
			isPopulating = true

			try {
				const gridContainer = document.querySelector<HTMLElement>(
					`.${GRID_CONTAINER_CLASS}`,
				)
				if (!gridContainer) return

				const tweets = getNextTweets(limit)

				for (const tweetEl of tweets) {
					const tweetId = getTweetId(tweetEl)

					// Skip duplicates
					if (tweetId && ADDED_TWEET_IDS.has(tweetId)) {
						tweetEl.setAttribute("data-twc-cloned", "true")
						continue
					}

					// Mark the original so we don't process it again.
					// The original stays in the timeline — virtualizer is untouched.
					tweetEl.setAttribute("data-twc-cloned", "true")
					if (tweetId) ADDED_TWEET_IDS.add(tweetId)

					// Deep clone the tweet node into the grid
					const clone = tweetEl.cloneNode(true) as HTMLElement

					// Clean up clone styles that the virtualizer may have set
					clone.style.removeProperty("position")
					clone.style.removeProperty("top")
					clone.style.removeProperty("left")
					clone.style.removeProperty("transform")
					clone.style.removeProperty("translate")
					clone.style.removeProperty("rotate")
					clone.style.removeProperty("width")

					// Fix lazy-loaded images and media in the clone
					fixClonedMedia(clone, tweetEl)

					const wrapper = document.createElement("article")
					wrapper.classList.add(GRID_ITEM_CLASS)
					wrapper.appendChild(clone)
					gridContainer.appendChild(wrapper)
				}
			} finally {
				isPopulating = false
			}
		}

		// ================================================================
		// Scroll driver — scrolls the hidden window to trigger Twitter's
		// IntersectionObserver sentinel and load more tweets
		// ================================================================

		function triggerLoadMore(): void {
			// Scroll the window incrementally. Twitter's sentinel-based infinite
			// scroll uses IntersectionObserver which only fires when the sentinel
			// enters the viewport. Small increments ensure we don't skip over it.
			const scrollStep = 600
			const steps = 5
			for (let i = 0; i < steps; i++) {
				window.setTimeout(() => {
					window.scrollBy(0, scrollStep)
				}, i * 100)
			}
		}

		// ================================================================
		// MutationObserver — watches for new tweets rendered by Twitter
		// ================================================================

		function setupTimelineObserver(): void {
			if (timelineObserver) return

			const timelineRoot = getTimelineRoot()
			if (!timelineRoot) return

			timelineObserver = new MutationObserver(() => {
				if (!isTwcRunning() || isPopulating) return
				// Debounce: batch mutations with rAF
				requestAnimationFrame(() => {
					autoPopulateGrid(8)
				})
			})

			timelineObserver.observe(timelineRoot, { childList: true, subtree: true })
		}

		function teardownTimelineObserver(): void {
			if (!timelineObserver) return
			timelineObserver.disconnect()
			timelineObserver = null
		}

		// ================================================================
		// Grid scroll — when user scrolls near bottom of grid, drive the
		// hidden timeline forward to load more
		// ================================================================

		function setupGridScroll(): void {
			if (gridScrollSetup) return

			const gridContainer = document.querySelector<HTMLElement>(
				`.${GRID_CONTAINER_CLASS}`,
			)
			if (!gridContainer) return

			gridScrollSetup = true
			let ticking = false

			gridContainer.addEventListener("scroll", () => {
				if (ticking) return

				const nearBottom =
					gridContainer.scrollTop + gridContainer.clientHeight >=
					gridContainer.scrollHeight - 1200

				if (!nearBottom) return

				ticking = true

				// First scroll the hidden timeline to trigger Twitter's loading
				triggerLoadMore()

				// Then harvest in waves, giving Twitter time to render new DOM
				window.setTimeout(() => {
					autoPopulateGrid(20)
					window.setTimeout(() => {
						autoPopulateGrid(20)
						ticking = false
					}, 1000)
				}, 800)
			})
		}

		// ================================================================
		// Grid container lifecycle
		// ================================================================

		function ensureGridContainer(): void {
			if (document.querySelector(`.${GRID_CONTAINER_CLASS}`)) return

			const container = document.createElement("div")
			container.classList.add(GRID_CONTAINER_CLASS)
			document.body.appendChild(container)
			setupGridScroll()
		}

		function startGame(): void {
			if (isTwcRunning()) return

			document.body.dataset.twcStarted = "true"
			document.body.dataset.twcGridMode = "true"
			ensureGridContainer()

			// Initial harvest of already-rendered tweets
			autoPopulateGrid(30)
			setupTimelineObserver()

			if (gameInterval !== -1) {
				window.clearInterval(gameInterval)
			}

			// Periodic: only harvest tweets that Twitter has already rendered.
			// Do NOT call triggerLoadMore() here — that should only happen
			// when the user scrolls near the bottom of the grid.
			gameInterval = window.setInterval(() => {
				autoPopulateGrid(8)
			}, 2000)
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
			if (gridContainer) gridContainer.remove()

			ADDED_TWEET_IDS.clear()

			if (reloadPage) window.location.reload()
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

		// ================================================================
		// UI Controls
		// ================================================================

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

		// ================================================================
		// Initialization
		// ================================================================

		function setupTwc(): void {
			loadTwcSettings()
			setStyle(twcCss)
			addTwcControls()
			if (TWC_SETTINGS.autoStart) startGame()
		}

		function ensureTwcSetup(): void {
			if (twcInitialized) return
			twcInitialized = true
			setupTwc()
		}

		// ================================================================
		// External API (used by popup / content script)
		// ================================================================

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
