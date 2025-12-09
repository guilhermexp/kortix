# AI Quickstart: Kortix

**Last Analysis Date:** 2025-12-08
**Git Branch:** main
**Last Commit:** d1646182 - fix(database): optimize Supabase performance and security
**Project Name:** Kortix (fork of supermemory)

---

## Project Overview

Kortix is an AI-powered personal knowledge management system. Users can save URLs, files, and notes, which are processed into searchable memories with semantic vector search. Features include Claude AI chat integration and an infinity canvas for visual organization.

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

---

## Database Schema (17 Tables)

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
| `ingestion_jobs` | Processing queue | document_id, status, attempts, error_message |
| `conversations` | Chat sessions | org_id, sdk_session_id, title |
| `events` | Chat event log | conversation_id, event_type, role, content |
| `conversation_events` | Typed events | conversation_id, type, content (jsonb) |
| `tool_results` | Tool call results | event_id, tool_name, input, output |
| `canvas_projects` | Canvas projects | org_id, name, thumbnail, color, state |
| `canvas_states` | Canvas state backup | org_id, project_id, state (jsonb) |
| `canvas_positions` | Document positions | document_id, x, y |

### Document Status Flow

```
unknown -> queued -> extracting -> chunking -> embedding -> indexing -> done
                                                                     \-> failed
```

### Embeddings

- **Dimension:** 1536 (Google text-embedding-004)
- **Index:** ivfflat with cosine similarity
- **Columns:** `document_chunks.embedding`, `documents.summary_embedding`, `memories.memory_embedding`

---

## Recent Optimizations (2025-12-08)

### Frontend Polling Reduction (~95%)

| Component | Before | After |
|-----------|--------|-------|
| `queries.ts` - subscription status | 5s polling | Window focus only |
| `connections-tab-content.tsx` | 60s polling | Window focus only |
| `integrations.tsx` | 60s polling | Window focus only |
| `home-client.tsx` - documents | 15s refetch | 60s refetch |
| `home-client.tsx` - timer | 1s interval | 5s interval |
| `offline-support.ts` | 5s polling | Storage event listener |
| `query-client.ts` (extension) | refetchOnMount: true | refetchOnMount: "stale" |
| `query-cache.ts` (API) | 2min cleanup | 15min cleanup |

### Database Migrations Applied

```sql
-- Key migrations from 2025-12-08
remove_duplicate_indexes
remove_unused_indexes_batch1/2/3
add_essential_indexes
enable_rls_all_tables
fix_rls_recursion               -- Fixed infinite recursion in organization_members
fix_header_functions_to_kortix  -- Updated x-supermemory-* to x-kortix-*
simplify_rls_policies           -- Uses org_id = get_request_org_id()
add_foreign_key_indexes         -- 26 FK indexes added
```

### Security Fixes

- RLS enabled on all 14 tables
- Custom auth using `x-kortix-organization` and `x-kortix-user` headers
- Policies use `get_request_org_id()` function (header-based, not Supabase Auth)
- Functions fixed with `SET search_path = public` and `SECURITY DEFINER`
- Materialized views protected from anon/authenticated access

---

## RLS Pattern (CRITICAL)

```typescript
// apps/api/src/supabase.ts

// For user-facing queries - ALWAYS use this
const supabase = createScopedSupabase(organizationId, userId);

// Sets headers that RLS policies check:
// x-kortix-organization: <org_id>
// x-kortix-user: <user_id>

// For admin operations only (bypasses RLS)
import { supabaseAdmin } from "./supabase";
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

**Policy Pattern:**
```sql
-- Most tables use org_id comparison
CREATE POLICY "Users can manage own documents" ON public.documents
  FOR ALL USING (org_id = public.get_request_org_id());

-- User-specific tables use user_id comparison
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (id = public.current_user_id());
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
| `src/services/claude-agent.ts` | Claude Agent SDK integration |
| `src/services/claude-agent-tools.ts` | Agent tools (search, get_document, etc.) |
| `src/services/ingestion.ts` | Document processing pipeline |
| `src/services/hybrid-search.ts` | Vector + keyword search |
| `src/worker/ingestion-worker.ts` | Background processing worker |
| `src/services/query-cache.ts` | In-memory query cache (15min cleanup) |

### Frontend (apps/web)

| File | Purpose |
|------|---------|
| `app/home-client.tsx` | Main document list (60s refetch) |
| `components/views/connections-tab-content.tsx` | Integrations list |
| `components/views/chat/` | Chat interface |
| `components/canvas/` | Infinity canvas (tldraw) |
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

## API Endpoints (v3)

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
| POST | `/v3/search/hybrid` | Hybrid search |
| POST | `/chat/v2` | Chat with Claude |
| GET | `/v3/conversations` | List conversations |
| POST | `/v3/canvas/:projectId` | Save canvas |
| GET | `/v3/canvas/:projectId` | Get canvas |

---

## Environment Variables

```bash
# Required
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_ANON_KEY=xxx              # REQUIRED for RLS

# AI
ANTHROPIC_API_KEY=xxx              # Claude chat
GOOGLE_API_KEY=xxx                 # Embeddings (text-embedding-004)

# Optional
COHERE_API_KEY=xxx                 # Reranking
EXA_API_KEY=xxx                    # Web search
VOYAGE_API_KEY=xxx                 # Alternative embeddings
OPENROUTER_API_KEY=xxx             # Fallback LLM

# URLs
NEXT_PUBLIC_APP_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:4000
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

## Supabase Advisor Status

| Type | Count | Notes |
|------|-------|-------|
| Errors | 0 | All fixed |
| Warnings | 1 | vector extension in public (cannot move safely) |
| Info | ~30 | New FK indexes (will show as "used" with traffic) |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Unauthorized" on requests | Check `kortix_session` cookie, verify session in DB |
| Documents not loading after rename | Clear browser cookies, logout/login (cookie name changed) |
| RLS blocking queries | Use `createScopedSupabase()`, not `supabaseAdmin` |
| RLS infinite recursion | Check policies don't self-reference (use SECURITY DEFINER functions) |
| Documents stuck processing | Check worker is running, check `ingestion_jobs` errors |
| Embeddings failing | Verify `GOOGLE_API_KEY` or `VOYAGE_API_KEY` |

---

## Important: Naming Convention

The project was renamed from `supermemory` to `kortix`:
- Cookie: `sm_session` → `kortix_session`
- Headers: `x-supermemory-*` → `x-kortix-*`
- Package: `supermemory-browser-extension` → `kortix-browser-extension`

If migrating from old version, users must **clear cookies and login again**.

---

*Generated 2025-12-08 - Kortix (fork of supermemory)*
