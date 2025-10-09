# Guia de Setup - Supermemory com Busca Híbrida

Este guia contém as instruções para configurar o Supermemory com as melhorias de busca híbrida (vetorial + full-text search) e chat com AI SDK.

## 📋 Pré-requisitos

- Node.js 20+ ou Bun 1.2.17+
- Conta no Supabase (com projeto criado)
- Chave de API do Google Gemini
- (Opcional) Chave de API do Cohere para re-ranking

## 🗄️ 1. Configuração do Banco de Dados (Supabase)

### 1.1 Habilitar extensão pgvector

No SQL Editor do Supabase, execute:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 1.2 Executar funções e índices SQL

Execute o arquivo `apps/api/supabase-functions.sql` no SQL Editor do Supabase:

1. Acesse o Supabase Dashboard → SQL Editor
2. Cole todo o conteúdo do arquivo `apps/api/supabase-functions.sql`
3. Execute (Run)

Isso criará:
- ✅ Colunas `fts` (tsvector) para full-text search
- ✅ Triggers para manter o FTS atualizado automaticamente
- ✅ Índices GIN para full-text search
- ✅ Índices IVFFlat para busca vetorial
- ✅ 4 funções principais:
  - `search_documents_fulltext()`
  - `search_chunks_fulltext()`
  - `search_documents_vector()`
  - `search_chunks_vector()`

### 1.3 Verificar execução

Confirme que as funções foram criadas:

```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE 'search_%';
```

Deve retornar 4 funções.

## ⚙️ 2. Configuração do Backend (API)

### 2.1 Variáveis de ambiente

Crie ou edite `apps/api/.env.local`:

```ini
# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
SUPABASE_ANON_KEY=sua_anon_key

# Google Gemini (obrigatório)
GOOGLE_API_KEY=sua_gemini_api_key

# Modelos (usando o modelo atualizado)
CHAT_MODEL=models/gemini-2.5-flash-preview-09-2025
EMBEDDING_MODEL=text-embedding-004
EMBEDDING_DIMENSION=1536

# Cohere Re-ranking (opcional, mas recomendado)
COHERE_API_KEY=sua_cohere_api_key
ENABLE_RERANKING=true  # Set to false para desabilitar re-ranking

# Recency Boost (opcional)
ENABLE_RECENCY_BOOST=true
RECENCY_WEIGHT=0.2
RECENCY_HALF_LIFE_DAYS=14

# Outros
PORT=4000
APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

### 2.2 Instalar dependências

Na raiz do projeto:

```bash
bun install
```

Isso instalará o pacote `cohere-ai` que foi adicionado ao `package.json`.

### 2.3 Testar API

```bash
bun dev
```

A API deve iniciar em `http://localhost:4000`.

**Testes de saúde:**

```bash
# Health check
curl http://localhost:4000/health

# Deve retornar: {"status":"ok"}
```

## 🎨 3. Configuração do Frontend (Web)

### 3.1 Variáveis de ambiente

Crie ou edite `apps/web/.env.local`:

```ini
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3.2 Iniciar frontend

```bash
bun dev
```

O frontend estará em `http://localhost:3001` (ou `http://localhost:3000` dependendo da configuração).

## 🧪 4. Testar Funcionalidades

### 4.1 Script Automatizado de Testes

Execute o script de validação rápida:

```bash
cd apps/api

# Sem autenticação (apenas /health funcionará, endpoints /v3/* e /chat* retornarão 401)
./test-endpoints.sh

# Com Bearer Token
AUTH_TOKEN=seu_token ./test-endpoints.sh

# Com Cookie de Sessão
SESSION_COOKIE="better-auth.session_token=seu_cookie" ./test-endpoints.sh

# Para output detalhado:
VERBOSE=true AUTH_TOKEN=seu_token ./test-endpoints.sh
```

**Nota:** Endpoints `/v3/*` e `/chat*` exigem autenticação. Configure `AUTH_TOKEN` ou `SESSION_COOKIE` para testes completos.

### 4.2 Testes Manuais

#### 4.2.1 Testar Full-Text Search

```bash
curl -X POST http://localhost:4000/v3/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{
    "q": "seu termo de busca",
    "limit": 10,
    "mode": "keyword"
  }'
```

#### 4.2.2 Testar Busca Vetorial

```bash
curl -X POST http://localhost:4000/v3/search \
  -H "Content-Type: application/json" \
  -d '{
    "q": "seu termo de busca",
    "limit": 10
  }'
```

#### 4.2.3 Testar Busca Híbrida (Keyword + Vector + RRF)

```bash
curl -X POST http://localhost:4000/v3/search/hybrid \
  -H "Content-Type: application/json" \
  -d '{
    "q": "seu termo de busca",
    "limit": 10,
    "mode": "hybrid",
    "weightVector": 0.7
  }'
```

#### 4.2.4 Testar Chat v2 (com modos)

**Modo Simple:**
```bash
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Olá!"}],
    "mode": "simple"
  }'
```

