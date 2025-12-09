import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "http://127.0.0.1:54321",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// Check all documents and their statuses
const { data: allDocs, error } = await supabase
  .from("documents")
  .select("id, title, url, status, created_at")
  .order("created_at", { ascending: false })
  .limit(20);

if (error) {
  console.error("Error:", error);
} else {
  console.log("Recent documents:");
  for (const doc of allDocs || []) {
    console.log(`- [${doc.status}] ${doc.title || doc.url || doc.id}`);
  }
}

// Check ingestion_jobs table for any jobs
const { data: allJobs, error: jobsErr } = await supabase
  .from("ingestion_jobs")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(10);

if (jobsErr) {
  console.error("Jobs error:", jobsErr);
} else {
  console.log("\nRecent ingestion jobs:");
  for (const job of allJobs || []) {
    console.log(`- [${job.status}] doc:${job.document_id} attempts:${job.attempts}`);
  }
}
