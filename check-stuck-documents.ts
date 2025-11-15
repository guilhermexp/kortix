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

async function checkStuckDocuments() {
  console.log("=== Checking Stuck Documents ===\n")

  // Check all non-done document statuses (limit to 50 to prevent excessive egress)
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, title, status, type, created_at, processing_metadata, error")
    .neq("status", "done")
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    console.error("Error fetching documents:", error)
  } else {
    console.log(`Found ${docs?.length || 0} non-done documents:`)
    if (docs && docs.length > 0) {
      console.table(docs.map(d => ({
        id: d.id.substring(0, 8) + "...",
        title: d.title?.substring(0, 40) || "Untitled",
        status: d.status,
        type: d.type,
        created_at: new Date(d.created_at).toLocaleString(),
        error: d.error ? d.error.substring(0, 50) : null
      })))

      // Show full details for each
      console.log("\n=== Detailed Info ===")
      docs.forEach(doc => {
        console.log(`\nDocument: ${doc.title || "Untitled"} (${doc.id})`)
        console.log(`  Status: ${doc.status}`)
        console.log(`  Type: ${doc.type}`)
        console.log(`  Created: ${doc.created_at}`)
        if (doc.error) {
          console.log(`  Error: ${doc.error}`)
        }
        if (doc.processing_metadata) {
          console.log(`  Processing Metadata:`, JSON.stringify(doc.processing_metadata, null, 2))
        }
      })
    }
  }

  // Check for corresponding jobs
  if (docs && docs.length > 0) {
    console.log("\n=== Checking corresponding jobs ===")
    for (const doc of docs) {
      const { data: jobs } = await supabase
        .from("ingestion_jobs")
        .select("*")
        .eq("document_id", doc.id)
        .order("created_at", { ascending: false })

      if (jobs && jobs.length > 0) {
        console.log(`\nJobs for document ${doc.id}:`)
        console.table(jobs.map(j => ({
          id: j.id.substring(0, 8) + "...",
          status: j.status,
          attempts: j.attempts,
          error: j.error_message?.substring(0, 50) || null,
          created: new Date(j.created_at).toLocaleString()
        })))
      } else {
        console.log(`\nNo jobs found for document ${doc.id}`)
      }
    }
  }
}

checkStuckDocuments().catch(console.error)
