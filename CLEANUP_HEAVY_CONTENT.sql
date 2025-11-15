-- =====================================================
-- 🧹 CLEANUP: Remove Heavy Content, Keep Summaries
-- Reduces storage from GB to MB
-- =====================================================
--
-- WHAT THIS DOES:
-- ✅ Keeps: id, title, summary, metadata, status, type, url
-- ❌ Removes: raw (bytea), content (full text), embeddings
--
-- STORAGE IMPACT:
-- - raw field: ~100KB-5MB per document
-- - content field: ~10KB-500KB per document
-- - embeddings: 6KB per document
-- Total reduction: ~95% storage per document
--
-- =====================================================

-- =====================================================
-- STEP 1: ANALYZE CURRENT STORAGE (Read-only)
-- =====================================================

-- Check total database size
SELECT
    'DATABASE_SIZE' as metric,
    pg_size_pretty(pg_database_size('postgres')) as current_size;

-- Check documents table size breakdown
SELECT
    'DOCUMENTS_TABLE' as table_name,
    pg_size_pretty(pg_total_relation_size('documents')) as total_size,
    pg_size_pretty(pg_relation_size('documents')) as table_size,
    pg_size_pretty(pg_total_relation_size('documents') - pg_relation_size('documents')) as indexes_size;

-- Count documents with heavy fields
SELECT
    COUNT(*) as total_documents,
    COUNT(*) FILTER (WHERE raw IS NOT NULL) as has_raw,
    COUNT(*) FILTER (WHERE content IS NOT NULL AND length(content) > 1000) as has_large_content,
    COUNT(*) FILTER (WHERE summary_embedding IS NOT NULL) as has_embedding,
    COUNT(*) FILTER (WHERE summary IS NOT NULL) as has_summary
FROM documents;

-- Estimate storage per field type
SELECT
    'raw_field' as field,
    pg_size_pretty(SUM(octet_length(raw::text))) as estimated_size,
    COUNT(*) FILTER (WHERE raw IS NOT NULL) as count
FROM documents
UNION ALL
SELECT
    'content_field' as field,
    pg_size_pretty(SUM(octet_length(content))) as estimated_size,
    COUNT(*) FILTER (WHERE content IS NOT NULL) as count
FROM documents
UNION ALL
SELECT
    'summary_field' as field,
    pg_size_pretty(SUM(octet_length(summary))) as estimated_size,
    COUNT(*) FILTER (WHERE summary IS NOT NULL) as count
FROM documents;

-- =====================================================
-- STEP 2: BACKUP CRITICAL DATA (Optional but Recommended)
-- =====================================================

-- Create a backup table with essential fields only
-- Uncomment if you want a backup before cleanup
/*
CREATE TABLE IF NOT EXISTS documents_backup AS
SELECT
    id,
    org_id,
    user_id,
    title,
    summary,
    url,
    type,
    status,
    metadata,
    created_at,
    updated_at
FROM documents
WHERE summary IS NOT NULL;

-- Verify backup
SELECT COUNT(*) as backup_count FROM documents_backup;
*/

-- =====================================================
-- STEP 3: CLEANUP - Remove Heavy Fields
-- =====================================================

-- OPTION A: Clean ALL documents at once (Fast but might lock table)
-- Use this if you have < 1000 documents
/*
UPDATE documents
SET
    raw = NULL,                          -- Remove bytea content (largest!)
    content = NULL,                      -- Remove full text content
    summary_embedding = NULL,            -- Remove embedding vector
    summary_embedding_model = NULL,      -- Remove model reference
    summary_embedding_new = NULL,        -- Remove new embedding
    summary_embedding_model_new = NULL   -- Remove new model reference
WHERE
    raw IS NOT NULL
    OR content IS NOT NULL
    OR summary_embedding IS NOT NULL;

-- Verify cleanup
SELECT
    COUNT(*) as total_docs,
    COUNT(*) FILTER (WHERE raw IS NULL) as raw_cleaned,
    COUNT(*) FILTER (WHERE content IS NULL) as content_cleaned,
    COUNT(*) FILTER (WHERE summary_embedding IS NULL) as embedding_cleaned
FROM documents;
*/

-- OPTION B: Clean in batches (Recommended for 1000+ documents)
-- Run this multiple times until no more rows affected

-- Batch 1: Clean raw field (heaviest)
UPDATE documents
SET raw = NULL
WHERE raw IS NOT NULL
LIMIT 100;

-- Check progress
SELECT COUNT(*) FILTER (WHERE raw IS NOT NULL) as remaining_raw FROM documents;

-- Batch 2: Clean content field
UPDATE documents
SET content = NULL
WHERE content IS NOT NULL AND length(content) > 1000  -- Keep small content
LIMIT 100;

