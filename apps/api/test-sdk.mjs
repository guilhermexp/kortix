import { query } from "@anthropic-ai/claude-agent-sdk"
import { resolve } from "node:path"
import { config } from "dotenv"

config({ path: ".env" })

const apiKey = process.env.KIMI_API_KEY
if (!apiKey) {
	console.error("KIMI_API_KEY not set")
	process.exit(1)
}

console.log("API Key:", apiKey.substring(0, 15) + "...")
console.log("Testing SDK query...")

try {
	const iterator = query({
		prompt: "Say hello in one word",
		options: {
			model: "kimi-k2.5-coding",
			thinking: { type: "adaptive" },
			env: {
				...process.env,
				ANTHROPIC_API_KEY: apiKey,
				ANTHROPIC_AUTH_TOKEN: apiKey,
				ANTHROPIC_BASE_URL: "https://api.kimi.com/coding",
				ANTHROPIC_MODEL: "kimi-k2.5-coding",
			},
			disallowedTools: ["Bash", "Grep", "BashOutput", "ExitPlanMode"],
			permissionMode: "bypassPermissions",
			allowDangerouslySkipPermissions: true,
			executable: "node",
			persistSession: true,
			cwd: resolve(process.cwd()),
			maxTurns: 1,
			stderr: (data) => {
				console.error("[STDERR]", data.trim())
			},
		},
	})

	for await (const event of iterator) {
		const type = event?.type || "unknown"
		console.log("Event:", type, JSON.stringify(event).substring(0, 200))
	}

	console.log("✅ Success!")
} catch (err) {
	console.error("❌ Error message:", err.message)
	console.error("❌ Error name:", err.name)
	console.error("❌ Error stack:", err.stack?.split("\n").slice(0, 5).join("\n"))
}
