// @ts-nocheck
/**
 * TweetsAgainstHumanity by rebane2001 — runs in MAIN world
 * https://github.com/rebane2001/TweetsAgainstHumanity/
 *
 * MUST run in MAIN world (same as page JS) so that:
 * - blob: URLs for videos work
 * - Twitter's React-managed media elements render properly
 * - DOM moves preserve all media state
 */

export default defineContentScript({
	matches: ["*://x.com/*", "*://twitter.com/*"],
	world: "MAIN",
	main() {
// ==UserScript==
// @name        Tweets Against Humanity
// @description Turn Twitter into a deck-building rougelike
// @homepage    https://github.com/rebane2001/TweetsAgainstHumanity/
// @author      rebane2001
// @namespace   rebane2001
// @version     1.0.2
// @noframes
// @match       https://x.com/*
// @match       https://twitter.com/*
// @grant       none
// ==/UserScript==

const TWC_VERSION = "1.0.2";

const TWC_SETTINGS = {
    version: TWC_VERSION,
    cardCount: 5,
    autoStart: false,
    viewMode: "grid", // "card" or "grid" (Pinterest-style)
};

// based on https://stackoverflow.com/a/61511955/2251833
async function waitForQuery(selector, timeoutMs = 30000) {
    return new Promise(resolve => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(mutations => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                clearTimeout(timer);
                resolve(document.querySelector(selector));
            }
        });

        const timer = setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, timeoutMs);

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}



let TWC_NEXT_TWEET_SELECTOR = "div:not([aria-label='Timeline: Conversation']) > div > [data-testid='cellInnerDiv']:not(:has(>.HiddenTweet)) [data-testid='tweet']:not([data-twc-used])";
const TWC_SIDEBAR_SELECTOR = "nav[aria-label='Primary']";

let twcCss = `
.twc-txt-btn {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: none;
    border: none;
    color: light-dark(#536471, #8B98A5);
    transition: color 0.2s;
    &[open], &:hover {
        color: light-dark(#000, #FFF);
    }
    & > summary {
        list-style: none;
    }
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
    color: #FFF;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
    z-index: 9999;
    &:hover {
        opacity: 1;
        transform: scale(1.05);
    }
}

html:has(body[data-twc-started]) {
    scrollbar-width: none;
}

body:not([data-twc-started]) {
    .twc-txt-btn {
        display: none;
    }
}

body[data-twc-started] {

    main div:not([aria-label="Timeline: Conversation"]) > div > [data-testid='cellInnerDiv']:not(:has([data-twc-used])):not(:has(>div>div>div[role=progressbar])) {
        opacity: 0;
        pointer-events: none;
    }
    
    [data-testid='cellInnerDiv']:has([data-twc-used]) {
        position: fixed !important;
        top: 0;
        left: 0;
        transform: none!important;
        transition: display 1s allow-discrete;
        &:has([data-twc-gone]) {
            display: none;
        }
        &>*{border-bottom-color:#0000}
    }
    
    
    [data-twc-card] {
        --max-offset: min(min(512px, 512px / 4.5 * var(--card-count)), calc(50vw - 256px));
        --rot: calc((var(--card-offset) - 0.5) * 2 * min(5deg, 5deg / 4 * var(--card-count)));
        --yRot: calc(max(50px * abs(sin(var(--rot) * 10)), 18px) / 1.5);
        position: absolute;
        background: light-dark(#FFF, #000);
        top: 100dvh;
        left: 50dvw;
        width: 360px;
        width: 480px;
        width: 400px;
        translate: calc(-50% + (var(--card-offset) - 0.5) * 2 * var(--max-offset)) calc(-100px + var(--yRot));
        rotate: var(--rot);
        border: 2px solid light-dark(#EEE8, #123);
        border-radius: 32px;
        @supports (corner-shape: superellipse(1.5)) {
            border-radius: 42px;
            corner-shape: superellipse(1.5);
        }
        box-shadow: 2px 2px 8px light-dark(#8884, #0004);
        padding-right: 12px;
        padding-left: 12px;
    
        transition: translate 0.4s, rotate 0.4s, background 0.4s;
        &:hover, &:has(:hover) {
            background: light-dark(#EEE, #111);
            translate: calc(-50% + (var(--card-offset) - 0.5) * 2 * var(--max-offset)) max(calc(-100% - 32px), -256px);
            --rot: calc((var(--card-offset) - 0.5) * 2 * 2deg);
        }
    
        &[data-twc-pick] {
            --rot: 0deg;
            translate: -50% calc(-50dvh - 50% - 40px + 25px);
        }
    
        &[data-twc-gone] {
            translate: calc(-50% + (var(--card-offset) - 0.5) * 2 * var(--max-offset)) 8px;
        }
    
        [data-testid="tweetText"], [data-testid="tweetPhoto"] {
            transition: filter 0.4s;
            filter: none;
        }
    
        [role="link"]:has([data-testid="Tweet-User-Avatar"]) {
            box-shadow: 4px 4px 16px inset light-dark(#0124, #0128);
            outline: none;
        }
    
        
        &:not([data-twc-pick]) {
            [data-testid="tweetText"], [data-testid="tweetPhoto"] {
                transition: none;
                filter: blur(12px);
            }
        }
    }
    
    [data-testid=primaryColumn] {
        border: none;
    }
    
    [aria-label="Home timeline"]>*:not(:has([data-testid=tweet])):not(:first-child), header[role=banner], [data-testid=sidebarColumn], [data-testid=DMDrawer], [data-testid=GrokDrawer] {
        opacity: 0;
        pointer-events: none;
    }
    
    [aria-label="Home timeline"]:not(:has(div[aria-label="Timeline: Conversation"])) > :first-child {
        pointer-events: all;
        opacity: 1;
        position: fixed;
        top: 0;
        left: 50vw;
        width: 50vw;
        translate: -50% 0;
        nav {
            border-bottom-color: #0000;
        }
        [aria-selected="true"]>*>*>:not(:first-child) {
            opacity: 0;
        }
    }

    [data-testid="cellInnerDiv"]:has(>div>div>div[role=progressbar]) {
        transform: none!important;
        position: fixed!important;
        bottom: 0;
        left: 0;
    }

    .twc-start {
        display: none;
    }

}

/* Grid Mode (Pinterest-style) */
.twc-grid-container {
    display: none;
}

body[data-twc-started][data-twc-grid-mode] {
    overflow: auto !important;

    /* Hide sidebars */
    header[role=banner], [data-testid=sidebarColumn], [data-testid=DMDrawer], [data-testid=GrokDrawer] {
        display: none !important;
    }

    /* Hide original timeline */
    main {
        position: absolute !important;
        left: -9999px !important;
        opacity: 0.01 !important;
    }

    /* Show grid container */
    .twc-grid-container {
        display: block !important;
        position: fixed;
        top: 60px;
        left: 0;
        right: 0;
        bottom: 0;
        overflow-y: auto;
        padding: 20px;
        background: light-dark(#F7F7F7, #000);
        z-index: 1000;
        column-count: 3;
        column-gap: 16px;
    }

    .twc-grid-item {
        break-inside: avoid;
        margin-bottom: 16px;

        [data-twc-card] {
            position: relative !important;
            top: auto !important;
            left: auto !important;
            width: 100% !important;
            translate: none !important;
            rotate: none !important;
            border-radius: 16px;
            border: 1px solid light-dark(#DDD, #333);
            overflow: hidden;

            [data-testid="tweetText"], [data-testid="tweetPhoto"] {
                filter: none !important;
            }

            /* Make video clickable - remove ALL overlay interference */
            [data-testid="videoPlayer"] {
                position: relative;
                z-index: 10;
            }

            /* Remove pointer events from ALL divs in video area except our overlay */
            [data-testid="videoPlayer"] div:not(.twc-video-overlay) {
                pointer-events: none !important;
            }

            /* Our click overlay - MUST receive clicks */
            .twc-video-overlay {
                pointer-events: auto !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                right: 0 !important;
                bottom: 0 !important;
                z-index: 99999 !important;
                cursor: pointer !important;
                background: transparent !important;
            }

            /* But keep video and controls clickable */
            [data-testid="videoPlayer"] video {
                position: relative !important;
                z-index: 9999 !important;
                pointer-events: auto !important;
                cursor: pointer !important;
            }

            /* Also target the specific overlay classes */
            .r-9aw3ui, .r-1p0dtai, .r-1d2f490, .r-u8s1d, .r-zchlnj, .r-ipm5af {
                pointer-events: none !important;
            }
        }
    }
}

@media (max-width: 1200px) {
    body[data-twc-started][data-twc-grid-mode] .twc-grid-container {
        column-count: 2;
    }
}

@media (max-width: 700px) {
    body[data-twc-started][data-twc-grid-mode] .twc-grid-container {
        column-count: 1;
    }
}

.twc-mode-toggle {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: transparent;
    border: none;
    color: light-dark(#666, #888);
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: color 0.2s;
    &:hover {
        color: light-dark(#000, #FFF);
    }
    &[data-active] {
        color: #1d9bf0;
    }
}
`;

const TWC_LANG_STRINGS = {
    "Timeline: Conversation": "Timeline: Conversation",
    "Home timeline": "Home timeline",
}

/*

Does not work atm due to isolated extension world.

function extractLangStrings() {
    const langFun = Object.values(window.webpackChunk_twitter_responsive_web.find(e=>e[0][0].startsWith("i18n") && !e[0][0].startsWith("i18n/emoji"))[1])[0].toString();
    const str_timeline = langFun.split('a("e5b0063d",(function(e){return"')[1].split('"+e.title')[0];
    const str_conversation = langFun.split('a("d35d74e4","')[1].split('")')[0];
    TWC_LANG_STRINGS["Timeline: Conversation"] = `${str_timeline}${str_conversation}`;
    TWC_LANG_STRINGS["Home timeline"] = langFun.split('a("c67e3fc2","')[1].split('")')[0];

    for (let [k,v] in Object.entries(TWC_LANG_STRINGS)) {
        TWC_NEXT_TWEET_SELECTOR = TWC_NEXT_TWEET_SELECTOR.replaceAll(k, v);
        twcCss = twcCss.replaceAll(k, v);
    }
}
*/

function getNextTweets(count) {
    const nextTweets = [...document.querySelectorAll(TWC_NEXT_TWEET_SELECTOR)].slice(0, count);
    nextTweets.forEach(e => e.dataset.twcUsed = true);
    return nextTweets;
}

function setStyle(styleText) {
    let styleEl = document.querySelector(".twc-style");
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.classList.add("twc-style");
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = styleText;
}

function cardNextTweets(count) {
    // In grid mode, auto-add tweets to grid
    if (TWC_SETTINGS.viewMode === "grid") {
        autoPopulateGrid();
        return;
    }

    const nextTweets = getNextTweets(count);
    nextTweets.forEach((e,i) => {
        e.dataset.twcCard = true;
        e.setAttribute("style", (e.getAttribute("style") ?? "") + `; --card-offset: ${i/(count-1)}; --card-count: ${count}`);
        e.addEventListener("click", (ev)=>{ev.preventDefault();pickCard(e)}, {capture:true,once:true});
    });
}

function getTweetId(tweet) {
    // Extract tweet ID from the status link
    const link = tweet.querySelector('a[href*="/status/"]');
    if (!link) return null;
    const match = link.href.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
}

function autoPopulateGrid() {
    const gridContainer = document.querySelector(".twc-grid-container");
    if (!gridContainer) return;

    // Get available tweets
    const tweets = [...document.querySelectorAll(TWC_NEXT_TWEET_SELECTOR)].slice(0, 10);
    if (tweets.length === 0) return;

    tweets.forEach(tweet => {
        // Get tweet ID and check if already added
        const tweetId = getTweetId(tweet);
        if (tweetId && TWC_ADDED_TWEET_IDS.has(tweetId)) {
            tweet.dataset.twcUsed = true; // Mark as used so we skip it next time
            return; // Skip this tweet, already in grid
        }

        tweet.dataset.twcUsed = true;
        tweet.dataset.twcCard = true;

        // Add to tracking set
        if (tweetId) {
            TWC_ADDED_TWEET_IDS.add(tweetId);
        }

        // Capture video info BEFORE moving
        const videoData = captureVideoData(tweet);

        const cardWrapper = document.createElement("div");
        cardWrapper.classList.add("twc-grid-item");

        // Move element to grid
        cardWrapper.appendChild(tweet);
        gridContainer.appendChild(cardWrapper);

        // Fix video after moving (always try if there's a video)
        fixVideoPlayer(tweet, videoData || {});
    });
}

function captureVideoData(tweet) {
    const video = tweet.querySelector('video');
    if (!video) return null;

    // Get all possible sources
    const sources = [];

    // Direct src
    if (video.src && !video.src.startsWith('blob:')) {
        sources.push(video.src);
    }

    // Source elements
    video.querySelectorAll('source').forEach(source => {
        if (source.src && !source.src.startsWith('blob:')) {
            sources.push(source.src);
        }
    });

    // Check for data attributes with video URL
    const videoContainer = tweet.querySelector('[data-testid="videoPlayer"]');
    if (videoContainer) {
        // Look for video URL in various places
        const allElements = videoContainer.querySelectorAll('*');
        allElements.forEach(el => {
            // Check style for background-image with video poster
            const style = el.getAttribute('style') || '';
            const bgMatch = style.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/);
            if (bgMatch) {
                // This might be the poster
            }
        });
    }

    const poster = video.poster || video.getAttribute('poster') || '';

    return {
        sources,
        poster,
        originalVideo: video
    };
}

