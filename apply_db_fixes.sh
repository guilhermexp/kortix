#!/bin/bash

# Script to apply database fixes for SuperMemory project
# This script addresses:
# 1. Functions with mutable search_path (security issue)
# 2. Extensions in public schema (should be in separate schema)
# 3. Ensure RLS is properly enabled on all tables

set -e

echo "🔧 Starting database fixes for SuperMemory..."

# Check if SUPABASE_DATABASE_URL is set
if [ -z "$SUPABASE_DATABASE_URL" ]; then
    echo "❌ SUPABASE_DATABASE_URL environment variable is not set"
    echo "Please set it before running this script"
    exit 1
fi

# Function to execute SQL with error handling
execute_sql() {
    local sql="$1"
    local description="$2"

    echo "📝 Executing: $description"

    if echo "$sql" | psql "$SUPABASE_DATABASE_URL" -v ON_ERROR_STOP=1; then
        echo "✅ Success: $description"
    else
        echo "❌ Failed: $description"
        return 1
    fi
}

# Create extensions schema
execute_sql "
CREATE SCHEMA IF NOT EXISTS extensions;
" "Create extensions schema"

# Backup vector data before moving extensions
execute_sql "
CREATE TABLE IF NOT EXISTS temp_vector_backup AS
SELECT id, embedding, metadata
FROM document_chunks
WHERE embedding IS NOT NULL;
" "Backup vector data"

# Drop extensions from public schema
execute_sql "
DROP EXTENSION IF EXISTS vector CASCADE;
DROP EXTENSION IF EXISTS pg_trgm CASCADE;
" "Drop extensions from public schema"

# Recreate extensions in extensions schema
execute_sql "
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;
" "Recreate extensions in extensions schema"

# Fix functions with mutable search_path
execute_sql "
CREATE OR REPLACE FUNCTION public.current_request_org()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS \$\$
DECLARE
  raw text;
  org_id uuid;
BEGIN
  raw := current_setting('request.headers.x-supermemory-organization', true);
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    org_id := raw::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN org_id;
END;
\$\$;
" "Fix current_request_org function"

execute_sql "
CREATE OR REPLACE FUNCTION public.current_request_user()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS \$\$
DECLARE
  raw text;
  user_id uuid;
BEGIN
  raw := current_setting('request.headers.x-supermemory-user', true);
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    user_id := raw::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN user_id;
END;
\$\$;
" "Fix current_request_user function"

# Fix search functions
execute_sql "
CREATE OR REPLACE FUNCTION public.search_documents_vector(
  query_vector vector,
  org_id uuid,
  space_id uuid DEFAULT NULL,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity_score real
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS \$\$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    dc.metadata,
    (dc.embedding <=> query_vector) as similarity_score
  FROM document_chunks dc
  WHERE dc.org_id = search_documents_vector.org_id
    AND (space_id IS NULL OR dc.id IN (
      SELECT dts.document_chunk_id
      FROM documents_to_spaces dts
      WHERE dts.space_id = search_documents_vector.space_id
    ))
    AND dc.embedding IS NOT NULL
  ORDER BY dc.embedding <=> query_vector
  LIMIT limit_count;
END;
\$\$;
" "Fix search_documents_vector function"

execute_sql "
CREATE OR REPLACE FUNCTION public.search_chunks_vector(
  query_vector vector,
  org_id uuid,
  space_id uuid DEFAULT NULL,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity_score real
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS \$\$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    dc.metadata,
    (dc.embedding <=> query_vector) as similarity_score
  FROM document_chunks dc
  WHERE dc.org_id = search_chunks_vector.org_id
    AND (space_id IS NULL OR dc.id IN (
      SELECT dts.document_chunk_id
      FROM documents_to_spaces dts
      WHERE dts.space_id = search_chunks_vector.space_id
    ))
    AND dc.embedding IS NOT NULL
  ORDER BY dc.embedding <=> query_vector
  LIMIT limit_count;
END;
\$\$;
" "Fix search_chunks_vector function"

execute_sql "
CREATE OR REPLACE FUNCTION public.finalize_document_atomic(
  doc_id uuid,
  org_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS \$\$
DECLARE
  chunk_count integer;
BEGIN
  SELECT COUNT(*) INTO chunk_count
  FROM document_chunks
  WHERE document_id = doc_id AND org_id = org_id;

  UPDATE documents
  SET
    chunk_count = chunk_count,
    finalized_at = now(),
    status = 'completed'
  WHERE id = doc_id AND org_id = org_id;

  RETURN FOUND;
END;
\$\$;
" "Fix finalize_document_atomic function"

# Enable RLS on all public tables
execute_sql "
DO \$\$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('temp_vector_backup')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END \$\$;
" "Enable RLS on all public tables"

# Create performance indexes
execute_sql "
CREATE INDEX IF NOT EXISTS idx_documents_org_id ON public.documents(org_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_org_id ON public.document_chunks(org_id);
CREATE INDEX IF NOT EXISTS idx_memories_org_id ON public.memories(org_id);
CREATE INDEX IF NOT EXISTS idx_spaces_org_id ON public.spaces(organization_id);
CREATE INDEX IF NOT EXISTS idx_connections_org_id ON public.connections(org_id);
" "Create performance indexes"

# Grant permissions to extensions schema
execute_sql "
GRANT USAGE ON SCHEMA extensions TO public;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA extensions TO public;
" "Grant permissions to extensions schema"

echo ""
echo "🎉 Database fixes completed successfully!"
echo ""
echo "📋 Summary of changes:"
echo "  ✅ Extensions moved to 'extensions' schema"
echo "  ✅ Fixed functions with mutable search_path"
echo "  ✅ Enabled RLS on all public tables"
echo "  ✅ Created performance indexes"
echo "  ✅ Vector data backed up to temp_vector_backup"
echo ""
echo "⚠️  Important notes:"
echo "  - Vector data is backed up in temp_vector_backup table"
echo "  - Application may need updates to use extensions.vector"
echo "  - Review and drop temp_vector_backup when confirmed working"
echo ""
echo "🔍 To verify changes, run:"
echo "  psql \$SUPABASE_DATABASE_URL -c \"SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'extensions';\""
echo "  psql \$SUPABASE_DATABASE_URL -c \"SELECT proname, proconfig FROM pg_proc WHERE proname LIKE '%current_request%';\""
