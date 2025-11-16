# Supermemory - Claude Development Guide

> **Last Updated**: November 16, 2025 (18:47 UTC)
> **Branch**: `main`
> **Version**: 2.2.1
> **Status**: ✅ Production - Performance Optimized & Schema Verified

## Executive Summary

Supermemory is a self-hosted, AI-powered memory and knowledge management system built on modern web technologies. It provides intelligent document ingestion, semantic search, visual organization, and agentic chat capabilities.

**Key Stats**:
- 🎨 Infinity Canvas for visual memory organization
- 📝 20,000+ lines of rich text editor code
- 🤖 Claude Agent SDK integration with custom tools
- 🔍 Hybrid search (vector + text with reranking)
- 📱 Production-ready on Railway + Supabase

---

## 🎯 Critical Project Context

### Current Branch Status
- **Active Branch**: `claudenewagent` (primary development)
- **Main Branch**: `main` (production)
- **Last Commit**: Style improvements to UI/menu
- **Deployment**: Railway (production ready)

### Known Issues & Considerations

⚠️ **IMPORTANT USER INSTRUCTION**: Never say something is working without testing using devtools first.

### Recent Changes (Latest Commits)
1. **🔐 Authentication Schema Fixed** (Nov 16, 2025 18:47 UTC) - **Complete auth flow verified**
   - Fixed column name mismatch: `hashed_password` → `password_hash` in auth.ts and password.ts
   - Created sessions table (migration 0015) for session-based authentication
   - Added payload column to ingestion_jobs (migration 0014)
   - **Testing**: User creation ✅ | User login ✅ | App loads ✅
   - **Impact**: Complete user authentication flow now working end-to-end
   - Commit: `d381ebf7` - fix(auth): correct column name from hashed_password to password_hash

2. **⚡ Database Performance Optimization** (Nov 16, 2025) - **80-95% query performance improvement**
   - Applied migration 0013_production_performance_optimization_final to Supabase
   - Created 7 new composite indexes for critical query patterns
   - Added materialized view for org statistics (99% faster)
   - Configured autovacuum tuning for high-traffic tables
   - Cleaned up duplicate/invalid migration files
   - **Impact**: Document queries 90% faster, org stats 99% faster
   - **Schema Sync**: All 9 migrations now synchronized with Supabase
   - See: `supabase/SCHEMA_SYNC_REPORT_2025-11-16.md`

2. **⚡ Critical Egress Optimization** (Nov 15, 2025) - **92% reduction in database egress**
   - Removed embeddings from all API responses (6-12KB per record saved)
   - Added LIMIT clauses to diagnostic scripts (prevented infinite loops)
   - Optimized document/memory queries to exclude heavy fields
   - **Impact**: Reduced from 12.77GB/month to <1GB/month
   - **Cost savings**: $10-20/month → $0/month (within free tier)
   - See: `ai_docs/EGRESS_OPTIMIZATION_NOV_2025.md`

2. **🎨 Glassmorphism UI Refactoring** (Nov 4) - Full theme-aware implementation with 50+ component fixes
   - Semi-transparent backdrop blur effect on chat interface
   - Fixed light mode text visibility across entire application
   - Established `text-foreground dark:text-white` pattern
   - See: `ai_docs/UI_GLASSMORPHISM_REFACTORING.md`

3. **🔧 Code Refactoring** (Nov 4) - Legacy service layers with delegation pattern
   - 60-85% code reduction in core services (extractor, preview)
   - Backward compatibility maintained with deprecation warnings
   - Clear migration path established for Phase 8
   - See: `ai_docs/CODE_REFACTORING_LEGACY_LAYERS.md`

4. **Multi-provider AI integration** (Nov 3) - OpenRouter, Deepseek OCR, enhanced fallbacks
5. UI/menu styling improvements
6. Claude Agent SDK integration and fixes
7. Infinity Canvas implementation completed
8. Rich text editor with 20,000+ lines of code

---

## 🏗️ Architecture Overview

### Tech Stack
```
Frontend:      Next.js 16 + React 19 + Turbopack
Backend:       Bun + Hono (REST API)
Database:      Supabase Postgres + pgvector
Storage:       Supabase Storage
AI Models:     GLM 4.6 + MiniMax M2 + Haiku 4.5 + OpenRouter + Gemini + Deepseek OCR
               (Multi-provider with intelligent fallbacks)
Search:        Vector similarity + hybrid ranking
Deployment:    Railway + GitHub integration
```