function fixVideoPlayer(tweet, videoData) {
    let video = tweet.querySelector('video');
    if (!video) return;

    const videoContainer = tweet.querySelector('[data-testid="videoPlayer"]');
    if (!videoContainer) return;

    // If video has no valid src after move, try to restore it
    const sources = videoData?.sources || [];
    const poster = videoData?.poster || '';
    if ((!video.src || video.src.startsWith('blob:') || video.readyState === 0) && sources.length > 0) {
        // Create new video element
        const newVideo = document.createElement('video');
        newVideo.controls = true;
        newVideo.playsInline = true;
        newVideo.preload = 'metadata';
        newVideo.style.cssText = 'width: 100%; height: auto; border-radius: 12px;';

        if (poster) {
            newVideo.poster = poster;
        }

        sources.forEach(src => {
            const source = document.createElement('source');
            source.src = src;
            source.type = 'video/mp4';
            newVideo.appendChild(source);
        });

        // Replace the broken video container
        const container = video.closest('[data-testid="videoPlayer"]') || video.parentElement;
        if (container) {
            container.innerHTML = '';
            container.appendChild(newVideo);
            video = newVideo; // Update reference to new video
        }
    }

    // Now add the click overlay AFTER any video replacement
    // Remove any existing overlay first
    const existingOverlay = videoContainer.querySelector('.twc-video-overlay');
    if (existingOverlay) existingOverlay.remove();

    // Create overlay with our special class (CSS handles positioning)
    const clickOverlay = document.createElement('div');
    clickOverlay.classList.add('twc-video-overlay');

    // Get reference to current video element
    const currentVideo = tweet.querySelector('video');

    clickOverlay.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentVideo) {
            if (currentVideo.paused) {
                currentVideo.play();
            } else {
                currentVideo.pause();
            }
        }
    });

    // Make container relative for overlay positioning
    videoContainer.style.position = 'relative';
    videoContainer.appendChild(clickOverlay);
}

