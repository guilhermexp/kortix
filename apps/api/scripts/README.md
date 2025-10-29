# Scripts de Manutenção

## Regenerar Embeddings

Este script regenera embeddings que foram perdidos durante a migration do banco de dados.

### Uso

```bash
# Regenerar TODOS os embeddings (chunks, documents, memories)
cd apps/api
bun run scripts/regenerate-embeddings.ts

# Regenerar apenas document_chunks (mais rápido para testar)
bun run scripts/regenerate-embeddings.ts --table=document_chunks

# Regenerar apenas documents
bun run scripts/regenerate-embeddings.ts --table=documents

# Regenerar apenas memories
bun run scripts/regenerate-embeddings.ts --table=memories

# Customizar batch size e delay (útil para rate limits)
bun run scripts/regenerate-embeddings.ts --batch-size=5 --delay-ms=200
```

### Parâmetros

- `--table=TABLE`: Qual tabela processar (document_chunks, documents, memories, ou all)
- `--batch-size=N`: Quantos itens processar por batch (default: 10)
- `--delay-ms=N`: Delay em ms entre batches (default: 100)

### Tempo Estimado

Com as configurações padrão:
- **document_chunks**: ~35-40 minutos (3.532 chunks)
- **documents**: ~1-2 minutos (133 documentos)
- **memories**: ~2-3 minutos (212 memórias)
- **Total**: ~40-45 minutos

### Requisitos

- `GOOGLE_API_KEY` configurado no `.env`
- Ou `ANTHROPIC_API_KEY` (fallback)
- Conexão com Supabase funcionando

### Monitoramento

O script mostra progresso em tempo real:
```
🚀 Iniciando regeneração de embeddings...
⚙️  Configurações: batch_size=10, delay_ms=100, table=all

🔄 Regenerando embeddings de document_chunks...
📊 Encontrados 3532 chunks sem embedding
✓ Processado batch 1/354 (10/3532)
✓ Processado batch 2/354 (20/3532)
...
✅ Chunks concluídos: 3532 processados, 0 erros
```

### Recuperação de Erros

Se o script falhar:
1. Ele pode ser executado novamente - só processará itens sem embedding
2. Verifique os logs para identificar erros específicos
3. Ajuste `--batch-size` e `--delay-ms` se houver rate limiting

### Após a Conclusão

Verifique no Supabase que os embeddings foram criados:

```sql
-- Verificar status
SELECT
  'document_chunks' as table_name,
  COUNT(*) as total,
  COUNT(embedding) as with_embedding
FROM document_chunks
UNION ALL
SELECT
  'documents',
  COUNT(*),
  COUNT(summary_embedding)
FROM documents
UNION ALL
SELECT
  'memories',
  COUNT(*),
  COUNT(memory_embedding)
FROM memories;
```

Todos devem mostrar `total = with_embedding`.
