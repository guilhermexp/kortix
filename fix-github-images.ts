import { config as loadEnv } from "dotenv"
import { createClient } from "@supabase/supabase-js"

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

async function fixGitHubImages() {
  console.log("=== Fixing GitHub Document Images ===\n")

  // Find GitHub documents with extraction.images but no root images
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, title, url, raw")
    .ilike("url", "%github.com%")
    .eq("status", "done")

  if (error) {
    console.error("Error fetching documents:", error)
    return
  }

  if (!docs || docs.length === 0) {
    console.log("No GitHub documents found")
    return
  }

  console.log(`Found ${docs.length} GitHub documents\n`)

  let fixed = 0
  let skipped = 0
  let errors = 0

  for (const doc of docs) {
    try {
      if (!doc.raw || typeof doc.raw !== 'object') {
        console.log(`⏭️  Skipping ${doc.title} - no raw data`)
        skipped++
        continue
      }

      const raw = doc.raw as Record<string, any>

      // Skip if already has root-level images
      if (raw.images && Array.isArray(raw.images) && raw.images.length > 0) {
        console.log(`✅ ${doc.title} - already has root images (${raw.images.length} images)`)
        skipped++
        continue
      }

      // Check if has extraction.images
      const extraction = raw.extraction as Record<string, any> | undefined
      if (!extraction || !Array.isArray(extraction.images) || extraction.images.length === 0) {
        console.log(`⏭️  Skipping ${doc.title} - no extraction.images`)
        skipped++
        continue
      }

      // Move images to root level
      const updatedRaw = {
        ...raw,
        images: extraction.images
      }

      // Update document
      const { error: updateError } = await supabase
        .from("documents")
        .update({ raw: updatedRaw })
        .eq("id", doc.id)

      if (updateError) {
        console.error(`❌ Error updating ${doc.title}:`, updateError)
        errors++
        continue
      }

      console.log(`✅ Fixed ${doc.title} - moved ${extraction.images.length} images to root`)
      fixed++

    } catch (err) {
      console.error(`❌ Error processing ${doc.title}:`, err)
      errors++
    }
  }

  console.log(`\n${"=".repeat(80)}`)
  console.log(`\n📊 Summary:`)
  console.log(`  ✅ Fixed: ${fixed}`)
  console.log(`  ⏭️  Skipped: ${skipped}`)
  console.log(`  ❌ Errors: ${errors}`)
  console.log(`  📦 Total: ${docs.length}`)
  console.log(`\n${"=".repeat(80)}\n`)
}

fixGitHubImages().catch(console.error)
