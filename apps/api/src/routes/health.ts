import type { Context } from "hono"
import { supabaseAdmin } from "../supabase"

type ServiceStatus = { status: "ok" | "error"; message?: string }
type TableStatus = { exists: boolean; error?: string }

type HealthChecks = {
	status: "ok"
	timestamp: string
	database?: ServiceStatus
	tables?: Record<string, TableStatus>
}

export const healthHandler = async (c: Context) => {
	const checks: HealthChecks = {
		status: "ok",
		timestamp: new Date().toISOString(),
	}

	// Test database connection
	try {
		const { error } = await supabaseAdmin
			.from("organizations")
			.select("count")
			.limit(1)
			.maybeSingle()

		checks.database = error
			? { status: "error", message: error.message }
			: { status: "ok" }
	} catch (err) {
		checks.database = {
			status: "error",
			message: err instanceof Error ? err.message : String(err),
		}
	}

	// Check required tables
	try {
		const tables = [
			"documents",
			"spaces",
			"memories",
			"users",
			"sessions",
		]
		const tableChecks: Record<string, TableStatus> = {}

		for (const table of tables) {
			try {
				const { error } = await supabaseAdmin
					.from(table)
					.select("count")
					.limit(1)
					.maybeSingle()

				tableChecks[table] = error
					? { exists: false, error: error.message }
					: { exists: true }
			} catch (err) {
				tableChecks[table] = {
					exists: false,
					error: err instanceof Error ? err.message : String(err),
				}
			}
		}

		checks.tables = tableChecks
	} catch (err) {
		checks.tables = { error: err instanceof Error ? err.message : String(err) }
	}

	const hasErrors =
		checks.database?.status === "error" ||
		Object.values(checks.tables || {}).some((table) => table.exists === false)

	return c.json(checks, hasErrors ? 500 : 200)
}
