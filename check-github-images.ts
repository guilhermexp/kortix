import { createClient } from "@supabase/supabase-js"
import { config as loadEnv } from "dotenv"

// Load environment
loadEnv({ path: "apps/api/.env.local" })
loadEnv({ path: "apps/api/.env" })

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
	console.error("Missing Supabase credentials")
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkGitHubImages() {
	console.log("=== Checking GitHub Documents and Images ===\n")

	// Find GitHub documents
	const { data: docs, error } = await supabase
		.from("documents")
		.select("id, title, url, raw, metadata, preview_image")
		.ilike("url", "%github.com%")
		.eq("status", "done")
		.order("created_at", { ascending: false })
		.limit(5)

	if (error) {
		console.error("Error fetching documents:", error)
		return
	}

	if (!docs || docs.length === 0) {
		console.log("No GitHub documents found")
		return
	}

	console.log(`Found ${docs.length} GitHub documents\n`)

	for (const doc of docs) {
		console.log(`\n${"=".repeat(80)}`)
		console.log(`Document: ${doc.title}`)
		console.log(`URL: ${doc.url}`)
		console.log(`ID: ${doc.id}`)
		console.log("-".repeat(80))

		// Check raw.images
		if (doc.raw && typeof doc.raw === "object") {
			const raw = doc.raw as Record<string, any>

			if (raw.images && Array.isArray(raw.images)) {
				console.log(
					`\n✅ Has images in raw.images (${raw.images.length} images):`,
				)
				raw.images.slice(0, 3).forEach((img: any, idx: number) => {
					console.log(
						`  ${idx + 1}. ${typeof img === "string" ? img : JSON.stringify(img).substring(0, 100)}`,
					)
				})
			} else {
				console.log("\n❌ No images in raw.images")
			}

			// Check raw.extraction.images
			if (raw.extraction && typeof raw.extraction === "object") {
				const extraction = raw.extraction as Record<string, any>
				if (extraction.images && Array.isArray(extraction.images)) {
					console.log(
						`\n✅ Has images in raw.extraction.images (${extraction.images.length} images):`,
					)
					extraction.images.slice(0, 3).forEach((img: any, idx: number) => {
						console.log(
							`  ${idx + 1}. ${typeof img === "string" ? img : JSON.stringify(img).substring(0, 100)}`,
						)
					})
				}
			}
		} else {
			console.log("\n❌ No raw data")
		}

		// Check preview_image
		if (doc.preview_image) {
			console.log(
				`\n✅ Has preview_image: ${doc.preview_image.substring(0, 100)}...`,
			)
		} else {
			console.log("\n❌ No preview_image")
		}

		// Check metadata images
		if (doc.metadata && typeof doc.metadata === "object") {
			const metadata = doc.metadata as Record<string, any>
			if (metadata.images) {
				console.log(
					`\n✅ Has images in metadata: ${JSON.stringify(metadata.images).substring(0, 100)}...`,
				)
			}
		}
	}

	console.log(`\n${"=".repeat(80)}\n`)

	// Compare with a non-GitHub document
	console.log("=== Comparing with Non-GitHub Documents ===\n")

	const { data: nonGithub } = await supabase
		.from("documents")
		.select("id, title, url, raw")
		.not("url", "ilike", "%github.com%")
		.eq("status", "done")
		.order("created_at", { ascending: false })
		.limit(2)

	if (nonGithub && nonGithub.length > 0) {
		for (const doc of nonGithub) {
			console.log(`\nDocument: ${doc.title}`)
			console.log(`URL: ${doc.url}`)

			if (doc.raw && typeof doc.raw === "object") {
				const raw = doc.raw as Record<string, any>
				if (raw.images && Array.isArray(raw.images)) {
					console.log(
						`✅ Has images in raw.images (${raw.images.length} images)`,
					)
				} else {
					console.log("❌ No images in raw.images")
				}
			}
		}
	}
}

checkGitHubImages().catch(console.error)
