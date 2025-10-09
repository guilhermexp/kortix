# Melhorias no Sistema de Busca - Supermemory

## O Que Foi Implementado

### 1. **Re-Ranking com Recência (Opcional)**

Adicionado sistema de re-ranking híbrido que combina similaridade semântica com recência temporal.

**Arquivos modificados:**
- `apps/api/src/env.ts` - Novas variáveis de ambiente
- `apps/api/src/routes/search.ts` - Lógica de re-ranking
- `apps/api/src/routes/chat.ts` - Limites ajustados

### 2. **Variáveis de Ambiente**

Adicione no arquivo `apps/api/.env.local`:

```bash
# Recency Boost (opcional - padrão: desabilitado)
ENABLE_RECENCY_BOOST=false  # true para ativar
RECENCY_WEIGHT=0.2          # 0.0 a 1.0 (20% peso para recência, 80% para similaridade)
RECENCY_HALF_LIFE_DAYS=14   # Documentos perdem 50% do peso a cada N dias
```

### 3. **Como Funciona**

#### Sem Recency Boost (padrão):
```
score_final = similaridade_semântica
```

#### Com Recency Boost ativado:
```
score_final = (0.8 × similaridade) + (0.2 × recência)

recência = exp(-idade_dias / 14)
```

**Exemplo:**
- Documento criado hoje: recência = 1.0
- Documento de 14 dias atrás: recência = 0.5
- Documento de 28 dias atrás: recência = 0.25

### 4. **Melhorias nos Limites**

#### Chat (`apps/api/src/routes/chat.ts`):
- **Antes**: Buscava 5 documentos, usava 3 no contexto
- **Depois**: Busca 10 documentos, usa 5 no contexto
- Thresholds aumentados de 0 para 0.1 (filtra resultados irrelevantes)

#### Search (`apps/api/src/routes/search.ts`):
- baseLimit continua calculado dinamicamente: `max(50, limit * 8)`
- Re-ranking aplicado APÓS agrupamento por documento
- Mantém compatibilidade com código existente

### 5. **Configurações Recomendadas**

#### Para busca geral (sem viés temporal):
```bash
ENABLE_RECENCY_BOOST=false
```

#### Para priorizar conteúdo recente (recomendado):
```bash
ENABLE_RECENCY_BOOST=true
RECENCY_WEIGHT=0.2
RECENCY_HALF_LIFE_DAYS=14
```

#### Para MUITO viés temporal (ex: notícias):
```bash
ENABLE_RECENCY_BOOST=true
RECENCY_WEIGHT=0.4
RECENCY_HALF_LIFE_DAYS=7
```

### 6. **Compatibilidade**

✅ **Totalmente compatível** com código existente
✅ **Sem breaking changes** - padrão é desabilitado
✅ **Funciona com Vercel AI SDK** - não afeta streaming
✅ **Funciona com Supabase** - re-ranking em TypeScript
✅ **Sem migrations necessárias** - usa timestamps existentes

### 7. **Próximos Passos (Opcional)**

Se quiser implementar busca híbrida (texto + vetor) no futuro:

1. Criar migration para adicionar coluna `fts` (full text search):
```sql
-- Migration: Add full text search column
ALTER TABLE documents ADD COLUMN fts tsvector;

CREATE INDEX documents_fts_idx ON documents USING gin(fts);

CREATE OR REPLACE FUNCTION update_documents_fts()
RETURNS TRIGGER AS $$
BEGIN
  NEW.fts = to_tsvector('portuguese', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_fts_update
BEFORE INSERT OR UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION update_documents_fts();
```

2. Criar função Supabase de hybrid search com RRF
3. Chamar função via `.rpc()` do Supabase client

## Teste

Para testar:

1. Inicie a API: `bun run dev` (na pasta apps/api)
2. Teste sem recency boost (padrão)
3. Ative `ENABLE_RECENCY_BOOST=true` e reinicie
4. Compare resultados com memórias recentes vs antigas

## Rollback

Para desabilitar completamente:
```bash
ENABLE_RECENCY_BOOST=false
```

Ou remova as variáveis do .env - o sistema volta ao comportamento anterior.
