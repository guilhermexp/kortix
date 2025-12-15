# AI Quickstart: Kortix

**Last Analysis Date:** 2025-12-14
**Git Branch:** main
**Last Commit:** 218f3425 - chore(deps): remove unused dependencies from apps/web
**Project Name:** Kortix

---

## Project Overview

Kortix is an AI-powered personal knowledge management system. Users can save URLs, files, and notes, which are processed into searchable memories with semantic vector search. Features include Claude AI chat integration, an infinity canvas (TLDraw) for visual organization, AI-powered text actions, and deep content analysis.

---

## Monorepo Structure

```
kortix/
  apps/
    api/              # Hono backend (Port 4000)
    web/              # Next.js 16 frontend (Port 3001)
    browser-extension/ # WXT browser extension (kortix-browser-extension)
    markitdown/       # Python Flask doc converter (Port 5000)
  packages/
    lib/              # React Query hooks, API client, utilities
    ui/               # Shadcn/Radix components
    validation/       # Zod schemas (SINGLE SOURCE OF TRUTH)
    hooks/            # Shared React hooks
```

---

## Tech Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Bun | 1.2.17 |
| Monorepo | Turborepo | 2.6.0 |
| Backend | Hono | 4.10.2 |
| Frontend | Next.js | 16.0.0 |
| UI | React | 19.1.0 |
| Database | Supabase (PostgreSQL + pgvector) | 2.76.1 |
| State | Zustand | 5.0.7 |
| Data Fetching | TanStack React Query | 5.81.2 |
| Validation | Zod | 4.1.12 |
| AI Agent | Claude Agent SDK | 0.1.14 |
| Canvas | TLDraw | - |
| Theme | next-themes | - |

---

## Database Schema (17+ Tables)

All tables have **RLS enabled** with policies using `org_id = get_request_org_id()` (custom header-based auth).

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `organizations` | Multi-tenant isolation | id, slug, name |
| `users` | User accounts | id, email, password_hash |
| `organization_members` | User-org relationship | organization_id, user_id, role, is_owner |
| `sessions` | Auth sessions | user_id, session_token, expires_at |
| `spaces` | Projects/folders | org_id, container_tag, name |
| `documents` | Ingested content | org_id, title, content, status, summary, url, summary_embedding |
| `document_chunks` | RAG chunks | document_id, content, embedding, chunk_index |
| `memories` | Extracted knowledge | document_id, content, memory_embedding, is_inference |
| `connections` | Third-party integrations | org_id, provider (google-drive/notion/onedrive), metadata |
| `ingestion_jobs` | Processing queue | document_id, status, attempts, error_message, payload |
| `conversations` | Chat sessions | org_id, sdk_session_id, title |
| `events` | Chat event log | conversation_id, event_type, role, content |
| `conversation_events` | Typed events | conversation_id, type, content (jsonb) |
| `tool_results` | Tool call results | event_id, tool_name, input, output |
| `canvas_projects` | Canvas projects | org_id, name, thumbnail, color, state |
| `canvas_states` | Canvas state backup | org_id, project_id, state (jsonb) |
| `canvas_positions` | Document positions | document_id, x, y |

### Document Status Flow

```
unknown -> queued -> fetching -> extracting -> chunking -> embedding -> processing -> indexing -> done
                                                                                              \-> failed
```

### Embeddings

- **Dimension:** 1536 (Google text-embedding-004)
- **Index:** ivfflat with cosine similarity
- **Columns:** `document_chunks.embedding`, `documents.summary_embedding`, `memories.memory_embedding`

---

## New Features (Since 2025-12-08)

### 1. AI Actions System (Canvas Context Menu)

New `/api/ai-actions` routes providing AI-powered text transformations:

**Review Actions:**
- `fixSpelling` - Fix spelling errors
- `fixGrammar` - Fix grammar errors
- `explain` - Explain selection

**Edit Actions:**
- `translate` - Translate to specified language (20+ languages supported)
- `changeTone` - Change writing tone (Professional, Casual, Friendly, etc.)
- `improveWriting` - Improve writing quality
- `makeLonger` / `makeShorter` - Adjust text length
- `continueWriting` - Continue writing in same style

**Generate Actions:**
- `summarize` - Create summary
- `generateHeadings` / `generateOutline` - Structure content
- `brainstormMindmap` - Create mind map
- `findActions` - Extract action items
- `writeArticle` / `writeTweet` / `writePoem` / `writeBlogPost`

