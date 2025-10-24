-- Script para verificar qual versão da função RPC está no banco

-- 1. Verificar se a função existe e sua assinatura
SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'finalize_document_atomic'
  AND n.nspname = 'public';

-- 2. Verificar documentos presos em estados intermediários
SELECT 
    status,
    COUNT(*) as count,
    MAX(updated_at) as last_updated
FROM documents
WHERE status IN ('fetching', 'extracting', 'chunking', 'embedding', 'indexing')
GROUP BY status
ORDER BY count DESC;

-- 3. Verificar jobs problemáticos
SELECT 
    status,
    COUNT(*) as count,
    AVG(attempts) as avg_attempts,
    MAX(updated_at) as last_updated
FROM ingestion_jobs
WHERE status IN ('queued', 'processing', 'failed')
GROUP BY status;
