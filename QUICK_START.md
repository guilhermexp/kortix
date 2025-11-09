# 🚀 Supermemory - Quick Start Guide

> **Para desenvolvedores que estão chegando agora**
>
> Última atualização: Novembro 2025
> Versão: 2.1.0

---

## 📖 O que é o Supermemory?

**Supermemory** é um sistema de memória e gerenciamento de conhecimento alimentado por IA, completamente self-hosted. Pense nele como um "segundo cérebro" que:

- 📝 Ingere e processa qualquer tipo de conteúdo (PDFs, sites, vídeos, imagens, código)
- 🔍 Busca semântica inteligente em toda sua base de conhecimento
- 💬 Chat com IA que tem contexto de todos seus documentos
- 🎨 Canvas infinito visual para organizar informações
- ✍️ Editor rico de markdown com 20.000+ linhas de código

### Casos de Uso

- Pesquisadores organizando papers e anotações
- Desenvolvedores salvando documentação e snippets
- Estudantes gerenciando materiais de estudo
- Empresas criando bases de conhecimento internas

---

## 🏗️ Arquitetura em 2 Minutos

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js)                      │
│  - Canvas Infinito (drag & drop visual)                    │
│  - Editor Rico (markdown avançado)                         │
│  - Chat com IA (streaming)                                 │
│  - UI com Glassmorphism                                    │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                      API (Bun + Hono)                       │
│  - Ingestão de documentos (multi-modal)                    │
│  - Busca híbrida (vector + text)                           │
│  - Claude Agent SDK (4 providers)                          │
│  - Processing pipeline (chunking, embeddings, summary)     │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                  DATABASE (Supabase)                        │
│  - PostgreSQL + pgvector                                   │
│  - Row Level Security (RLS)                                │
│  - Storage para arquivos                                   │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| **Frontend** | Next.js + React | 16 + 19 |
| **Backend** | Bun + Hono | 1.2+ |
| **Database** | Supabase (Postgres + pgvector) | Latest |
| **AI Models** | GLM 4.6, MiniMax M2, Haiku 4.5, Kimi | - |
| **Embeddings** | Gemini text-embedding-004, Voyage AI | - |
| **Search** | pgvector (IVFFlat) + Hybrid ranking | - |
| **Deployment** | Railway | - |

---

## ⚡ Setup em 5 Minutos

### 1. Pré-requisitos

```bash
# Instale o Bun (recomendado)
curl -fsSL https://bun.sh/install | bash

# OU Node.js 20+
node --version  # deve ser >= 20
```

