import { createFirecrawlExtractor } from "./apps/api/src/services/extraction/firecrawl-extractor"

const extractor = createFirecrawlExtractor()

async function test() {
	console.log(
		"🚀 Testing preview extraction with a site that has og:image...\n",
	)

	// GitHub has og:image
	const url = "https://github.com/anthropics/anthropic-sdk-typescript"

	try {
		await extractor.initialize()

		const result = await extractor.extractFromUrl(url)

		console.log("✅ Extraction successful!\n")
		console.log("📊 Results:")
		console.log(`   Title: ${result.title}`)
		console.log(`   Content length: ${result.text.length} characters`)
		console.log("\n🖼️  Preview Metadata:")
		console.log(`   metadata.image: ${result.metadata?.image || "NOT FOUND"}`)
		console.log("\n🏷️  Meta Tags:")
		console.log(
			`   og:image: ${result.extractionMetadata?.metaTags?.ogImage || "NOT FOUND"}`,
		)
		console.log(
			`   twitter:image: ${result.extractionMetadata?.metaTags?.twitterImage || "NOT FOUND"}`,
		)

		if (result.metadata?.image) {
			console.log("\n✅ SUCCESS! Preview image will be used by imageExtractor!")
			console.log(`   Image URL: ${result.metadata.image}`)
		} else {
			console.log("\n❌ No preview image found")
		}
	} catch (error) {
		console.error("❌ Error:", error)
		process.exit(1)
	}
}

test()
