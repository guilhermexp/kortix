// ============================================================
// TLDraw AI Agent Generate API
// Non-streaming AI response for canvas manipulation
// ============================================================

import type { NextRequest } from "next/server"
import { generateAgent } from "@/lib/ai/AgentService"
import type { TLAiSerializedPrompt } from "@/lib/ai/tldraw-ai-types"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
	try {
		const prompt = (await req.json()) as TLAiSerializedPrompt
		const result = await generateAgent(prompt)

		return new Response(JSON.stringify(result), {
			headers: { "Content-Type": "application/json" },
		})
	} catch (error) {
		console.error("API error:", error)
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : "Unknown error",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		)
	}
}
