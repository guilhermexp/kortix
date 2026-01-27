-- ================================================
-- Full Metadata Indexing and Search Enhancement
-- Migration: 0017_metadata_indexing
-- ================================================
-- This migration adds GIN indexes on JSONB metadata columns for fast
-- metadata queries, enabling search across tags, properties, comments,
-- mentions, and custom fields. Also adds triggers for metadata change
-- detection to support automatic reindexing.

-- ================================================
-- GIN Indexes on Metadata JSONB Columns
-- ================================================
-- GIN (Generalized Inverted Index) indexes are optimal for JSONB columns
-- as they support fast containment queries (@>, ?, ?&, ?|) commonly used
-- in metadata searches.

-- Documents metadata index (primary search target)
CREATE INDEX IF NOT EXISTS idx_documents_metadata_gin
    ON documents USING GIN (metadata jsonb_path_ops);

-- Documents processing_metadata index (for ingestion/processing metadata)
CREATE INDEX IF NOT EXISTS idx_documents_processing_metadata_gin
    ON documents USING GIN (processing_metadata jsonb_path_ops);

-- Document chunks metadata index (chunk-level annotations, properties)
CREATE INDEX IF NOT EXISTS idx_document_chunks_metadata_gin
    ON document_chunks USING GIN (metadata jsonb_path_ops);

-- Memories metadata index (memory annotations, inference metadata)
CREATE INDEX IF NOT EXISTS idx_memories_metadata_gin
    ON memories USING GIN (metadata jsonb_path_ops);

-- Spaces metadata index (space/project properties, settings)
CREATE INDEX IF NOT EXISTS idx_spaces_metadata_gin
    ON spaces USING GIN (metadata jsonb_path_ops);

-- Organizations metadata index (org-level settings, custom fields)
CREATE INDEX IF NOT EXISTS idx_organizations_metadata_gin
    ON organizations USING GIN (metadata jsonb_path_ops);

-- Conversations metadata index (conversation properties, agent state)
CREATE INDEX IF NOT EXISTS idx_conversations_metadata_gin
    ON conversations USING GIN (metadata jsonb_path_ops);

-- Events metadata index (event-level properties, tool metadata)
CREATE INDEX IF NOT EXISTS idx_events_metadata_gin
    ON events USING GIN (metadata jsonb_path_ops);

-- ================================================
-- Metadata Search Terms Generated Column
-- ================================================
-- Add a generated column that extracts searchable text from metadata
-- for faster full-text search across metadata fields.
-- This column combines tags, properties, and other searchable metadata
-- into a single searchable text field.

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS metadata_search_terms TEXT
GENERATED ALWAYS AS (
    COALESCE(
        -- Extract tags as space-separated string
        (SELECT string_agg(value::text, ' ')
         FROM jsonb_array_elements_text(
             CASE
                 WHEN jsonb_typeof(metadata->'tags') = 'array'
                 THEN metadata->'tags'
                 ELSE '[]'::jsonb
             END
         )),
        ''
    ) || ' ' ||
    COALESCE(
        -- Extract properties values as searchable text
        (SELECT string_agg(value::text, ' ')
         FROM jsonb_each_text(
             CASE
                 WHEN jsonb_typeof(metadata->'properties') = 'object'
                 THEN metadata->'properties'
                 ELSE '{}'::jsonb
             END
         )),
        ''
    ) || ' ' ||
    COALESCE(
        -- Extract mentions (flatten array of mentions)
        (SELECT string_agg(value::text, ' ')
         FROM jsonb_array_elements_text(
             CASE
                 WHEN jsonb_typeof(metadata->'mentions') = 'array'
                 THEN metadata->'mentions'
                 ELSE '[]'::jsonb
             END
         )),
        ''
    ) || ' ' ||
    COALESCE(
        -- Extract comments text
        (SELECT string_agg(value->>'text', ' ')
         FROM jsonb_array_elements(
             CASE
                 WHEN jsonb_typeof(metadata->'comments') = 'array'
                 THEN metadata->'comments'
                 ELSE '[]'::jsonb
             END
         )),
        ''
    )
) STORED;

-- Create full-text search index on generated column
CREATE INDEX IF NOT EXISTS idx_documents_metadata_search_terms
    ON documents USING GIN (to_tsvector('english', metadata_search_terms));

-- ================================================
-- Metadata Change Detection Triggers
-- ================================================
-- These triggers detect when metadata is modified and set a flag
-- that can be used to trigger reindexing jobs.

-- Add metadata_changed_at timestamp to track metadata updates
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS metadata_changed_at TIMESTAMPTZ;

-- Function to update metadata_changed_at timestamp
CREATE OR REPLACE FUNCTION update_metadata_changed_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if metadata actually changed
    IF (OLD.metadata IS DISTINCT FROM NEW.metadata) THEN
        NEW.metadata_changed_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on documents table to track metadata changes
DROP TRIGGER IF EXISTS trigger_documents_metadata_changed ON documents;
CREATE TRIGGER trigger_documents_metadata_changed
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_metadata_changed_at();

-- Similar trigger for document_chunks
ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS metadata_changed_at TIMESTAMPTZ;

DROP TRIGGER IF EXISTS trigger_chunks_metadata_changed ON document_chunks;
CREATE TRIGGER trigger_chunks_metadata_changed
    BEFORE UPDATE ON document_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_metadata_changed_at();

-- ================================================
-- Composite Indexes for Common Query Patterns
-- ================================================
-- These indexes optimize common metadata filtering patterns combined
-- with other fields (org_id, user_id, space_id).

