-- Migration to fix database security and schema issues
-- This migration addresses:
-- 1. Functions with mutable search_path (security issue)
-- 2. Extensions in public schema (should be in separate schema)
-- 3. Ensure RLS is properly enabled on all tables

-- Create a separate schema for extensions
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move extensions to the extensions schema
-- Note: This requires dropping and recreating extensions, which may affect existing data
-- Backup vector data before proceeding
CREATE TABLE IF NOT EXISTS temp_vector_backup AS
SELECT id, embedding, metadata
FROM document_chunks
WHERE embedding IS NOT NULL;

-- Drop extensions from public schema
DROP EXTENSION IF EXISTS vector CASCADE;
DROP EXTENSION IF EXISTS pg_trgm CASCADE;

-- Recreate extensions in the extensions schema
CREATE EXTENSION IF NOT EXISTS vector SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- Restore vector data if needed
-- This will be handled by the application layer

-- Fix functions with mutable search_path
-- Replace current_request_org function with fixed version
CREATE OR REPLACE FUNCTION public.current_request_org()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
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
$$;

-- Replace current_request_user function with fixed version
CREATE OR REPLACE FUNCTION public.current_request_user()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
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
$$;

-- Fix other functions with mutable search_path
-- search_documents_vector function
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
AS $$
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
$$;

-- search_chunks_vector function
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
AS $$
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
$$;

-- finalize_document_atomic function
-- REMOVED: This function is defined in apps/api/migrations/0001_add_atomic_document_finalization.sql
-- The correct version accepts (p_document_id UUID, p_document_update JSONB, p_memory_insert JSONB)
-- and handles atomic document finalization with memory creation.

-- Ensure RLS is enabled on all public tables
DO $$
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
END $$;

-- Clean up temporary backup table after confirming data integrity
-- DROP TABLE IF EXISTS temp_vector_backup;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_documents_org_id ON public.documents(org_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_org_id ON public.document_chunks(org_id);
CREATE INDEX IF NOT EXISTS idx_memories_org_id ON public.memories(org_id);
CREATE INDEX IF NOT EXISTS idx_spaces_org_id ON public.spaces(organization_id);
CREATE INDEX IF NOT EXISTS idx_connections_org_id ON public.connections(org_id);

-- Grant necessary permissions to extensions schema
GRANT USAGE ON SCHEMA extensions TO public;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA extensions TO public;

COMMIT;
