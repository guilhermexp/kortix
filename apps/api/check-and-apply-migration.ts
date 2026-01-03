import postgres from "postgres"

const databaseUrl = process.env.SUPABASE_DATABASE_URL
if (!databaseUrl) {
	throw new Error("Missing SUPABASE_DATABASE_URL")
}
const sql = postgres(databaseUrl)

async function checkFunction() {
	console.log("=== Checking function in database ===\n")

	const result = await sql`
    SELECT
        p.proname AS function_name,
        pg_get_function_arguments(p.oid) AS arguments,
        p.provolatile AS volatility
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'finalize_document_atomic'
      AND n.nspname = 'public';
  `

	return result
}

async function checkStuckDocuments() {
	console.log("\n=== Checking stuck documents ===\n")

	const result = await sql`
    SELECT
        status,
        COUNT(*) as total,
        MAX(updated_at) as ultima_atualizacao
    FROM documents
    WHERE status IN ('fetching', 'extracting', 'chunking', 'embedding', 'indexing')
    GROUP BY status
    ORDER BY total DESC;
  `

	return result
}

async function main() {
	try {
		const functions = await checkFunction()

		if (functions.length === 0) {
			console.log("❌ Function NOT found in database")
			console.log("✅ Migration needs to be applied\n")
		} else {
			console.log("✅ Function found:")
			console.log(JSON.stringify(functions[0], null, 2))
			console.log("\nArguments:", functions[0].arguments)
		}

		const stuckDocs = await checkStuckDocuments()

		if (stuckDocs.length === 0) {
			console.log("✅ No stuck documents found")
		} else {
			console.log("⚠️  Stuck documents:")
			stuckDocs.forEach((row) => {
				console.log(
					`  - ${row.status}: ${row.total} documents (last: ${row.ultima_atualizacao})`,
				)
			})
		}
	} catch (error) {
		console.error("Error:", error)
	} finally {
		await sql.end()
	}
}

main()
