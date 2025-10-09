/**
 * Teste simples e direto para debug
 */

import { GoogleGenerativeAI } from "@google/generative-ai"
import { aiClient } from "./src/services/ai-provider"

console.log("🧪 Teste direto do Gemini...")

const googleApiKey = process.env.GOOGLE_API_KEY

if (googleApiKey) {
	try {
		const gemini = new GoogleGenerativeAI(googleApiKey)
		const model = gemini.getGenerativeModel({ model: "gemini-2.5-flash" })

		const result = await model.generateContent({
			contents: [
				{
					role: "user",
					parts: [{ text: "Diga apenas 'OK'" }],
				},
			],
		})

		const text = result.response.text()
		console.log("✅ Gemini direto:", text)
		console.log("Tipo de response:", typeof result.response)
		console.log("Método text existe?", typeof result.response.text === "function")
	} catch (error) {
		console.error("❌ Erro Gemini direto:", error)
	}
} else {
	console.log("⚠️  GOOGLE_API_KEY não configurada")
}

console.log("\n🧪 Teste via aiClient wrapper...")

if (aiClient) {
	try {
		const model = aiClient.getGenerativeModel({ model: "models/gemini-2.5-flash" })

		const result = await model.generateContent({
			contents: [
				{
					role: "user",
					parts: [{ text: "Diga apenas 'OK'" }],
				},
			],
		})

		console.log("Tipo de result:", typeof result)
		console.log("Tipo de response:", typeof result.response)
		console.log("Response:", result.response)
		console.log("Método text existe?", typeof result.response.text === "function")

		const text = result.response.text()
		console.log("✅ aiClient wrapper:", text)
	} catch (error) {
		console.error("❌ Erro aiClient wrapper:", error)
	}
} else {
	console.log("⚠️  aiClient não configurado")
}
