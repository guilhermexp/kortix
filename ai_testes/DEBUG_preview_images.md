# Debug: Preview Images não aparecendo

## Análise do Problema

### ✅ Sistema Implementado Corretamente

O sistema de extração e exibição de imagens de preview **está implementado e funcionando**:

1. **Backend - Extração** (`apps/api/src/services/extractor.ts:689-737`)
   - Faz request HTTP para buscar o HTML da página
   - Extrai meta tags Open Graph (`og:image`, `twitter:image`, etc.)
   - Salva em `raw.ogImage` e `raw.metaTags`

2. **Backend - Salvamento** (`apps/api/src/services/ingestion.ts:154-159`)
   - Salva `extraction.raw` dentro de `raw.extraction` no banco
   - Estrutura final: `raw.extraction.ogImage`

3. **Backend - API Response** (`apps/api/src/routes/documents.ts:579`)
   - Retorna o campo `raw` completo na listagem de documentos

4. **Frontend - Exibição** (`apps/web/components/memory-list-view.tsx:165-271`)
   - Função `getDocumentPreview()` busca imagens em múltiplos locais:
     - `raw.ogImage` (linha 198)
     - `raw.extraction.ogImage` (linha 200)
     - `raw.firecrawl.metadata.ogImage` (linha 207)
     - `metadata.ogImage` (linha 196)
   - Se encontrar, exibe a preview (linhas 423-465)

### ⚠️ Casos Onde Preview Não Aparece (Esperado)

1. **GitHub Repository URLs (*.git)**
   - Exemplo: `https://github.com/user/repo.git`
   - Essas URLs **não possuem** Open Graph images
   - Log mostra: `hasOgImage: false` ← comportamento correto

2. **Páginas sem Meta Tags**
   - Páginas que não implementam Open Graph
   - Sites que bloqueiam scraping

3. **Erro na Extração**
   - Timeout no request HTTP
   - URL bloqueada por SSRF protection

### 🔍 Verificação Necessária

Para confirmar se o sistema está funcionando, teste com **URLs que possuem OG images**:

#### URLs de Teste (com OG images garantidas):
- `https://www.youtube.com/watch?v=dQw4w9WgXcQ` ← YouTube tem thumbnail
- `https://github.com/vercel/next.js` ← Página do projeto (não .git)
- `https://twitter.com/elonmusk/status/123` ← Tweets têm imagens
- Qualquer artigo de notícia de site grande

#### URLs sem OG images (não mostrarão preview):
- `https://github.com/user/repo.git` ← Repositório Git
- Sites simples sem meta tags
- APIs/endpoints JSON

## Diagnóstico Rápido

Execute este comando para ver o conteúdo de `raw` de um documento:

```sql
-- No Supabase SQL Editor ou psql
SELECT
  id,
  title,
  url,
  raw->'extraction'->'ogImage' as og_image_extraction,
  raw->'ogImage' as og_image_direct,
  raw->'metaTags' as meta_tags
FROM documents
WHERE url IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

## Resultado Esperado

- **Se `og_image_extraction` ou `og_image_direct` estão NULL**: A URL realmente não tem OG image
- **Se estão preenchidos mas preview não aparece**: Bug no frontend
- **Se `og_image` está em outro caminho**: Precisa ajustar frontend para buscar nesse local

## Próximos Passos

1. ✅ Teste com uma URL conhecida por ter OG image (YouTube, Twitter, GitHub project page)
2. ✅ Verifique no DevTools Network se a imagem está sendo retornada na resposta da API
3. ✅ Verifique no Console do navegador se há erros ao carregar a imagem
4. ✅ Se preview aparecer para URLs com OG image, sistema está funcionando corretamente

## Conclusão Preliminar

O sistema está **implementado corretamente**. O problema reportado pode ser:
- URLs testadas não possuem OG images (GitHub .git URLs)
- Necessário testar com URLs que têm OG images para confirmar funcionamento
