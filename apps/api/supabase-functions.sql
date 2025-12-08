-- ============================================================================
-- Kortix - Funções SQL para Busca Híbrida (FTS + Vetorial)
-- ============================================================================
-- Execute este arquivo no SQL Editor do Supabase
--
-- Pré-requisitos:
--   - Extensão pgvector habilitada
--   - Tabelas documents e document_chunks existentes
--   - Coluna embedding (vector) nas tabelas
-- ============================================================================

-- ============================================================================
-- 1. FULL-TEXT SEARCH - Índices e Funções
-- ============================================================================

-- Criar coluna tsvector para documents (se não existir)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'fts'
  ) THEN
    ALTER TABLE documents ADD COLUMN fts tsvector;
  END IF;
END $$;

-- Criar coluna tsvector para document_chunks (se não existir)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_chunks' AND column_name = 'fts'
  ) THEN
    ALTER TABLE document_chunks ADD COLUMN fts tsvector;
  END IF;
END $$;

-- Função para atualizar fts em documents
CREATE OR REPLACE FUNCTION documents_fts_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fts := setweight(to_tsvector('portuguese', COALESCE(NEW.title, '')), 'A') ||
             setweight(to_tsvector('portuguese', COALESCE(NEW.content, '')), 'B') ||
             setweight(to_tsvector('portuguese', COALESCE(NEW.summary, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para manter fts atualizado em documents
DROP TRIGGER IF EXISTS documents_fts_update ON documents;
CREATE TRIGGER documents_fts_update
  BEFORE INSERT OR UPDATE OF title, content, summary
  ON documents
  FOR EACH ROW
  EXECUTE FUNCTION documents_fts_trigger();

-- Função para atualizar fts em document_chunks
CREATE OR REPLACE FUNCTION document_chunks_fts_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fts := to_tsvector('portuguese', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para manter fts atualizado em document_chunks
DROP TRIGGER IF EXISTS document_chunks_fts_update ON document_chunks;
CREATE TRIGGER document_chunks_fts_update
  BEFORE INSERT OR UPDATE OF content
  ON document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION document_chunks_fts_trigger();

-- Índices GIN para full-text search
CREATE INDEX IF NOT EXISTS documents_fts_idx ON documents USING GIN(fts);
CREATE INDEX IF NOT EXISTS document_chunks_fts_idx ON document_chunks USING GIN(fts);

-- Atualizar registros existentes
UPDATE documents SET fts =
  setweight(to_tsvector('portuguese', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('portuguese', COALESCE(content, '')), 'B') ||
  setweight(to_tsvector('portuguese', COALESCE(summary, '')), 'C')
WHERE fts IS NULL;

UPDATE document_chunks SET fts =
  to_tsvector('portuguese', COALESCE(content, ''))
WHERE fts IS NULL;

-- ============================================================================
-- 2. FULL-TEXT SEARCH - Função de Busca para Documents
-- ============================================================================

CREATE OR REPLACE FUNCTION search_documents_fulltext(
  search_query text,
  org_id_param uuid,
  limit_param int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  title text,
  type text,
  content text,
  summary text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  rank_score float
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.type,
    d.content,
    d.summary,
    d.metadata,
    d.created_at,
    d.updated_at,
    d.status,
    ts_rank(d.fts, plainto_tsquery('portuguese', search_query))::float AS rank_score
  FROM documents d
  WHERE
    d.org_id = org_id_param
    AND d.fts @@ plainto_tsquery('portuguese', search_query)
  ORDER BY rank_score DESC
  LIMIT limit_param;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 3. FULL-TEXT SEARCH - Função de Busca para Chunks
-- ============================================================================

CREATE OR REPLACE FUNCTION search_chunks_fulltext(
  search_query text,
  org_id_param uuid,
  limit_param int DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  rank_score float,
  document_title text,
  document_type text,
  document_summary text,
  document_metadata jsonb,
  document_created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    c.content,
    c.metadata,
    ts_rank(c.fts, plainto_tsquery('portuguese', search_query))::float AS rank_score,
    d.title AS document_title,
    d.type AS document_type,
    d.summary AS document_summary,
    d.metadata AS document_metadata,
    d.created_at AS document_created_at
  FROM document_chunks c
  INNER JOIN documents d ON c.document_id = d.id
  WHERE
    c.org_id = org_id_param
    AND c.fts @@ plainto_tsquery('portuguese', search_query)
  ORDER BY rank_score DESC
  LIMIT limit_param;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 4. VECTOR SEARCH - Índices
-- ============================================================================

-- Verificar dimensão do embedding (deve corresponder a EMBEDDING_DIMENSION no env)
-- O padrão usado é 1536 (text-embedding-004)

-- Criar índice IVFFlat para busca vetorial em documents
-- Ajuste 'lists' conforme o tamanho da base (recomendado: sqrt(total_rows))
CREATE INDEX IF NOT EXISTS documents_embedding_idx
ON documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Criar índice IVFFlat para busca vetorial em document_chunks
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================================================
-- 5. VECTOR SEARCH - Função de Busca para Documents
-- ============================================================================

CREATE OR REPLACE FUNCTION search_documents_vector(
  query_embedding vector(1536),
  org_id_param uuid,
  limit_param int DEFAULT 50,
  similarity_threshold float DEFAULT 0.0
)
RETURNS TABLE (
  id uuid,
  title text,
  type text,
  content text,
  summary text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  status text,
  similarity float
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.type,
    d.content,
    d.summary,
    d.metadata,
    d.created_at,
    d.updated_at,
    d.status,
    (1 - (d.embedding <=> query_embedding))::float AS similarity
  FROM documents d
  WHERE
    d.org_id = org_id_param
    AND d.embedding IS NOT NULL
    AND (1 - (d.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT limit_param;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 6. VECTOR SEARCH - Função de Busca para Chunks
-- ============================================================================

CREATE OR REPLACE FUNCTION search_chunks_vector(
  query_embedding vector(1536),
  org_id_param uuid,
  limit_param int DEFAULT 100,
  similarity_threshold float DEFAULT 0.0
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float,
  document_title text,
  document_type text,
  document_summary text,
  document_metadata jsonb,
  document_created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    c.content,
    c.metadata,
    (1 - (c.embedding <=> query_embedding))::float AS similarity,
    d.title AS document_title,
    d.type AS document_type,
    d.summary AS document_summary,
    d.metadata AS document_metadata,
    d.created_at AS document_created_at
  FROM document_chunks c
  INNER JOIN documents d ON c.document_id = d.id
  WHERE
    c.org_id = org_id_param
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT limit_param;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 7. GRANTS - Permissões para as funções
-- ============================================================================

-- Ajuste conforme seu role/schema do Supabase
GRANT EXECUTE ON FUNCTION search_documents_fulltext(text, uuid, int) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION search_chunks_fulltext(text, uuid, int) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION search_documents_vector(vector, uuid, int, float) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION search_chunks_vector(vector, uuid, int, float) TO service_role, authenticated;

-- ============================================================================
-- FIM
-- ============================================================================
-- Após executar este arquivo, teste as funções:
--
-- SELECT * FROM search_documents_fulltext('seu termo de busca', 'uuid-da-org', 10);
-- SELECT * FROM search_chunks_fulltext('seu termo de busca', 'uuid-da-org', 10);
--
-- Para testar vector search, você precisa de um embedding válido:
-- SELECT * FROM search_documents_vector('[0.1,0.2,...]'::vector, 'uuid-da-org', 10, 0.5);
-- ============================================================================
