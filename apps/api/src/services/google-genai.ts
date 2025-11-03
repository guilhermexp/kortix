import { GoogleGenerativeAI } from "@google/generative-ai"
import { env } from "../env"

let singletonClient: GoogleGenerativeAI | null = null

function normaliseModelId(modelId: string) {
	if (!modelId) {
		return "models/gemini-2.0-flash"
	}
	return modelId.startsWith("models/") ? modelId : `models/${modelId}`
}

export function getGoogleClient(): GoogleGenerativeAI | null {
	if (singletonClient) {
		return singletonClient
}
	const apiKey = env.GOOGLE_API_KEY
	if (!apiKey) {
		return null
	}
	singletonClient = new GoogleGenerativeAI(apiKey)
	return singletonClient
}

export function getGoogleModel(modelId: string) {
	const client = getGoogleClient()
	if (!client) {
		return null
	}
	return client.getGenerativeModel({ model: normaliseModelId(modelId) })
}
