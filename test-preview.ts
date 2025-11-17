import { createFirecrawlExtractor } from "./apps/api/src/services/extraction/firecrawl-extractor"

const extractor = createFirecrawlExtractor()

async function test() {
	console.log("🚀 Testing preview extraction...\n")

	const url = "https://copy-of-cena-pronta-849863043350.us-west1.run.app/"

	try {
		await extractor.initialize()

		const result = await extractor.extractFromUrl(url)

		console.log("✅ Extraction successful!\n")
		console.log("📊 Results:")
		console.log(`   Title: ${result.title}`)
		console.log(`   URL: ${result.url}`)
		console.log(`   Source: ${result.source}`)
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
		console.log(
			`   title: ${result.extractionMetadata?.metaTags?.title || "NOT FOUND"}`,
		)
		console.log(
			`   description: ${result.extractionMetadata?.metaTags?.description || "NOT FOUND"}`,
		)

		if (result.metadata?.image) {
			console.log("\n✅ Preview image will be used by imageExtractor!")
		} else {
			console.log("\n❌ No preview image found - will fallback to SVG")
		}
	} catch (error) {
		console.error("❌ Error:", error)
		process.exit(1)
	}
}

test()
