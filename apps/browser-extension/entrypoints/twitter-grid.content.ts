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
/* ==========================================================
   Twitter Card Grid – CSS Completo
   ========================================================== */

/* ── 0. Body: esconder scrollbar nativa ───────────────────── */
body[data-twc-started][data-twc-grid-mode] {
	scrollbar-width: none !important;
}
body[data-twc-started][data-twc-grid-mode]::-webkit-scrollbar {
	display: none !important;
}

/* ── 1. Esconder sidebar, header, drawers ─────────────────── */
body[data-twc-started][data-twc-grid-mode] header[role="banner"],
body[data-twc-started][data-twc-grid-mode] [data-testid="sidebarColumn"],
body[data-twc-started][data-twc-grid-mode] [data-testid="DMDrawer"],
body[data-twc-started][data-twc-grid-mode] [data-testid="GrokDrawer"] {
	display: none !important;
}

/* ── 2. Esconder main original (precisa existir pro virtualizer) */
body[data-twc-started][data-twc-grid-mode] main {
	opacity: 0 !important;
	pointer-events: none !important;
	z-index: -1 !important;
	position: relative !important;
}

/* ── 3. Masonry container (CSS columns) ───────────────────── */
body[data-twc-started][data-twc-grid-mode] .${GRID_CONTAINER_CLASS} {
	display: block !important;
	column-count: 3;
	column-gap: 16px;
	position: fixed;
	top: 56px;
	left: 0;
	right: 0;
	bottom: 0;
	overflow-y: auto;
	overflow-x: hidden;
	padding: 16px;
	background-color: rgb(0, 0, 0);
	z-index: 2147483646;
}

/* ── 4. Grid item ─────────────────────────────────────────── */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} {
	min-width: 0;
	break-inside: avoid;
	margin-bottom: 16px;
	display: block;
}

/* ── 5. Card do tweet ─────────────────────────────────────── */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweet"] {
	border: 1px solid rgba(255, 255, 255, 0.12);
	border-radius: 16px;
	overflow: hidden;
	background-color: rgb(0, 0, 0);
	width: 100% !important;
	max-width: none !important;
	margin: 0 !important;
	contain: inline-size;
}

/* ── 6. Wildcard: limitar largura de TODOS os filhos ──────── */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweet"] * {
	max-width: 100% !important;
	box-sizing: border-box;
}

/* ══════════════════════════════════════════════════════════════
   CORREÇÃO #1: Divs com height FIXO inline
   Twitter coloca style="width: 502px; height: 510px;" num
   container ancestral da mídia. max-width:100% reduz o width,
   mas o HEIGHT permanece fixo → distorção.
   ══════════════════════════════════════════════════════════════ */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweet"] div[style*="height"] {
	height: auto !important;
}
/* Exceções: preservar height fixa nos avatares */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweet"] [data-testid*="UserAvatar"] div[style*="height"],
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweet"] [data-testid="Tweet-User-Avatar"] div[style*="height"] {
	height: revert !important;
}

/* ══════════════════════════════════════════════════════════════
   CORREÇÃO #2: Imagens e vídeos responsivos
   ══════════════════════════════════════════════════════════════ */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweetPhoto"] img,
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="videoPlayer"] video,
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="videoPlayer"] img,
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="videoComponent"] video {
	width: 100% !important;
	height: auto !important;
	max-height: ${GRID_MEDIA_MAX_HEIGHT_PX}px !important;
	object-fit: cover !important;
}

/* ── 8. Container de vídeo ────────────────────────────────── */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="videoPlayer"],
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="videoComponent"] {
	border-radius: 12px;
	max-height: ${GRID_MEDIA_MAX_HEIGHT_PX}px !important;
	overflow: hidden !important;
	width: 100% !important;
}

/* ══════════════════════════════════════════════════════════════
   CORREÇÃO #3: NÃO sobrescrever padding-bottom original.
   Preservar aspect ratio nativo (16:9, 9:16, 1:1, etc.).
   ══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   CORREÇÃO #4: Container de mídia com width inline fixa
   ══════════════════════════════════════════════════════════════ */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweet"] div[style*="width"] {
	width: 100% !important;
}
/* Exceções: avatares */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweet"] [data-testid*="UserAvatar"] div[style*="width"],
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweet"] [data-testid="Tweet-User-Avatar"] div[style*="width"] {
	width: revert !important;
}

