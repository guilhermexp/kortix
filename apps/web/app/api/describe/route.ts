// ============================================================
// Image Description API
// Uses Gemini Vision to describe images
// ============================================================

import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { generateText } from "ai"
import { type NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
	try {
		const { imageUrl, language = "pt-BR" } = await req.json()

		if (!imageUrl) {
			return NextResponse.json(
				{ error: "Image URL is required" },
				{ status: 400 },
			)
		}

		const apiKey = process.env.API_KEY || process.env.GOOGLE_API_KEY
		if (!apiKey) {
			return NextResponse.json(
				{ error: "Google API key not configured" },
				{ status: 500 },
			)
		}

		const google = createGoogleGenerativeAI({ apiKey })
		const model = google("gemini-2.0-flash")

		const languagePrompts: Record<string, string> = {
			"pt-BR":
				"Descreva esta imagem de forma detalhada em português brasileiro. Inclua cores, objetos, composição, estilo e sentimento geral.",
			en: "Describe this image in detail. Include colors, objects, composition, style, and overall mood.",
		}

		const prompt = languagePrompts[language] ?? languagePrompts["pt-BR"] ?? ""

		const result = await generateText({
			model,
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: prompt },
						{ type: "image", image: imageUrl as string },
					],
				},
			],
		})

		return NextResponse.json({
			description: result.text,
		})
	} catch (error) {
		console.error("[Describe API Error]:", error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			{ status: 500 },
		)
	}
}
