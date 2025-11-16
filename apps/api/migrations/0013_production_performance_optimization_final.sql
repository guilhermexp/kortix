-- Migration: Production Performance Optimization (Transaction-Safe Version)
-- Date: 2025-11-16
-- Purpose: Critical performance improvements for production scale
-- Note: Regular index creation (non-CONCURRENTLY) for migration compatibility

-- ============================================================================
-- PART 1: Additional Critical Indexes
-- ============================================================================

-- Composite index for the most common query pattern (org_id + status + sort)
CREATE INDEX IF NOT EXISTS idx_documents_org_status_created
ON documents(org_id, status, created_at DESC NULLS LAST)
WHERE status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_org_status_updated
ON documents(org_id, status, updated_at DESC NULLS LAST)
WHERE status IS NOT NULL;

-- Index for memory queries with proper ordering
CREATE INDEX IF NOT EXISTS idx_memories_document_created
ON memories(document_id, created_at DESC NULLS LAST);

-- Covering index for space container tags (includes ID for index-only scans)
CREATE INDEX IF NOT EXISTS idx_spaces_container_tag_id
ON spaces(container_tag, id, org_id);

-- Index for ingestion jobs monitoring
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status_created
ON ingestion_jobs(status, created_at DESC)
WHERE status IN ('pending', 'processing', 'queued');

-- Index for conversation queries
CREATE INDEX IF NOT EXISTS idx_conversations_org_user
ON conversations(org_id, user_id, created_at DESC);

-- Index for events by conversation
CREATE INDEX IF NOT EXISTS idx_events_conversation_created
ON events(conversation_id, created_at DESC);

-- ============================================================================
-- PART 2: Materialized View for Hot Queries
-- ============================================================================

-- Create materialized view for document counts per organization
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_org_document_stats AS
SELECT
    org_id,
    COUNT(*) as total_documents,
    COUNT(*) FILTER (WHERE status = 'done') as completed_documents,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_documents,
    COUNT(*) FILTER (WHERE status IN ('queued', 'processing', 'extracting', 'chunking', 'embedding')) as processing_documents,
    MAX(updated_at) as last_updated
FROM documents
WHERE org_id IS NOT NULL
GROUP BY org_id;

-- Index on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_org_stats_org_id
ON mv_org_document_stats(org_id);

-- ============================================================================
-- PART 3: Table-Level Optimization (autovacuum tuning)
-- ============================================================================

-- Enable auto-vacuum for heavily updated tables
ALTER TABLE documents SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE memories SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE ingestion_jobs SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE events SET (autovacuum_vacuum_scale_factor = 0.1);

-- ============================================================================
-- PART 4: Create Function to Refresh Stats (for cron scheduling)
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_org_document_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_org_document_stats;
END;
$$;

-- ============================================================================
-- PART 5: Add Comments for Documentation
-- ============================================================================

COMMENT ON INDEX idx_documents_org_status_created IS 'Critical index for filtering and sorting documents by org and status';
COMMENT ON INDEX idx_memories_document_created IS 'Optimizes memory retrieval per document';
COMMENT ON INDEX idx_ingestion_jobs_status_created IS 'Optimizes job queue queries for pending/processing jobs';
COMMENT ON MATERIALIZED VIEW mv_org_document_stats IS 'Cached statistics for dashboard queries - refresh every 5 minutes via cron job';
COMMENT ON FUNCTION refresh_org_document_stats() IS 'Refreshes org document statistics materialized view - schedule via pg_cron every 5 minutes';
