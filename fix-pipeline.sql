-- ============================================
-- SCRIPT DE CORREÇÃO DO PIPELINE DE INGESTÃO
-- ============================================

-- PASSO 1: Verificar função atual
-- Copie o resultado e me envie
SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    p.provolatile AS volatility
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'finalize_document_atomic'
  AND n.nspname = 'public';

-- PASSO 2: Se a função acima NÃO mostrar "p_document_update jsonb, p_memory_insert jsonb",
-- então rode o conteúdo do arquivo:
-- apps/api/migrations/0001_add_atomic_document_finalization.sql

-- PASSO 3: Verificar documentos presos
SELECT 
    status,
    COUNT(*) as total,
    MAX(updated_at) as ultima_atualizacao
FROM documents 
WHERE status IN ('fetching', 'extracting', 'chunking', 'embedding', 'indexing')
GROUP BY status
ORDER BY total DESC;

-- PASSO 4: Verificar jobs problemáticos
SELECT 
    status,
    COUNT(*) as total,
    AVG(attempts) as tentativas_media,
    MAX(updated_at) as ultima_atualizacao
FROM ingestion_jobs
WHERE status IN ('queued', 'processing', 'failed')
GROUP BY status
ORDER BY total DESC;

-- PASSO 5: Se encontrar documentos presos, resetá-los (CUIDADO!)
-- NÃO EXECUTE ISSO AINDA - apenas se confirmar que estão travados
/*
UPDATE documents 
SET status = 'queued' 
WHERE status IN ('fetching', 'extracting', 'chunking', 'embedding', 'indexing')
  AND updated_at < NOW() - INTERVAL '1 hour';

UPDATE ingestion_jobs
SET status = 'queued'
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '1 hour';
*/