### Core Data Flow
```
User Input → Content Type → Processing Pipeline
├─ Text → Direct processing
├─ Files → Multi-modal extraction
└─ URLs → Web scraping

↓

Processing → AI Summary → Chunking (800 tokens) → Vector Embeddings

↓

pgvector Storage → Indexing (IVFFlat) → Search & Chat Integration

↓

Claude Agent → Tool Use (searchDatabase) → Streaming Response
```

### Key Components

| Component | Location | Purpose | Status |
|-----------|----------|---------|--------|
| **Infinity Canvas** | `apps/web/components/canvas/` | Visual memory organization | ✅ Complete |
| **Rich Editor** | `apps/web/components/ui/rich-editor/` | Advanced markdown editing | ✅ Complete |
| **Memory Editor** | `apps/web/components/editor/` | Full editing experience | ✅ Complete |
| **Claude Agent** | `apps/api/src/services/claude-agent.ts` | AI chat with tools | ✅ Complete |
| **Multi-Provider AI** | `apps/api/src/services/openrouter.ts`, `summarizer.ts` | Flexible AI provider switching | ✅ Complete |
| **Hybrid Search** | `apps/api/src/services/hybrid-search.ts` | Search orchestration | ✅ Complete |
| **Content Extractor** | `apps/api/src/services/extractor.ts` | Multi-modal processing | ✅ Complete |
| **Glassmorphism UI** | `apps/web/globals.css`, `components/views/` | Semi-transparent chat interface | ✅ Complete |
| **Legacy Service Layers** | `apps/api/src/services/{extractor,preview}.ts` | Backward-compatible delegation | ✅ Complete |

---

## 📁 Project Structure

```
supermemory/
├── apps/
│   ├── api/                    # Backend (Bun + Hono)
│   │   ├── src/
│   │   │   ├── routes/         # API endpoints
│   │   │   ├── services/       # Business logic
│   │   │   ├── middleware/     # Auth, rate limiting
│   │   │   └── types/          # TypeScript types
│   │   └── migrations/         # Database migrations
│   │
│   ├── web/                    # Frontend (Next.js 16)
│   │   ├── app/                # App router pages
│   │   ├── components/
│   │   │   ├── canvas/         # Infinity canvas
│   │   │   ├── editor/         # Memory editor
│   │   │   ├── ui/             # UI components
│   │   │   └── views/          # Page views
│   │   └── stores/             # Zustand state
│   │
│   └── docs/                   # Mintlify documentation
│
├── packages/
│   ├── lib/                    # Shared utilities
│   ├── ui/                     # Shared components
│   ├── validation/             # Zod schemas
│   └── hooks/                  # Shared hooks
│
├── ai_docs/                    # Technical documentation
├── ai_specs/                   # Feature specifications
├── ai_changelog/               # Version history
├── ai_issues/                  # Bug tracking
├── ai_research/                # Research & experiments
│
└── docs/                       # Complete user/dev docs
```

---

## 🚀 Development Workflow

### Setup
```bash
# Clone and install
git clone https://github.com/guilhermexp/supermemory.git
cd supermemory
bun install

# Configure environment
cp apps/api/.env.local.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
# Edit .env files with your credentials

# Start development
bun run dev                    # API + Web (ports 4000, 3000)
bun run dev:all               # API + Web + Docs (ports 4000, 3000, 3003)
```

### Key Commands
```bash
# Development
bun run dev                    # Start all services
bun run --cwd apps/api dev    # API only (port 4000)
bun run --cwd apps/web dev    # Web only (port 3000)

# Building & Testing
bun run build                  # Build all apps
bun run check-types            # Type checking
bun run format-lint            # Format + lint
bun test                       # Run tests

# Database
bun run --cwd apps/api migrate # Run migrations
```

---

## 🔑 Key Features & Implementation

### 1. Infinity Canvas (Visual Organization)
- **Status**: ✅ Complete
- **Files**: `apps/web/components/canvas/infinity-canvas.tsx`, `apps/web/stores/canvas.ts`
- **Features**:
  - Drag-and-drop card positioning with smooth animations
  - Zoom controls (25%-200%) with mouse wheel support
  - Pan navigation with click-and-drag
  - Persistent card positions (saved to `canvas_positions` table)
  - Document selector modal
  - Touch support for mobile
- **Spec**: `ai_specs/cards-to-full-markdown-pages/`