function addVideoClickHandler(wrapper, tweet) {
    // Find the tweet URL
    const tweetLink = tweet.querySelector('a[href*="/status/"]');
    if (!tweetLink) return;

    const tweetUrl = tweetLink.href.split('?')[0]; // Clean URL

    // Find video/media elements and add click handler
    const mediaElements = wrapper.querySelectorAll('[data-testid="videoPlayer"], [data-testid="tweetPhoto"] video, [data-testid="videoComponent"]');

    mediaElements.forEach(media => {
        media.style.cursor = 'pointer';
        media.addEventListener('click', (e) => {
            // Check if video is actually playing
            const video = media.querySelector('video') || media;
            if (video.tagName === 'VIDEO' && !video.paused) {
                return; // Video is playing, don't interfere
            }

            // Open tweet in new tab
            e.preventDefault();
            e.stopPropagation();
            window.open(tweetUrl, '_blank');
        }, { capture: true });
    });

    // Also handle clicks on play button overlays
    const playButtons = wrapper.querySelectorAll('[aria-label*="Play"], [role="button"]:has(svg)');
    playButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Give it a moment to see if video starts
            setTimeout(() => {
                const video = wrapper.querySelector('video');
                if (!video || video.paused) {
                    window.open(tweetUrl, '_blank');
                }
            }, 300);
        });
    });
}

