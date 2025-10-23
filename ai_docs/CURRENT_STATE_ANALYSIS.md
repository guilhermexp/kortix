# Current State Analysis - Supermemory

**Date**: 2025-10-22  
**Branch**: memory.dev  
**Owner**: guilhermexp

---

## Executive Summary

This is a **fully independent fork** of Supermemory, now maintained by guilhermexp. The application has been completely decoupled from the original upstream repository and all references to the original SaaS platform have been removed.

**Key Status**:
- ✅ No upstream remote configured
- ✅ Independent repository: `github.com/guilhermexp/supermemory`
- ✅ Self-hosted architecture fully functional
- ✅ All services running on own infrastructure
- ⚠️ Documentation still contains references to original project

---

## Repository Information

### Git Configuration
```
Remote: origin → https://github.com/guilhermexp/supermemory.git
Upstream: None (fully independent)
Main Branch: main
Development Branch: memory.dev
```

### Branches
- `main` - Production-ready code
- `memory.dev` - Active development branch

---

## Application Architecture

### Technology Stack

**Backend (`apps/api/`)**
- Runtime: Bun 1.2.17+
- Framework: Hono 4.4.4
- Language: TypeScript (strict mode)
- Database: Supabase Postgres with pgvector
- Authentication: Better Auth (custom session-based)
- AI: Google Gemini (embeddings + chat)

**Frontend (`apps/web/`)**
- Framework: Next.js 15 with Turbopack
- Language: TypeScript
- UI: Radix UI components
- State: Zustand + TanStack Query
- Styling: Tailwind CSS

**Infrastructure**
- Deployment: Railway with Nixpacks
- Database: Supabase (Postgres + pgvector + Storage)
- Email: Resend API
- Document Processing: MarkItDown (Python)

### Active Services

**API Endpoints (`apps/api/`)**
- `/api/auth/*` - Authentication (signup, signin, password reset)
- `/v3/documents*` - Document/memory management
- `/v3/projects` - Project/space management
- `/v3/search` - Vector semantic search
- `/v3/search/hybrid` - Hybrid search with reranking
- `/chat` - Streaming chat with memory integration
- `/chat-v2` - Enhanced chat endpoint
- `/v3/connections*` - OAuth integrations
- `/v3/settings` - Organization settings
- `/health` - Health check

**Core Services**
- `ingestion.ts` - Document processing pipeline
- `extractor.ts` - Content extraction (PDF, HTML, media)
- `summarizer.ts` - LLM-based summarization
- `embedding-provider.ts` - Vector embeddings
- `chunk.ts` - Text chunking
- `hybrid-search.ts` - Combined search
- `agentic-search.ts` - Advanced query handling
- `markitdown.ts` - Document conversion

---

## Database Schema

### Core Tables
- **Authentication**: `users`, `sessions`, `organizations`, `organization_members`
- **Content**: `documents`, `document_chunks`, `document_metadata`
- **Memory Graph**: `memories`, `memory_relationships`
- **Projects**: `spaces`, `documents_to_spaces`
- **Integrations**: `connections`, `oauth_tokens`
- **Jobs**: `ingestion_jobs`
- **API**: `api_keys`

### Key Features
- Row-Level Security (RLS) enabled on all tables
- pgvector extension for 1536-dimensional embeddings
- Full-text search with pg_trgm
- HNSW indexes for fast vector search
- Atomic operations for document finalization

### Latest Migration
- `db/migrations/0005_fix_database_issues.sql`
  - Fixed mutable search_path in functions
  - Moved extensions to separate schema
  - Added performance indexes
  - Ensured RLS on all tables

---

## Authentication System

### Implementation
- **Type**: Session-based with Better Auth
- **Session Storage**: Database-backed (7-day expiry)
- **Cookie**: `sm_session` (HTTP-only, secure)
- **Multi-tenancy**: Organization-scoped data
- **API Keys**: Separate programmatic access

### User Flow
1. User signs up with email/password
2. Password hashed with bcrypt
3. Session created and stored in database
4. Session cookie set (HTTP-only)
5. Organization membership auto-created
6. All data scoped to organization

### Middleware
- `requireAuth` - Validates session, sets context
- Adds headers: `X-Supermemory-Organization`, `X-Supermemory-User`
- Applied to all `/v3/*` and `/chat` routes

---

## Content Processing Pipeline

### Ingestion Flow
```
Creation → Queueing → Fetching → Extracting → Chunking → Embedding → Indexing → Done
```

### Status States
- `queued` - Waiting for processing
- `fetching` - Retrieving content
- `extracting` - Converting to text
- `chunking` - Splitting into chunks
- `embedding` - Generating vectors
- `indexing` - Storing in database
- `done` - Completed successfully
- `failed` - Processing error

### Supported Content
- Text: Plain text, markdown
- Web: HTML, URLs (with Firecrawl/MarkItDown)
- Documents: PDF, DOCX, PPTX, spreadsheets
- Media: Images (OCR), audio, video
- Code: GitHub repositories
- YouTube: Videos with transcripts

### Processing Features
- Background worker: `bun run --cwd apps/api ingest:worker`
- Batch processing: 5 documents at a time
- Retry logic: Up to 5 attempts
- Automatic summarization
- Metadata extraction
- Content hashing (deduplication)

---

## Search & Retrieval

### Vector Search
- **Model**: Google text-embedding-004
- **Dimensions**: 1536
- **Index**: pgvector HNSW
- **Fallback**: Deterministic embeddings on API failure

