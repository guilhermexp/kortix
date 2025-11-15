# 🧹 Guia de Limpeza do Supabase

## 📊 O que será limpo

### ✅ MANTIDO (Essencial):
- ✅ `id`, `title`, `summary` (resumo!)
- ✅ `metadata`, `status`, `type`, `url`
- ✅ `created_at`, `updated_at`
- ✅ Estrutura da tabela e índices

### ❌ REMOVIDO (Pesado):
- ❌ `raw` - Conteúdo bruto (bytea) - **100KB-5MB cada**
- ❌ `content` - Texto completo - **10KB-500KB cada**
- ❌ `summary_embedding` - Vetores - **6KB cada**
- ❌ `summary_embedding_model` - Referência do modelo

### 📈 Impacto Esperado:
- **Storage**: Redução de **90-95%**
- **Egress**: Redução de **95%+** (já com nossas correções de código)
- **Custo**: De $10-20/mês → **$0/mês** (free tier)

---

## 🚀 Execução Passo-a-Passo

### PASSO 1: Analisar Tamanho Atual

1. Abra o **Supabase Dashboard** → Seu Projeto
2. Vá em **SQL Editor** (menu lateral)
3. Cole e execute este comando:

```sql
-- Ver tamanho atual
SELECT
    'DATABASE_SIZE' as metric,
    pg_size_pretty(pg_database_size('postgres')) as current_size;

-- Contar documentos
SELECT
    COUNT(*) as total_documents,
    COUNT(*) FILTER (WHERE raw IS NOT NULL) as has_raw,
    COUNT(*) FILTER (WHERE content IS NOT NULL) as has_content,
    COUNT(*) FILTER (WHERE summary IS NOT NULL) as has_summary
FROM documents;
```

**Anote os valores!** Você vai comparar depois.

---

### PASSO 2: Limpeza em Batches (RECOMENDADO)

Execute **um de cada vez**, aguardando alguns segundos entre eles:

#### Batch 1: Limpar campo `raw` (mais pesado)
```sql
-- Execute isso 2-3 vezes até retornar "0 rows affected"
UPDATE documents
SET raw = NULL
WHERE raw IS NOT NULL
LIMIT 100;

-- Verificar progresso
SELECT COUNT(*) FILTER (WHERE raw IS NOT NULL) as remaining_raw FROM documents;
```

#### Batch 2: Limpar campo `content`
```sql
-- Execute isso 2-3 vezes até retornar "0 rows affected"
UPDATE documents
SET content = NULL
WHERE content IS NOT NULL AND length(content) > 1000
LIMIT 100;

-- Verificar progresso
SELECT COUNT(*) FILTER (WHERE content IS NOT NULL AND length(content) > 1000) as remaining_content FROM documents;
```

#### Batch 3: Limpar embeddings
```sql
-- Execute isso 2-3 vezes até retornar "0 rows affected"
UPDATE documents
SET
    summary_embedding = NULL,
    summary_embedding_model = NULL,
    summary_embedding_new = NULL,
    summary_embedding_model_new = NULL
WHERE summary_embedding IS NOT NULL
LIMIT 100;

-- Verificar progresso
SELECT COUNT(*) FILTER (WHERE summary_embedding IS NOT NULL) as remaining_embeddings FROM documents;
```

---

### PASSO 3: Recuperar Espaço em Disco

Após todos os batches estarem completos (0 rows affected):

```sql
-- Atualizar estatísticas
ANALYZE documents;

-- Recuperar espaço (pode demorar 1-2 minutos)
VACUUM FULL documents;
```

**Importante**: O `VACUUM FULL` realmente libera o espaço no disco. Sem ele, o Supabase não vai reduzir a cobrança.

---

### PASSO 4: Verificar Resultados

```sql
-- Verificar novo tamanho
SELECT
    'AFTER_CLEANUP' as status,
    pg_size_pretty(pg_database_size('postgres')) as database_size,
    pg_size_pretty(pg_total_relation_size('documents')) as documents_size;

-- Verificar integridade dos dados
SELECT
    COUNT(*) as total_docs,
    COUNT(*) FILTER (WHERE summary IS NOT NULL) as has_summary,
    COUNT(*) FILTER (WHERE title IS NOT NULL) as has_title,
    COUNT(*) FILTER (WHERE raw IS NULL) as raw_cleaned,
    COUNT(*) FILTER (WHERE content IS NULL) as content_cleaned,
    ROUND(100.0 * COUNT(*) FILTER (WHERE summary IS NOT NULL) / COUNT(*), 2) as summary_coverage_pct
FROM documents;
```

