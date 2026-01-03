import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
	process.env.SUPABASE_URL || "http://127.0.0.1:54321",
	process.env.SUPABASE_SERVICE_ROLE_KEY || "",
)

// Check all unique statuses in documents
const { data: statuses, error: _error } = await supabase
	.from("documents")
	.select("status")
	.order("status")

const uniqueStatuses = new Set((statuses || []).map((s) => s.status))
console.log("All document statuses in DB:", [...uniqueStatuses])

// Get documents that are NOT done or failed
const { data: notFinished, error: _err2 } = await supabase
	.from("documents")
	.select("id, title, url, status, created_at")
	.not("status", "in", "(done,failed)")
	.order("created_at", { ascending: false })

console.log("\nDocuments NOT in done/failed status:")
console.log(JSON.stringify(notFinished, null, 2))

// Get the failed document details
const { data: failedDoc } = await supabase
	.from("documents")
	.select("*")
	.eq("id", "a7b77e2c-7e43-4757-816e-576314556db4")
	.single()

console.log("\nFailed document details:")
console.log(JSON.stringify(failedDoc, null, 2))
