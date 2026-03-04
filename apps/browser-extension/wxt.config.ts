import tailwindcss from "@tailwindcss/vite"
import { defineConfig, type WxtViteConfig } from "wxt"

const DEFAULT_APP_URL = "https://kortix.claudedokploy.com"
const DEFAULT_API_URL = "https://kortix-api.claudedokploy.com"

const APP_URL = process.env.KORTIX_APP_URL ?? DEFAULT_APP_URL
const API_URL = process.env.KORTIX_API_URL ?? DEFAULT_API_URL

const appOrigin = new URL(APP_URL)
const apiOrigin = new URL(API_URL)

// See https://wxt.dev/api/config.html
export default defineConfig({
	modules: ["@wxt-dev/module-react"],
	vite: () =>
		({
			plugins: [tailwindcss()],
		}) as WxtViteConfig,
	manifest: {
		name: "Kortix",
		homepage_url: APP_URL,
		version: "6.0.004",
		permissions: [
			"contextMenus",
			"storage",
			"activeTab",
			"webRequest",
			"tabs",
			"cookies",
		],
		commands: {
			"save-to-kortix": {
				suggested_key: {
					default: "Ctrl+K",
					mac: "Command+K",
				},
				description: "Save current page to Kortix",
			},
		},
		host_permissions: [
			"*://x.com/*",
			"*://twitter.com/*",
			`${appOrigin.protocol}//${appOrigin.host}/*`,
			`${apiOrigin.protocol}//${apiOrigin.host}/*`,
			"*://chatgpt.com/*",
			"*://chat.openai.com/*",
			"*://claude.ai/*",
			"*://t3.chat/*",
			"*://notebooklm.google.com/*",
		],
		web_accessible_resources: [
			{
				resources: [
					"icon-16.png",
					"icon.svg",
					"fonts/*.ttf",
					"images/icon-128.png",
				],
				matches: ["<all_urls>"],
			},
		],
	},
	webExt: {
		chromiumArgs: ["--user-data-dir=./.wxt/chrome-data"],
	},
})
