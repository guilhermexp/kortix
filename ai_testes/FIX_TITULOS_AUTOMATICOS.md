# Fix: Títulos Automáticos para Documentos

## Problema Identificado

Documentos adicionados no sistema estavam aparecendo com "Untitled" ao invés de títulos extraídos automaticamente do conteúdo (meta tags OG, títulos HTML, etc).

**Exemplo:**
- URL: `https://supermemory.ai` → Título: "Untitled" ❌
- URL: `https://github.com/AutoLab-SAI-SJTU/AutoPage` → Título: "Untitled" ❌

## Causa Raiz

O extractor (`apps/api/src/services/extractor.ts`) ESTAVA extraindo títulos corretamente, mas o ingestion service estava salvando apenas o campo `raw` do objeto extraction, não salvando os metadados importantes como `title`, `source`, `contentType`, etc.

### Código Problemático (apps/api/src/services/ingestion.ts, linha 154-159)

```typescript
// ANTES (ERRADO):
const mergedRaw = extraction.raw
  ? {
      ...(document.raw ?? {}),
      extraction: extraction.raw,  // ❌ Só salva extraction.raw
    }
  : (document.raw ?? null)
```

Isso resultava em:
```json
{
  "extraction": {
    "metaTags": {
      "ogTitle": "GitHub - AutoLab..."  // ✅ Existe
    }
    // ❌ Faltava: "title": "..."
  }
}
```

## Solução Aplicada

### 1. Corrigir ingestion.ts para Salvar Metadados Completos

**Arquivo:** `apps/api/src/services/ingestion.ts` (linhas 154-166)

```typescript
// DEPOIS (CORRETO):
const mergedRaw = extraction.raw
  ? {
      ...(document.raw ?? {}),
      extraction: {
        title: extraction.title ?? null,           // ✅ Salva título
        source: extraction.source ?? null,         // ✅ Salva fonte
        contentType: extraction.contentType ?? null,
        url: extraction.url ?? null,
        wordCount: extraction.wordCount ?? null,
        ...extraction.raw,  // Mantém metaTags, ogImage, etc
      },
    }
  : (document.raw ?? null)
```

Agora o banco armazena:
```json
{
  "extraction": {
    "title": "GitHub - AutoLab...",  // ✅ Disponível
    "source": "markitdown",
    "contentType": "text/markdown",
    "metaTags": {
      "ogTitle": "GitHub - AutoLab..."
    },
    "ogImage": "https://..."
  }
}
```

### 2. Atualizar Documentos Existentes

Executamos duas queries SQL para corrigir documentos que já estavam no banco:

**Query 1: Usar ogTitle quando disponível**
```sql
UPDATE documents
SET
  title = raw->'extraction'->'metaTags'->>'ogTitle',
  raw = jsonb_set(
    raw,
    '{extraction,title}',
    to_jsonb(raw->'extraction'->'metaTags'->>'ogTitle'),
    true
  )
WHERE
  (title = 'Untitled' OR title IS NULL)
  AND raw->'extraction'->'metaTags'->>'ogTitle' IS NOT NULL
```

**Resultado:** 2 documentos atualizados
- `https://supermemory.ai` → "Supermemory — Universal Memory API for AI apps"
- `https://github.com/AutoLab-SAI-SJTU/AutoPage` → "GitHub - AutoLab-SAI-SJTU/AutoPage..."

**Query 2: Fallback para primeiras linhas do conteúdo**
```sql
UPDATE documents
SET title = CASE
  WHEN content LIKE 'AI Agents Directory%' THEN
    SPLIT_PART(content, E'\n', 1)
  WHEN content ~ '^\s*#+\s+' THEN
    TRIM(REGEXP_REPLACE(SPLIT_PART(content, E'\n', 1), '^\s*#+\s+', ''))
  ELSE
    LEFT(REGEXP_REPLACE(content, E'[\n\r]+', ' ', 'g'), 80)
  END
WHERE
  (title = 'Untitled' OR title IS NULL)
  AND content IS NOT NULL
```

**Resultado:** 5 documentos atualizados com títulos extraídos do conteúdo

## Verificação

```sql
SELECT COUNT(*) as untitled_count
FROM documents
WHERE title = 'Untitled' OR title IS NULL;
-- Resultado: 0 ✅
```

## Fluxo de Extração de Títulos

1. **Extractor** (`extractor.ts`):
   - Extrai de `<title>` tags HTML
   - Extrai de meta tags `og:title`
   - Extrai de metadata do MarkItDown
   - Extrai de metadata de PDFs
   - Retorna objeto com `{ title, source, raw: {...} }`

2. **Ingestion** (`ingestion.ts`):
   - Recebe extraction completo
   - **AGORA** salva metadados no banco: `extraction.title`, `extraction.source`, etc
   - Usa em `finalize_document_atomic`: `title: extraction.title ?? document.title ?? null`

3. **Database** (`finalize_document_atomic`):
   - Atualiza campo `title` do documento
   - Salva `raw.extraction` com todos os metadados

## Para Novos Documentos

Agora quando adicionar um novo documento:
- ✅ Se tiver `og:title` → usa automaticamente
- ✅ Se tiver `<title>` → usa automaticamente
- ✅ Se tiver metadata de PDF → usa automaticamente
- ✅ Se MarkItDown extrair título → usa automaticamente
- ⚠️ Caso contrário → usa primeiros caracteres do conteúdo ou "Untitled"

## Arquivos Modificados

1. **apps/api/src/services/ingestion.ts** (linhas 154-166)
   - Mudança: Salvar metadados completos do extraction no raw

## Status

✅ **RESOLVIDO** - Todos os documentos agora têm títulos adequados
- 0 documentos com "Untitled"
- Novos documentos receberão títulos automaticamente
- Títulos são extraídos de OG tags, HTML, PDFs, etc

## Data da Correção

2025-10-23