/* ══════════════════════════════════════════════════════════════
   CORREÇÃO #5: tweetPhoto container
   ══════════════════════════════════════════════════════════════ */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweetPhoto"] {
	width: 100% !important;
	height: auto !important;
	max-height: ${GRID_MEDIA_MAX_HEIGHT_PX}px;
	overflow: hidden;
	border-radius: 12px;
}

/* ══════════════════════════════════════════════════════════════
   CORREÇÃO #6: Card wrapper (link previews: GitHub, etc)
   ══════════════════════════════════════════════════════════════ */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="card.wrapper"] {
	width: 100% !important;
	max-width: 100% !important;
	overflow: hidden;
	border-radius: 12px;
	border: 1px solid rgba(255, 255, 255, 0.12);
}
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="card.layoutLarge.media"],
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="card.layoutSmall.media"] {
	width: 100% !important;
	overflow: hidden;
}
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="card.wrapper"] img {
	width: 100% !important;
	height: auto !important;
	max-height: 300px;
	object-fit: cover !important;
}

/* ══════════════════════════════════════════════════════════════
   CORREÇÃO #7: Grid de múltiplas imagens
   ══════════════════════════════════════════════════════════════ */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweet"] [aria-label] div[style*="grid"] {
	width: 100% !important;
}

/* ══════════════════════════════════════════════════════════════
   CORREÇÃO #8: Links <a> com width fixa
   ══════════════════════════════════════════════════════════════ */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweet"] a {
	max-width: 100% !important;
}

/* ══════════════════════════════════════════════════════════════
   CORREÇÃO #9: Video element overflow (+3px bug do Twitter)
   ══════════════════════════════════════════════════════════════ */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} video {
	width: 100% !important;
	max-width: 100% !important;
}

/* ══════════════════════════════════════════════════════════════
   CORREÇÃO #11: Thumbnail <img> sobre vídeo – position absolute
   Quando tweetPhoto contém um <video>, o Twitter sobrepõe uma
   <img> (thumbnail) com position:absolute. Ao clonar, o clone
   perde o position:absolute e os 2 filhos empilham, dobrando
   a altura. :has(video) garante que só se aplica quando há vídeo.
   ══════════════════════════════════════════════════════════════ */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweetPhoto"]:has(video) > img {
	position: absolute !important;
	top: 0 !important;
	left: 0 !important;
	width: 100% !important;
	height: 100% !important;
	z-index: 1 !important;
	object-fit: cover !important;
}

/* ══════════════════════════════════════════════════════════════
   CORREÇÃO #10: Texto longo – truncar com line-clamp
   ══════════════════════════════════════════════════════════════ */
body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} [data-testid="tweetText"] {
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 8;
	-webkit-box-orient: vertical;
	word-break: break-word;
}

/* ── 11. Botão start (UI da extensão) ─────────────────────── */
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
	background: rgb(0, 0, 0);
	color: rgb(255, 255, 255);
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0;
	z-index: 2147483647;
	opacity: 0.7;
	border: 1px solid rgba(255, 255, 255, 0.2);
}

.twc-start:hover {
	opacity: 1;
	transform: scale(1.1);
}

.twc-txt-btn {
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
	background: none;
	border: none;
	color: rgb(139, 152, 165);
	transition: color 0.2s;
	cursor: pointer;
	font-size: 13px;
	padding: 4px 8px;
	z-index: 2147483647;
}

.twc-txt-btn:hover {
	color: rgb(255, 255, 255);
}

body[data-twc-started] .twc-start {
	display: none;
}

/* ── 12. Responsivo ───────────────────────────────────────── */
@media (max-width: 900px) {
	body[data-twc-started][data-twc-grid-mode] .${GRID_CONTAINER_CLASS} {
		column-count: 2;
	}
}

