-- =====================================================
-- KORTIX DATABASE MIGRATION SCRIPT
-- From: gxowenznnqiwererpqde.supabase.co
-- To: vauzkvicxwjdktishtom.supabase.co
-- Generated: 2025-12-17
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =====================================================
-- 1. USERS TABLE (base table - no foreign keys)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    password_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    auth_id UUID UNIQUE
);

-- =====================================================
-- 2. ORGANIZATIONS TABLE (base table - no foreign keys)
-- =====================================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 3. ORGANIZATION_MEMBERS TABLE (depends on users, organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    role TEXT DEFAULT 'member'::text,
    is_owner BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 4. SPACES TABLE (depends on users, organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    container_tag TEXT NOT NULL,
    name TEXT,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 5. DOCUMENTS TABLE (depends on users, organizations, spaces)
-- =====================================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    space_id UUID REFERENCES spaces(id),
    title TEXT,
    content TEXT,
    status TEXT DEFAULT 'unknown'::text,
    summary TEXT,
    url TEXT,
    source TEXT,
    type TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    processing_metadata JSONB DEFAULT '{}'::jsonb,
    raw JSONB,
    word_count INTEGER,
    token_count INTEGER,
    summary_embedding vector(1536),
    summary_embedding_model TEXT,
    chunk_count INTEGER DEFAULT 0,
    average_chunk_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    stuck_at TIMESTAMPTZ,
    timeout_threshold_seconds INTEGER DEFAULT 3600,
    preview_image TEXT,
    error TEXT,
    tags JSONB DEFAULT '[]'::jsonb
);

COMMENT ON COLUMN documents.preview_image IS 'URL or data URI for document preview image';
COMMENT ON COLUMN documents.error IS 'Error message if document processing failed';
COMMENT ON COLUMN documents.tags IS 'AI-generated tags for the document (JSONB array)';

-- =====================================================
-- 6. DOCUMENT_CHUNKS TABLE (depends on documents, organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id),
    org_id UUID REFERENCES organizations(id),
    content TEXT NOT NULL,
    chunk_index INTEGER,
    token_count INTEGER,
    embedding vector(1536),
    embedding_model TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 7. MEMORIES TABLE (depends on documents, spaces, users, organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id),
    space_id UUID REFERENCES spaces(id),
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    memory_embedding vector(1536),
    memory_embedding_model TEXT,
    is_inference BOOLEAN DEFAULT false,
    is_latest BOOLEAN DEFAULT true,
    source_count INTEGER DEFAULT 1,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 8. CANVAS_POSITIONS TABLE (depends on documents, users, organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS canvas_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id),
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    x DOUBLE PRECISION NOT NULL DEFAULT 0,
    y DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 9. CANVAS_STATES TABLE (depends on users, organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS canvas_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    project_id TEXT NOT NULL DEFAULT 'default'::text,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT canvas_states_user_project_unique UNIQUE (user_id, project_id)
);

COMMENT ON TABLE canvas_states IS 'Stores tldraw canvas state for each user per project';
COMMENT ON COLUMN canvas_states.project_id IS 'Project/space identifier (container_tag or default)';
COMMENT ON COLUMN canvas_states.state IS 'Full tldraw document state as JSONB';

-- =====================================================
-- 10. CANVAS_PROJECTS TABLE (depends on users, organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS canvas_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    thumbnail TEXT,
    color TEXT DEFAULT 'blue'::text,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    state JSONB
);

COMMENT ON TABLE canvas_projects IS 'Stores canvas project metadata (like Figma projects)';
COMMENT ON COLUMN canvas_projects.thumbnail IS 'Preview thumbnail as base64 data URL or external URL';
COMMENT ON COLUMN canvas_projects.color IS 'Color theme: blue, purple, pink, orange, green, teal, indigo, rose';

-- =====================================================
-- 11. CONVERSATIONS TABLE (depends on users, organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    sdk_session_id TEXT,
    title TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 12. CONVERSATION_EVENTS TABLE (depends on conversations)
-- =====================================================
CREATE TABLE IF NOT EXISTS conversation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id),
    type TEXT NOT NULL CHECK (type = ANY (ARRAY['user'::text, 'assistant'::text, 'tool_use'::text, 'tool_result'::text, 'error'::text])),
    role TEXT CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text])),
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 13. TOOL_RESULTS TABLE (depends on conversation_events)
-- =====================================================
CREATE TABLE IF NOT EXISTS tool_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES conversation_events(id),
    tool_name TEXT NOT NULL,
    tool_use_id TEXT,
    input JSONB NOT NULL DEFAULT '{}'::jsonb,
    output JSONB,
    is_error BOOLEAN DEFAULT false,
    error_message TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    duration_ms INTEGER
);

