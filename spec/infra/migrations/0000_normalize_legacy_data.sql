-- Normalização de dados legados do SaaS
-- Este script corrige embeddings, metadados e campos de data que vieram em formatos antigos

-- 1. Normalizar embeddings de documents (converter string para vector)
-- Tenta converter embeddings que estão como string para vector
-- Se a conversão falhar, simplesmente limpa (o pipeline vai regenerar)
UPDATE documents
SET summary_embedding = NULL
WHERE summary_embedding IS NOT NULL
  AND summary_embedding::text ~ '^\{.*}';

-- 2. Normalizar embeddings de memories
UPDATE memories
SET memory_embedding = NULL
WHERE memory_embedding IS NOT NULL
  AND memory_embedding::text ~ '^\{.*}';

-- 3. Normalizar source_added_at (usar created_at se estiver vazio ou em formato string)
UPDATE memories
SET source_added_at = created_at
WHERE source_added_at IS NULL
   OR source_added_at::text ~ '^\d{4}-\d{2}-\d{2}T';

-- 4. Remover metadados herdados (containerTags) que não são mais usados
UPDATE documents
SET metadata = metadata - 'containerTags'
WHERE metadata ? 'containerTags';

UPDATE document_chunks
SET metadata = metadata - 'containerTags'
WHERE metadata ? 'containerTags';

UPDATE memories
SET metadata = metadata - 'containerTags'
WHERE metadata ? 'containerTags';