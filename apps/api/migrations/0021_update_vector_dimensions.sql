-- Migration: Update vector dimensions from 1536 to 1024
-- Reason: Switching from Google text-embedding-004 (1536) to voyage-3-large (1024) via 302.ai
-- Impact: All existing embeddings are nullified (incompatible across models)

-- Nullify all existing embeddings first (incompatible with new model)
UPDATE document_chunks SET embedding = NULL;
UPDATE documents SET summary_embedding = NULL;
UPDATE memories SET memory_embedding = NULL;

-- Alter vector columns from 1536 to 1024
ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(1024);
ALTER TABLE documents ALTER COLUMN summary_embedding TYPE vector(1024);
ALTER TABLE memories ALTER COLUMN memory_embedding TYPE vector(1024);

-- Recreate index with new dimension
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Recreate search_chunks_vector function with vector(1024)
CREATE OR REPLACE FUNCTION public.search_chunks_vector(
  query_embedding vector(1024),
  org_id_param uuid,
  limit_param integer DEFAULT 10
)
RETURNS TABLE (id uuid, document_id uuid, content text, metadata jsonb, similarity real)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.metadata,
    (1 - (dc.embedding <=> query_embedding))::real as similarity
  FROM document_chunks dc
  WHERE dc.org_id = org_id_param
    AND dc.embedding IS NOT NULL
  ORDER BY dc.embedding <=> query_embedding
  LIMIT limit_param;
END;
$$;
