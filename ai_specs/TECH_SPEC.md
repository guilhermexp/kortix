# Technical Specification – Self-Hosted Supermemory

## 1. Requirements Summary
### Functional
- Provide endpoints alinhados com `packages/lib/api.ts` e `packages/validation` (`/v3/documents*`, `/v3/projects`, `/v3/search`, `/v4/search`, `/chat`, `/chat/title`, `/v3/connections*`, `/v3/settings`).
- Maintain custom session flows (email/password, organizations) with cookie-based auth.
- Support document ingestion pipeline (text/link/upload) with status tracking (`queued`, `extracting`, `chunking`, `embedding`, `indexing`, `done`, `failed`).
- Persist documents, chunks, memories, relationships, and metadata; expose polling endpoints to retrieve status and content.
- Implement vector search with thresholds, filters, containerTags, rerank toggles, query rewriting flags; optionally provide `/v4/search` for memory-based retrieval.
- Deliver chat endpoints that stream responses and can invoke `searchMemories` / `addMemory` tools.
- Provide OAuth connector scaffolding for Google Drive, Notion, OneDrive; support token storage and sync jobs (can be feature-flagged if disabled).
- Telemetria opcional; nenhuma dependência obrigatória de Posthog no modo self-hosted.

### Non-Functional
- Deployable as a standalone Bun/Node service falando direto com Supabase Postgres (pgvector) e Supabase Storage. O diretório `cloudflare-saas-stack/` permanece apenas como histórico, sem suporte oficial na trilha self-hosted.
- Authentication middleware enforces organization/project scoping; all data filtered by containerTags.
- Endpoints respond within <300 ms p95 for standard requests; ingestion pipeline resilient to retries.
- Provide logging, error tracking hooks, and health checks.

## 2. Architecture Overview
```mermaid
graph TD
  FE[Next.js Frontend (apps/web)] -->|Cookies / $fetch| API{{API Worker (Hono/Bun)}}
  API -->|SQL + Vector| DB[(Supabase Postgres + pgvector)]
  API -->|File Streams| Storage[[Supabase Storage]]
  API -->|Enqueue Jobs| Queue[Workers Queue / Edge Function]
  Queue --> Worker[Background Worker]
  Worker --> DB
  Worker --> Embedding[Gemini Embedding API]
  API --> LLM[Gemini Chat API]
  API --> Connectors[OAuth Connectors]
```

### Component Responsibilities
- **API Worker**: Entry point (Workers/Pages) handling auth, REST endpoints, streaming chat.
- **Background Worker**: Consumes ingestion jobs, performs extraction/chunking/embedding, updates DB and storage.
- **Database**: Supabase Postgres instance with pgvector; stores users/orgs, documents, chunks, memories, relationships, connectors e settings (conforme `packages/validation`).
- **Object Storage**: Supabase Storage buckets for raw files and derived assets referenced by document metadata.
- **Embedding Provider**: Gemini embeddings (default); adapters allow future providers.
- **LLM Provider**: Gemini chat completion (default) with pluggable adapter interface for future providers.
- **Connectors**: OAuth clients, token storage, scheduled sync tasks.

## 3. Data Model (Logical)
- `users`, `sessions`, `organizations`, `organization_members`: Custom authentication tables.
- `spaces` (projects), `documents`, `document_chunks`, `document_metadata`, `memories`, `memory_relationships`, `documents_to_spaces`.
- `api_requests` (usage logging), `organization_settings`, `connections`, `connection_states`, `oauth_tokens`.
- `ingestion_jobs` / `processing_logs` for pipeline monitoring.
- All `*_id` are ULIDs/UUIDs; `container_tag` stored for quick filtering.
- Embeddings stored in `pgvector` columns with indexes (IVFFlat/HNSW); metadata JSONB for filters.

## 4. API Contract Snapshot
- **Auth**: `/api/auth/*` (custom auth handlers); internal endpoints for org management.
- **Documents**:
  - `POST /v3/documents` – add note/link; returns document/memory ID.
  - `POST /v3/documents/file` – multipart upload to R2 → job enqueued.
  - `POST /v3/documents/list` – pagination.
  - `POST /v3/documents/documents`, `/by-ids` – per existing schema.
  - `GET /v3/documents/:id` – status/payload; `PATCH` updates metadata.
  - `DELETE /v3/documents/:id` – remove document & related data.