**Resultados esperados:**
- `raw_cleaned` = total_docs
- `content_cleaned` = total_docs
- `summary_coverage_pct` = próximo de 100%
- `database_size` = reduzido em 90%+

---

## 🔧 Limpeza Opcional: Chunks e Memories

Se você quiser limpar **tudo**, também pode limpar embeddings de chunks e memories:

### Limpar Chunks (opcional):
```sql
-- Ver tamanho
SELECT COUNT(*) as total_chunks,
       COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding
FROM document_chunks;

-- Limpar em batches
UPDATE document_chunks
SET
    embedding = NULL,
    embedding_model = NULL,
    embedding_new = NULL,
    embedding_new_model = NULL
WHERE embedding IS NOT NULL
LIMIT 100;

-- Recuperar espaço
ANALYZE document_chunks;
VACUUM FULL document_chunks;
```

### Limpar Memories (opcional):
```sql
-- Ver tamanho
SELECT COUNT(*) as total_memories,
       COUNT(*) FILTER (WHERE memory_embedding IS NOT NULL) as has_embedding
FROM memories;

-- Limpar em batches
UPDATE memories
SET
    memory_embedding = NULL,
    memory_embedding_model = NULL,
    memory_embedding_new = NULL,
    memory_embedding_new_model = NULL
WHERE memory_embedding IS NOT NULL
LIMIT 100;

-- Recuperar espaço
ANALYZE memories;
VACUUM FULL memories;
```

---

## ⚠️ IMPORTANTE: O que vai acontecer

### ✅ Ainda vai funcionar:
- ✅ **Busca por resumos** - Summaries preservados
- ✅ **Listagem de documentos** - Títulos e metadados OK
- ✅ **Chat** - Usa summaries para contexto
- ✅ **Filtros e tags** - Metadata preservado
- ✅ **Timeline** - Datas preservadas

### ❌ Não vai funcionar (se você usava):
- ❌ **Busca vetorial exata** - Embeddings removidos (mas você não precisa mais com nossas correções!)
- ❌ **Leitura do conteúdo completo** - Content removido
- ❌ **Download do arquivo original** - Raw removido

---

## 🔄 Alternativa: Limpeza Automática Futura

Se você quiser evitar acumular conteúdo pesado, pode criar uma função para limpar automaticamente:

```sql
-- Criar função de auto-limpeza
CREATE OR REPLACE FUNCTION auto_cleanup_heavy_content()
RETURNS trigger AS $$
BEGIN
    -- Remove campos pesados após 7 dias
    IF NEW.created_at < NOW() - INTERVAL '7 days' THEN
        NEW.raw := NULL;
        NEW.content := NULL;
        NEW.summary_embedding := NULL;
        NEW.summary_embedding_model := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger (descomente para ativar)
-- CREATE TRIGGER cleanup_old_documents
-- BEFORE UPDATE ON documents
-- FOR EACH ROW
-- EXECUTE FUNCTION auto_cleanup_heavy_content();
```

---

## 📊 Monitoramento Pós-Limpeza

Após 24-48 horas, verifique no Supabase Dashboard:

1. **Settings** → **Usage**
2. Verificar:
   - Database Size (deve ter caído 90%+)
   - Egress (deve estar < 1GB/mês)
   - Billing (deve estar $0)

---

## 🆘 Precisa Reverter?

Se algo der errado e você quiser restaurar:

1. **Infelizmente, dados binários (raw) são perdidos permanentemente**
2. **Content pode ser regenerado** fazendo re-ingestion dos documentos
3. **Embeddings podem ser regenerados** rodando o processamento novamente

**Mas**: Como você manteve os **summaries**, a aplicação continua funcionando normalmente!

---

## ✅ Checklist de Execução

- [ ] Analisei o tamanho atual do banco
- [ ] Executei Batch 1 (raw) até 0 rows affected
- [ ] Executei Batch 2 (content) até 0 rows affected
- [ ] Executei Batch 3 (embeddings) até 0 rows affected
- [ ] Rodei ANALYZE documents
- [ ] Rodei VACUUM FULL documents
- [ ] Verifiquei os resultados
- [ ] Database size reduziu 90%+
- [ ] Summaries preservados (100%)
- [ ] Aplicação ainda funciona normalmente

---

**Tempo total estimado**: 5-10 minutos (dependendo do número de documentos)

**Economia estimada**: $10-20/mês → $0/mês
