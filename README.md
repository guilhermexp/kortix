# Supermemory - Self-Hosted AI Memory Layer

A complete self-hosted AI-powered memory and knowledge management system. This application runs entirely on your own infrastructure with no external dependencies.

## 🚀 Production Status

**Live & Running**: This application is currently **deployed in production** on Railway.

- ✅ **Status**: Stable and actively maintained
- 🌐 **Platform**: Railway (Nixpacks)
- 📦 **Services**: API (Bun) + Web (Next.js 16)
- 🗄️ **Database**: Supabase Postgres with pgvector

[View deployment guide →](ai_docs/RAILWAY_DEPLOYMENT.md)

## Stack

- **Frontend**: Next.js 16 with Turbopack (`apps/web`)
- **Backend API**: Bun + Hono server (`apps/api`)
- **Database**: Supabase Postgres with pgvector extension
- **Storage**: Supabase Storage
- **Authentication**: Custom session-based auth with scrypt password hashing
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
CHAT_MODEL=models/gemini-1.5-flash-latest
EMBEDDING_MODEL=text-embedding-004
SUMMARY_MODEL=models/gemini-1.5-pro-latest

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

## Production Deployment

> **✅ Live Application**: This project is currently running in production on Railway.  
> **Deployment Status**: Stable and actively maintained.

### Railway (Production Platform)

This application is deployed on Railway. See [`ai_docs/RAILWAY_DEPLOYMENT.md`](ai_docs/RAILWAY_DEPLOYMENT.md) for complete deployment guide.

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

> **📊 Detailed Architecture**: See [`DATA_MODEL.md`](DATA_MODEL.md) for complete database schema, search flow, and performance metrics.

### Content Processing Pipeline

```
Document Upload (File/URL/Text)
    ↓
Content Extraction
  • Text: Direct processing
  • PDF: Text + OCR fallback
  • Images: Vision API (OCR)
  • Videos: Audio transcription
  • Web: HTML → Markdown
  • GitHub: Repository clone
    ↓
Document Storage (documents table)
  • Full content + metadata
  • AI-generated summary
  • Document-level embedding
    ↓
Chunking (document_chunks table)
  • Split into 800-token chunks
  • 200-token overlap
  • Semantic boundaries preserved
    ↓
Vector Embedding
  • 1536-dimensional vectors
  • Google Gemini text-embedding-004
  • Parallel batch processing
    ↓
Database Indexing
  • pgvector IVFFlat index
  • Cosine similarity search
  • Sub-second query latency
    ↓
Ready for Search & Chat
```

### Data Layers

The system uses three complementary data layers:

1. **Documents Layer** (`documents` table)
   - Original content preservation
   - Full-text storage
   - Metadata and summaries

2. **Chunks Layer** (`document_chunks` table)
   - Semantic search via vector embeddings
   - Precise passage retrieval
   - Fast similarity matching

3. **Memories Layer** (`memories` table - optional)
   - AI-processed insights
   - Relationship extraction
   - Knowledge graph nodes

### Search System

**Multi-Path Search Strategy:**
- **Vector Search** (primary): Semantic similarity using pgvector with IVFFlat indexing
- **Fallback Modes**: Local cosine similarity, metadata-only, recent documents
- **Caching**: In-memory cache with 1-hour TTL
- **Reranking**: Optional Cohere-based relevance improvement
- **Recency Boosting**: Time-weighted scoring for recent content

**Performance:**
- Typical search: 200-500ms end-to-end
- Vector similarity: 50-200ms (with index)
- Result aggregation: 10-50ms
- Reranking: +100-300ms (optional)

### Chat System

**Claude Agent SDK Integration:**
- Streaming responses via Anthropic Claude
- Tool: `searchDatabase` - MCP server for knowledge base access
- Automatic context retrieval from vector search
- Multi-turn conversations with history tracking
- Three modes: `simple` (6 turns), `agentic` (10 turns), `deep` (12 turns)

**Conversation Storage:**
- Full chat history in `conversations` table
- Event tracking (user, assistant, tool use/result)
- Tool execution logs with timing
- Supports conversation replay and context loading

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

### Technical Documentation
- **📊 Data Model & Architecture**: [`DATA_MODEL.md`](DATA_MODEL.md) - Complete database schema, search architecture, and data flow
- **🏗️ Technical Specification**: [`spec/TECH_SPEC.md`](spec/TECH_SPEC.md) - System architecture and design
- **🚀 Railway Deployment**: [`ai_docs/RAILWAY_DEPLOYMENT.md`](ai_docs/RAILWAY_DEPLOYMENT.md) - Production deployment guide
- **📈 Current State Analysis**: [`ai_docs/CURRENT_STATE_ANALYSIS.md`](ai_docs/CURRENT_STATE_ANALYSIS.md) - Project status

### Product Documentation
- **🗺️ Product Roadmap**: [`spec/PRD.md`](spec/PRD.md)
- **📖 Interactive Docs**: Run `bun run --cwd apps/docs dev` for Mintlify documentation

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