### 2. Rich Text Editor
- **Status**: ✅ Complete
- **Files**: `apps/web/components/ui/rich-editor/` (~20,000 lines)
- **Features**:
  - Block-based editing with drag-and-drop reordering
  - Inline formatting (bold, italic, underline, strikethrough, code)
  - Headers (H1-H6), paragraphs, quotes, code blocks
  - Tables with builder interface
  - Image upload/paste with galleries
  - Video embedding (YouTube, local)
  - Link editing with popover
  - Color picker + font sizing
  - Keyboard shortcuts (Cmd+B, Cmd+I, Cmd+K)
  - Command menu for quick actions
  - Undo/redo with history
  - Auto-save integration
  - Markdown parsing and HTML export

### 3. Claude Agent SDK Integration
- **Status**: ✅ Complete (recent refactor)
- **Files**: `apps/api/src/services/claude-agent.ts`, `claude-agent-tools.ts`
- **Features**:
  - Direct Anthropic API integration
  - Custom MCP tools (`searchDatabase`)
  - Streaming responses via SSE
  - Three chat modes: simple (6 turns), agentic (10 turns), deep (12 turns)
  - Conversation history preservation
  - Event storage for conversation logs
  - Tool use tracking and logging
  - Auto-context retrieval from knowledge base
- **Spec**: `ai_specs/claude-agent-sdk-fixes/`
- **Migrations**:
  - `0002_add_conversation_tables.sql` - Conversation storage
  - `0003_add_sdk_session_id.sql` - Session tracking

### 4. Multi-Provider AI Integration (NEW - Nov 2025)
- **Status**: ✅ Complete
- **Files**: `apps/api/src/services/openrouter.ts`, `replicate.ts`, `summarizer.ts`, `extractor.ts`
- **Features**:
  - **OpenRouter Integration** - Primary AI provider with access to multiple models
    - Summary generation (x-ai/grok-4-fast)
    - Deep content analysis
    - Category tag generation
    - Fallback to Gemini for compatibility
  - **Deepseek OCR** - High-quality document extraction via Replicate
    - PDF OCR for scanned documents
    - Image text extraction
    - Intelligent fallback chain: MarkItDown → Deepseek OCR → Gemini Vision
  - **Enhanced MarkItDown** - Improved document conversion
    - Exponential backoff retry (2s → 4s → 8s delays)
    - YouTube transcript validation (min 300 chars)
    - Multi-language subtitle support (en, en-US, pt, pt-BR)
    - Timedtext API fallback for YouTube
  - **API Improvements** - Better reliability and data handling
    - Unicode sanitization (prevents PostgreSQL 22P02 errors)
    - Document status normalization
    - Enhanced meta tag extraction (og:image, twitter:image)
    - GitHub URL cleanup (60+ regex patterns)
  - **UI Provider Selection** - User-selectable AI models
    - Provider dropdown in chat interface
    - Tool execution tracking
    - Mentioned documents visualization
- **Documentation**: `ai_docs/MULTI_PROVIDER_AI_INTEGRATION.md`
- **Environment Variables**: `OPENROUTER_API_KEY`, `REPLICATE_API_KEY`

### 5. Hybrid Search System
- **Status**: ✅ Complete
- **Files**: `apps/api/src/services/hybrid-search.ts`
- **Algorithm**:
  - Vector similarity search (pgvector IVFFlat)
  - BM25 text search reranking
  - Adaptive combination of results
  - Configurable weights and thresholds

### 6. Multi-Modal Content Ingestion
- **Status**: ✅ Complete
- **Files**: `apps/api/src/services/extractor.ts`
- **Supported Types**:
  - Text (raw, markdown)
  - PDFs (with OCR fallback)
  - Images (vision API extraction)
  - Audio/Video (transcription)
  - Web URLs (MarkItDown scraping)
  - Code repositories (GitHub sync)

---

## 📊 Database Schema Highlights

### Core Tables
- `organizations` - Multi-tenant support
- `documents` - Document metadata and content
- `chunks` - Text chunks with embeddings
- `memories` - AI-processed insights
- `canvas_positions` - Visual card positions
- `conversations` - Chat history
- `events` - Detailed conversation logs

### Key Relationships
- 1-to-Many: Organization → Users, Documents, Projects
- 1-to-Many: Document → Chunks, Memories
- 1-to-Many: User → Conversations
- Vector Index: `chunks` table uses pgvector with IVFFlat

**Reference**: See `ai_docs/DATA_MODEL.md` and `ai_docs/DATA_MODEL_REFERENCE.md`

---

## 🔐 Security & Authentication