function triggerLoadMore() {
    // Find the timeline and scroll it to trigger Twitter's infinite scroll
    const timeline = document.querySelector('[aria-label="Home timeline"]');
    if (timeline) {
        timeline.scrollTop = timeline.scrollHeight;
    }

    // Also try scrolling the virtualized container
    const virtualContainer = document.querySelector('[aria-label="Home timeline"] > div:nth-child(2)');
    if (virtualContainer) {
        virtualContainer.scrollTop = virtualContainer.scrollHeight;
    }

    // And the main window
    window.scrollTo(0, document.body.scrollHeight);
}

// Setup infinite scroll for grid mode
let gridScrollSetup = false;
function setupGridScroll() {
    if (gridScrollSetup) return;
    gridScrollSetup = true;

    const gridContainer = document.querySelector(".twc-grid-container");
    if (!gridContainer) return;

    let isLoading = false;

    // Load initial batch
    autoPopulateGrid();

    gridContainer.addEventListener("scroll", () => {
        // When near bottom (500px from end), load more
        const nearBottom = gridContainer.scrollTop + gridContainer.clientHeight >= gridContainer.scrollHeight - 500;

        if (!isLoading && nearBottom) {
            isLoading = true;

            // First, add any available tweets to grid
            autoPopulateGrid();

            // Then trigger Twitter to fetch more
            triggerLoadMore();

            // Wait before allowing another load (debounce)
            setTimeout(() => {
                isLoading = false;
            }, 1500);
        }
    });
}