- **Projects**: `GET/POST /v3/projects`, `DELETE /v3/projects/:projectId`.
- **Search**: `POST /v3/search` (documents) ; optional `POST /v4/search` (memories) supporting parameters in docs.
- **Chat**: `POST /chat` streaming SSE/websocket, `POST /chat/title` for autocompletion.
- **Integrations**: `/v3/connections`, `/v3/connections/list`, `/v3/connections/:provider` handshake.
- **Settings**: `/v3/settings` (analytics, welcome-email e proxy PostHog foram removidos no self-hosted).

## 5. Processing Pipeline
1. User adds document (text/link/file).
2. API persists initial record (`status=queued`), stores file in R2 if necessary, enqueues job with document ID + organization/project context.
3. Worker flow:
   - **Extracting**: Pull file/URL, convert to text using parser/transcriber.
   - **Chunking**: Split into segments; attach metadata (position, headings, container tags).
   - **Embedding**: Call embedding provider; store vectors and chunk text in DB.
   - **Indexing**: Insert into pgvector indexes; create derived memories, mark `status=done`.
   - **Error Handling**: On failure, update status, store error message.
4. Frontend polls `/v3/documents/:id` until `done` to render final content.

## 6. Implementation Plan
### Phase 1 – Foundations
- Set up monorepo workspace for backend (may reuse `cloudflare-saas-stack` directory or create new module).
- Configure custom auth server (env secrets, session cookies, organization support).
- Scaffold Hono/Workers router with middleware (auth, error handling, validation using zod).
- Define database schema with Drizzle (matching logical model) and migrations.

### Phase 2 – Document & Memory Services
- Implement `/v3/documents*` routes.
- Integrate Supabase Storage and queue/worker; implement file upload signing/storing.
- Build ingestion worker and job definitions.
- Write extraction/chunking utilities (PDF, HTML, text, optional audio/video).
- Persist chunk metadata & statuses; ensure `GET /v3/documents/:id` returns full structure as expected.

### Phase 3 – Search & Chat
- Build vector search module (embedding retrieval, metadata filters, thresholds, rerank option).
- Implement `/v3/search` (documents) and optional `/v4/search` (memories).
- Create chat orchestrator using selected LLM provider; support streaming responses and tool invocations.
- Implement `/chat/title` summarizer.

### Phase 4 – Integrations & Settings
- Scaffold OAuth flows for connectors; ship behind feature flags até credenciais existirem.
- Add job scheduler for syncing connectors (se necessário) quando integrações estiverem ativas.
- Garantir `/v3/settings` exposto com validações; analytics/Posthog permanecem fora do escopo.

### Phase 5 – Frontend Retrofit & Documentation
- Remove Autumn billing checks, hide paywalled components, update environment defaults.
- Ensure all `$fetch` calls point to local backend; adjust feature flags.
- Update `apps/browser-extension` default URLs.
- Write deployment guide (Supabase + Bun as primary path), configuration docs, troubleshooting.
- Conduct integration testing (Cypress/Playwright optional) and performance validation.

## 7. Work Breakdown
| Task | Owner | Dependencies | Notes |
| --- | --- | --- | --- |
| Backend repo initialization | Backend | None | Create env templates, base config |
| Custom auth server integration | Backend | Repo init | Email/password, org support |
| Database schema & migrations | Backend | Auth | Using Drizzle + Supabase connection |
| Document endpoints & storage | Backend | DB | Implement API + Supabase Storage upload |
| Ingestion worker | Backend | Document endpoints | Queue integration, pipeline stages |
| Embedding provider adapter | Backend | Worker | Configurable (OpenAI default) |
| Search service `/v3/search` | Backend | Worker, Embeddings | Implement thresholds/filters |
| Chat service | Backend | Search | Streaming SSE, LLM adapter |
| Connector OAuth flows | Backend | Auth | Feature flag per provider (post-MVP) |
| Settings endpoint | Backend | Auth | Provide minimal responses |
| Frontend billing removal | Frontend | Backend API stubs | Update UI, feature toggles |
| Frontend env/config update | Frontend | Backend base URL | `.env.example`, docs |
| Browser extension update | Frontend | Backend base URL | Replace API URL references |
| Deployment docs | Docs/DevOps | Implementation | Documentar deploy Bun + Supabase (sem dependências de Cloudflare) |
| Testing/QA | QA/Backend/Frontend | All | End-to-end validation |

