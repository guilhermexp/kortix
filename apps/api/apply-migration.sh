#!/bin/bash
set -euo pipefail

# Read the migration SQL file
MIGRATION_SQL=$(cat migrations/0001_add_atomic_document_finalization.sql)

# Supabase credentials (NEVER hardcode secrets in repo)
: "${SUPABASE_URL:?Missing SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Missing SUPABASE_SERVICE_ROLE_KEY}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

echo "=== Applying Migration 0001 ==="
echo ""

# Execute via psql-like query
curl -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"query\": $(echo "$MIGRATION_SQL" | jq -Rs .)}"

echo ""
echo "=== Migration Complete ==="
