# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a **Turbo monorepo** for Supermemory, a self-hosted AI-powered memory layer. It contains multiple applications and shared packages:

### Applications (`apps/`)
- **`api/`** - Bun + Hono backend API server (default port 4000)
- **`web/`** - Next.js 15 web application with Turbopack
- **`browser-extension/`** - WXT-based browser extension
- **`docs/`** - Mintlify documentation site

### Packages (`packages/`)
- **`lib/`** - Shared utilities, API clients, environment helpers
- **`ui/`** - Shared React component library
- **`validation/`** - Zod schemas for API requests/responses
- **`auth-server/`** - Authentication utilities (deprecated, auth is now in API)
- **`ai-sdk/`** - AI SDK integrations
- **`hooks/`** - Shared React hooks
- **`tools/`** - Development tooling

## Development Commands

### Root Level (Monorepo)
- `bun install` - Install all dependencies
- `bun run dev` - Start API and web in development mode (excludes docs and extension)
- `bun run dev:all` - Start all apps including docs (excludes extension)
- `bun run build` - Build all applications
- `bun run check-types` - Run TypeScript checks across all apps
- `bun run format-lint` - Format and lint code using Biome

### API Application (`apps/api/`)
- `bun run --cwd apps/api dev` - Start API server with hot reload (port 4000)
- `bun run --cwd apps/api start` - Start production API server
- `bun run --cwd apps/api ingest:worker` - Run background ingestion worker

### Web Application (`apps/web/`)
- `bun run --cwd apps/web dev` - Start Next.js development server with Turbopack
- `bun run --cwd apps/web build` - Build Next.js application
- `bun run --cwd apps/web start` - Start production Next.js server
- `bun run --cwd apps/web lint` - Run Next.js linting

### Documentation (`apps/docs/`)
- `bun run --cwd apps/docs dev` - Start Mintlify docs server (port 3003)

## Architecture Overview

### Core Technology Stack
- **Runtime**: Bun (API), Node.js 20+ (Web)
- **Backend Framework**: Hono (Bun runtime)
- **Frontend Framework**: Next.js 15 with Turbopack
- **Language**: TypeScript throughout with strict mode
- **Package Manager**: Bun 1.2.17+
- **Monorepo Tool**: Turbo
- **Database**: Supabase Postgres with pgvector extension
- **Storage**: Supabase Storage
- **Authentication**: Custom session-based with scrypt password hashing
- **ORM**: Drizzle ORM
- **Validation**: Zod schemas
- **Monitoring**: Sentry

### API Application (Primary Backend)
The API (`apps/api/`) is a Bun-based Hono server serving as the core backend:

**Core Routes** (`apps/api/src/routes/`)
- `/api/auth/*` - Custom authentication endpoints (sign-up, sign-in, sign-out, session)
- `/v3/documents*` - CRUD operations for documents/memories
  - `POST /v3/documents` - Add text note or link
  - `POST /v3/documents/file` - Upload file (multipart)
  - `POST /v3/documents/list` - List with pagination
  - `GET /v3/documents/:id` - Get document status and content
  - `PATCH /v3/documents/:id` - Update document metadata
  - `DELETE /v3/documents/:id` - Remove document
- `/v3/projects` - Workspace/space management
- `/v3/search` - Semantic search across documents
- `/v4/search` - Memory-based retrieval
- `/chat` - Streaming chat with memory tool integration
- `/chat/title` - Generate conversation titles
- `/v3/connections*` - OAuth integrations (Google Drive, Notion, OneDrive)
- `/v3/settings` - Organization and user settings
- `/v3/api-keys` - API key management
- `/health` - Health check endpoint

**Key Services** (`apps/api/src/services/`)
- **`ingestion.ts`** - Central document processing pipeline
- **`extractor.ts`** - Content extraction from various formats
- **`summarizer.ts`** - Automatic summary generation
- **`embedding-provider.ts`** - Vector embedding generation (Gemini default)
- **`chunk.ts`** - Text chunking for vector storage
- **`firecrawl.ts`** - Web page normalization

### Web Application
Next.js 15 application (`apps/web/`) providing:
- User authentication and organization management
- Document/memory management interface
- Real-time chat interface with streaming
- Search and discovery features
- Settings and integrations UI
- Analytics dashboard using Recharts

### Content Processing Pipeline
All content flows through the ingestion service (`apps/api/src/services/ingestion.ts`):

1. **Document Creation** - User adds text, link, or file
2. **Queueing** - Document marked as `queued`, job created
3. **Extraction** - Content extracted based on type (PDF, HTML, text, etc.)
4. **Summarization** - Optional automatic summary generation
5. **Chunking** - Text split into semantic chunks with metadata
6. **Embedding** - Vector embeddings generated via configured provider (Gemini default)
7. **Indexing** - Chunks stored in Postgres with pgvector indexes
8. **Completion** - Status updated to `done`, relationships registered