function pickCard(cardEl) {
    if (window.cardSnd) {
        cardSnd.currentTime = 0;
        cardSnd.play();
    }
    const otherCards = [...document.querySelectorAll("[data-twc-card]:not([data-twc-gone])")].filter(e=>e!==cardEl);
    otherCards.forEach(e=>e.dataset.twcGone = true);
    cardEl.dataset.twcPick = true;

    // In grid mode, move picked card to the grid container
    if (TWC_SETTINGS.viewMode === "grid") {
        const gridContainer = document.querySelector(".twc-grid-container");
        if (gridContainer) {
            // Move actual element to preserve blob URLs and media
            const cardWrapper = document.createElement("div");
            cardWrapper.classList.add("twc-grid-item");
            cardEl.dataset.twcPick = true;
            delete cardEl.dataset.twcGone;
            cardWrapper.appendChild(cardEl);
            gridContainer.prepend(cardWrapper);
        }
    }

    cardNextTweets(TWC_SETTINGS.cardCount);
}

let TWC_GAME_INTERVAL = -1;
const TWC_ADDED_TWEET_IDS = new Set(); // Track tweets already added to grid

async function startGame() {
    document.body.dataset.twcStarted = true;
    updateViewMode();
    await waitForQuery(TWC_NEXT_TWEET_SELECTOR);
    cardNextTweets(TWC_SETTINGS.cardCount);
    // todo: make this better
    if (TWC_GAME_INTERVAL != -1)
        clearInterval(TWC_GAME_INTERVAL);
    TWC_GAME_INTERVAL = setInterval(() => {
        if (!document.querySelector("[data-twc-card]:not([data-twc-gone]):not([data-twc-pick])"))
            cardNextTweets(TWC_SETTINGS.cardCount);
    }, 1000);
}

