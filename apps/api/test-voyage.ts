/**
 * Test script for Voyage AI embeddings
 */

const VOYAGE_API_KEY = "pa-g6do78pHh5PKqcP5hAWASaYNFtd3lLeSwvUe6ZwQkKE"
const API_URL = "https://api.voyageai.com/v1/embeddings"

async function testVoyageAI() {
	console.log("Testing Voyage AI API...")
	console.log("API Key:", VOYAGE_API_KEY.substring(0, 15) + "...")

	try {
		const response = await fetch(API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${VOYAGE_API_KEY}`,
			},
			body: JSON.stringify({
				input: "Hello World",
				model: "voyage-3.5-lite",
				input_type: "document",
			}),
		})

		console.log("Status:", response.status, response.statusText)

		if (!response.ok) {
			const error = await response.text()
			console.error("Error response:", error)
			return
		}

		const data = await response.json()
		console.log("Success!")
		console.log("Embedding dimension:", data.data[0].embedding.length)
		console.log("Tokens used:", data.usage.total_tokens)
		console.log("First 10 values:", data.data[0].embedding.slice(0, 10))
	} catch (error) {
		console.error("Request failed:", error)
	}
}

testVoyageAI()
