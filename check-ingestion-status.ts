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

async function checkStatus() {
  console.log("=== Checking Ingestion Status ===\n")

  // Check ingestion jobs
  const { data: jobs, error: jobsError } = await supabase
    .from("ingestion_jobs")
    .select("id, status, created_at, attempts, error_message")
    .order("created_at", { ascending: false })
    .limit(10)

  if (jobsError) {
    console.error("Error fetching jobs:", jobsError)
  } else {
    console.log("Recent Ingestion Jobs:")
    console.table(jobs)
  }

  // Check documents
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id, title, status, created_at, type")
    .order("created_at", { ascending: false })
    .limit(10)

  if (docsError) {
    console.error("Error fetching documents:", docsError)
  } else {
    console.log("\nRecent Documents:")
    console.table(docs)
  }

  // Check queued jobs specifically
  const { data: queuedJobs, error: queuedError } = await supabase
    .from("ingestion_jobs")
    .select("id, document_id, status, created_at, attempts")
    .eq("status", "queued")

  if (queuedError) {
    console.error("Error fetching queued jobs:", queuedError)
  } else {
    console.log("\nQueued Jobs Count:", queuedJobs?.length || 0)
    if (queuedJobs && queuedJobs.length > 0) {
      console.table(queuedJobs)
    }
  }

  // Check documents with queued status
  const { data: queuedDocs, error: queuedDocsError } = await supabase
    .from("documents")
    .select("id, title, status, type, created_at")
    .eq("status", "queued")

  if (queuedDocsError) {
    console.error("Error fetching queued documents:", queuedDocsError)
  } else {
    console.log("\nQueued Documents Count:", queuedDocs?.length || 0)
    if (queuedDocs && queuedDocs.length > 0) {
      console.table(queuedDocs)
    }
  }
}

checkStatus().catch(console.error)