async function stopGame() {
    if (TWC_GAME_INTERVAL != -1)
        clearInterval(TWC_GAME_INTERVAL);
    delete document.body.dataset.twcStarted;
    delete document.body.dataset.twcGridMode;
    const gridContainer = document.querySelector(".twc-grid-container");
    if (gridContainer) gridContainer.remove();
    TWC_ADDED_TWEET_IDS.clear(); // Reset tracking for next session
}

function toggleViewMode() {
    TWC_SETTINGS.viewMode = TWC_SETTINGS.viewMode === "card" ? "grid" : "card";
    saveTwcSettings();
    updateViewMode();
}

function updateViewMode() {
    const toggleBtn = document.querySelector(".twc-mode-toggle");
    if (toggleBtn) {
        if (TWC_SETTINGS.viewMode === "grid") {
            toggleBtn.dataset.active = true;
            toggleBtn.innerText = "Grid";
        } else {
            delete toggleBtn.dataset.active;
            toggleBtn.innerText = "Cards";
        }
    }

    if (TWC_SETTINGS.viewMode === "grid") {
        document.body.dataset.twcGridMode = true;
        ensureGridContainer();
    } else {
        delete document.body.dataset.twcGridMode;
    }
}

function ensureGridContainer() {
    if (!document.querySelector(".twc-grid-container")) {
        const container = document.createElement("div");
        container.classList.add("twc-grid-container");
        document.body.appendChild(container);
        setupGridScroll();
    }
}

function loadTwcSettings() {
    let loadedSettings = {};
    try {
        loadedSettings = JSON.parse(localStorage.getItem("twc-settings") || "{}");
    } catch {
        localStorage.removeItem("twc-settings");
    }
    Object.entries(TWC_SETTINGS).forEach(([k,v]) => {
        if (Object.hasOwn(loadedSettings, k))
            TWC_SETTINGS[k] = loadedSettings[k];
    });
}

function saveTwcSettings() {
    TWC_SETTINGS.version = TWC_VERSION;
    localStorage.setItem("twc-settings", JSON.stringify(TWC_SETTINGS));
}

async function setupTwc() {
    loadTwcSettings();
    addTwcControls();
    // extractLangStrings();
    setStyle(twcCss);
    if (TWC_SETTINGS.autoStart)
        startGame();
}

function createSetting(name, label, type) {
    const div = document.createElement("div");
    div.classList.add("twc-setting");

    const labelEl = document.createElement("label");
    labelEl.innerText = `${label}: `;

    const input = document.createElement("input");
    input.name = name;
    input.type = type;

    if (type == "checkbox") {
        input.checked = TWC_SETTINGS[name];
    } else {
        input.value = TWC_SETTINGS[name];
    }

    input.oninput = () => {
        if (type == "checkbox") {
            TWC_SETTINGS[name] = input.checked;
        } else {
            TWC_SETTINGS[name] = parseInt(input.value);
        }
        saveTwcSettings();
    }
    
    labelEl.appendChild(input);
    div.appendChild(labelEl);

    return [div, input];
}

