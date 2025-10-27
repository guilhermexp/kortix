import fs from "fs"
import path from "path"

const SUPABASE_URL = "https://lrqjdzqyaoiovnzfbnrj.supabase.co"
const SERVICE_ROLE_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWpkenF5YW9pb3ZuemZibnJqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE2NzI0OSwiZXhwIjoyMDc0NzQzMjQ5fQ.cBCXvycwWSFD1G4BMRx4-f8gYzhWtPBEa4WQBGVXs1U"

async function applyMigration() {
	console.log("=== Reading Migration File ===\n")

	const migrationPath = path.join(
		__dirname,
		"migrations",
		"0001_add_atomic_document_finalization.sql",
	)
	const migrationSQL = fs.readFileSync(migrationPath, "utf8")

	console.log("Migration file loaded:", migrationPath)
	console.log("SQL length:", migrationSQL.length, "characters\n")

	console.log("=== Applying Migration via Supabase REST API ===\n")

	// Split SQL into individual statements
	const statements = migrationSQL
		.split(";")
		.map((s) => s.trim())
		.filter((s) => s.length > 0 && !s.startsWith("--"))

	console.log("Found", statements.length, "SQL statements to execute\n")

	for (let i = 0; i < statements.length; i++) {
		const statement = statements[i] + ";"
		console.log(`\nExecuting statement ${i + 1}/${statements.length}...`)
		console.log("First 100 chars:", statement.substring(0, 100) + "...")

		try {
			const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
				method: "POST",
				headers: {
					apikey: SERVICE_ROLE_KEY,
					Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
					"Content-Type": "application/json",
					Prefer: "return=representation",
				},
				body: JSON.stringify({ query: statement }),
			})

			const result = await response.text()

			if (!response.ok) {
				console.log("❌ Failed:", result)
			} else {
				console.log("✅ Success")
			}
		} catch (error) {
			console.log("❌ Error:", error)
		}
	}

	console.log("\n=== Migration Process Complete ===")
	console.log(
		"\nNote: If queries failed, you may need to apply the migration manually",
	)
	console.log("using the Supabase Dashboard SQL Editor.")
}

applyMigration()
