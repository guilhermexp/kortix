-- ================================================
-- Add document_connections table for smart document relationships
-- Migration: 0017_create_document_connections_table
-- ================================================

-- Document connections table for automatic and manual document relationships
-- Supports semantic similarity-based automatic connections and user-defined manual connections
CREATE TABLE IF NOT EXISTS document_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
    target_document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    connection_type TEXT NOT NULL CHECK (connection_type IN ('automatic', 'manual')),
    similarity_score NUMERIC(5,4) CHECK (similarity_score >= 0 AND similarity_score <= 1),
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_document_id, target_document_id),
    CHECK (source_document_id != target_document_id)
);

-- Create index for fast lookups by source document
CREATE INDEX IF NOT EXISTS idx_document_connections_source
    ON document_connections(source_document_id);

-- Create index for fast lookups by target document
CREATE INDEX IF NOT EXISTS idx_document_connections_target
    ON document_connections(target_document_id);

-- Create index for fast lookups by organization
CREATE INDEX IF NOT EXISTS idx_document_connections_org
    ON document_connections(org_id);

-- Create index for querying by connection type
CREATE INDEX IF NOT EXISTS idx_document_connections_type
    ON document_connections(connection_type);

-- Create composite index for finding connections by document and type
CREATE INDEX IF NOT EXISTS idx_document_connections_source_type
    ON document_connections(source_document_id, connection_type);

-- Comments for documentation
COMMENT ON TABLE document_connections IS 'Smart document connections based on semantic similarity or manual user curation';
COMMENT ON COLUMN document_connections.source_document_id IS 'The document from which the connection originates';
COMMENT ON COLUMN document_connections.target_document_id IS 'The document to which the connection points';
COMMENT ON COLUMN document_connections.connection_type IS 'Type of connection: automatic (AI-detected similarity) or manual (user-created)';
COMMENT ON COLUMN document_connections.similarity_score IS 'Cosine similarity score (0-1) for automatic connections, NULL for manual';
COMMENT ON COLUMN document_connections.reason IS 'Explanation of why documents are connected (AI-generated for automatic, user-provided for manual)';
COMMENT ON COLUMN document_connections.user_id IS 'User who created the manual connection, NULL for automatic connections';
COMMENT ON COLUMN document_connections.metadata IS 'Additional connection metadata (topics, keywords, etc)';

-- ================================================
-- Function: find_similar_documents
-- Finds documents similar to a given document using vector similarity search
-- ================================================

CREATE OR REPLACE FUNCTION find_similar_documents(
    p_document_id UUID,
    p_similarity_threshold NUMERIC DEFAULT 0.7,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    document_id UUID,
    title TEXT,
    summary TEXT,
    similarity_score NUMERIC,
    space_id UUID,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    v_org_id UUID;
    v_embedding vector(1536);
BEGIN
    -- Get the source document's organization and embedding
    SELECT org_id, summary_embedding
    INTO v_org_id, v_embedding
    FROM documents
    WHERE id = p_document_id;

    -- Return empty result if document not found or has no embedding
    IF v_org_id IS NULL OR v_embedding IS NULL THEN
        RETURN;
    END IF;

    -- Find similar documents using cosine similarity
    RETURN QUERY
    SELECT
        d.id AS document_id,
        d.title,
        d.summary,
        (1 - (d.summary_embedding <=> v_embedding))::NUMERIC(5,4) AS similarity_score,
        d.space_id,
        d.created_at
    FROM documents d
    WHERE
        d.id != p_document_id
        AND d.org_id = v_org_id
        AND d.summary_embedding IS NOT NULL
        AND (1 - (d.summary_embedding <=> v_embedding)) >= p_similarity_threshold
    ORDER BY d.summary_embedding <=> v_embedding ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION find_similar_documents IS 'Finds documents similar to the given document using vector cosine similarity on summary embeddings';
