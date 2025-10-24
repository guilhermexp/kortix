#!/bin/bash

# Read the migration SQL file
MIGRATION_SQL=$(cat migrations/0001_add_atomic_document_finalization.sql)

# Supabase credentials
SUPABASE_URL="https://lrqjdzqyaoiovnzfbnrj.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxycWpkenF5YW9pb3ZuemZibnJqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTE2NzI0OSwiZXhwIjoyMDc0NzQzMjQ5fQ.cBCXvycwWSFD1G4BMRx4-f8gYzhWtPBEa4WQBGVXs1U"

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
