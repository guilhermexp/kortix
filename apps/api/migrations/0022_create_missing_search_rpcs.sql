-- Migration: Create missing search RPC functions
-- These functions are called by hybrid-search.ts, document-similarity.ts
-- but were never created in the database.

-- 1. search_documents_vector: vector search returning chunks with document info
CREATE OR REPLACE FUNCTION public.search_documents_vector(
  query_embedding vector(1024),
  org_id_param uuid,
  limit_param integer DEFAULT 20,
  similarity_threshold real DEFAULT 0.1
)
RETURNS TABLE (
  document_id uuid,
  content text,
  metadata jsonb,
  similarity real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.document_id,
    dc.content,
    dc.metadata,
    (1 - (dc.embedding <=> query_embedding))::real as similarity
  FROM document_chunks dc
  WHERE dc.org_id = org_id_param
    AND dc.embedding IS NOT NULL
    AND (1 - (dc.embedding <=> query_embedding))::real >= similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT limit_param;
END;
$$;

-- 2. search_documents_fulltext: full-text search on documents
CREATE OR REPLACE FUNCTION public.search_documents_fulltext(
  search_query text,
  org_id_param uuid,
  limit_param integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  title text,
  type text,
  content text,
  summary text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  rank_score real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.type,
    d.content,
    d.summary,
    d.metadata,
    d.created_at,
    d.updated_at,
    ts_rank(
      setweight(to_tsvector('english', coalesce(d.title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(d.summary, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(left(d.content, 10000), '')), 'C'),
      to_tsquery('english', search_query)
    )::real as rank_score
  FROM documents d
  WHERE d.org_id = org_id_param
    AND d.status = 'done'
    AND (
      to_tsvector('english', coalesce(d.title, '')) ||
      to_tsvector('english', coalesce(d.summary, '')) ||
      to_tsvector('english', coalesce(left(d.content, 10000), ''))
    ) @@ to_tsquery('english', search_query)
  ORDER BY rank_score DESC
  LIMIT limit_param;
END;
$$;

-- 3. search_chunks_fulltext: full-text search on chunks
CREATE OR REPLACE FUNCTION public.search_chunks_fulltext(
  search_query text,
  org_id_param uuid,
  limit_param integer DEFAULT 60
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  rank_score real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    dc.metadata,
    ts_rank(
      to_tsvector('english', coalesce(dc.content, '')),
      to_tsquery('english', search_query)
    )::real as rank_score
  FROM document_chunks dc
  WHERE dc.org_id = org_id_param
    AND to_tsvector('english', coalesce(dc.content, '')) @@ to_tsquery('english', search_query)
  ORDER BY rank_score DESC
  LIMIT limit_param;
END;
$$;

-- 4. search_by_metadata: metadata JSONB search
CREATE OR REPLACE FUNCTION public.search_by_metadata(
  metadata_filter jsonb,
  org_id_param uuid,
  text_query text DEFAULT NULL,
  limit_param integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  title text,
  type text,
  content text,
  summary text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  rank_score real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.type,
    d.content,
    d.summary,
    d.metadata,
    d.created_at,
    d.updated_at,
    CASE
      WHEN metadata_filter IS NOT NULL AND d.metadata @> metadata_filter THEN 1.0
      WHEN text_query IS NOT NULL THEN
        ts_rank(
          to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.summary, '')),
          to_tsquery('english', text_query)
        )
      ELSE 0.5
    END::real as rank_score
  FROM documents d
  WHERE d.org_id = org_id_param
    AND d.status = 'done'
    AND (
      (metadata_filter IS NULL OR d.metadata @> metadata_filter)
      AND
      (text_query IS NULL OR
        to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.summary, ''))
        @@ to_tsquery('english', text_query)
      )
    )
  ORDER BY rank_score DESC
  LIMIT limit_param;
END;
$$;

-- 5. find_similar_documents: find docs similar to a given document
CREATE OR REPLACE FUNCTION public.find_similar_documents(
  p_document_id uuid,
  p_similarity_threshold real DEFAULT 0.7,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  type text,
  summary text,
  metadata jsonb,
  created_at timestamptz,
  similarity_score real
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  source_embedding vector(1024);
  source_org_id uuid;
BEGIN
  SELECT d.summary_embedding, d.org_id
  INTO source_embedding, source_org_id
  FROM documents d
  WHERE d.id = p_document_id;

  IF source_embedding IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.type,
    d.summary,
    d.metadata,
    d.created_at,
    (1 - (d.summary_embedding <=> source_embedding))::real as similarity_score
  FROM documents d
  WHERE d.org_id = source_org_id
    AND d.id != p_document_id
    AND d.summary_embedding IS NOT NULL
    AND d.status = 'done'
    AND (1 - (d.summary_embedding <=> source_embedding))::real >= p_similarity_threshold
  ORDER BY d.summary_embedding <=> source_embedding
  LIMIT p_limit;
END;
$$;