function addTwcControls() {
    const twcButton = document.createElement("button");
    twcButton.classList.add("twc-start");
    twcButton.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="7" height="7" rx="1.5"/><rect x="12" y="1" width="7" height="7" rx="1.5"/><rect x="1" y="12" width="7" height="7" rx="1.5"/><rect x="12" y="12" width="7" height="7" rx="1.5"/></svg>`;
    twcButton.title = "Grid Mode";
    twcButton.onclick = () => {
        TWC_SETTINGS.viewMode = "grid";
        startGame();
    };
    document.body.appendChild(twcButton);

    const twcStop = document.createElement("button");
    twcStop.classList.add("twc-txt-btn");
    twcStop.innerText = "X";
    twcStop.style.position = "fixed";
    twcStop.style.top = "16px";
    twcStop.style.right = "16px";
    twcStop.style.cursor = "pointer";
    twcStop.onclick = stopGame;
    document.body.appendChild(twcStop);

    // View mode toggle button
    const twcModeToggle = document.createElement("button");
    twcModeToggle.classList.add("twc-txt-btn", "twc-mode-toggle");
    twcModeToggle.innerText = TWC_SETTINGS.viewMode === "grid" ? "Grid" : "Cards";
    twcModeToggle.style.position = "fixed";
    twcModeToggle.style.top = "16px";
    twcModeToggle.style.right = "50px";
    twcModeToggle.onclick = toggleViewMode;
    if (TWC_SETTINGS.viewMode === "grid") twcModeToggle.dataset.active = true;
    document.body.appendChild(twcModeToggle);

    const twcSettings = document.createElement("details");
    const twcSettingsSum = document.createElement("summary");
    twcSettingsSum.innerText = "Settings";
    twcSettingsSum.style.cursor = "pointer";
    twcSettings.appendChild(twcSettingsSum);
    twcSettings.classList.add("twc-txt-btn");
    twcSettings.style.position = "fixed";
    twcSettings.style.top = "16px";
    twcSettings.style.left = "16px";

    const [cardCountDiv, cardCountInput] = createSetting("cardCount", "Card count", "number");
    cardCountInput.min = 3;
    cardCountInput.max = 7;
    twcSettings.appendChild(cardCountDiv);

    const [autoStartDiv, autoStartInput] = createSetting("autoStart", "Autostart", "checkbox");
    twcSettings.appendChild(autoStartDiv);

    const creditP = document.createElement("p");
    creditP.innerHTML = `
<a href="https://github.com/rebane2001/TweetsAgainstHumanity" target="_blank">Tweets Against Humanity</a> v${TWC_VERSION.replace(/[^0-9.a-z]/g,'')}<br>
by <a href="https://lyra.horse" target="_blank">rebane2001</a>`;
    twcSettings.appendChild(creditP);

    document.body.appendChild(twcSettings);
}

let twcInitialized = false;

function ensureTwcSetup() {
	if (!twcInitialized) {
		twcInitialized = true;
		setupTwc();
	}
}

function isTwcRunning() {
	return "twcStarted" in document.body.dataset;
}

function toggleTwcGrid() {
	if (isTwcRunning()) {
		stopGame();
		return false;
	}

	ensureTwcSetup();
	TWC_SETTINGS.viewMode = "grid";
	saveTwcSettings();
	startGame();
	return true;
}

// Request/response bridge for isolated content script (popup button)
document.addEventListener("kortix-grid-request", (event) => {
	const detail = event?.detail || {};
	const requestId = detail.requestId;
	const command = detail.command;

	let active = isTwcRunning();
	if (command === "toggle") {
		active = toggleTwcGrid();
	} else if (command === "state") {
		active = isTwcRunning();
	}

	document.dispatchEvent(
		new CustomEvent("kortix-grid-response", {
			detail: { requestId, active },
		}),
	);
});

// Backward-compatible one-way toggle event
document.addEventListener("kortix-toggle-grid", () => {
	toggleTwcGrid();
});

	},
})
