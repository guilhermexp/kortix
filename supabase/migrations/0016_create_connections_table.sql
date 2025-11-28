-- ================================================
-- Add connections table for third-party integrations
-- Migration: 0016_create_connections_table
-- ================================================

-- Connections table for third-party service integrations
-- Supports Google Drive, Notion, OneDrive, and future providers
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google-drive', 'notion', 'onedrive')),
    email TEXT,
    document_limit INTEGER DEFAULT 1000 CHECK (document_limit > 0 AND document_limit <= 10000),
    container_tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, provider, email)
);

-- Create index for faster queries by organization and provider
CREATE INDEX IF NOT EXISTS idx_connections_org_provider
    ON connections(org_id, provider);

-- Create index for expiration checks
CREATE INDEX IF NOT EXISTS idx_connections_expires_at
    ON connections(expires_at) WHERE expires_at IS NOT NULL;

-- Comments for documentation
COMMENT ON TABLE connections IS 'Third-party service connections (Google Drive, Notion, OneDrive)';
COMMENT ON COLUMN connections.provider IS 'Integration provider: google-drive, notion, or onedrive';
COMMENT ON COLUMN connections.document_limit IS 'Maximum documents to sync from this connection';
COMMENT ON COLUMN connections.container_tags IS 'Project/space tags to filter synced documents';
COMMENT ON COLUMN connections.metadata IS 'Provider-specific metadata (tokens, webhook IDs, etc)';
COMMENT ON COLUMN connections.expires_at IS 'OAuth token expiration timestamp';