@media (max-width: 560px) {
	body[data-twc-started][data-twc-grid-mode] .${GRID_CONTAINER_CLASS} {
		column-count: 1;
		padding: 10px;
		column-gap: 10px;
	}
	body[data-twc-started][data-twc-grid-mode] .${GRID_ITEM_CLASS} {
		margin-bottom: 10px;
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
				loadedSettings = JSON.parse(
					localStorage.getItem("twc-settings") || "{}",
				)
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
				document.querySelector<HTMLElement>(
					'[aria-label="Timeline: Your Home Timeline"]',
				) ||
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
			const link = tweetEl.querySelector<HTMLAnchorElement>(
				'a[href*="/status/"]',
			)
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
				const cell = tweetEl.closest<HTMLElement>(
					"[data-testid='cellInnerDiv']",
				)
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
			for (const sel of MEDIA_SELECTORS) {
				const cloneContainers = Array.from(
					clone.querySelectorAll<HTMLElement>(sel),
				)
				const origContainers = Array.from(
					original.querySelectorAll<HTMLElement>(sel),
				)

				for (
					let c = 0;
					c < cloneContainers.length && c < origContainers.length;
					c++
				) {
					const cloneDivs = Array.from(
						cloneContainers[c].querySelectorAll<HTMLElement>("div"),
					)
					const origDivs = Array.from(
						origContainers[c].querySelectorAll<HTMLElement>("div"),
					)

					for (let i = 0; i < cloneDivs.length && i < origDivs.length; i++) {
						const computed = window.getComputedStyle(origDivs[i])
						const bg = computed.backgroundImage
						if (bg && bg !== "none") {
							cloneDivs[i].style.backgroundImage = bg
							cloneDivs[i].style.backgroundSize =
								computed.backgroundSize || "cover"
							cloneDivs[i].style.backgroundPosition =
								computed.backgroundPosition || "center"
							cloneDivs[i].style.backgroundRepeat = "no-repeat"
						}

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

				img.removeAttribute("loading")
				img.setAttribute("loading", "eager")

				if (origImg?.currentSrc) {
					img.src = origImg.currentSrc
				}
				if (origImg?.srcset) {
					img.srcset = origImg.srcset
				}

				img.style.setProperty("opacity", "1", "important")

				if (isInsideMedia(img)) {
					img.style.setProperty("position", "relative", "important")
					img.style.setProperty("z-index", "auto", "important")
					img.style.setProperty("width", "100%", "important")
					img.style.setProperty("height", "100%", "important")
					img.style.setProperty("object-fit", "cover", "important")
				}
			})

			// 3. Fix profile images — copy background-image for avatar circles.
			const cloneAvatars = clone.querySelectorAll<HTMLElement>(
				'[data-testid="Tweet-User-Avatar"] div',
			)
			const origAvatars = original.querySelectorAll<HTMLElement>(
				'[data-testid="Tweet-User-Avatar"] div',
			)
			for (let i = 0; i < cloneAvatars.length && i < origAvatars.length; i++) {
				const computed = window.getComputedStyle(origAvatars[i])
				const bg = computed.backgroundImage
				if (bg && bg !== "none") {
					cloneAvatars[i].style.backgroundImage = bg
					cloneAvatars[i].style.backgroundSize =
						computed.backgroundSize || "cover"
					cloneAvatars[i].style.backgroundPosition =
						computed.backgroundPosition || "center"
				}
			}

			// 4. Fix videos — copy poster + create fallback poster <img>.
			const cloneVideos = clone.querySelectorAll<HTMLVideoElement>("video")
			const originalVideos =
				original.querySelectorAll<HTMLVideoElement>("video")
			cloneVideos.forEach((video, i) => {
				const origVideo = originalVideos[i]
				const posterUrl = origVideo?.poster || video.getAttribute("poster")
				if (posterUrl) video.poster = posterUrl

				video.style.setProperty("object-fit", "cover", "important")
				video.preload = "none"
				try {
					video.pause()
				} catch {}

				if (posterUrl) {
					const photoContainer =
						video.closest('[data-testid="tweetPhoto"]') ||
						video.closest('[data-testid="videoPlayer"]')
					if (
						photoContainer &&
						!photoContainer.querySelector("img.twc-poster")
					) {
						const posterImg = document.createElement("img")
						posterImg.src = posterUrl
						posterImg.classList.add("twc-poster")
						posterImg.style.cssText =
							"position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;"
						photoContainer.prepend(posterImg)
					}
				}
			})

			// 5. Fallback: if tweetPhoto containers have no loaded images at all
			//    (Twitter lazy-loaded them after cloning), check and inject.
			clone
				.querySelectorAll<HTMLElement>('[data-testid="tweetPhoto"]')
				.forEach((tp) => {
					const video = tp.querySelector("video")
					const imgs = tp.querySelectorAll<HTMLImageElement>("img")
					const hasLoadedImg = Array.from(imgs).some(
						(img) => img.naturalWidth > 0 || img.currentSrc,
					)
					if (
						!hasLoadedImg &&
						video?.poster &&
						!tp.querySelector("img.twc-poster")
					) {
						const posterImg = document.createElement("img")
						posterImg.src = video.poster
						posterImg.classList.add("twc-poster")
						posterImg.style.cssText =
							"position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;z-index:1;"
						tp.prepend(posterImg)
					}
				})
		}

		// ================================================================
		// Deferred media sync — watches originals for lazy-loaded images
		// that Twitter renders AFTER we cloned the tweet, and patches the
		// grid clone when media appears.
		// ================================================================

		/** Map from tweet ID → { clone, original } for deferred patching */
		const pendingMediaSync = new Map<
			string,
			{ clone: HTMLElement; original: HTMLElement }
		>()
		let mediaSyncObserver: MutationObserver | null = null

		function setupMediaSyncObserver(): void {
			if (mediaSyncObserver) return

			mediaSyncObserver = new MutationObserver(() => {
				if (pendingMediaSync.size === 0) return

				for (const [tweetId, { clone, original }] of pendingMediaSync) {
					// Check if the original now has media that the clone is missing
					const origPhotos = original.querySelectorAll<HTMLElement>(
						'[data-testid="tweetPhoto"]',
					)
					const clonePhotos = clone.querySelectorAll<HTMLElement>(
						'[data-testid="tweetPhoto"]',
					)

					let patched = false
					origPhotos.forEach((origPhoto, idx) => {
						const clonePhoto = clonePhotos[idx]
						if (!clonePhoto) return

						// Check if clone is missing images the original now has
						const origImgs = origPhoto.querySelectorAll<HTMLImageElement>("img")
						const cloneImgs =
							clonePhoto.querySelectorAll<HTMLImageElement>("img")

						origImgs.forEach((origImg, imgIdx) => {
							if (!origImg.currentSrc) return
							const cloneImg = cloneImgs[imgIdx]
							if (cloneImg && !cloneImg.currentSrc) {
								cloneImg.src = origImg.currentSrc
								if (origImg.srcset) cloneImg.srcset = origImg.srcset
								cloneImg.style.setProperty("opacity", "1", "important")
								patched = true
							}
						})

						// Also copy background-images that appeared after clone
						const origDivs = Array.from(
							origPhoto.querySelectorAll<HTMLElement>("div"),
						)
						const cloneDivs = Array.from(
							clonePhoto.querySelectorAll<HTMLElement>("div"),
						)
						for (let i = 0; i < origDivs.length && i < cloneDivs.length; i++) {
							const computed = window.getComputedStyle(origDivs[i])
							const bg = computed.backgroundImage
							if (bg && bg !== "none" && !cloneDivs[i].style.backgroundImage) {
								cloneDivs[i].style.backgroundImage = bg
								cloneDivs[i].style.backgroundSize =
									computed.backgroundSize || "cover"
								cloneDivs[i].style.backgroundPosition =
									computed.backgroundPosition || "center"
								cloneDivs[i].style.backgroundRepeat = "no-repeat"
								patched = true
							}
						}
					})

					if (patched) {
						pendingMediaSync.delete(tweetId)
					}
				}
			})

			const timelineRoot = getTimelineRoot()
			if (timelineRoot) {
				mediaSyncObserver.observe(timelineRoot, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ["src", "style"],
				})
			}
		}

		function teardownMediaSyncObserver(): void {
			if (!mediaSyncObserver) return
			mediaSyncObserver.disconnect()
			mediaSyncObserver = null
			pendingMediaSync.clear()
		}

		/**
		 * Hide empty media containers in grid items.
		 * When Twitter's lazy loading didn't render images before cloning,
		 * the clone has a tall empty div between tweet text and the action bar.
		 * This detects that gap and hides the outermost empty container.
		 */
		function cleanEmptyMediaContainers(gridContainer: HTMLElement): void {
			const items = gridContainer.querySelectorAll<HTMLElement>(
				`.${GRID_ITEM_CLASS}`,
			)
			items.forEach((item) => {
				const article = item.querySelector<HTMLElement>('[data-testid="tweet"]')
				if (!article) return

				const textEl = article.querySelector<HTMLElement>(
					'[data-testid="tweetText"]',
				)
				const actionBar = article.querySelector<HTMLElement>('[role="group"]')
				if (!textEl || !actionBar) return

				const textBottom = textEl.getBoundingClientRect().bottom
				const actionTop = actionBar.getBoundingClientRect().top
				const gap = actionTop - textBottom

				if (gap < 60) return // Normal gap, nothing to fix

				// Check if there's actual visual content (img/video) in that space
				let hasVisualInGap = false
				article.querySelectorAll<HTMLElement>("img, video").forEach((el) => {
					const r = el.getBoundingClientRect()
					if (
						r.top >= textBottom - 10 &&
						r.bottom <= actionTop + 10 &&
						r.height > 30
					) {
						hasVisualInGap = true
					}
				})

				if (hasVisualInGap) return // Has real media, don't hide

				// Find the outermost empty container in the gap and hide it
				const candidates: Array<{ el: HTMLElement; depth: number }> = []
				article.querySelectorAll<HTMLElement>("div, a").forEach((el) => {
					const r = el.getBoundingClientRect()
					if (
						r.top >= textBottom - 5 &&
						r.bottom <= actionTop + 5 &&
						r.height > 50
					) {
						let depth = 0
						let p: HTMLElement | null = el
						while (p && p !== article) {
							depth++
							p = p.parentElement as HTMLElement | null
						}
						candidates.push({ el, depth })
					}
				})

				if (candidates.length > 0) {
					candidates.sort((a, b) => a.depth - b.depth)
					candidates[0].el.style.display = "none"
				}
			})
		}

		/**
		 * Extract real .mp4 URLs from Twitter's React fiber tree and replace
		 * cloned blob: videos with native HTML5 <video> players.
		 *
		 * Twitter uses Media Source Extensions (blob: URLs) for video playback.
		 * When we clone the DOM, the <video> loses its src. The actual .mp4 URLs
		 * are stored in the React fiber tree: memoizedProps.source.variants.
		 */
		function makeVideosPlayable(): void {
			// 1. Find the React fiber key (changes every page load)
			const sampleEl = document.querySelector('[data-testid="videoPlayer"]')
			if (!sampleEl) return
			const fiberKey = Object.keys(sampleEl).find((k) =>
				k.startsWith("__reactFiber"),
			)
			if (!fiberKey) return

			const mainEl = document.querySelector("main")
			const gc = document.querySelector<HTMLElement>(`.${GRID_CONTAINER_CLASS}`)
			if (!mainEl || !gc) return

			// 2. Build map: tweetId → best .mp4 URL from original tweets in main
			const videoMap: Record<string, { url: string; bitrate: number }> = {}
			mainEl.querySelectorAll("article").forEach((art) => {
				const vp = art.querySelector('[data-testid="videoPlayer"]')
				if (!vp) return

				const timeLink = art.querySelector('a[href*="/status/"] time')
				const statusLink = timeLink?.parentElement as HTMLAnchorElement | null
				const href = statusLink?.href ?? ""
				const match = href.match(/status\/(\d+)/)
				if (!match) return

				// Walk up the fiber tree to find source.variants
				let fiber = (vp as any)[fiberKey]
				let depth = 0
				while (fiber && depth < 25) {
					if (fiber.memoizedProps?.source?.variants) {
						const variants = fiber.memoizedProps.source.variants as Array<{
							content_type?: string
							contentType?: string
							bitrate?: number
							url?: string
							src?: string
						}>

						// Prefer ≤5Mbps for performance, fallback to highest
						let best: (typeof variants)[0] | null = null
						for (const v of variants) {
							const ct = v.content_type || v.contentType
							if (ct !== "video/mp4") continue
							const br = v.bitrate ?? 0
							if (!best || (br > (best.bitrate ?? 0) && br <= 5_000_000)) {
								best = v
							}
						}
						if (!best) {
							for (const v of variants) {
								const ct = v.content_type || v.contentType
								if (
									ct === "video/mp4" &&
									(!best || (v.bitrate ?? 0) > (best.bitrate ?? 0))
								) {
									best = v
								}
							}
						}

						if (best) {
							videoMap[match[1]] = {
								url: best.url || best.src || "",
								bitrate: best.bitrate ?? 0,
							}
						}
						break
					}
					fiber = fiber.return
					depth++
				}
			})

			// 3. Replace cloned videos with native HTML5 players
			gc.querySelectorAll<HTMLElement>(`.${GRID_ITEM_CLASS}`).forEach(
				(item) => {
					const video = item.querySelector("video")
					if (!video) return
					// Skip if already replaced
					if (video.dataset.twcPlayable) return

					const timeLink = item.querySelector('a[href*="/status/"] time')
					const href =
						(timeLink?.parentElement as HTMLAnchorElement | null)?.href ?? ""
					const match = href.match(/status\/(\d+)/)
					if (!match || !videoMap[match[1]]) return

					const tweetPhoto = item.querySelector<HTMLElement>(
						'[data-testid="tweetPhoto"]',
					)
					if (!tweetPhoto) return

					const newVideo = document.createElement("video")
					newVideo.src = videoMap[match[1]].url
					newVideo.controls = true
					newVideo.playsInline = true
					newVideo.preload = "metadata"
					newVideo.poster = video.poster || ""
					newVideo.dataset.twcPlayable = "true"
					newVideo.style.cssText =
						"width:100%; height:auto; max-height:500px; object-fit:contain; border-radius:12px; background:#000;"

					tweetPhoto.innerHTML = ""
					tweetPhoto.style.display = "block"
					tweetPhoto.appendChild(newVideo)
				},
			)
		}

		/**
		 * Wire up bookmark buttons in cloned tweets to Twitter's REST API.
		 *
		 * React event handlers don't work on cloned nodes, so we intercept
		 * clicks and call the bookmark add/remove API directly via fetch.
		 * The BEARER token is a public constant from Twitter's Web App.
		 */
		function setupBookmarkAPI(): void {
			const gc = document.querySelector<HTMLElement>(`.${GRID_CONTAINER_CLASS}`)
			if (!gc) return

			function getCsrfToken(): string | null {
				const match = document.cookie
					.split(";")
					.map((c) => c.trim())
					.find((c) => c.startsWith("ct0="))
				return match ? match.split("=")[1] : null
			}

			const BEARER =
				"AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"

			async function callBookmarkAPI(
				tweetId: string,
				action: "add" | "remove",
			): Promise<boolean> {
				const ct0 = getCsrfToken()
				if (!ct0) return false
				const url =
					action === "remove"
						? "https://x.com/i/api/1.1/bookmark/entries/remove.json"
						: "https://x.com/i/api/1.1/bookmark/entries/add.json"
				const resp = await fetch(url, {
					method: "POST",
					headers: {
						authorization: "Bearer " + decodeURIComponent(BEARER),
						"x-csrf-token": ct0,
						"x-twitter-auth-type": "OAuth2Session",
						"x-twitter-active-user": "yes",
						"content-type": "application/x-www-form-urlencoded",
					},
					body: "tweet_id=" + tweetId,
					credentials: "include",
				})
				return resp.status === 200
			}

			const FILLED_SVG =
				'<g><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z"></path></g>'
			const EMPTY_SVG =
				'<g><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"></path></g>'

			gc.querySelectorAll<HTMLElement>(`.${GRID_ITEM_CLASS}`).forEach(
				(item) => {
					const article = item.querySelector("article")
					if (!article) return

					const timeLink = article.querySelector('a[href*="/status/"] time')
					const href =
						(timeLink?.parentElement as HTMLAnchorElement | null)?.href ?? ""
					const m = href.match(/status\/(\d+)/)
					if (!m) return
					const tweetId = m[1]

					const btn = article.querySelector<HTMLElement>(
						'[data-testid="removeBookmark"], [data-testid="bookmark"]',
					)
					if (!btn || btn.dataset.twcBookmarkProxy) return

					btn.dataset.twcBookmarkProxy = "true"
					btn.style.cursor = "pointer"

					btn.addEventListener(
						"click",
						async (e) => {
							e.preventDefault()
							e.stopPropagation()
							e.stopImmediatePropagation()

							const isBookmarked =
								btn.getAttribute("data-testid") === "removeBookmark"
							const success = await callBookmarkAPI(
								tweetId,
								isBookmarked ? "remove" : "add",
							)
							if (success) {
								const svg = btn.querySelector("svg")
								if (isBookmarked) {
									btn.setAttribute("data-testid", "bookmark")
									btn.setAttribute("aria-label", "Bookmark")
									if (svg) {
										svg.innerHTML = EMPTY_SVG
										svg.style.color = "rgb(113, 118, 123)"
									}
								} else {
									btn.setAttribute("data-testid", "removeBookmark")
									btn.setAttribute("aria-label", "Bookmarked")
									if (svg) {
										svg.innerHTML = FILLED_SVG
										svg.style.color = "rgb(29, 155, 240)"
									}
								}
							}
						},
						true,
					)
				},
			)
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

					// Register for deferred media sync — if the original had lazy
					// images that weren't loaded yet, the observer will patch the
					// clone when Twitter finishes loading them.
					if (tweetId) {
						const clonePhotos = clone.querySelectorAll(
							'[data-testid="tweetPhoto"]',
						)
						const origPhotos = tweetEl.querySelectorAll(
							'[data-testid="tweetPhoto"]',
						)
						const hasMissingMedia = Array.from(clonePhotos).some((cp) => {
							const imgs = cp.querySelectorAll<HTMLImageElement>(
								"img:not(.twc-poster)",
							)
							return Array.from(imgs).some(
								(img) => !img.currentSrc && img.naturalWidth === 0,
							)
						})
						if (hasMissingMedia && origPhotos.length > 0) {
							pendingMediaSync.set(tweetId, { clone, original: tweetEl })
						}
					}

					const wrapper = document.createElement("article")
					wrapper.classList.add(GRID_ITEM_CLASS)
					wrapper.appendChild(clone)
					gridContainer.appendChild(wrapper)
				}

				// Clean up empty media containers and make videos playable
				// after a frame so layout is settled
				requestAnimationFrame(() => {
					cleanEmptyMediaContainers(gridContainer)
					makeVideosPlayable()
					setupBookmarkAPI()
				})
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

				// Only trigger when user is very close to the actual bottom
				// (within 400px). This prevents premature loading that shifts
				// content while the user is still reading.
				const nearBottom =
					gridContainer.scrollTop + gridContainer.clientHeight >=
					gridContainer.scrollHeight - 400

				if (!nearBottom) return

				ticking = true

				// Scroll the hidden timeline to trigger Twitter's loading
				triggerLoadMore()

				// Harvest in waves, giving Twitter time to render new DOM
				window.setTimeout(() => {
					autoPopulateGrid(20)
					window.setTimeout(() => {
						autoPopulateGrid(20)
						ticking = false
					}, 1500)
				}, 1000)
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
			setupMediaSyncObserver()

			if (gameInterval !== -1) {
				window.clearInterval(gameInterval)
			}

			// No periodic polling — only load more when the user scrolls
			// near the bottom. This prevents content shifts while reading.
		}

		function stopGame(reloadPage = false): void {
			if (gameInterval !== -1) {
				window.clearInterval(gameInterval)
				gameInterval = -1
			}

			teardownTimelineObserver()
			teardownMediaSyncObserver()
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

		// ================================================================
		// Auto-initialize — show the grid button as soon as X loads
		// ================================================================

		function autoInit(): void {
			if (document.readyState === "loading") {
				document.addEventListener("DOMContentLoaded", () => ensureTwcSetup())
			} else {
				ensureTwcSetup()
			}
		}

		autoInit()
	},
})
