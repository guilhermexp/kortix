#!/usr/bin/env bun
/**
 * Script para executar migrations SQL via Supabase Management API
 * Uso: bun run spec/infra/run-migrations-supabase.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = 'https://lrqjdzqyaoiovnzfbnrj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWpkenF5YW9pb3ZuemZibnJqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE2NzI0OSwiZXhwIjoyMDc0NzQzMjQ5fQ.cBCXvycwWSFD1G4BMRx4-f8gYzhWtPBEa4WQBGVXs1U';

async function executeSql(sql: string): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  return await response.json();
}

async function runMigration(filePath: string) {
  console.log(`\n🔄 Executando migration: ${filePath}`);

  try {
    const sql = readFileSync(filePath, 'utf-8');

    // Dividir em statements individuais (separados por ;)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        console.log(`  ⏳ Executando statement ${i + 1}/${statements.length}...`);
        try {
          // Usar o cliente Supabase JS para executar SQL raw
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

          // Executar via RPC
          const { error } = await supabase.rpc('exec_sql', { query: statement + ';' });

          if (error) {
            console.error(`    ❌ Erro:`, error.message);
            // Continue com os próximos statements mesmo se um falhar
          } else {
            console.log(`    ✅ Sucesso`);
          }
        } catch (err: any) {
          console.error(`    ⚠️  Aviso: ${err.message}`);
        }
      }
    }

    console.log(`✅ Migration processada: ${filePath}`);
  } catch (error) {
    console.error(`❌ Erro ao executar migration ${filePath}:`, error);
    throw error;
  }
}

async function main() {
  console.log('⚠️  NOTA: Este script tenta executar as migrations, mas pode falhar se a função exec_sql não existir.');
  console.log('          Recomendo executar as migrations manualmente via Supabase Dashboard > SQL Editor\n');

  const migrationsDir = join(import.meta.dir, 'migrations');

  // Ordem de execução das migrations
  const migrations = [
    '0000_normalize_legacy_data.sql',
    '0002_rls_policies.sql',
    '0003_auth_verifications.sql',
    '0004_api_keys_password_reset.sql',
  ];

  console.log('🚀 Iniciando execução de migrations...\n');

  console.log('📋 Instruções manuais:\n');
  console.log(`1. Acesse: ${SUPABASE_URL.replace('https://', 'https://supabase.com/dashboard/project/')}/editor/sql`);
  console.log('2. Copie e cole o conteúdo de cada arquivo SQL:');

  for (const migration of migrations) {
    const filePath = join(migrationsDir, migration);
    console.log(`   - ${filePath}`);
  }

  console.log('\n3. Execute cada migration na ordem acima\n');
}

main().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});