- ✅ Row-level security (RLS) on all Supabase tables
- ✅ Session-based auth with secure cookies
- ✅ JWT-based API authentication
- ✅ API key rotation support
- ✅ CORS protection with allowed origins
- ✅ Rate limiting per user/IP
- ✅ Input validation with Zod schemas

---

## 🚢 Deployment (Railway)

### Production Configuration
```ini
# API Service
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key
SUPABASE_ANON_KEY=your_key
AUTH_SECRET=32_character_secret
GOOGLE_API_KEY=your_gemini_key
ANTHROPIC_API_KEY=your_claude_key

# Web Service
NEXT_PUBLIC_BACKEND_URL=""  # Empty for relative URLs
NEXT_PUBLIC_APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}
```

### Railway Setup
1. Connect GitHub repository to Railway
2. Create two services: API + Web
3. Set environment variables
4. Deploy automatically on push

**Reference**: `ai_docs/RAILWAY_DEPLOYMENT.md`

---

## 📚 Documentation Locations

### Quick Start
- **Installation**: `docs/setup/INSTALLATION.md`
- **Quick Start**: `docs/setup/QUICK_START.md`
- **Configuration**: `docs/setup/CONFIGURATION.md`

### Technical Reference
- **System Architecture**: `docs/architecture/SYSTEM_ARCHITECTURE.md`
- **Data Model**: `docs/architecture/DATA_MODEL.md` + `ai_docs/DATA_MODEL_REFERENCE.md`
- **Search System**: `docs/architecture/SEARCH_SYSTEM.md`
- **Chat System**: `docs/architecture/CHAT_SYSTEM.md`

### Implementation Details
- **Implementation Status**: `ai_docs/IMPLEMENTATION_SUMMARY.md`
- **Phase Summary**: `ai_docs/PHASE_5_6_IMPLEMENTATION_SUMMARY.md`
- **Code Standards**: `ai_docs/CODE_GENERATION_GUARDRAILS.md`
- **Claude Integration**: `ai_docs/CLAUDE_AGENT_INTEGRATION_ANALYSIS.md`
- **Glassmorphism UI**: `ai_docs/UI_GLASSMORPHISM_REFACTORING.md` (Nov 4, 2025)
- **Code Refactoring**: `ai_docs/CODE_REFACTORING_LEGACY_LAYERS.md` (Nov 4, 2025)

### Project Planning
- **Changelog**: `ai_changelog/CHANGELOG.md`
- **Issues**: `ai_issues/` (bug tracking)
- **Specifications**: `ai_specs/` (feature specs)
- **Research**: `ai_research/` (experiments & findings)

---

## 🐛 Common Issues & Troubleshooting

### Chat System Issues
- **Problem**: Infinite loops in chat responses
- **Solution**: Fixed in commit 13bb5b4, uses abort controllers for streaming

### Claude Agent SDK
- **Problem**: Dynamic CLI path issues
- **Solution**: Use direct Anthropic API instead of SDK CLI (commit 6ae5351)

### UI/Canvas Performance
- **Problem**: Slow rendering with 100+ cards
- **Solution**: Implemented efficient memoization and virtual scrolling

### Database Migrations
- **Problem**: pgvector extension not enabled
- **Solution**: Enable in Supabase dashboard under Extensions tab

---

## 🎯 Development Best Practices

### Code Style
1. Use TypeScript everywhere (strict mode)
2. Validate input with Zod schemas
3. Handle errors explicitly
4. Use Zustand for state management (web)
5. Follow React hooks best practices
6. Add error boundaries for critical sections
7. Implement proper loading states

### Testing Guidelines
- Write unit tests for services
- Integration tests for API endpoints
- E2E tests for critical user flows
- Use describe/it for test structure
- Mock external APIs

### Database Work
- Always create migrations for schema changes
- Use prepared statements to prevent SQL injection
- Implement RLS policies for all tables
- Test migrations on staging first
- Include rollback procedures

### Commits & PRs
- Use conventional commits (feat:, fix:, refactor:, etc.)
- Include issue references when applicable
- Keep PRs focused on single feature/fix
- Add tests with code changes
- Update documentation when needed

---

## 🚨 Before You Start

