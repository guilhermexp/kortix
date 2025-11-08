import { createFirecrawlExtractor } from './apps/api/src/services/extraction/firecrawl-extractor'

const extractor = createFirecrawlExtractor()

async function test() {
	console.log('🚀 Testing Puppeteer extraction...\n')

	const url = 'https://copy-of-cena-pronta-849863043350.us-west1.run.app/'

	try {
		await extractor.initialize()
		console.log('✅ Extractor initialized\n')

		console.log(`🌐 Extracting URL: ${url}\n`)

		const result = await extractor.extractFromUrl(url)

		console.log('✅ Extraction successful!\n')
		console.log('📊 Results:')
		console.log(`   Title: ${result.title}`)
		console.log(`   Source: ${result.source}`)
		console.log(`   Extractor: ${result.extractorUsed}`)
		console.log(`   Content length: ${result.text.length} characters`)
		console.log(`   Word count: ${result.wordCount} words`)
		console.log(`\n📄 Content preview (first 500 chars):`)
		console.log(result.text.substring(0, 500))
		console.log('\n✅ Test completed!')
	} catch (error) {
		console.error('❌ Error:', error)
		process.exit(1)
	}
}

test()
