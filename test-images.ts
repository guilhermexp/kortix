import { createFirecrawlExtractor } from "./apps/api/src/services/extraction/firecrawl-extractor"

const extractor = createFirecrawlExtractor()

async function test() {
	console.log("🖼️  Testing image extraction...\n")

	// URL that definitely has images (Google Blog post with images)
	const url = "https://blog.google/technology/ai/google-gemini-ai/"

	try {
		await extractor.initialize()

		const result = await extractor.extractFromUrl(url)

		console.log("✅ Extraction successful!\n")
		console.log("📊 Results:")
		console.log(`   Title: ${result.title}`)
		console.log(`   Source: ${result.source}`)
		console.log(`   Content length: ${result.text.length} characters`)

		console.log("\n🖼️  Images Extracted:")
		if (result.images && Array.isArray(result.images)) {
			console.log(`   Total images: ${result.images.length}`)
			console.log("\n   First 5 images:")
			result.images.slice(0, 5).forEach((img, i) => {
				console.log(`   ${i + 1}. ${img}`)
			})
		} else {
			console.log("   ❌ No images array found!")
		}

		console.log("\n📦 Raw data images:")
		if (result.raw?.images && Array.isArray(result.raw.images)) {
			console.log(`   Raw images: ${result.raw.images.length}`)
		} else {
			console.log("   ❌ No raw.images found!")
		}
	} catch (error) {
		console.error("❌ Error:", error)
		process.exit(1)
	}
}

test()