### Pre-Flight Checklist
- [ ] Have Supabase account with pgvector extension enabled
- [ ] Have Anthropic API key (Claude Sonnet access)
- [ ] Have Google Gemini API key (for embeddings)
- [ ] Have Bun 1.2.17+ or Node.js 20+ installed
- [ ] Have Railway account for deployment
- [ ] Read `ai_docs/CURRENT_STATE_ANALYSIS.md` for latest status
- [ ] Check `ai_changelog/CHANGELOG.md` for recent changes
- [ ] Review `docs/CONTRIBUTING.md` before submitting PRs

### Understanding the Codebase
1. Start with `ai_docs/CURRENT_STATE_ANALYSIS.md` for overview
2. Review relevant architecture doc (`docs/architecture/`)
3. Check implementation spec (`ai_specs/` directory)
4. Look at related service files
5. Review recent commits for context
6. Check test files for examples

---

## 📝 Communication & Context

### For New Agents/Developers
This guide provides essential context. Always refer to:
- `ai_docs/CURRENT_STATE_ANALYSIS.md` - Current system state
- `ai_changelog/CHANGELOG.md` - Recent changes
- `docs/` - Complete documentation
- `ai_specs/` - Feature specifications
- GitHub issues/PRs for discussions

### When Something Breaks
1. Check recent commits in `ai_changelog/CHANGELOG.md`
2. Look for related issues in `ai_issues/`
3. Review error logs from Railway/devtools
4. Check database migrations in `apps/api/migrations/`
5. Run `bun run check-types` for type errors
6. Test in isolation before debugging

---

## 📊 Performance Metrics

| Operation | Latency | Notes |
|-----------|---------|-------|
| Document ingestion | 2-5s | Includes embedding generation |
| Vector search | 50-200ms | With pgvector IVFFlat index |
| Hybrid search | 200-500ms | Including reranking |
| Chat response (first token) | 500ms-1s | Streaming starts immediately |
| Canvas render | <100ms | 100+ cards with smooth interaction |

**Scale Testing**:
- Tested with 10,000+ documents
- 1536-dimensional embeddings
- IVFFlat index optimization
- Horizontal scaling via Railway

---

## 🤝 Contributing

### Workflow
1. Fork repository
2. Create feature branch from `main`
3. Implement feature/fix with tests
4. Update documentation
5. Submit PR with description
6. Address review feedback
7. Merge to `main`

### Commit Message Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

Examples:
- `feat(canvas): add zoom controls`
- `fix(chat): resolve infinite loop`
- `refactor(api): improve error handling`
- `docs(setup): update installation guide`

---

## 📞 Getting Help

- **Docs**: See `docs/` directory
- **Issues**: GitHub Issues section
- **Discussions**: GitHub Discussions
- **Code Examples**: Check existing components
- **Tests**: Review test files for patterns
- **Architecture**: See `ai_docs/` for system details

---

## 🎓 Learning Resources

### Recommended Reading Order
1. Start: `ai_docs/CURRENT_STATE_ANALYSIS.md`
2. Architecture: `docs/architecture/SYSTEM_ARCHITECTURE.md`
3. Data: `ai_docs/DATA_MODEL_REFERENCE.md`
4. Implementation: `ai_docs/IMPLEMENTATION_SUMMARY.md`
5. Deployment: `ai_docs/RAILWAY_DEPLOYMENT.md`
6. Code: Review actual component implementations

### Key Technologies
- **Next.js 16**: App Router, Server Components
- **React 19**: New hooks and features
- **Bun**: Fast JavaScript runtime
- **Hono**: Lightweight web framework
- **Supabase**: PostgreSQL + Auth + Storage
- **pgvector**: Vector search in PostgreSQL
- **Claude API**: Anthropic AI models
- **Zustand**: State management

---

## ✅ Verification Checklist

Before committing changes:
- [ ] Code compiles without errors (`bun run check-types`)
- [ ] Code is formatted (`bun run format-lint`)
- [ ] Tests pass (`bun test`)
- [ ] Changes follow architecture patterns
- [ ] Database migrations are included (if schema changed)
- [ ] Documentation is updated
- [ ] No breaking changes introduced
- [ ] Performance impact is assessed
- [ ] Security implications reviewed
- [ ] Error handling is comprehensive

---

## 📅 Version & Update Info

- **Current Version**: 2.0.0
- **Active Branch**: `claudenewagent`
- **Last Updated**: October 30, 2025
- **Next Release**: v2.1 (Q1 2026)
- **Planned Features**: Real-time collaboration, mobile apps, advanced graphs

---

**Remember**: Always test with devtools before claiming something works. The project is production-ready, but thorough testing ensures quality!

**Questions?** Check the documentation first, then create an issue or discussion on GitHub.