## 8. Testing Strategy
- **Unit Tests**: Service modules (auth, ingestion pipeline utilities, search ranking).
- **Integration Tests**: API routes against local Postgres/R2 mocks (use MinIO for local storage).
- **Load Tests**: Search endpoints with vector DB; ingestion pipeline under queued load.
- **End-to-End**: Run Next.js frontend against backend in dev mode; verify flows (login, add memory, search, chat, connectors).

## 9. Deployment & Ops
- Fornecer scripts (Terraform, Supabase CLI ou flyctl/docker) para criar recursos necessários: Postgres, Storage buckets e filas.
- Implement CI pipeline for lint/tests/migrations.
- Document environment variables (`AUTH_SECRET`, DB credentials, storage keys, embedding/LLM keys, OAuth secrets, telemetry toggles).
- Set up logging (Pino) and alerting (Sentry optional) with configuration hooks.

## 10. Risks & Mitigations
- **Embedding provider limits**: Offer fallback to local embeddings or batching.
- **Large file processing**: Implement chunked uploads and streaming extraction; enforce size limits with informative errors.
- **Connector OAuth complexity**: Provide feature flags to disable connectors until credentials configured.
- **Resource limits**: Keep heavy ingestion work in the background worker to avoid blocking requests; scale the Bun worker horizontally when needed.

## Implementation Progress – 2024-11-02
- Autenticação customizada com fluxo próprio de email/senha sobre as tabelas `users`/`sessions`. O backend expõe `/api/auth/sign-up|sign-in|sign-out|session`, gerencia senhas com `scrypt`, cria cookies httpOnly e garante associação automática à organização padrão via `ensureMembershipForUser`.
- O middleware de sessão agora lê o cookie `sm_session`, valida expiração no Postgres e injeta `organizationId`/`userId` para as rotas `/v3` mantendo a base para políticas RLS.
- Policies RLS habilitadas para `spaces`, `documents`, `document_chunks`, `memories`, `documents_to_spaces`, `organization_members` e `ingestion_jobs`, amarrando `org_id` aos headers `X-Supermemory-*` enviados pelo backend.
- `apps/api` recebeu middleware com sessão, rotas `/v3` validadas por zod e pipeline de ingestão que enfileira jobs, gera chunks/embeddings com Gemini (fallback determinístico) e popula memórias (modo assíncrono via worker em `src/worker/ingestion-worker.ts`).
- Busca vetorial gera embeddings via Gemini (com fallback determinístico) e ranqueia por cosseno em `/v3/search`, respondendo conforme os esquemas compartilhados.
- Stubs de conectores, configurações, waitlist, migração MCP e chat streaming já permitem que o frontend OSS converse só com a nossa API enquanto as integrações definitivas são desenvolvidas.
- Pipeline de ingestão agora busca conteúdo remoto (HTML/PDF) com leitura via Readability/pdf-parse, gera resumo automático via Gemini e enriquece os metadados/word count antes de criar chunks. Quando `FIRECRAWL_API_KEY` está definido, URLs públicas são convertidas via Firecrawl antes do parser local, garantindo Markdown consistente para páginas complexas. Links do YouTube são analisados via Gemini Vision (com o vídeo passado em `file_uri`) para gerar resumos multimodais, e qualquer arquivo binário não suportado (DOCX, PPTX, imagens, áudio, vídeo) é enviado pela API de Upload do Gemini, que devolve Markdown + bullet points prontos para chunking.

### Próximos Passos Imediatos
1. Aplicar políticas RLS no Supabase utilizando o `org_id` e `user_id` agora garantidos pelas sessões customizadas.
2. Evoluir a fila de ingestão para Supabase Queue (ou worker dedicado) com observabilidade (backoff/monitoramento) e distribuir carga entre múltiplos workers.
3. Trocar o chat stub por orquestração LLM (ferramentas, memória) e validar o streaming/SSE com testes alinhados ao transporte do pacote `ai` no frontend.
4. Completar adaptadores OAuth dos conectores e substituir stubs por fluxos reais quando as credenciais estiverem disponíveis.