### Hybrid Search
- **Modes**: vector, keyword, hybrid
- **Weighting**: Configurable (default 70% vector)
- **Reranking**: Optional Cohere integration
- **Recency Boost**: Configurable time decay
- **Filtering**: By document, container, date

### Agentic Search
- Web search integration (Exa)
- Query condensation/rewriting
- Multi-step reasoning
- Context-aware results

---

## Chat System

### Endpoints
- `POST /chat` - Basic streaming chat
- `POST /chat-v2` - Enhanced chat with advanced context

### Features
- Automatic context retrieval from knowledge base
- Citation system with [1], [2], [3] references
- Language detection and response matching
- Streaming responses via Vercel AI SDK
- System prompts:
  - Enhanced citation rules
  - Query rewriting for follow-ups
  - Fallback for empty context

### Configuration
- **Model**: `models/gemini-2.5-flash-preview-09-2025`
- **Provider**: Google Gemini (configurable)
- **Max Tokens**: 8192
- **Temperature**: Configurable

---

## Deployment Configuration

### Railway Setup
```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "numReplicas": 1,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Build Process
**API** (`apps/api/nixpacks.toml`):
- Bun + Python 3.11 installation
- MarkItDown service setup
- Type checking in build phase
- Port 4000 default

**Web** (`nixpacks-web.toml`):
- Node.js 22
- Bun package manager
- Next.js build with Turbopack
- Production server start

### Environment Variables

**Required (API)**:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- `SUPABASE_DATABASE_URL`
- `AUTH_SECRET`
- `GOOGLE_API_KEY`

**Required (Web)**:
- `NEXT_PUBLIC_BACKEND_URL` (empty string for Railway)
- `NEXT_PUBLIC_APP_URL`

**Optional**:
- `FIRECRAWL_API_KEY`, `COHERE_API_KEY`, `XAI_API_KEY`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `ENABLE_AGENTIC_MODE`, `ENABLE_RERANKING`

---

## Modified Files (Staging)

### Current Changes (memory.dev branch)
```
deleted:    ANALYSIS_REPORT.md
deleted:    EXTRACTOR_MARKITDOWN_RESULTS.md
deleted:    IMPLEMENTATION_GUIDE.md
deleted:    IMPLEMENTATION_STATUS.md
deleted:    MANUAL_TESTING_GUIDE.md
deleted:    RELEASE_NOTES_v1.2.md
deleted:    SEARCH_IMPROVEMENTS.md
deleted:    SETUP_GUIDE.md
deleted:    TESTE_FALLBACK_RESULTS.md
deleted:    TESTING_CHAT_V2.md
deleted:    TESTING_GUIDE.md
deleted:    TESTING_RESULTS.md
deleted:    test-chat-modes.sh
deleted:    test-chat-v2.sh

renamed:    COMPARISON_AGENTSET_VS_SUPERMEMORY.md → ai_docs/
renamed:    DATABASE_FIXES_README.md → ai_docs/
renamed:    IMPLEMENTATION_SUMMARY.md → ai_docs/
renamed:    RAILWAY_DEPLOYMENT.md → ai_docs/
renamed:    XAI_INTEGRATION.md → ai_docs/
```

---

## Documentation Status

### References to Original Project

**Files containing original references**:
1. `CONTRIBUTING.md` - References to upstream repo and original maintainer
2. `README.md` - Mentions self-hosted edition context
3. `apps/browser-extension/entrypoints/popup/App.tsx` - May have UI references
4. `spec/PRD.md` - Product requirements document
5. `apps/docs/` - Multiple documentation files

**References found**:
- `supermemory.ai` - Original SaaS platform
- `dhravya` - Original maintainer username
- `dhr.wtf` - Original maintainer domain
- `supermemoryai` - Original GitHub organization
- Email: `dhravya@supermemory.com`

### Action Required
✅ Update all documentation to reflect independent fork  
✅ Remove references to original SaaS platform  
✅ Update contact information to guilhermexp  
✅ Update repository URLs  
✅ Update support/community links  

---

## Code Quality

### Standards
- **Linting**: Biome 2.2.2
- **Formatting**: Biome (configured)
- **Type Checking**: TypeScript strict mode
- **Testing**: No test framework currently configured

### Build Commands
```bash
bun install                    # Install dependencies
bun run dev                    # Start API + Web
bun run build                  # Build all apps
bun run check-types            # TypeScript validation
bun run format-lint            # Format and lint
```

---

## Outstanding Items

### Immediate Tasks
1. ✅ Git remote verification (complete - no upstream)
2. ⚠️ Update documentation references
3. ⚠️ Update contact information
4. ⚠️ Review browser extension for branding
5. ⚠️ Update spec documents

### Future Improvements
- Add comprehensive test suite
- Set up CI/CD pipeline
- Add API documentation (Swagger/Scalar)
- Performance monitoring setup
- Error tracking configuration

---

## Summary

**Current State**: Production-ready self-hosted Supermemory application with:
- Complete backend API (Bun + Hono)
- Modern frontend (Next.js 15)
- Full document processing pipeline
- Vector search with hybrid capabilities
- Streaming chat with context
- Multi-tenant architecture
- Railway deployment ready

**Independence**: Fully decoupled from original repository with no upstream dependencies.

**Next Steps**: Update all documentation to reflect independent fork status and remove references to original project.

---

**Analysis completed**: 2025-10-22  
**Repository**: github.com/guilhermexp/supermemory  
**Branch**: memory.dev
