# Product Requirements Document (PRD)

## Project Overview
- **Project**: Self-Hosted Supermemory Backend & Frontend Retrofit
- **Goal**: Deliver a fully self-contained deployment that runs the open-source Supermemory UI against a new backend without relying on app.supermemory.ai, removing subscription/paywall dependencies while preserving core functionality (ingestion, search, chat, integrations).

## Problem Statement
The open-source frontend depends on the proprietary Supermemory SaaS API for all operations (auth, document ingestion, search, chat, connectors, billing). For self-hosting, we must recreate the backend contract and adjust the UI to run independently.

## Objectives & Success Metrics
1. **Backend Compatibility** – All endpoints consumed by the OSS frontend are implemented locally with identical schemas (`packages/lib/api.ts`, `packages/validation`). _Metric_: Frontend runs end-to-end without hitting `api.supermemory.ai`.
2. **Document & Memory Workflow** – Users can add text/links/files, pipeline processes to memories, and search results match stored data. _Metric_: Ingestion completes and searchable memories include new content.
3. **Chat Experience** – Conversational UI works with locally configured LLMs. _Metric_: `/chat` and `/chat/title` endpoints stream responses using project context.
4. **Integrations Readiness** – OAuth connectors (Google Drive, Notion, OneDrive) are available or clearly feature-flagged. _Metric_: Connector UI flows complete or display configured status.
5. **Self-Hosting Simplicity** – A documentação oficial deve explicar como subir Bun + Supabase (Postgres/Storage) localmente ou em servidores próprios, sem depender de Cloudflare. _Metric_: Passo a passo validado em ambiente limpo.

## Scope
### In Scope
- Backend services for auth, documents, memories, search, chat, connectors e settings.
- Conversão automática de conteúdos (sites, PDFs, DOCX, PPTX, áudio, vídeo, YouTube) usando Firecrawl e Gemini para alimentar memórias enriquecidas.
- Queue/worker pipeline for ingestion stages (`queued` → `done`).
- Vector search with configurable thresholds and filters.
- Frontend updates removing subscription gating (Autumn/Pro), pointing to new backend.
- Documentation for configuration, secrets, deployment, testing.

### Out of Scope
- Paid subscription management, billing portals, Autumn licensing.
- Analytics proprietários/telemetria centralizada.
- Enterprise-only connectors not exposed in OSS frontend.
- MCP client packaging beyond existing repo tools.

## Stakeholders
- **Backend Engineering** – builds API, worker pipeline, integrations.
- **Frontend Engineering** – refactors UI, config, feature flags.
- **DevOps/Platform** – infraestrutura (Supabase Postgres/Storage, provisionamento do backend Bun, observabilidade).
- **Docs/Support** – self-hosting guides, troubleshooting.

## Assumptions & Risks
- Access to Supabase Postgres with pgvector and Supabase Storage (or equivalents).
- Availability of Gemini API keys (default provider) – adapters can add others later if needed.
- Firecrawl é opcional mas recomendado para padronizar páginas web antes do chunking.
- OAuth clients for connectors can be provisioned by deployers.
- Some SaaS behaviors undocumented; may require iterative testing against original API to match edge cases.
- Long-running ingestion jobs must fit within Workers/queue constraints; may need dedicated worker runtime.

## Milestones
1. **M1 – Authentication Foundation**: Custom session-based auth, session cookies, organization/project scoping.
2. **M2 – Ingestion Pipeline**: document upload, storage, async processing, status polling.
3. **M3 – Search & Chat**: vector retrieval, thresholds, rerank, chat streaming.
4. **M4 – Integrations & Settings**: connector OAuth skeletons (atrás de feature flags até configurar) e ajustes de preferências; analytics/Posthog foram descartados para o self-hosted.
5. **M5 – Frontend Retrofit & Docs**: remove paywall logic, update env files, write deployment guides, final QA.

## Dependencies
- Supabase para Postgres/Storage (ou banco compatível com pgvector).
- Migrações Drizzle garantindo schema e configuração da autenticação customizada.
- Plataforma para jobs de ingestão (Supabase Queue ou worker dedicado em Bun).

## Non-Functional Requirements
- Response latency for core APIs < 300 ms p95 (search may exceed with rerank).
- Ingestion handles files up to 20 MB; larger assets queued with backoff.
- Fault tolerance: retries on extraction/embedding; idempotent status polling.
- Observability: structured logs, basic metrics, error tracking hooks.

## Open Questions
- Will first release include derived memory relationships (`updates`, `extends`, `derives`) or defer for later?
- Should we provide fallbacks for connectors (manual import) if OAuth unavailable?
- Whether future releases need providers beyond Gemini default.
