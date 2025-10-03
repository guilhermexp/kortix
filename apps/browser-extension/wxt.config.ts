import tailwindcss from "@tailwindcss/vite"
import { defineConfig, type WxtViteConfig } from "wxt"

const DEFAULT_APP_URL = "https://repoweb-production.up.railway.app"
const DEFAULT_API_URL = "https://repoapi-production-d4f7.up.railway.app"

const APP_URL = process.env.SUPERMEMORY_APP_URL ?? DEFAULT_APP_URL
const API_URL = process.env.SUPERMEMORY_API_URL ?? DEFAULT_API_URL

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
		name: "supermemory",
		homepage_url: APP_URL,
		version: "6.0.003",
		permissions: ["contextMenus", "storage", "activeTab", "webRequest", "tabs"],
		host_permissions: [
			"*://x.com/*",
			"*://twitter.com/*",
			`${appOrigin.protocol}//${appOrigin.host}/*`,
			`${apiOrigin.protocol}//${apiOrigin.host}/*`,
			"*://chatgpt.com/*",
			"*://chat.openai.com/*",
		],
		web_accessible_resources: [
			{
				resources: ["icon-16.png", "fonts/*.ttf"],
				matches: ["<all_urls>"],
			},
		],
	},
	webExt: {
		chromiumArgs: ["--user-data-dir=./.wxt/chrome-data"],
	},
})
