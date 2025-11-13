-- Migration: Optimize document queries for performance
-- Date: 2025-11-12
-- Purpose: Add indexes and optimize queries to prevent statement timeouts

-- Add indexes for commonly used sort columns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_created_at_desc ON documents(created_at DESC NULLS LAST);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_updated_at_desc ON documents(updated_at DESC NULLS LAST);

-- Add composite index for org_id + sort columns (most common query pattern)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_org_created_at ON documents(org_id, created_at DESC NULLS LAST);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_org_updated_at ON documents(org_id, updated_at DESC NULLS LAST);

-- Add index for memory lookups by document_id
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memories_document_id_org ON memories(document_id, org_id);

-- Add index for space lookups (used in container tag filtering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_spaces_org_container_tag ON spaces(organization_id, container_tag);

-- Add index for document-to-space mappings
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_to_spaces_space_id ON documents_to_spaces(space_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_to_spaces_document_id ON documents_to_spaces(document_id);