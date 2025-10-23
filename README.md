# Supermemory - Self-Hosted AI Memory Layer

A complete self-hosted AI-powered memory and knowledge management system. This application runs entirely on your own infrastructure with no external dependencies.

## Stack

- **Frontend**: Next.js 15 with Turbopack (`apps/web`)
- **Backend API**: Bun + Hono server (`apps/api`)
- **Database**: Supabase Postgres with pgvector extension
- **Storage**: Supabase Storage
- **Authentication**: Better Auth (email/password, magic links, organizations)
- **AI**: Google Gemini models (embeddings + chat, configurable)

## Features

- ✅ Memory ingestion pipeline (text, links, multimedia files) with background processing
- ✅ Vector search + hybrid search with optional reranking
- ✅ Streaming chat interface that surfaces stored memories
- ✅ Multi-modal content extraction (PDF, images, audio, video, code)
- ✅ GitHub repository ingestion
- ✅ OAuth connectors for Google Drive, Notion, OneDrive
- ✅ Multi-tenant organization support
- ✅ API key authentication for programmatic access
- ✅ Browser extension for quick saving

## Prerequisites

1. **Supabase Project** with pgvector extension enabled
2. **Bun** ≥ 1.2.17 and **Node.js** ≥ 20
3. **Google Gemini API key** (or configure alternative AI provider)

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Environment

```bash
# Copy example environment files
cp apps/api/.env.local.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/api/.env.local` with your credentials:

```ini
# Server
PORT=4000

# Supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_DATABASE_URL=postgresql://postgres:password@db.host:5432/postgres

# Authentication
AUTH_SECRET=use_a_32_character_secret_here_123456789012

# AI Provider
GOOGLE_API_KEY=your_gemini_api_key
CHAT_MODEL=models/gemini-2.5-flash-preview-09-2025
EMBEDDING_MODEL=text-embedding-004
SUMMARY_MODEL=models/gemini-2.5-pro

# Application URLs
APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000

# Optional Services
FIRECRAWL_API_KEY=your_firecrawl_key  # For web content extraction
COHERE_API_KEY=your_cohere_key        # For search reranking
USE_MARKITDOWN_FOR_WEB=true           # Use MarkItDown for URL processing
```

Edit `apps/web/.env.local`:

```ini
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_TELEMETRY_ENABLED=false
```

### 3. Start Development Servers

```bash
# Terminal 1 - Backend API
bun run --cwd apps/api dev

# Terminal 2 - Frontend
bun run --cwd apps/web dev

# Terminal 3 - Background worker (optional, for document processing)
bun run --cwd apps/api ingest:worker
```

Open http://localhost:3000 and create your account.

## Repository Structure

```
apps/
  api/        → Bun/Hono backend (port 4000)
  web/        → Next.js frontend (port 3000)
  docs/       → Mintlify documentation
  browser-extension/ → WXT-based extension
packages/
  lib/        → Shared utilities, API clients, env helpers
  ui/         → React component library
  validation/ → Zod schemas for API validation
  auth-server/ → Better Auth configuration
  ai-sdk/     → AI SDK integrations
  hooks/      → Shared React hooks
spec/         → Technical specifications and architecture docs
ai_docs/      → AI-generated documentation and analysis
db/           → Database migrations
```

## Configuration

### Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | `apps/web/.env.local` | API base URL (`http://localhost:4000` for dev) |
| `NEXT_PUBLIC_APP_URL` | `apps/web/.env.local` | Web app public URL |
| `SUPABASE_*` | `apps/api/.env.local` | Supabase credentials |
| `AUTH_SECRET` | `apps/api/.env.local` | Secret for session encryption (32+ chars) |
| `GOOGLE_API_KEY` | `apps/api/.env.local` | Gemini API key |
| `CHAT_MODEL` | `apps/api/.env.local` | LLM model for chat |
| `EMBEDDING_MODEL` | `apps/api/.env.local` | Model for vector embeddings |
| `FIRECRAWL_API_KEY` | `apps/api/.env.local` | Optional: web content extraction |
| `COHERE_API_KEY` | `apps/api/.env.local` | Optional: search result reranking |

### AI Provider Configuration

The app supports multiple AI providers. Configure via environment variables:

```ini
# Google Gemini (default)
AI_PROVIDER=google
GOOGLE_API_KEY=your_key

# X.AI (alternative)
AI_PROVIDER=xai
XAI_API_KEY=your_key

# OpenRouter (alternative)
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key
```

## Development Commands

### Root Level (Monorepo)
```bash
bun install                              # Install all dependencies
bun run dev                              # Start API + Web
bun run dev:all                          # Start all apps including docs
bun run build                            # Build all applications
bun run check-types                      # TypeScript type checking
bun run format-lint                      # Format and lint with Biome
```

### API Application
```bash
bun run --cwd apps/api dev               # Start with hot reload (port 4000)
bun run --cwd apps/api start             # Start production server
bun run --cwd apps/api ingest:worker     # Run background ingestion worker
```

