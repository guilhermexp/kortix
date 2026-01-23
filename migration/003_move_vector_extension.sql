-- =====================================================
-- MOVE VECTOR EXTENSION TO EXTENSIONS SCHEMA
-- WARNING: This will temporarily drop vector columns
-- Embeddings data will be preserved via backup tables
-- =====================================================

-- 1. Create extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;

-- 2. Drop old backup tables if they exist (from failed previous runs)
DROP TABLE IF EXISTS _backup_documents_embeddings;
DROP TABLE IF EXISTS _backup_document_chunks_embeddings;
DROP TABLE IF EXISTS _backup_memories_embeddings;

-- 3. Create backup tables with TEXT type (not vector) to avoid dependency
CREATE TABLE _backup_documents_embeddings AS
SELECT id, summary_embedding::text as summary_embedding_text, summary_embedding_model
FROM documents
WHERE summary_embedding IS NOT NULL;

CREATE TABLE _backup_document_chunks_embeddings AS
SELECT id, embedding::text as embedding_text, embedding_model
FROM document_chunks
WHERE embedding IS NOT NULL;

CREATE TABLE _backup_memories_embeddings AS
SELECT id, memory_embedding::text as memory_embedding_text, memory_embedding_model
FROM memories
WHERE memory_embedding IS NOT NULL;

-- 4. Drop columns that depend on vector type
ALTER TABLE documents DROP COLUMN IF EXISTS summary_embedding;
ALTER TABLE documents DROP COLUMN IF EXISTS summary_embedding_model;

ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding_model;

ALTER TABLE memories DROP COLUMN IF EXISTS memory_embedding;
ALTER TABLE memories DROP COLUMN IF EXISTS memory_embedding_model;

-- 5. Drop the extension from public schema
DROP EXTENSION IF EXISTS vector CASCADE;

-- 6. Create the extension in extensions schema
CREATE EXTENSION vector WITH SCHEMA extensions;

-- 7. Recreate vector columns using extensions schema
ALTER TABLE documents ADD COLUMN summary_embedding extensions.vector(1536);
ALTER TABLE documents ADD COLUMN summary_embedding_model TEXT;

ALTER TABLE document_chunks ADD COLUMN embedding extensions.vector(1536);
ALTER TABLE document_chunks ADD COLUMN embedding_model TEXT;

ALTER TABLE memories ADD COLUMN memory_embedding extensions.vector(1536);
ALTER TABLE memories ADD COLUMN memory_embedding_model TEXT;

-- 8. Restore embedding data from backups (convert text back to vector)
UPDATE documents d
SET
    summary_embedding = b.summary_embedding_text::extensions.vector,
    summary_embedding_model = b.summary_embedding_model
FROM _backup_documents_embeddings b
WHERE d.id = b.id;

UPDATE document_chunks dc
SET
    embedding = b.embedding_text::extensions.vector,
    embedding_model = b.embedding_model
FROM _backup_document_chunks_embeddings b
WHERE dc.id = b.id;

UPDATE memories m
SET
    memory_embedding = b.memory_embedding_text::extensions.vector,
    memory_embedding_model = b.memory_embedding_model
FROM _backup_memories_embeddings b
WHERE m.id = b.id;

-- 9. Drop backup tables
DROP TABLE IF EXISTS _backup_documents_embeddings;
DROP TABLE IF EXISTS _backup_document_chunks_embeddings;
DROP TABLE IF EXISTS _backup_memories_embeddings;

-- 10. Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- =====================================================
-- PERFORMANCE INDEXES (from Index Advisor)
-- =====================================================

-- Index for queries ordering by updated_at (reduces cost from 43.8 to 27.16)
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON public.documents USING btree (updated_at);

-- Index for queries filtering by URL (reduces cost from 88.29 to 2.28)
CREATE INDEX IF NOT EXISTS idx_documents_url ON public.documents USING btree (url);
