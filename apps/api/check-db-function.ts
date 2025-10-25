import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkFunction() {
	console.log("Checking function in database...\n")

	const query = `
    SELECT
        p.proname AS function_name,
        pg_get_function_arguments(p.oid) AS arguments,
        p.provolatile AS volatility
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'finalize_document_atomic'
      AND n.nspname = 'public';
  `

	const { data, error } = await supabase.rpc("exec_sql", {
		sql_query: query,
	})

	if (error) {
		console.error("Error checking function:", error.message)
		return null
	}

	return data
}

async function checkStuckDocuments() {
	console.log("\nChecking stuck documents...\n")

	const { data, error } = await supabase
		.from("documents")
		.select("status")
		.in("status", [
			"fetching",
			"extracting",
			"chunking",
			"embedding",
			"indexing",
		])

	if (error) {
		console.error("Error checking documents:", error.message)
		return
	}

	const statusCount: Record<string, number> = {}
	data?.forEach((doc) => {
		statusCount[doc.status] = (statusCount[doc.status] || 0) + 1
	})

	console.log("Stuck documents by status:", statusCount)
}

checkFunction().then((data) => {
	if (data && data.length > 0) {
		console.log("Function found:", JSON.stringify(data, null, 2))
	} else {
		console.log("Function NOT found - migration needed!")
	}
	return checkStuckDocuments()
})
