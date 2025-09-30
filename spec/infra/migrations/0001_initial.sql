-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            text UNIQUE NOT NULL,
    name            text NOT NULL,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email           text UNIQUE NOT NULL,
    hashed_password text,
    name            text,
    image_url       text,
    metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));

-- Organization members
CREATE TABLE IF NOT EXISTS organization_members (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role             text NOT NULL DEFAULT 'member',
    is_owner         boolean NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_members_unique ON organization_members (organization_id, user_id);

-- Sessions (for better-auth compatibility)
CREATE TABLE IF NOT EXISTS sessions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id  uuid REFERENCES organizations(id) ON DELETE SET NULL,
    session_token    text NOT NULL UNIQUE,
    expires_at       timestamptz NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- Spaces / Projects
CREATE TABLE IF NOT EXISTS spaces (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    container_tag     text NOT NULL UNIQUE,
    name              text,
    description       text,
    visibility        text NOT NULL DEFAULT 'private',
    is_experimental   boolean NOT NULL DEFAULT false,
    metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
    content_text_index jsonb NOT NULL DEFAULT '{}'::jsonb,
    index_size        numeric,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    connection_id            uuid,
    custom_id                text,
    content_hash             text,
    title                    text,
    content                  text,
    summary                  text,
    url                      text,
    source                   text,
    type                     text NOT NULL DEFAULT 'text',
    status                   text NOT NULL DEFAULT 'unknown',
    metadata                 jsonb,
    processing_metadata      jsonb,
    raw                      jsonb,
    og_image                 text,
    token_count              integer,
    word_count               integer,
    chunk_count              integer NOT NULL DEFAULT 0,
    average_chunk_size       integer,
    summary_embedding        vector(1536),
    summary_embedding_model  text,
    summary_embedding_new        vector(1536),
    summary_embedding_model_new  text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_org_idx ON documents (org_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents (status);
CREATE UNIQUE INDEX IF NOT EXISTS documents_custom_id_idx ON documents (org_id, custom_id) WHERE custom_id IS NOT NULL;

-- Documents to spaces (projects)
CREATE TABLE IF NOT EXISTS documents_to_spaces (
    document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    space_id      uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, space_id)
);

-- Document chunks
CREATE TABLE IF NOT EXISTS document_chunks (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id      uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    content          text NOT NULL,
    embedded_content text,
    type             text NOT NULL DEFAULT 'text',
    position         integer,
    metadata         jsonb,
    embedding        vector(1536),
    embedding_model  text,
    embedding_new        vector(1536),
    embedding_new_model  text,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_chunks_document_idx ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS document_chunks_org_idx ON document_chunks (org_id);
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Memories (memory entries)
CREATE TABLE IF NOT EXISTS memories (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id             uuid REFERENCES documents(id) ON DELETE SET NULL,
    space_id                uuid REFERENCES spaces(id) ON DELETE SET NULL,
    org_id                  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id                 uuid REFERENCES users(id) ON DELETE SET NULL,
    content                 text NOT NULL,
    metadata                jsonb,
    memory_embedding        vector(1536),
    memory_embedding_model  text,
    memory_embedding_new        vector(1536),
    memory_embedding_new_model  text,
    is_latest               boolean NOT NULL DEFAULT true,
    version                 integer NOT NULL DEFAULT 1,
    is_inference            boolean NOT NULL DEFAULT false,
    is_forgotten            boolean NOT NULL DEFAULT false,
    forget_after            timestamptz,
    forget_reason           text,
    source_count            integer NOT NULL DEFAULT 1,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memories_org_idx ON memories (org_id);
CREATE INDEX IF NOT EXISTS memories_space_idx ON memories (space_id);
CREATE INDEX IF NOT EXISTS memories_embedding_idx ON memories USING ivfflat (memory_embedding vector_cosine_ops) WITH (lists = 100);

-- Memory relationships
CREATE TABLE IF NOT EXISTS memory_relationships (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_memory_id    uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    target_memory_id    uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    relationship_type   text NOT NULL,
    metadata            jsonb,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_relationships_source_idx ON memory_relationships (source_memory_id);
CREATE INDEX IF NOT EXISTS memory_relationships_target_idx ON memory_relationships (target_memory_id);

-- Organization settings
CREATE TABLE IF NOT EXISTS organization_settings (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                 uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    should_llm_filter      boolean NOT NULL DEFAULT false,
    filter_prompt          text,
    include_items          text[],
    exclude_items          text[],
    google_drive_custom_key_enabled boolean NOT NULL DEFAULT false,
    google_drive_client_id         text,
    google_drive_client_secret     text,
    notion_custom_key_enabled      boolean NOT NULL DEFAULT false,
    notion_client_id               text,
    notion_client_secret           text,
    onedrive_custom_key_enabled    boolean NOT NULL DEFAULT false,
    onedrive_client_id             text,
    onedrive_client_secret         text,
    updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Connections (OAuth connectors)
CREATE TABLE IF NOT EXISTS connections (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
    provider         text NOT NULL,
    email            text,
    document_limit   integer NOT NULL DEFAULT 10000,
    container_tags   text[],
    access_token     text,
    refresh_token    text,
    expires_at       timestamptz,
    metadata         jsonb,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connections_org_idx ON connections (org_id);

-- Connection states (for OAuth device handshakes)
CREATE TABLE IF NOT EXISTS connection_states (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    state_token    text NOT NULL UNIQUE,
    provider       text NOT NULL,
    org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id  uuid REFERENCES connections(id) ON DELETE CASCADE,
    document_limit integer,
    redirect_url   text,
    metadata       jsonb,
    container_tags text[],
    expires_at     timestamptz NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- API requests log
CREATE TABLE IF NOT EXISTS api_requests (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
    key_id          uuid,
    request_type    text NOT NULL,
    status_code     integer NOT NULL,
    duration_ms     integer,
    input           jsonb,
    output          jsonb,
    original_tokens integer,
    final_tokens    integer,
    tokens_saved    integer,
    cost_saved_usd  numeric,
    model           text,
    provider        text,
    conversation_id text,
    context_modified boolean NOT NULL DEFAULT false,
    metadata        jsonb,
    origin          text NOT NULL DEFAULT 'api',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_requests_org_idx ON api_requests (org_id);
CREATE INDEX IF NOT EXISTS api_requests_type_idx ON api_requests (request_type);

-- Ingestion jobs
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id   uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status        text NOT NULL DEFAULT 'queued',
    attempts      integer NOT NULL DEFAULT 0,
    payload       jsonb,
    error_message text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingestion_jobs_status_idx ON ingestion_jobs (status);

-- Processing logs (optional detailed stages)
CREATE TABLE IF NOT EXISTS processing_logs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id        uuid NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
    stage         text NOT NULL,
    status        text NOT NULL,
    message       text,
    metadata      jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Helper trigger to update timestamps
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_users ON users;
CREATE TRIGGER set_timestamp_users
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_spaces ON spaces;
CREATE TRIGGER set_timestamp_spaces
    BEFORE UPDATE ON spaces
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_documents ON documents;
CREATE TRIGGER set_timestamp_documents
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_memories ON memories;
CREATE TRIGGER set_timestamp_memories
    BEFORE UPDATE ON memories
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_ingestion_jobs ON ingestion_jobs;
CREATE TRIGGER set_timestamp_ingestion_jobs
    BEFORE UPDATE ON ingestion_jobs
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();
