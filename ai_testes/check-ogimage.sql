-- Verificar se ogImage está sendo salvo para supermemory.ai
SELECT
  id,
  title,
  url,
  raw->'extraction'->'ogImage' as og_image_extraction,
  raw->'extraction'->'metaTags' as meta_tags_extraction,
  raw->'ogImage' as og_image_direct,
  raw as raw_complete
FROM documents
WHERE url LIKE '%supermemory.ai%'
ORDER BY created_at DESC
LIMIT 1;
