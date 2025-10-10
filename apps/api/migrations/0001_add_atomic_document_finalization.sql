-- Migration: Add atomic document finalization function
-- Purpose: Ensure document updates, chunk insertions, and memory creation happen atomically
-- Date: 2025-01-09
-- Updated: 2025-01-10 - Fixed JSONB to vector conversion

-- Drop function if exists (for idempotency)
DROP FUNCTION IF EXISTS finalize_document_atomic(
  p_document_id UUID,
  p_document_update JSONB,
  p_memory_insert JSONB
);

-- Create atomic finalization function
CREATE OR REPLACE FUNCTION finalize_document_atomic(
  p_document_id UUID,
  p_document_update JSONB,
  p_memory_insert JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_result JSONB;
  v_memory_id UUID;
  v_summary_embedding vector;
  v_memory_embedding vector;
BEGIN
  -- Convert JSONB arrays to vector type using explicit casting
  -- summary_embedding from document_update
  IF p_document_update ? 'summary_embedding' AND p_document_update->'summary_embedding' IS NOT NULL THEN
    v_summary_embedding := (p_document_update->>'summary_embedding')::vector;
  END IF;

  -- memory_embedding from memory_insert
  IF p_memory_insert ? 'memory_embedding' AND p_memory_insert->'memory_embedding' IS NOT NULL THEN
    v_memory_embedding := (p_memory_insert->>'memory_embedding')::vector;
  END IF;

  -- 1. Update document to 'done' status with all metadata
  UPDATE documents
  SET
    status = (p_document_update->>'status')::text,
    title = (p_document_update->>'title')::text,
    content = (p_document_update->>'content')::text,
    url = (p_document_update->>'url')::text,
    source = (p_document_update->>'source')::text,
    metadata = (p_document_update->'metadata')::jsonb,
    processing_metadata = (p_document_update->'processing_metadata')::jsonb,
    raw = (p_document_update->'raw')::jsonb,
    summary = (p_document_update->>'summary')::text,
    word_count = (p_document_update->>'word_count')::integer,
    token_count = (p_document_update->>'token_count')::integer,
    summary_embedding = v_summary_embedding,
    summary_embedding_model = (p_document_update->>'summary_embedding_model')::text,
    chunk_count = (p_document_update->>'chunk_count')::integer,
    average_chunk_size = (p_document_update->>'average_chunk_size')::integer,
    updated_at = NOW()
  WHERE id = p_document_id;

  -- Check if document was updated
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found: %', p_document_id;
  END IF;

  -- 2. Insert summary memory
  INSERT INTO memories (
    document_id,
    space_id,
    org_id,
    user_id,
    content,
    metadata,
    memory_embedding,
    memory_embedding_model
  )
  VALUES (
    p_document_id,
    (p_memory_insert->>'space_id')::uuid,
    (p_memory_insert->>'org_id')::uuid,
    (p_memory_insert->>'user_id')::uuid,
    (p_memory_insert->>'content')::text,
    (p_memory_insert->'metadata')::jsonb,
    v_memory_embedding,
    (p_memory_insert->>'memory_embedding_model')::text
  )
  RETURNING id INTO v_memory_id;

  -- 3. Return success result
  v_result := jsonb_build_object(
    'success', true,
    'document_id', p_document_id,
    'memory_id', v_memory_id,
    'updated_at', NOW()
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Rollback happens automatically, re-raise the error
    RAISE EXCEPTION 'Atomic finalization failed for document %: %', p_document_id, SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION finalize_document_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_document_atomic TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION finalize_document_atomic IS
  'Atomically updates document status and creates summary memory. Handles vector conversion from JSONB. Ensures data consistency by wrapping operations in a transaction.';