**Code Actions:**
- `explainCode` - Explain code
- `checkCodeErrors` - Find bugs and issues

**Endpoints:**
- `POST /api/ai-actions/stream` - Streaming SSE response
- `POST /api/ai-actions/execute` - Non-streaming response
- `GET /api/ai-actions/actions` - List available actions

### 2. Deep Analysis Service (AnalysisService)

New service for deep content analysis using Gemini 2.5 Flash:

**Capabilities:**
- YouTube video analysis (audio + visual frames via multimodal)
- Web URL analysis with EXA subpage crawling
- GitHub repository analysis (README, package.json, pyproject.toml, etc.)

**Features:**
- Preview metadata extraction (OG images, favicons, site name)
- EXA integration for web search and code context
- Automatic mode detection (YouTube/GitHub/Web)

**Endpoint:**
- `POST /v3/deep-agent/analyze` - Deep analysis with auto mode detection

### 3. Ingestion Orchestrator (New Architecture)

Complete refactoring of document processing pipeline:

**Components:**
- `IngestionOrchestratorService` - Coordinates full processing flow
- `DocumentExtractorService` - Content extraction from various sources
- `DocumentProcessorService` - Chunking, embedding, summarization, tagging
- `PreviewGeneratorService` - Preview image generation

**Features:**
- Circuit breaker protection for external services
- Retry logic with exponential backoff and jitter
- State management and transitions
- Real-time status updates (fetching → extracting → processing → indexing → done)
- Performance monitoring

### 4. YouTube Extractor (Enhanced)

Specialized extractor for YouTube videos:

**Features:**
- Multiple URL format support (youtube.com/watch, youtu.be, /embed, /shorts)
- Transcript extraction with language preferences (en, pt, pt-BR)
- oEmbed API fallback for title extraction
- AI summary generation when transcript unavailable
- Metadata extraction (channel, duration, views, thumbnails)

### 5. Canvas Agent Tools (canvasApplyChanges)

Claude Agent SDK tool for canvas manipulation:

**Shape Types:**
- `note` - Sticky notes with color, size, font, alignment
- `text` - Text labels
- `geo` - Geometric shapes (rectangle, ellipse, triangle, etc.)
- `arrow` - Connectors with arrowheads

**Operations:**
- `createShape` - Add new shapes
- `updateShape` - Modify existing shapes
- `deleteShape` - Remove shapes
- `selectShapes` - Select multiple shapes
- `zoomToFit` / `zoomToArea` / `focusOnShape` - Navigation

### 6. Theme Toggle (Dark/Light Mode)

New `ThemeToggle` component with:
- Smooth icon transitions with rotation animations
- Hydration mismatch prevention
- Persistent theme preference via next-themes
- Accessibility support (keyboard, screen readers)

### 7. OpenRouter Fallback for Summarization

All summarization now uses OpenRouter (Grok) as primary provider:
- Gemini disabled for summaries/tags
- `summarizeWithOpenRouter()` used throughout
- Fallback chain: OpenRouter → Heuristic fallback

---

## API Endpoints (v3)

### Core CRUD

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/sign-in` | Login |
| POST | `/api/auth/sign-up` | Register |
| GET | `/api/auth/session` | Get session |
| POST | `/v3/documents` | Add document |
| POST | `/v3/documents/file` | Upload file |
| POST | `/v3/documents/list` | List documents (with pagination) |
| GET | `/v3/documents/:id` | Get document |
| PATCH | `/v3/documents/:id` | Update document |
| DELETE | `/v3/documents/:id` | Delete document |
| POST | `/v3/documents/:id/cancel` | Cancel processing |
| POST | `/v3/documents/:id/related-links` | Find related links |

### Search

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v3/search` | Basic search |
| POST | `/v3/search/hybrid` | Hybrid search (vector + keyword + rerank) |

### Chat

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/chat` | Legacy chat |
| POST | `/chat/v2` | Claude Agent SDK chat |
| POST | `/chat/title` | Generate chat title |

### Conversations

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v3/conversations` | Create conversation |
| GET | `/v3/conversations` | List conversations |
| GET | `/v3/conversations/:id` | Get conversation |
| GET | `/v3/conversations/:id/events` | Get events |
| GET | `/v3/conversations/:id/history` | Get history |
| PATCH | `/v3/conversations/:id` | Update conversation |
| DELETE | `/v3/conversations/:id` | Delete conversation |