**Modo Agentic (com busca automática):**
```bash
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "O que tenho sobre IA?"}],
    "mode": "agentic"
  }'
```

**Modo Deep (análise profunda):**
```bash
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Analise minhas memórias sobre programação"}],
    "mode": "deep"
  }'
```

## 📊 5. Endpoints Disponíveis

### Busca

- `POST /v3/search` - Busca vetorial clássica
- `POST /v3/search/hybrid` - Busca híbrida (FTS + Vetorial + RRF)
- `POST /v4/search` - Busca baseada em memórias

### Chat

- `POST /chat` - Chat legado (streaming manual)
- `POST /chat/v2` - Chat com AI SDK (recomendado)
  - Suporta modos: `simple`, `agentic`, `deep`
  - Ferramentas (tools) automáticas
  - Streaming eficiente com AI SDK

### Documentos

- `POST /v3/documents` - Adicionar documento
- `POST /v3/documents/list` - Listar documentos
- `GET /v3/documents/:id` - Obter documento
- `PATCH /v3/documents/:id` - Atualizar documento
- `DELETE /v3/documents/:id` - Remover documento

## 🔧 6. Configurações Avançadas

### 6.1 Ajustar dimensão do embedding

Se você usar um modelo de embedding diferente de `text-embedding-004`, ajuste:

1. **No .env:**
   ```ini
   EMBEDDING_MODEL=seu-modelo
   EMBEDDING_DIMENSION=nova-dimensao
   ```

2. **No SQL (supabase-functions.sql):**
   Altere todas as referências de `vector(1536)` para a nova dimensão.

### 6.2 Otimizar índices vetoriais

Para bases de dados grandes (>100k documentos), ajuste o parâmetro `lists` dos índices IVFFlat:

```sql
-- Recomendação: lists ≈ sqrt(total_rows)
-- Para 100k docs: lists = 316
-- Para 1M docs: lists = 1000

DROP INDEX IF EXISTS documents_embedding_idx;
CREATE INDEX documents_embedding_idx 
ON documents 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 316);
```

### 6.3 Ajustar pesos da busca híbrida

No código ou via parâmetros da requisição:

```typescript
// apps/api/src/services/hybrid-search.ts
const DEFAULT_KEYWORD_WEIGHT = 0.3; // Peso do FTS
const DEFAULT_VECTOR_WEIGHT = 0.7;  // Peso da busca vetorial
```

### 6.4 Configurar Recency Boost

Favorece documentos mais recentes nos resultados:

```ini
ENABLE_RECENCY_BOOST=true
RECENCY_WEIGHT=0.2          # 20% do score vem da recência
RECENCY_HALF_LIFE_DAYS=14   # Docs perdem 50% do boost após 14 dias
```

## 🐛 7. Troubleshooting

### Erro: "Failed to fetch"
- Verifique se a API está rodando em `http://localhost:4000`
- Confirme que CORS está configurado corretamente em `ALLOWED_ORIGINS`

### Erro: "function search_documents_fulltext does not exist"
- Execute o arquivo `supabase-functions.sql` no Supabase
- Verifique permissões da role (service_role deve ter EXECUTE)

### Erro: "cohere-ai module not found"
- Execute `bun install` na raiz do projeto
- Verifique que `cohere-ai` está em `package.json` (raiz do monorepo)

### Busca vetorial lenta
- Confirme que os índices IVFFlat foram criados
- Ajuste o parâmetro `lists` conforme o tamanho da base
- Considere usar HNSW em vez de IVFFlat para bases grandes:
  ```sql
  CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);
  ```

### Re-ranking não funciona
- Verifique que `COHERE_API_KEY` está configurada
- Confirme que o pacote `cohere-ai` está instalado
- O re-ranking só é aplicado quando há >1 resultado

## 📝 8. Próximos Passos

- [ ] Migrar UI para `/chat/v2` (atualmente usa `/chat`)
- [ ] Adicionar seletor de modo na interface do chat
- [ ] Implementar loop agentic com avaliação de suficiência
- [ ] Adicionar observabilidade (métricas, logs estruturados)
- [ ] Padronizar formato de citações [N] no prompt
- [ ] Criar testes automatizados para endpoints

## 🔗 Referências

- [Documentação Supabase](https://supabase.com/docs)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [Cohere Re-ranking](https://docs.cohere.com/docs/reranking)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Google Gemini](https://ai.google.dev/docs)

---

**Data de criação:** 2025-01-08  
**Versão:** 1.0
### 3.3 Selecionar o modo do chat

Ao abrir a tela de chat, use o seletor “Mode” no topo à direita para escolher entre:
- `Simple` – resposta rápida, 1 rodada de busca
- `Agentic` – busca iterativa com múltiplas queries (requer `ENABLE_AGENTIC_MODE=true`)
- `Deep` – contexto ampliado e respostas longas

O frontend envia a conversa para `POST /chat/v2` com o campo `mode` no corpo da requisição.