-- Documents: org + metadata filtering
CREATE INDEX IF NOT EXISTS idx_documents_org_metadata
    ON documents(org_id) INCLUDE (metadata);

-- Documents: space + metadata filtering
CREATE INDEX IF NOT EXISTS idx_documents_space_metadata
    ON documents(space_id) INCLUDE (metadata)
    WHERE space_id IS NOT NULL;

-- Memories: space + metadata filtering
CREATE INDEX IF NOT EXISTS idx_memories_space_metadata
    ON memories(space_id) INCLUDE (metadata)
    WHERE space_id IS NOT NULL;

-- ================================================
-- Comments for Documentation
-- ================================================

COMMENT ON INDEX idx_documents_metadata_gin IS
    'GIN index for fast JSONB metadata queries (tags, properties, custom fields)';

COMMENT ON INDEX idx_documents_processing_metadata_gin IS
    'GIN index for processing metadata (ingestion status, extraction results)';

COMMENT ON INDEX idx_document_chunks_metadata_gin IS
    'GIN index for chunk-level metadata (annotations, highlights, positions)';

COMMENT ON INDEX idx_memories_metadata_gin IS
    'GIN index for memory metadata (inference info, relationships, context)';

COMMENT ON COLUMN documents.metadata_search_terms IS
    'Generated column containing searchable text extracted from metadata (tags, properties, mentions, comments)';

COMMENT ON COLUMN documents.metadata_changed_at IS
    'Timestamp of last metadata change, used to trigger reindexing when metadata is updated';

COMMENT ON FUNCTION update_metadata_changed_at() IS
    'Trigger function to update metadata_changed_at timestamp when metadata JSONB column is modified';

-- ================================================
-- Metadata Search RPC Function
-- ================================================
-- This function provides fast metadata-based search with ranking.
-- It supports:
--   1. JSONB containment queries (uses GIN index)
--   2. Full-text search on metadata_search_terms (uses FTS index)
--   3. Hybrid scoring when both filters are applied
--
-- Usage examples:
--   -- Search by tags
--   SELECT * FROM search_by_metadata(
--     '{"tags": ["important", "review"]}'::jsonb,
--     'org-uuid'::uuid,
--     NULL,
--     50
--   );
--
--   -- Search by properties
--   SELECT * FROM search_by_metadata(
--     '{"properties": {"status": "approved"}}'::jsonb,
--     'org-uuid'::uuid,
--     NULL,
--     50
--   );
--
--   -- Full-text search in metadata
--   SELECT * FROM search_by_metadata(
--     NULL,
--     'org-uuid'::uuid,
--     'urgent priority',
--     50
--   );
--
--   -- Hybrid search (JSONB + full-text)
--   SELECT * FROM search_by_metadata(
--     '{"tags": ["project"]}'::jsonb,
--     'org-uuid'::uuid,
--     'frontend development',
--     50
--   );

CREATE OR REPLACE FUNCTION search_by_metadata(
    metadata_filter jsonb DEFAULT NULL,
    org_id_param uuid DEFAULT NULL,
    text_query text DEFAULT NULL,
    limit_param int DEFAULT 50
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
    status text,
    rank_score float
) AS $$
DECLARE
    has_metadata_filter boolean;
    has_text_query boolean;
BEGIN
    -- Determine which filters are active
    has_metadata_filter := metadata_filter IS NOT NULL AND metadata_filter != '{}'::jsonb;
    has_text_query := text_query IS NOT NULL AND text_query != '';

    -- Validate that at least one filter is provided
    IF NOT has_metadata_filter AND NOT has_text_query THEN
        RAISE EXCEPTION 'At least one of metadata_filter or text_query must be provided';
    END IF;

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
        d.status,
        -- Calculate hybrid rank score
        CASE
            -- Both filters: combine JSONB match score with FTS rank
            WHEN has_metadata_filter AND has_text_query THEN
                (
                    -- JSONB containment score (1.0 if matches, 0.0 if not)
                    CASE WHEN d.metadata @> metadata_filter THEN 1.0 ELSE 0.0 END +
                    -- FTS rank score (normalized)
                    COALESCE(
                        ts_rank(
                            to_tsvector('english', d.metadata_search_terms),
                            plainto_tsquery('english', text_query)
                        ),
                        0.0
                    )
                )::float
            -- Only metadata filter: binary match score
            WHEN has_metadata_filter THEN
                CASE WHEN d.metadata @> metadata_filter THEN 1.0 ELSE 0.0 END
            -- Only text query: FTS rank
            WHEN has_text_query THEN
                ts_rank(
                    to_tsvector('english', d.metadata_search_terms),
                    plainto_tsquery('english', text_query)
                )::float
            ELSE 0.0
        END AS rank_score
    FROM documents d
    WHERE
        -- Organization filter (if provided)
        (org_id_param IS NULL OR d.org_id = org_id_param)
        AND
        -- Apply metadata containment filter (uses GIN index)
        (NOT has_metadata_filter OR d.metadata @> metadata_filter)
        AND
        -- Apply full-text search filter (uses FTS index)
        (NOT has_text_query OR to_tsvector('english', d.metadata_search_terms) @@ plainto_tsquery('english', text_query))
    ORDER BY rank_score DESC, d.created_at DESC
    LIMIT limit_param;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant permissions for the metadata search function
GRANT EXECUTE ON FUNCTION search_by_metadata(jsonb, uuid, text, int) TO service_role, authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION search_by_metadata(jsonb, uuid, text, int) IS
    'Search documents by metadata with hybrid ranking. Supports JSONB containment queries and full-text search on metadata fields. Returns ranked results combining both scoring methods when applicable.';