### Canvas

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v3/canvas-projects` | List canvas projects |
| POST | `/v3/canvas-projects` | Create project |
| PATCH | `/v3/canvas-projects/:projectId` | Update project |
| DELETE | `/v3/canvas-projects/:projectId` | Delete project |
| GET | `/v3/canvas/:projectId?` | Get canvas state |
| POST | `/v3/canvas/:projectId?` | Save canvas state |
| DELETE | `/v3/canvas/:projectId?` | Delete canvas state |

### AI Actions

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/ai-actions/stream` | Streaming AI action |
| POST | `/api/ai-actions/execute` | Non-streaming AI action |
| GET | `/api/ai-actions/actions` | List available actions |

### Deep Analysis (NEW)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/v3/deep-agent/analyze` | Deep content analysis (YouTube/Web/GitHub) |

### Other

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/v3/projects` | List projects |
| POST | `/v3/projects` | Create project |
| DELETE | `/v3/projects/:projectId` | Delete project |
| POST | `/v3/connections/list` | List connections |
| POST | `/v3/connections/:provider` | Create connection |
| GET | `/v3/connections/:connectionId` | Get connection |
| DELETE | `/v3/connections/:connectionId` | Delete connection |
| GET | `/v3/settings` | Get settings |
| PATCH | `/v3/settings` | Update settings |
| POST | `/v3/graph/connections` | Get graph connections |

---

## Recent Migrations (2025-11-16 to 2025-12-08)

```
0001_add_atomic_document_finalization
0002_add_conversation_tables
0003_add_sdk_session_id
0004_normalize_document_status
0009_add_stuck_document_timeout
0010_add_missing_document_columns
0011_fix_conversations_rls
0012_optimize_document_queries
0013_production_performance_optimization_final
0014_add_payload_to_ingestion_jobs
0015_create_sessions_table
0016_create_connections_table
create_canvas_states_table
add_canvas_projects_table
add_state_column_to_canvas_projects
remove_duplicate_indexes
remove_unused_indexes_batch1/2/3
add_essential_indexes
enable_rls_all_tables
create_rls_policies_service_role
fix_functions_search_path
protect_materialized_view
fix_rls_policies_performance
add_proper_rls_policies
add_foreign_key_indexes
fix_rls_recursion
fix_spaces_rls_policy
fix_rls_use_org_id
fix_documents_rls_policy
fix_user_org_ids_function
fix_header_functions_to_kortix
simplify_rls_policies
add_supabase_auth_support
update_rls_policies_for_supabase_auth
```

---

## RLS Pattern (CRITICAL)

```typescript
// apps/api/src/supabase.ts
import { createClientForSession, supabaseAdmin } from "./supabase";

// For request-scoped (user-facing) queries - use this
const supabase = createClientForSession(session);

// For admin/maintenance operations only (bypasses RLS)
// ⚠️ Avoid in request handlers unless absolutely required.
const admin = supabaseAdmin;
```

**RLS Functions (in database):**
```sql
-- Gets org_id from x-kortix-organization header
CREATE FUNCTION public.get_request_org_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.headers.x-kortix-organization', true), '')::uuid
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Gets user_id from x-kortix-user header
CREATE FUNCTION public.current_user_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('request.headers.x-kortix-user', true), '')::uuid
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

---

## Key Files Reference

### Backend (apps/api)

| File | Purpose |
|------|---------|
| `src/index.ts` | Hono app entry point |
| `src/supabase.ts` | Supabase clients (admin + scoped) |
| `src/session.ts` | Session resolution from cookie |
| `src/middleware/auth.ts` | requireAuth middleware |
| `src/routes/documents.ts` | Document CRUD endpoints |
| `src/routes/chat-v2.ts` | Claude chat endpoint |
| `src/routes/ai-actions.ts` | AI text transformation actions |
| `src/routes/canvas.ts` | Canvas state management |
| `src/services/analysis-service.ts` | Deep content analysis (YouTube/Web/GitHub) |
| `src/services/claude-agent.ts` | Claude Agent SDK integration |
| `src/services/claude-agent-tools.ts` | Agent tools (searchDatabase, canvasApplyChanges) |
| `src/services/orchestration/ingestion-orchestrator.ts` | Document processing orchestrator |
| `src/services/extraction/youtube-extractor.ts` | YouTube transcript/metadata extraction |
| `src/services/extraction/document-extractor-service.ts` | Generic document extraction |
| `src/services/processing/document-processor.ts` | Chunking, embedding, summarization |
| `src/services/preview/preview-generator.ts` | Preview image generation |
| `src/services/summarizer.ts` | Content summarization (OpenRouter) |
| `src/services/hybrid-search.ts` | Vector + keyword search |
| `src/worker/ingestion-worker.ts` | Background processing worker |
| `src/services/document-timeout-monitor.ts` | Monitor for stuck documents |