-- =====================================================
-- 14. EVENTS TABLE (depends on conversations, users, organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id),
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    event_type TEXT NOT NULL,
    role TEXT,
    content TEXT,
    tool_use_id TEXT,
    tool_name TEXT,
    tool_input JSONB,
    tool_result JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 15. INGESTION_JOBS TABLE (depends on documents, users, organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id),
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    status TEXT DEFAULT 'pending'::text,
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    payload JSONB DEFAULT '{}'::jsonb
);

-- =====================================================
-- 16. SESSIONS TABLE (depends on users, organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id),
    session_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- 17. CONNECTIONS TABLE (depends on users, organizations)
-- =====================================================
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    user_id UUID REFERENCES users(id),
    provider TEXT NOT NULL CHECK (provider = ANY (ARRAY['google-drive'::text, 'notion'::text, 'onedrive'::text])),
    email TEXT,
    document_limit INTEGER DEFAULT 1000 CHECK (document_limit > 0 AND document_limit <= 10000),
    container_tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE connections IS 'Third-party service connections (Google Drive, Notion, OneDrive)';
COMMENT ON COLUMN connections.provider IS 'Integration provider: google-drive, notion, or onedrive';
COMMENT ON COLUMN connections.document_limit IS 'Maximum documents to sync from this connection';
COMMENT ON COLUMN connections.container_tags IS 'Project/space tags to filter synced documents';
COMMENT ON COLUMN connections.metadata IS 'Provider-specific metadata (tokens, webhook IDs, etc)';
COMMENT ON COLUMN connections.expires_at IS 'OAuth token expiration timestamp';

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Documents indexes
CREATE INDEX IF NOT EXISTS idx_documents_org_id ON documents(org_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_space_id ON documents(space_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

-- Document chunks indexes
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_org_id ON document_chunks(org_id);

-- Memories indexes
CREATE INDEX IF NOT EXISTS idx_memories_org_id ON memories(org_id);
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_document_id ON memories(document_id);

-- Conversations indexes
CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

-- Conversation events indexes
CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation_id ON conversation_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_events_created_at ON conversation_events(created_at DESC);

-- Ingestion jobs indexes
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_document_id ON ingestion_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs(status);

-- Sessions indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_session_token ON sessions(session_token);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES
-- =====================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- BASIC RLS POLICIES (adjust as needed for your app)
-- =====================================================

-- Allow service role full access (for backend operations)
CREATE POLICY "Service role has full access to users" ON users FOR ALL USING (true);
CREATE POLICY "Service role has full access to organizations" ON organizations FOR ALL USING (true);
CREATE POLICY "Service role has full access to organization_members" ON organization_members FOR ALL USING (true);
CREATE POLICY "Service role has full access to spaces" ON spaces FOR ALL USING (true);
CREATE POLICY "Service role has full access to documents" ON documents FOR ALL USING (true);
CREATE POLICY "Service role has full access to document_chunks" ON document_chunks FOR ALL USING (true);
CREATE POLICY "Service role has full access to memories" ON memories FOR ALL USING (true);
CREATE POLICY "Service role has full access to canvas_positions" ON canvas_positions FOR ALL USING (true);
CREATE POLICY "Service role has full access to canvas_states" ON canvas_states FOR ALL USING (true);
CREATE POLICY "Service role has full access to canvas_projects" ON canvas_projects FOR ALL USING (true);
CREATE POLICY "Service role has full access to conversations" ON conversations FOR ALL USING (true);
CREATE POLICY "Service role has full access to conversation_events" ON conversation_events FOR ALL USING (true);
CREATE POLICY "Service role has full access to tool_results" ON tool_results FOR ALL USING (true);
CREATE POLICY "Service role has full access to events" ON events FOR ALL USING (true);
CREATE POLICY "Service role has full access to ingestion_jobs" ON ingestion_jobs FOR ALL USING (true);
CREATE POLICY "Service role has full access to sessions" ON sessions FOR ALL USING (true);
CREATE POLICY "Service role has full access to connections" ON connections FOR ALL USING (true);

-- =====================================================
-- END OF SCHEMA MIGRATION
-- =====================================================