**Status Flow**: `queued` → `extracting` → `chunking` → `embedding` → `indexing` → `done` (or `failed`)

## Key Libraries & Dependencies

### Shared Dependencies
- Custom authentication - Session-based with scrypt password hashing
- `drizzle-orm` - Type-safe SQL ORM
- `drizzle-zod` - Zod schema generation from Drizzle schemas
- `zod` - Schema validation and type inference
- `hono` - Fast web framework for API
- `@sentry/*` - Error monitoring and performance tracking
- `turbo` - Monorepo build system
- `ai` (Vercel AI SDK) - Streaming chat and LLM integrations
- `@ai-sdk/google` - Gemini model integration
- `@supabase/supabase-js` - Supabase client

### API-Specific
- `@hono/zod-validator` - Request validation middleware
- `@scalar/hono-api-reference` - API documentation
- `pg` / `postgres` - PostgreSQL clients
- `pdf-parse` - PDF text extraction
- `jsdom` + `@mozilla/readability` - HTML content extraction
- `file-type` - File type detection

### Web-Specific
- `next` - React framework
- `@radix-ui/*` - Accessible UI primitives
- `@tanstack/react-query` - Server state management
- `@tanstack/react-table` - Table components
- `recharts` - Data visualization
- `next-themes` - Theme management
- `zustand` - Client state management
- `slate` / `slate-react` - Rich text editor
- `motion` (Framer Motion) - Animation library

## Environment Configuration

### API Environment (`apps/api/.env.local`)
```ini
PORT=4000
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
SUPABASE_DATABASE_URL=postgresql://...
AUTH_SECRET=use_a_32_char_secret
GOOGLE_API_KEY=your_gemini_key
SUMMARY_MODEL=models/gemini-2.5-pro
FIRECRAWL_API_KEY=optional_firecrawl_key
APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
```

### Web Environment (`apps/web/.env.local`)
```ini
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_MCP_SERVER_URL=http://localhost:4000/mcp
```

Environment variables are validated using Zod schemas in:
- `apps/api/src/env.ts` - API environment
- `packages/lib/env.ts` - Shared environment helpers

## Database Management

- **ORM**: Drizzle ORM with schema definitions in shared packages
- **Migrations**: Managed via Drizzle Kit (`drizzle-kit`)
- **Vector Search**: pgvector extension for embeddings
- **Schema Location**: Check `packages/validation/` and API services for schema definitions

**Key Tables**:
- `users`, `sessions`, `organizations`, `organization_members` - Custom authentication
- `spaces` - Projects/workspaces
- `documents`, `document_chunks`, `document_metadata` - Content storage
- `memories`, `memory_relationships` - Semantic memory graph
- `connections`, `oauth_tokens` - External integrations
- `ingestion_jobs` - Background job tracking
- `api_keys` - API authentication

## Code Quality & Standards

### Linting & Formatting
- **Biome** used for both linting and formatting
- Configuration: `biome.json` at repository root
- Run: `bun run format-lint` to format and lint all code

### TypeScript
- Strict mode enabled using `@total-typescript/tsconfig`
- Type checking: `bun run check-types`
- Shared types in `packages/*` directories
- No Cloudflare-specific tooling in main codebase

### Error Handling & Monitoring
- `HTTPException` from Hono for consistent API errors
- Sentry integration with user/organization context
- Custom logging that filters analytics noise
- Status tracking throughout ingestion pipeline

## Security & Best Practices

### Authentication
- Custom session-based authentication with HTTP-only cookies
- Password hashing via Node.js crypto scrypt (64-byte derived key)
- 7-day session expiry stored in Postgres
- Organization-based access control
- API key authentication for external/programmatic access
- Role-based permissions within organizations

### Data Handling
- All data scoped by `containerTags` for multi-tenancy
- Content hashing prevents duplicate processing
- Secure credential storage for OAuth connections
- Automatic file type detection and validation

### Deployment
- **Backend**: Standalone Bun server (default port 4000)
- **Frontend**: Next.js build via `bun run --cwd apps/web build`
- **Environment**: Use `.env` files or secret manager for production
- **Observability**: Sentry for error tracking and performance monitoring

## Important Development Notes

- The `cloudflare-saas-stack/` directory is historical and not part of active self-hosted development
- Background jobs run via separate worker process: `bun run --cwd apps/api ingest:worker`
- Analytics/PostHog dependencies are optional in self-hosted mode
- All API endpoints expect organization context from auth middleware
- Vector embeddings default to Gemini but providers are pluggable via adapters

## Documentation References

- Architecture & requirements: `spec/TECH_SPEC.md`
- Product scope & milestones: `spec/PRD.md`
- Schema status: `spec/infra/SCHEMA_STATUS.md`
- Contributing guide: `CONTRIBUTING.md`
- Self-hosting guide: `apps/docs/deployment/self-hosting.mdx`
