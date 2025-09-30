#!/usr/bin/env bun
/**
 * Script para executar migrations SQL no Supabase
 * Uso: bun run spec/infra/run-migrations.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const DATABASE_URL = process.env.SUPABASE_DATABASE_URL || 'postgresql://postgres:81883311varela0045@db.lrqjdzqyaoiovnzfbnrj.supabase.co:5432/postgres';

async function runMigration(filePath: string) {
  console.log(`\n🔄 Executando migration: ${filePath}`);

  try {
    const sql = readFileSync(filePath, 'utf-8');

    // Conectar ao banco usando Bun's built-in Postgres support
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: DATABASE_URL });

    try {
      await pool.query(sql);
      console.log(`✅ Migration executada com sucesso: ${filePath}`);
    } finally {
      await pool.end();
    }
  } catch (error) {
    console.error(`❌ Erro ao executar migration ${filePath}:`, error);
    throw error;
  }
}

async function main() {
  const migrationsDir = join(import.meta.dir, 'migrations');

  // Ordem de execução das migrations
  const migrations = [
    '0000_normalize_legacy_data.sql',
    '0002_rls_policies.sql',
    '0003_auth_verifications.sql',
    '0004_api_keys_password_reset.sql',
  ];

  console.log('🚀 Iniciando execução de migrations...\n');

  for (const migration of migrations) {
    const filePath = join(migrationsDir, migration);
    await runMigration(filePath);
  }

  console.log('\n✨ Todas as migrations foram executadas com sucesso!');
}

main().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});