-- Check progress
SELECT COUNT(*) FILTER (WHERE content IS NOT NULL AND length(content) > 1000) as remaining_content FROM documents;

-- Batch 3: Clean embeddings
UPDATE documents
SET
    summary_embedding = NULL,
    summary_embedding_model = NULL,
    summary_embedding_new = NULL,
    summary_embedding_model_new = NULL
WHERE summary_embedding IS NOT NULL
LIMIT 100;

-- Check progress
SELECT COUNT(*) FILTER (WHERE summary_embedding IS NOT NULL) as remaining_embeddings FROM documents;

-- =====================================================
-- STEP 4: CLEANUP - Document Chunks (Optional)
-- =====================================================

-- Chunks also have embeddings and content that can be cleaned
-- Only clean if you don't need exact chunk matching

-- Analyze chunks size
SELECT
    COUNT(*) as total_chunks,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding,
    pg_size_pretty(SUM(array_length(embedding, 1) * 4)) as embedding_size_estimate
FROM document_chunks;

-- Clean chunk embeddings (keep content for search)
-- Uncomment if you want to clean chunks too
/*
UPDATE document_chunks
SET
    embedding = NULL,
    embedding_model = NULL,
    embedding_new = NULL,
    embedding_new_model = NULL,
    matryoksha_embedding = NULL,
    matryoksha_embedding_model = NULL
WHERE embedding IS NOT NULL
LIMIT 100;
*/

-- =====================================================
-- STEP 5: CLEANUP - Memories (Optional)
-- =====================================================

-- Memories also have embeddings
-- Only clean if you rely on summary-level search only

-- Analyze memories
SELECT
    COUNT(*) as total_memories,
    COUNT(*) FILTER (WHERE memory_embedding IS NOT NULL) as has_embedding,
    pg_size_pretty(SUM(array_length(memory_embedding, 1) * 4)) as embedding_size_estimate
FROM memories;

-- Clean memory embeddings
-- Uncomment if you want to clean memories too
/*
UPDATE memories
SET
    memory_embedding = NULL,
    memory_embedding_model = NULL,
    memory_embedding_new = NULL,
    memory_embedding_new_model = NULL
WHERE memory_embedding IS NOT NULL
LIMIT 100;
*/

-- =====================================================
-- STEP 6: VACUUM to Reclaim Storage
-- =====================================================

-- IMPORTANT: This actually frees up disk space
-- Run this AFTER all cleanup batches are complete

-- Analyze tables to update statistics
ANALYZE documents;
ANALYZE document_chunks;
ANALYZE memories;

-- Vacuum to reclaim space (run as superuser or table owner)
-- This can take several minutes for large tables
VACUUM FULL documents;
VACUUM FULL document_chunks;
VACUUM FULL memories;

-- =====================================================
-- STEP 7: VERIFY FINAL RESULTS
-- =====================================================

-- Check new database size
SELECT
    'AFTER_CLEANUP' as status,
    pg_size_pretty(pg_database_size('postgres')) as database_size,
    pg_size_pretty(pg_total_relation_size('documents')) as documents_size,
    pg_size_pretty(pg_total_relation_size('document_chunks')) as chunks_size,
    pg_size_pretty(pg_total_relation_size('memories')) as memories_size;

-- Verify data integrity
SELECT
    COUNT(*) as total_docs,
    COUNT(*) FILTER (WHERE summary IS NOT NULL) as has_summary,
    COUNT(*) FILTER (WHERE title IS NOT NULL) as has_title,
    COUNT(*) FILTER (WHERE raw IS NULL) as raw_cleaned,
    COUNT(*) FILTER (WHERE content IS NULL) as content_cleaned,
    COUNT(*) FILTER (WHERE summary_embedding IS NULL) as embedding_cleaned,
    ROUND(100.0 * COUNT(*) FILTER (WHERE summary IS NOT NULL) / COUNT(*), 2) as summary_coverage_pct
FROM documents;

-- Check what remains
SELECT
    id,
    title,
    summary IS NOT NULL as has_summary,
    raw IS NULL as raw_cleaned,
    content IS NULL as content_cleaned,
    type,
    status,
    created_at
FROM documents
LIMIT 10;

-- =====================================================
-- EXPECTED RESULTS:
-- - Storage reduction: 90-95%
-- - Summaries: 100% preserved
-- - Metadata: 100% preserved
-- - Search: Still works via summaries
-- - Egress: Reduced by 95%+ on future queries
-- =====================================================

-- =====================================================
-- ROLLBACK PLAN (If Something Goes Wrong)
-- =====================================================

-- If you created a backup table:
/*
-- Restore from backup (only restores summary, not raw/content)
UPDATE documents d
SET summary = b.summary
FROM documents_backup b
WHERE d.id = b.id AND d.summary IS NULL;

-- Drop backup after successful restore
DROP TABLE IF EXISTS documents_backup;
*/
