#!/usr/bin/env bun
/**
 * Script para executar migrations SQL via Supabase Management API
 * Uso: bun run spec/infra/run-migrations-supabase.ts
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
	console.error(
		"❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar definidos nas variáveis de ambiente",
	)
	process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function runMigration(filePath: string) {
	console.log(`\n🔄 Executando migration: ${filePath}`)

	try {
		const sql = readFileSync(filePath, "utf-8")

		// Dividir em statements individuais (separados por ;)
		const statements = sql
			.split(";")
			.map((s) => s.trim())
			.filter((s) => s.length > 0 && !s.startsWith("--"))

		for (const [index, statement] of statements.entries()) {
			if (!statement) continue

			console.log(
				`  ⏳ Executando statement ${index + 1}/${statements.length}...`,
			)
			try {
				const { error } = await supabase.rpc("exec_sql", {
					query: `${statement};`,
				})

				if (error) {
					console.error("    ❌ Erro:", error.message)
				} else {
					console.log("    ✅ Sucesso")
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err)
				console.error(`    ⚠️  Aviso: ${message}`)
			}
		}

		console.log(`✅ Migration processada: ${filePath}`)
	} catch (error) {
		console.error(`❌ Erro ao executar migration ${filePath}:`, error)
		throw error
	}
}

async function main() {
	console.log(
		"⚠️  NOTA: Este script tenta executar as migrations, mas pode falhar se a função exec_sql não existir.",
	)
	console.log(
		"          Recomendo executar as migrations manualmente via Supabase Dashboard > SQL Editor\n",
	)

	const migrationsDir = join(import.meta.dir, "migrations")

	// Ordem de execução das migrations
	const migrations = [
		"0000_normalize_legacy_data.sql",
		"0002_rls_policies.sql",
		"0003_auth_verifications.sql",
		"0004_api_keys_password_reset.sql",
	]

	console.log("🚀 Iniciando execução de migrations...\n")

	console.log("📋 Instruções manuais:\n")
	const dashboardUrl = supabaseUrl.replace(
		"https://",
		"https://supabase.com/dashboard/project/",
	)
	console.log(`1. Acesse: ${dashboardUrl}/editor/sql`)
	console.log("2. Copie e cole o conteúdo de cada arquivo SQL:")

	for (const migration of migrations) {
		const filePath = join(migrationsDir, migration)
		console.log(`   - ${filePath}`)
	}

	console.log("\n3. Execute cada migration na ordem acima\n")

	if (process.env.RUN_SUPABASE_MIGRATIONS === "true") {
		for (const migration of migrations) {
			const filePath = join(migrationsDir, migration)
			await runMigration(filePath)
		}
	}
}

main().catch((error) => {
	console.error("❌ Erro fatal:", error)
	process.exit(1)
})
