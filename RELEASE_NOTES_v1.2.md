# Release Notes – Supermemory v1.2

Data: 2025-01-08

## Resumo

Esta versão consolida o pipeline RAG com re‑ranking, busca híbrida e um modo Agentic iterativo. O chat legado foi migrado para AI SDK (streamText) e a UI agora permite escolher o modo (simple/agentic/deep) usando o endpoint `/chat/v2`.

## Principais Mudanças

- Backend
  - Chat v1 reescrito com AI SDK (`streamText`).
  - Chat v2 integra o novo serviço Agentic e mantém modos `simple` e `deep`.
  - Serviço Agentic dedicado (`apps/api/src/services/agentic-search.ts`) com `generateObject` para geração de queries e avaliação de suficiência.
  - Tool renomeada para `searchMemories` e saída compatível com a UI (count/results).
  - Prompt endurecido aplicado em ambos os chats (somente contexto + citações [N] + “Sources:”).
  - Reranking via Cohere com toggle `ENABLE_RERANKING`.
  - Recency boost configurável (`ENABLE_RECENCY_BOOST`, `RECENCY_WEIGHT`, `RECENCY_HALF_LIFE_DAYS`).
  - Gate do modo Agentic por `ENABLE_AGENTIC_MODE` (padrão: true).

- Banco de Dados (Supabase)
  - Colunas FTS, triggers e índices GIN para `documents`/`document_chunks`.
  - Funções: `search_documents_fulltext`, `search_chunks_fulltext`, `search_documents_vector`, `search_chunks_vector`.
  - Índices IVFFlat recomendados (não criados automaticamente se houver limitação de memória).
  - Arquivo: `apps/api/supabase-functions.sql`.

- UI (Web)
  - Chat agora usa `/chat/v2` e envia `mode` no body.
  - Seletor de modo (simple/agentic/deep) adicionado no componente de chat.
  - Destaques do grafo habilitados via tool `searchMemories`.

## Variáveis de Ambiente

```ini
# Supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Gemini
GOOGLE_API_KEY=...
CHAT_MODEL=models/gemini-2.5-flash-preview-09-2025
EMBEDDING_MODEL=text-embedding-004
EMBEDDING_DIMENSION=1536

# Reranking (opcional)
COHERE_API_KEY=...
ENABLE_RERANKING=true

# Recency Boost (opcional)
ENABLE_RECENCY_BOOST=true
RECENCY_WEIGHT=0.2
RECENCY_HALF_LIFE_DAYS=14

# Agentic gate
ENABLE_AGENTIC_MODE=true
```

## Endpoints

- `POST /v3/search` – busca vetorial
- `POST /v3/search/hybrid` – FTS + vetorial + RRF (requer SQL aplicado)
- `POST /chat` – chat legado (AI SDK agora)
- `POST /chat/v2` – chat com modos (simple/agentic/deep) e tools

## Como Testar

1) Script automatizado:
```bash
cd apps/api
AUTH_TOKEN=seu_token VERBOSE=true ./test-endpoints.sh
```

2) cURL – chat v2 agentic:
```bash
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "mode": "agentic",
    "messages": [{"role":"user","content":"O que tenho sobre IA?"}]
  }'
```

3) UI – seletor “Mode” no topo do chat.

## Notas Operacionais

- Custos: re‑ranking habilitado eleva custo por requisição. Use `ENABLE_RERANKING=false` se necessário.
- Desempenho: crie IVFFlat em bases grandes ou aceite maior latência sem índice.
- Observabilidade (sugestão): métricas de latência/busca, tokens, taxa de resultados vazios.

## Rollback

- Desabilitar Agentic: `ENABLE_AGENTIC_MODE=false` (mantém simple/deep).
- Desabilitar re‑ranking: `ENABLE_RERANKING=false` (mantém ordenação por similaridade/recência).
- UI: voltar endpoint para `/chat` e remover seletor de modo (não recomendado).

