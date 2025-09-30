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
1. Seed initial organization/user (admin) via better-auth once backend ready.
2. Add migrations for API keys, chat sessions, and other aux tables if needed.
3. Integrate Drizzle migration process to manage future schema changes.
4. Set up Supabase RLS policies after auth flows are in place.

## Migration 0004_api_keys_password_reset
- Adds `api_keys` table with hashed secrets, metadata, and lifecycle timestamps.
- Adds `password_resets` table to store time-bound reset tokens and drops the legacy `auth_verifications` table.
- Enables RLS for both tables (authenticated org-scoped access for `api_keys`, service-role only for `password_resets`).
- Apply via MCP/Supabase SQL console before rolling out password reset & API key flows.

## Seed 0001_default_org
- Applied via Supabase SQL Editor (Seed Default Organization, Admin User and Project).
- Creates organization slug `default`, admin user `admin@local.host`, owner membership, and default project (`sm_project_default`).

## Migration 0002_rls_policies
- Pending application (define via Supabase SQL or CLI before exposing anon key).
- Adds helper functions `current_request_org()`/`current_request_user()` and enables RLS on organizations, memberships, spaces, documents, chunks, memories, join tables e jobs.
- Policies restrict `authenticated` role to rows matching the `X-Supermemory-Organization` header while keeping `service_role` unrestricted for internal workers.

## Migration 0003_auth_verifications
- Applied via Supabase management API (2025-09-29) using PAT.
- Creates `auth_verifications` table + indexes to store better-auth magic link / OTP tokens.
