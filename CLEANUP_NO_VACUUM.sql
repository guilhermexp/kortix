-- =====================================================
-- ULTRA LIGHT CLEANUP - No VACUUM, just delete data
-- Execute each block separately
-- =====================================================

-- STEP 1: Check before
SELECT
    COUNT(*) as total_documents,
    COUNT(*) FILTER (WHERE raw IS NOT NULL) as has_raw,
    COUNT(*) FILTER (WHERE content IS NOT NULL) as has_content,
    COUNT(*) FILTER (WHERE summary_embedding IS NOT NULL) as has_embeddings
FROM documents;


-- STEP 2: Clean raw (repeat until 0 rows)
UPDATE documents
SET raw = NULL
WHERE raw IS NOT NULL
LIMIT 500;


-- STEP 3: Clean content (repeat until 0 rows)
UPDATE documents
SET content = NULL
WHERE content IS NOT NULL AND length(content) > 1000
LIMIT 500;


-- STEP 4: Clean embeddings (repeat until 0 rows)
UPDATE documents
SET
    summary_embedding = NULL,
    summary_embedding_model = NULL,
    summary_embedding_new = NULL,
    summary_embedding_model_new = NULL
WHERE summary_embedding IS NOT NULL
LIMIT 500;


-- STEP 5: Check after
SELECT
    COUNT(*) as total_docs,
    COUNT(*) FILTER (WHERE raw IS NULL) as raw_cleaned,
    COUNT(*) FILTER (WHERE content IS NULL OR length(content) <= 1000) as content_cleaned,
    COUNT(*) FILTER (WHERE summary_embedding IS NULL) as embeddings_cleaned,
    COUNT(*) FILTER (WHERE summary IS NOT NULL) as has_summary
FROM documents;