**Contas necessárias:**
- [Supabase](https://supabase.com) (free tier) - Database
- [Google AI Studio](https://aistudio.google.com) (free) - Gemini API
- [OpenRouter](https://openrouter.ai) (optional) - Fallback AI
- [Anthropic](https://anthropic.com) (optional) - Claude API

### 2. Clone e Instale

```bash
git clone https://github.com/guilhermexp/supermemory.git
cd supermemory
bun install  # ou: npm install
```

### 3. Configure o Supabase

1. Crie um novo projeto em [supabase.com](https://supabase.com)
2. Ative a extensão **pgvector**:
   - Dashboard → Database → Extensions
   - Procure "vector" e clique em "Enable"
3. Pegue suas credenciais:
   - Settings → API → Project URL
   - Settings → API → anon/public key
   - Settings → API → service_role key

### 4. Configure as Variáveis de Ambiente

**API (.env.local):**

```bash
cd apps/api
cp .env.local.example .env.local
nano .env.local  # ou seu editor preferido
```

**Mínimo necessário:**

```bash
# Supabase (obrigatório)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_aqui
SUPABASE_ANON_KEY=sua_anon_key_aqui

# Google Gemini (obrigatório - para embeddings)
GOOGLE_API_KEY=sua_google_api_key_aqui

# Multi-Provider AI (obrigatório - para chat)
# O sistema usa GLM como provider padrão compatível com Anthropic
ANTHROPIC_API_KEY=sua_glm_api_key_aqui
GLM_API_KEY=sua_glm_api_key_aqui

# Opcional mas recomendado
OPENROUTER_API_KEY=sua_openrouter_key  # Fallback para summarização
VOYAGE_API_KEY=sua_voyage_key          # Embeddings alternativos (100M tokens free)
```

**Web (.env.local):**

```bash
cd ../web
cp .env.example .env.local
nano .env.local
```

```bash
# Backend URL (deixe vazio para usar URL relativa)
NEXT_PUBLIC_BACKEND_URL=

# Supabase (mesmo do API)
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_anon_key_aqui
```

### 5. Rode as Migrations

```bash
cd apps/api
bun run migrate  # Cria as tabelas no Supabase
```

### 6. Inicie o Desenvolvimento

```bash
# Na raiz do projeto
bun run dev
```

Isso vai iniciar:
- **API**: http://localhost:4000
- **Web**: http://localhost:3000
- **Ingestion Worker**: Background processing

Abra http://localhost:3000 e crie sua conta! 🎉

---

## 📁 Estrutura do Projeto

```
supermemory/
├── apps/
│   ├── api/                          # Backend (Bun + Hono)
│   │   ├── src/
│   │   │   ├── routes/               # Endpoints REST
│   │   │   │   ├── chat-v2.ts        # Chat com Claude Agent SDK ⭐
│   │   │   │   ├── documents.ts      # CRUD de documentos
│   │   │   │   ├── search.ts         # Busca híbrida
│   │   │   │   └── conversations.ts  # Histórico de chat
│   │   │   │
│   │   │   ├── services/             # Lógica de negócio
│   │   │   │   ├── claude-agent.ts   # Orquestrador de multi-provider ⭐
│   │   │   │   ├── ingestion.ts      # Pipeline de ingestão ⭐
│   │   │   │   ├── hybrid-search.ts  # Busca semântica + texto ⭐
│   │   │   │   ├── extractor.ts      # Extração multi-modal
│   │   │   │   ├── markitdown.ts     # Conversão de conteúdo
│   │   │   │   ├── summarizer.ts     # Resumo com AI
│   │   │   │   ├── embedding-provider.ts  # Embeddings (Gemini/Voyage)
│   │   │   │   └── openrouter.ts     # Fallback AI provider
│   │   │   │
│   │   │   ├── config/
│   │   │   │   └── providers.ts      # Config dos 4 AI providers ⭐
│   │   │   │
│   │   │   ├── middleware/           # Auth, rate limiting
│   │   │   ├── types/                # TypeScript types
│   │   │   └── worker/
│   │   │       └── ingestion-worker.ts  # Background processing
│   │   │
│   │   └── migrations/               # Supabase SQL migrations
│   │
│   ├── web/                          # Frontend (Next.js 16)
│   │   ├── app/                      # App router pages
│   │   │   ├── page.tsx              # Homepage (dashboard)
│   │   │   └── memory/[id]/edit/page.tsx  # Editor de memória
│   │   │
│   │   ├── components/
│   │   │   ├── canvas/               # Infinity Canvas ⭐
│   │   │   │   ├── infinity-canvas.tsx
│   │   │   │   ├── document-card.tsx
│   │   │   │   └── document-selector-modal.tsx
│   │   │   │
│   │   │   ├── editor/               # Sistema de edição ⭐
│   │   │   │   ├── memory-edit-client.tsx
│   │   │   │   └── memory-entries-sidebar.tsx
│   │   │   │
│   │   │   ├── ui/
│   │   │   │   └── rich-editor/      # Editor rico (~20k linhas) ⭐
│   │   │   │       ├── editor.tsx
│   │   │   │       ├── block.tsx
│   │   │   │       ├── handlers/
│   │   │   │       └── utils/
│   │   │   │
│   │   │   └── views/
│   │   │       ├── chat/             # Interface de chat ⭐
│   │   │       │   ├── index.tsx
│   │   │       │   ├── chat-messages.tsx
│   │   │       │   └── provider-selector.tsx
│   │   │       └── add-memory/       # Adicionar conteúdo
│   │   │
│   │   ├── stores/                   # Zustand state management
│   │   │   ├── chat.ts
│   │   │   └── canvas.ts
│   │   │
│   │   └── lib/                      # Utilities
│   │
│   └── docs/                         # Mintlify documentation
│
├── packages/                         # Shared code (monorepo)
│   ├── lib/                          # Utilities compartilhadas
│   ├── ui/                           # Componentes compartilhados
│   └── validation/                   # Schemas Zod
│
├── ai_docs/                          # Documentação técnica ⭐
│   ├── CLAUDE_AGENT_MULTI_PROVIDER_ARCHITECTURE.md
│   ├── MULTI_PROVIDER_AI_INTEGRATION.md
│   ├── DEPLOYMENT_CHECKLIST.md
│   └── ...
│
├── ai_specs/                         # Especificações de features
├── ai_issues/                        # Bug tracking
├── ai_changelog/                     # Histórico de versões
│
└── ai_testes/                        # Scripts de teste
```

### ⭐ Arquivos Mais Importantes

| Arquivo | O que faz | Quando mexer |
|---------|-----------|--------------|
| `apps/api/src/services/claude-agent.ts` | Orquestra chat com 4 AI providers | Adicionar novos providers, mudar lógica de chat |
| `apps/api/src/services/ingestion.ts` | Pipeline completo de ingestão | Adicionar novos tipos de documento |
| `apps/api/src/services/hybrid-search.ts` | Busca semântica + ranking | Melhorar relevância de busca |
| `apps/api/src/config/providers.ts` | Configuração de GLM, MiniMax, Anthropic, Kimi | Adicionar/configurar providers |
| `apps/web/components/canvas/infinity-canvas.tsx` | Canvas infinito drag & drop | Melhorar UX do canvas |
| `apps/web/components/views/chat/chat-messages.tsx` | Interface de chat (2000+ linhas) | UI do chat, tool rendering |
| `apps/web/components/ui/rich-editor/editor.tsx` | Editor rico de markdown | Features do editor |

---

## 🔑 Conceitos-Chave

### 1. Pipeline de Ingestão

```
Input (URL/File/Text)
    ↓
Extração (markitdown, OCR, transcription)
    ↓
Summarização (OpenRouter/Gemini)
    ↓
Chunking (800 tokens)
    ↓
Embeddings (Gemini/Voyage)
    ↓
Armazenamento (pgvector)
```

**Arquivo:** `apps/api/src/services/ingestion.ts`

### 2. Multi-Provider Chat (Claude Agent SDK)

O sistema suporta **4 providers de IA** intercambiáveis:

| Provider | ID | Modelo | Uso |
|----------|-----|--------|-----|
| **Z.AI (GLM)** | `glm` | GLM-4.6 | Rápido e balanceado (padrão) |
| **MiniMax** | `minimax` | MiniMax-M2 | Raciocínio avançado |
| **Anthropic** | `anthropic` | Haiku 4.5 | Baixa latência |
| **Kimi** | `kimi` | Kimi K2 Thinking | Deep thinking |

**Como funciona:**
1. Frontend envia `providerId` no request
2. `claude-agent.ts` carrega config do provider
3. Usa API compatível com Anthropic
4. Streaming de resposta via SSE

**Arquivos:**
- Config: `apps/api/src/config/providers.ts`
- Orquestrador: `apps/api/src/services/claude-agent.ts`
- UI: `apps/web/components/views/chat/provider-selector.tsx`

### 3. Busca Híbrida

Combina 2 tipos de busca:

**Vector Search (Semântica)**
- Embeddings 1536-d
- pgvector IVFFlat index
- Similaridade por cosseno

**Text Search (BM25)**
- PostgreSQL full-text search
- Reranking com Cohere (opcional)

**Resultado:** Mescla inteligente dos dois rankings

**Arquivo:** `apps/api/src/services/hybrid-search.ts`

### 4. Infinity Canvas

Canvas infinito para organizar documentos visualmente:

- **Drag & drop:** Posiciona cards livremente
- **Zoom:** 25%-200% com mouse wheel
- **Pan:** Click-and-drag para navegar
- **Persistência:** Salva posições em `canvas_positions` table

**Arquivos:**
- Canvas: `apps/web/components/canvas/infinity-canvas.tsx`
- Store: `apps/web/stores/canvas.ts`

### 5. Rich Text Editor

Editor de markdown com 20.000+ linhas:

**Features:**
- Blocos drag & drop
- Formatação inline (bold, italic, code)
- Headers, quotes, code blocks
- Tables com builder
- Imagens (upload/paste)
- Vídeos (YouTube embed)
- Links com preview
- Color picker
- Undo/redo
- Auto-save
- Export HTML

**Pasta:** `apps/web/components/ui/rich-editor/`

---

## 🔧 Comandos Úteis

### Desenvolvimento

```bash
# Iniciar tudo
bun run dev                           # API + Web + Worker

# Iniciar individualmente
bun run --cwd apps/api dev           # Apenas API (porta 4000)
bun run --cwd apps/web dev           # Apenas Web (porta 3000)

# Com documentação
bun run dev:all                      # API + Web + Docs (porta 3003)
```

### Build & Type Check

```bash
# Type checking
bun run check-types                  # Verifica todos os projetos

# Build
bun run build                        # Build de produção

# Lint e Format
bun run format-lint                  # Formata e lint todo código
```

### Database

```bash
# Rodar migrations
cd apps/api
bun run migrate

# Criar nova migration
# Crie arquivo SQL em: apps/api/migrations/XXXX_nome.sql
# Execute: bun run migrate
```

### Testes

```bash
# Rodar testes
bun test

# Testes de integração
cd ai_testes
bun run 01-test-document-creation.ts
```

---

## 🚀 Deploy (Railway)

### Setup Inicial

1. **Conecte o GitHub:**
   - Vá em [railway.app](https://railway.app)
   - New Project → Deploy from GitHub
   - Selecione o repositório

2. **Crie 2 Services:**

   **Service 1 - API:**
   - Root Directory: `apps/api`
   - Start Command: `bun run src/index.ts`
   - Watch Paths: `apps/api/**`

   **Service 2 - Web:**
   - Root Directory: `apps/web`
   - Start Command: `npm run start`
   - Watch Paths: `apps/web/**`

3. **Configure Variáveis:**

   **API Service:**
   ```bash
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=sua_key
   SUPABASE_ANON_KEY=sua_key
   AUTH_SECRET=gere_um_secret_32_chars
   GOOGLE_API_KEY=sua_key
   ANTHROPIC_API_KEY=sua_glm_key
   GLM_API_KEY=sua_key
   OPENROUTER_API_KEY=sua_key  # opcional
   ```

   **Web Service:**
   ```bash
   NEXT_PUBLIC_BACKEND_URL=  # Deixe VAZIO (usa URL relativa)
   NEXT_PUBLIC_APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}
   NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_key
   ```

4. **Deploy:**
   - Push para branch `Producao`
   - Railway faz deploy automaticamente

### Branch Strategy

```
main (desenvolvimento)
  ↓ merge quando estável
Producao (production)
  ↓ auto-deploy
Railway (live)
```

**Documentação completa:** `ai_docs/DEPLOYMENT_CHECKLIST.md`

---

## 📊 Principais Tabelas do Database

| Tabela | O que armazena | Chave |
|--------|----------------|-------|
| `organizations` | Multi-tenant (empresas) | `id` |
| `users` | Usuários do sistema | `id` |
| `documents` | Metadados dos documentos | `id` |
| `chunks` | Pedaços de texto + embeddings | `id` (usa pgvector) |
| `memories` | Insights processados pela IA | `id` |
| `conversations` | Histórico de chats | `id` |
| `events` | Logs de eventos (tool use, etc) | `id` |
| `canvas_positions` | Posições dos cards no canvas | `document_id` |
| `projects` | Projetos/pastas | `id` |

**Schema completo:** `ai_docs/DATA_MODEL_REFERENCE.md`

---

## 🐛 Troubleshooting Comum

### "Port 4000 already in use"

```bash
# Encontre o processo
lsof -ti:4000

# Mate o processo
kill -9 $(lsof -ti:4000)
```

### "Invalid environment configuration"

Verifique que todas as variáveis obrigatórias estão no `.env.local`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `GOOGLE_API_KEY`
- `ANTHROPIC_API_KEY`

### "pgvector extension not found"

1. Vá no Supabase Dashboard
2. Database → Extensions
3. Procure "vector"
4. Clique em "Enable"

### Chat não funciona / "No messages"

1. Verifique se o provider está configurado:
   ```bash
   cd apps/api
   bun run test-providers-loaded.ts
   ```

2. Veja logs do API:
   ```bash
   bun run --cwd apps/api dev
   # Observe os logs quando fizer pergunta
   ```

3. Verifique se tem `ANTHROPIC_API_KEY` (obrigatório pelo sistema)

### Ingestão de documentos falhando

1. Verifique worker está rodando:
   ```bash
   # Deve aparecer: [ingestion-worker] Ingestion worker started
   ```

2. Veja status dos documentos:
   ```sql
   -- No Supabase SQL Editor
   SELECT title, status, processing_error
   FROM documents
   WHERE status = 'failed'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

3. Logs de processamento:
   ```sql
   SELECT * FROM processing_logs
   ORDER BY created_at DESC
   LIMIT 20;
   ```

### Canvas não salva posições

Verifique se a tabela existe:
```sql
SELECT * FROM canvas_positions LIMIT 1;
```

Se não existir, rode migrations:
```bash
cd apps/api
bun run migrate
```

---

## 🎓 Fluxos Principais

### 1. Adicionar um Documento

```
Frontend (add-memory)
  ↓ POST /documents
API (documents.ts)
  ↓ createDocument()
  ↓ INSERT INTO documents (status='pending')
  ↓ Retorna document_id
  ↓
Ingestion Worker (ingestion-worker.ts)
  ↓ Detecta documento pending
  ↓ processDocument()
Ingestion Service (ingestion.ts)
  ↓ extractContent() → markitdown.ts
  ↓ summarize() → openrouter.ts
  ↓ chunkContent() → chunk.ts
  ↓ generateEmbeddings() → embedding-provider.ts
  ↓ INSERT INTO chunks
  ↓ UPDATE documents SET status='completed'
```

### 2. Buscar Documentos

```
Frontend (search input)
  ↓ POST /search
API (search.ts)
  ↓ performHybridSearch()
Hybrid Search (hybrid-search.ts)
  ↓ vectorSearch() → pgvector similarity
  ↓ textSearch() → PostgreSQL full-text
  ↓ mergeResults()
  ↓ (opcional) rerank() → Cohere
  ↓ Retorna lista rankeada
Frontend
  ↓ Renderiza resultados
```

### 3. Chat com IA

```
Frontend (chat interface)
  ↓ POST /chat/v2 (SSE)
  ↓ { message, providerId, mode }
API (chat-v2.ts)
  ↓ startConversation()
Claude Agent (claude-agent.ts)
  ↓ Carrega config do provider
  ↓ createAnthropicClient()
  ↓ Adiciona tool: searchDatabase
  ↓ agent.messages.create()
  ↓ (IA decide usar tool ou não)
  ↓ Tool execution → hybrid-search.ts
  ↓ Stream resposta
  ↓ Salva em conversations + events
Frontend
  ↓ Renderiza mensagens
  ↓ Mostra tool use
```

### 4. Editar Memória (Rich Editor)

```
Frontend (/memory/[id]/edit)
  ↓ GET /documents/:id
  ↓ Carrega conteúdo
Rich Editor (editor.tsx)
  ↓ Parsea markdown → blocks
  ↓ Usuário edita
  ↓ Auto-save timer (3s)
  ↓ PATCH /documents/:id
API (documents.ts)
  ↓ UPDATE documents
  ↓ Retorna sucesso
Frontend
  ↓ Mostra saved indicator
```

---

## 📚 Documentação Adicional

### Para Entender Mais

| Documento | O que cobre |
|-----------|-------------|
| `CLAUDE.md` | Guia completo do projeto (800+ linhas) |
| `ai_docs/CLAUDE_AGENT_MULTI_PROVIDER_ARCHITECTURE.md` | Arquitetura do chat (900+ linhas) |
| `ai_docs/MULTI_PROVIDER_AI_INTEGRATION.md` | Integração multi-provider |
| `ai_docs/DEPLOYMENT_CHECKLIST.md` | Checklist completo de deploy |
| `ai_docs/DATA_MODEL_REFERENCE.md` | Schema completo do database |
| `ai_docs/YOUTUBE_PROCESSING_ANALYSIS.md` | Como processa vídeos |
| `ai_specs/` | Especificações de features individuais |
| `ai_changelog/CHANGELOG.md` | Histórico de mudanças |

### Para Contribuir

| Documento | O que cobre |
|-----------|-------------|
| `CONTRIBUTING.md` | Guia de contribuição |
| `AGENTS.md` | Como trabalhar com AI agents |
| `ai_docs/README.md` | Índice de toda documentação |

---

## 🆘 Precisa de Ajuda?

### 1. Leia a documentação
- Comece por `CLAUDE.md` (visão geral completa)
- Procure em `ai_docs/` por tópico específico
- Veja `ai_issues/` para bugs conhecidos

### 2. Verifique logs
```bash
# API logs
bun run --cwd apps/api dev

# Browser devtools
# F12 → Console/Network
```

### 3. Teste componentes isolados
```bash
# Teste providers
cd apps/api
bun run test-tools.ts

# Teste busca
cd ai_testes
bun run 05-test-search.ts
```

### 4. GitHub Issues
- Procure issues existentes
- Crie nova issue com detalhes completos

---

## ✅ Checklist: "Estou Pronto?"

Marque quando conseguir fazer cada item:

**Setup Básico:**
- [ ] Clonou repositório
- [ ] Instalou dependências (`bun install`)
- [ ] Configurou Supabase
- [ ] Configurou `.env.local` (API + Web)
- [ ] Rodou migrations
- [ ] App roda em localhost (API + Web)

**Compreensão:**
- [ ] Entende o fluxo de ingestão
- [ ] Sabe onde fica cada feature no código
- [ ] Consegue adicionar um documento
- [ ] Consegue fazer busca
- [ ] Consegue usar o chat
- [ ] Entende o sistema multi-provider

**Desenvolvimento:**
- [ ] Consegue modificar UI
- [ ] Consegue modificar API endpoint
- [ ] Consegue rodar type checking
- [ ] Entende estrutura do database
- [ ] Sabe onde procurar documentação

---

## 🎯 Próximos Passos Recomendados

### Dia 1: Setup e Exploração
1. ✅ Rode o app localmente
2. 📝 Adicione alguns documentos (URL, texto, PDF)
3. 🔍 Teste a busca
4. 💬 Converse com a IA
5. 🎨 Brinque com o canvas

### Dia 2: Código
1. 📖 Leia `CLAUDE.md` completo
2. 🔍 Explore arquivos marcados com ⭐
3. 🧪 Rode os testes em `ai_testes/`
4. 📝 Adicione um `console.log()` e veja funcionando

### Dia 3: Feature
1. 🐛 Escolha um bug/feature pequena
2. 🔧 Implemente mudança
3. ✅ Teste localmente
4. 📤 Faça commit e teste em staging

---

## 💡 Dicas de Produtividade

### VS Code Extensions Recomendadas
- **TypeScript + React**: ESLint, Prettier
- **Database**: PostgreSQL, Supabase
- **AI**: GitHub Copilot, Codeium

### Atalhos Úteis
```bash
# Alias úteis (adicione no .bashrc/.zshrc)
alias sm='cd ~/supermemory'
alias sma='cd ~/supermemory/apps/api && bun run dev'
alias smw='cd ~/supermemory/apps/web && bun run dev'
alias sml='tail -f ~/supermemory/apps/api/logs/*.log'
```

### Debug Tips
```typescript
// apps/api/src/services/algum-service.ts
console.log('[DEBUG]', 'Nome da função', { variavel1, variavel2 })

// Busque por [DEBUG] nos logs
```

---

## 📝 Glossário

| Termo | Significado |
|-------|-------------|
| **Chunk** | Pedaço de texto (800 tokens) usado para embeddings |
| **Embedding** | Vetor numérico (1536-d) representando significado semântico |
| **pgvector** | Extensão PostgreSQL para busca de vetores |
| **IVFFlat** | Algoritmo de indexação para busca aproximada de vetores |
| **RLS** | Row Level Security - segurança nível de linha no Postgres |
| **SSE** | Server-Sent Events - streaming de servidor para cliente |
| **MCP** | Model Context Protocol - protocolo de contexto para modelos |
| **Tool Use** | IA chamando funções (ex: searchDatabase) |
| **Hybrid Search** | Busca combinando similaridade vetorial + texto |
| **Reranking** | Re-ordenação de resultados por relevância |
| **Ingestion** | Processo completo de processar e indexar documento |

---

## 🎊 Parabéns!

Se chegou até aqui, você tem todo conhecimento necessário para começar a desenvolver no Supermemory!

**Lembre-se:**
- 📖 Documentação é sua amiga (`ai_docs/`)
- 🐛 Bugs acontecem, logs ajudam
- 💬 Pergunte quando precisar
- 🚀 Divirta-se codando!

**Happy Coding! 🎉**

---

<div align="center">

**Made with ❤️ by the Supermemory Team**

[GitHub](https://github.com/guilhermexp/supermemory) • [Documentation](./ai_docs/) • [Issues](https://github.com/guilhermexp/supermemory/issues)

</div>