### Frontend (apps/web)

| File | Purpose |
|------|---------|
| `app/home-client.tsx` | Main document list (10s/3s polling) |
| `components/theme-toggle.tsx` | Dark/light mode toggle |
| `components/canvas/` | TLDraw infinity canvas |
| `components/canvas/canvas-agent-provider.tsx` | Canvas AI agent context |
| `components/views/connections-tab-content.tsx` | Integrations list |
| `components/views/chat/` | Chat interface |
| `components/editor/` | Rich text editor |
| `stores/canvas.ts` | Canvas Zustand store |
| `stores/chat.js` | Chat Zustand store |

### Shared Packages

| File | Purpose |
|------|---------|
| `packages/lib/queries.ts` | React Query hooks (optimized staleTime) |
| `packages/lib/api.ts` | $fetch API client |
| `packages/validation/data-model.ts` | Zod schemas (types source of truth) |
| `packages/validation/api.ts` | API request/response schemas |

---

## Environment Variables

```bash
# Required
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_ANON_KEY=xxx              # REQUIRED for RLS

# AI
ANTHROPIC_API_KEY=xxx              # Claude chat + AI actions
GOOGLE_API_KEY=xxx                 # Embeddings (text-embedding-004) + Deep analysis
OPENROUTER_API_KEY=xxx             # Summarization (primary)

# Optional
COHERE_API_KEY=xxx                 # Reranking
EXA_API_KEY=xxx                    # Web search + code context
VOYAGE_API_KEY=xxx                 # Alternative embeddings

# URLs
NEXT_PUBLIC_APP_URL=http://localhost:3001
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
BACKEND_URL_INTERNAL=http://localhost:4000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

---

## Development Commands

```bash
# Install
bun install

# Run all services (API + Worker + Web)
bun run dev

# Individual services
cd apps/api && bun run dev:server    # API only
cd apps/api && bun run dev:worker    # Ingestion worker
cd apps/web && bun run dev           # Frontend

# MarkItDown (Python)
cd apps/markitdown
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python server.py

# Tests
cd apps/api && bun test
cd apps/web && bun test
```

---

## Frontend Polling Configuration

| Component | Interval | Condition |
|-----------|----------|-----------|
| `home-client.tsx` - documents | 10s (normal) / 3s (processing) | Window visible, not rate limited |
| `home-client.tsx` - rate limit | 90s backoff | After 429 response |
| Search debounce | 400ms | On search input |

---

## Claude Agent Tools

The Claude Agent SDK integration provides these tools:

### searchDatabase
- Search user's knowledge base
- Returns: documentId, title, type, score, url, summary, content, chunks
- Features: caching (1 hour TTL), container tag filtering, scoped document IDs

### canvasApplyChanges
- Manipulate TLDraw canvas via AI
- Operations: createShape, updateShape, deleteShape, selectShapes, zoom controls
- Shape types: note, text, geo, arrow

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Unauthorized" on requests | Check `kortix_session` cookie, verify session in DB |
| Documents not loading after rename | Clear browser cookies, logout/login |
| RLS blocking queries | Prefer `createClientForSession()` (avoid `supabaseAdmin` in request handlers) |
| RLS infinite recursion | Check policies don't self-reference (use SECURITY DEFINER functions) |
| Documents stuck processing | Check worker is running, check `ingestion_jobs` errors, monitor timeout |
| Embeddings failing | Verify `GOOGLE_API_KEY` or `VOYAGE_API_KEY` |
| Summarization failing | Check `OPENROUTER_API_KEY` |
| YouTube title "Unknown" | oEmbed fallback should work, check network |
| AI Actions not working | Verify `ANTHROPIC_API_KEY` |
| Deep analysis failing | Check `GOOGLE_API_KEY` and `EXA_API_KEY` |

---

## Naming Convention

Use prefix `x-kortix-*` em headers e `kortix_session` para cookie de sessão.

---

*Generated 2025-12-14 - Kortix*
