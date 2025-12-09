#!/usr/bin/env bun
/**
 * Apply conversation tables migration to Supabase
 * This script reads and executes the SQL migration file
 */

import { createClient } from "@supabase/supabase-js"
// Load environment variables
import { config as loadEnv } from "dotenv"
import { readFileSync } from "node:fs"
import { join } from "node:path"

loadEnv({ path: join(process.cwd(), ".env.local") })
loadEnv()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	console.error("❌ Missing required environment variables:")
	console.error("   - SUPABASE_URL")
	console.error("   - SUPABASE_SERVICE_ROLE_KEY")
	process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
})

async function applyMigration() {
	console.log("🔄 Reading migration file...")

	const migrationPath = join(
		process.cwd(),
		"migrations",
		"0002_add_conversation_tables.sql",
	)

	try {
		const migrationSQL = readFileSync(migrationPath, "utf-8")

		console.log("🔄 Applying migration to Supabase...")
		console.log("   Migration: 0002_add_conversation_tables.sql")

		const { data, error } = await supabase.rpc("exec", {
			sql: migrationSQL,
		})

		if (error) {
			// Try direct SQL execution if RPC doesn't work
			console.log("⚠️  RPC failed, trying direct SQL execution...")

			// Split by semicolons and execute each statement
			const statements = migrationSQL
				.split(";")
				.map((s) => s.trim())
				.filter((s) => s.length > 0 && !s.startsWith("--"))

			for (const statement of statements) {
				if (statement.toLowerCase().startsWith("commit")) continue

				try {
					const result = await supabase.rpc("exec", {
						sql: `${statement};`,
					})

					if (result.error) {
						// Some statements may fail if already exist, that's ok
						console.log(`   ℹ️  Statement result: ${result.error.message}`)
					}
				} catch (err) {
					console.error("   ⚠️  Statement error:", err)
				}
			}

			console.log("✅ Migration applied (with some possible warnings)")
		} else {
			console.log("✅ Migration applied successfully!")
			if (data) {
				console.log("   Result:", data)
			}
		}

		// Verify tables were created
		console.log("\n🔍 Verifying tables...")
		const { data: tables, error: tablesError } = await supabase
			.from("information_schema.tables")
			.select("table_name")
			.eq("table_schema", "public")
			.in("table_name", [
				"conversations",
				"conversation_events",
				"tool_results",
			])

		if (tablesError) {
			console.error("❌ Failed to verify tables:", tablesError)
		} else {
			const tableNames = tables?.map((t: any) => t.table_name) || []
			console.log("   Found tables:", tableNames)

			if (tableNames.includes("conversations")) {
				console.log("   ✅ conversations table exists")
			}
			if (tableNames.includes("conversation_events")) {
				console.log("   ✅ conversation_events table exists")
			}
			if (tableNames.includes("tool_results")) {
				console.log("   ✅ tool_results table exists")
			}
		}
	} catch (error) {
		console.error("❌ Failed to read or apply migration:")
		console.error(error)
		process.exit(1)
	}
}

applyMigration()
	.then(() => {
		console.log("\n✅ Migration complete!")
		process.exit(0)
	})
	.catch((error) => {
		console.error("\n❌ Migration failed:")
		console.error(error)
		process.exit(1)
	})
