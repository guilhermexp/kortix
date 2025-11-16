-- Migration: Add missing document columns (preview_image, error, tags)
-- Date: 2025-11-04
-- Purpose: Add columns required by the new processing architecture

-- Add preview_image column to store preview URLs or data URIs
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS preview_image TEXT;

-- Add error column to store processing error messages
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS error TEXT;

-- Add tags column to store AI-generated tags as JSON array
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::JSONB;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_error ON documents(error) WHERE error IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_tags ON documents USING gin(tags);

-- Add comments to columns
COMMENT ON COLUMN documents.preview_image IS 'URL or data URI for document preview image';
COMMENT ON COLUMN documents.error IS 'Error message if document processing failed';
COMMENT ON COLUMN documents.tags IS 'AI-generated tags for the document (JSONB array)';
