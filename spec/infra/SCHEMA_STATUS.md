# Database Schema Status

## Migration 0001_initial
- Applied via Supabase SQL Editor (`Vectorized Knowledge & Ingestion Schema` saved query).
- Includes tables:
  - organizations, users, organization_members, sessions
  - spaces (projects), documents, documents_to_spaces
  - document_chunks, memories, memory_relationships
  - organization_settings, connections, connection_states
  - api_requests, ingestion_jobs, processing_logs
- Extensions enabled: `pgcrypto`, `vector`
- Vector indexes created using `ivfflat` (lists = 100) on chunk and memory embeddings.
- Timestamp triggers set on users, spaces, documents, memories, ingestion_jobs.

## Next Steps
1. Seed inicial já aplicado (ver seção `Seed 0001_default_org`).
2. Aplicar `0002_rls_policies.sql` na instância Supabase para liberar uso do `anon` key com segurança (ver detalhes abaixo).
3. Executar `0004_api_keys_password_reset.sql` antes de habilitar API keys e reset de senha em produção.
4. Integrar processo automatizado de migrações (Drizzle/CLI) para versionar mudanças futuras.

## Migration 0004_api_keys_password_reset
- Adds `api_keys` table with hashed secrets, metadata, and lifecycle timestamps.
- Adds `password_resets` table to store time-bound reset tokens and drops the legacy `auth_verifications` table.
- Enables RLS for both tables (authenticated org-scoped access for `api_keys`, service-role only for `password_resets`).
- Apply via MCP/Supabase SQL console before rolling out password reset & API key flows.

## Seed 0001_default_org
- Applied via Supabase SQL Editor (Seed Default Organization, Admin User and Project).
- Creates organization slug `default`, admin user `admin@local.host`, owner membership, and default project (`sm_project_default`).

## Migration 0002_rls_policies
- **Status**: pendente (executar antes de expor `SUPABASE_ANON_KEY`).
- Cria helpers `current_request_org()`/`current_request_user()` que leem os headers `X-Supermemory-*` injetados pelo backend.
- Ativa RLS em organizations, memberships, spaces, documents, chunks, memories, join tables e jobs, liberando apenas linhas do `org_id` atual.
- `service_role` mantém acesso irrestrito para workers/background.
- Como aplicar:
  1. Abra o **SQL Editor** do Supabase ou use o MCP `supabase` configurado no repositório.
  2. Carregue o conteúdo de `spec/infra/migrations/0002_rls_policies.sql`.
  3. Execute e verifique se nenhuma política conflituosa permanece (`DROP POLICY` já cuida das existentes).
  4. Teste com o backend local garantindo que chamadas feitas com a service-role continuam funcionando e que o `anon` respeita o cabeçalho `X-Supermemory-Organization`.

## Migration 0003_auth_verifications
- Applied via Supabase management API (2025-09-29) using PAT.
- Creates `auth_verifications` table + indexes to store better-auth magic link / OTP tokens.
