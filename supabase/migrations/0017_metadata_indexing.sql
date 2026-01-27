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