### Web Application
```bash
bun run --cwd apps/web dev               # Start dev server with Turbopack
bun run --cwd apps/web build             # Build for production
bun run --cwd apps/web start             # Start production server
```

### Documentation Site
```bash
bun run --cwd apps/docs dev              # Start Mintlify docs (port 3003)
```

## Deployment

### Railway (Recommended)

See [`ai_docs/RAILWAY_DEPLOYMENT.md`](ai_docs/RAILWAY_DEPLOYMENT.md) for complete Railway deployment guide.

**Quick Setup**:

1. Create Railway project with two services:
   - API service (from `apps/api/`)
   - Web service (from `apps/web/`)

2. Set environment variables:
   ```ini
   # API Service
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   SUPABASE_ANON_KEY=...
   SUPABASE_DATABASE_URL=...
   AUTH_SECRET=...
   GOOGLE_API_KEY=...
   APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}
   ALLOWED_ORIGINS=${{WEB_SERVICE.RAILWAY_PUBLIC_DOMAIN}}
   
   # Web Service
   NEXT_PUBLIC_BACKEND_URL=""  # Empty for relative URLs
   NEXT_PUBLIC_APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}
   ```

3. Deploy both services

**Important**: Set `NEXT_PUBLIC_BACKEND_URL=""` (empty string) for Railway to enable relative URLs via Next.js proxy.

### Local Development

All Railway code changes are fully compatible with local development:

```bash
# Terminal 1: API
cd apps/api
bun run dev  # localhost:4000

# Terminal 2: Web
cd apps/web
bun run dev  # localhost:3000
```

The `BACKEND_URL` constant automatically uses `http://localhost:4000` in development.

### Self-Hosted (VPS/Docker)

For VPS or Docker deployment:

1. Set up Supabase project (managed or self-hosted)
2. Configure environment variables
3. Build and start services:
   ```bash
   # API
   cd apps/api
   bun install
   bun run start  # Production server
   
   # Web
   cd apps/web
   bun install
   bun run build
   bun run start  # Production Next.js
   ```

4. Set up reverse proxy (nginx/Caddy) for HTTPS
5. Configure systemd/PM2 for process management

## Architecture

### Content Processing Pipeline

```
Document Creation
    ↓
Queueing (background job)
    ↓
Content Extraction (PDF, HTML, images, etc.)
    ↓
Text Chunking (semantic chunks)
    ↓
Vector Embedding (1536-dim via Gemini)
    ↓
Database Indexing (pgvector)
    ↓
Done (ready for search)
```

### Search System

- **Vector Search**: Semantic similarity using pgvector HNSW indexes
- **Keyword Search**: Full-text search with pg_trgm
- **Hybrid Search**: Combined vector + keyword with configurable weighting
- **Reranking**: Optional Cohere-based result reranking
- **Agentic Search**: Web search integration for external knowledge

### Chat System

- Streaming responses via Vercel AI SDK
- Automatic context retrieval from knowledge base
- Citation system with source references
- Language detection and matching
- Configurable system prompts

## API Documentation

Once running, API documentation is available at:
- **Scalar UI**: http://localhost:4000/mcp/reference
- **Health Check**: http://localhost:4000/health

### Key Endpoints

- `POST /api/auth/sign-up` - Create account
- `POST /api/auth/sign-in` - Login
- `POST /v3/documents` - Add text/link
- `POST /v3/documents/file` - Upload file
- `POST /v3/search` - Vector search
- `POST /v3/search/hybrid` - Hybrid search
- `POST /chat` - Streaming chat
- `GET /v3/projects` - List projects

## Documentation

- **Architecture**: [`spec/TECH_SPEC.md`](spec/TECH_SPEC.md)
- **Product Roadmap**: [`spec/PRD.md`](spec/PRD.md)
- **Railway Deployment**: [`ai_docs/RAILWAY_DEPLOYMENT.md`](ai_docs/RAILWAY_DEPLOYMENT.md)
- **Current State**: [`ai_docs/CURRENT_STATE_ANALYSIS.md`](ai_docs/CURRENT_STATE_ANALYSIS.md)
- **Developer Docs**: Run `bun run --cwd apps/docs dev` for interactive docs

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes and commit: `git commit -m 'Add feature'`
4. Push to your fork: `git push origin feature/your-feature`
5. Open a Pull Request

### Development Guidelines

- Run `bun run format-lint` before committing
- Run `bun run check-types` to ensure type safety
- Follow existing code patterns and structure
- Write clear commit messages
- Update documentation for significant changes

## Support

- **Issues**: [GitHub Issues](https://github.com/guilhermexp/supermemory/issues)
- **Discussions**: [GitHub Discussions](https://github.com/guilhermexp/supermemory/discussions)

## License

See [LICENSE](LICENSE) file for details.

---

**Repository**: https://github.com/guilhermexp/supermemory  
**Maintainer**: guilhermexp
