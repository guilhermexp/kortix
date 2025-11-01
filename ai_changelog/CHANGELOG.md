# Changelog

All notable changes to Supermemory will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-10-30 (Branch: claudenewagent)

### 🎉 Major Features Added

#### Infinity Canvas
- ✨ **NEW**: Complete infinity canvas implementation for visual memory organization
  - Drag-and-drop card positioning with smooth animations
  - Zoom controls (25%-200%) with mouse wheel support
  - Pan navigation with click-and-drag
  - Visual clustering of related memories
  - Persistent card positions (saved in `canvas_positions` table)
  - Document selector modal for adding new cards
  - Responsive design with touch support
- **Files**: `apps/web/components/canvas/infinity-canvas.tsx`, `apps/web/stores/canvas.ts`
- **Spec**: `Spec/infinity-canvas/` (requirements, design, tasks)

#### Rich Text Editor
- ✨ **NEW**: Advanced markdown editor with full WYSIWYG capabilities
  - 20,000+ lines of editor code (`apps/web/components/ui/rich-editor/`)
  - Block-based editing system with drag-and-drop reordering
  - Inline formatting (bold, italic, underline, strikethrough, code)
  - Headers (H1-H6), paragraphs, quotes, code blocks
  - Lists (ordered, unordered, checklists)
  - Tables with builder interface and markdown import/export
  - Image upload, paste, and drag-and-drop with galleries
  - Video embedding (YouTube, local uploads)
  - Link editing with popover interface
  - Color picker for text and background
  - Font size customization
  - Custom CSS class support
  - Keyboard shortcuts (Cmd+B, Cmd+I, Cmd+K, etc.)
  - Command menu (Cmd+K) for quick actions
  - Context menu on blocks
  - Undo/redo with history tracking
  - Auto-save integration
  - Markdown table parsing
  - HTML serialization for export
- **Files**: `apps/web/components/ui/rich-editor/**/*.tsx`

#### Memory Editor
- ✨ **NEW**: Full-featured page for editing memories (`/memory/[id]/edit`)
  - Rich editor integration for content editing
  - Auto-save service with debouncing (saves every 2 seconds)
  - Form validation with Zod schemas
  - Offline support with IndexedDB fallback
  - Performance monitoring and metrics
  - Lazy loading of components for better performance
  - Navigation header with save status indicators
  - Memory entries sidebar for quick navigation
  - Error boundary for graceful error handling
  - Loading states and skeletons
  - Unsaved changes warning before navigation
- **Files**: `apps/web/app/memory/[id]/edit/page.tsx`, `apps/web/components/editor/**/*.tsx`
- **Spec**: `ai_specs/cards-to-full-markdown-pages/`

#### Claude Agent SDK Integration
- ✨ **NEW**: Complete migration from AI SDK to Claude Agent SDK
  - Direct Anthropic API integration (`apps/api/src/services/claude-agent.ts`)
  - Custom tools implementation with `searchDatabase` MCP tool
  - Streaming responses with Server-Sent Events (SSE)
  - Tool use tracking and logging
  - Conversation history preservation in `conversations` table
  - Event storage system for detailed conversation logs
  - Three chat modes: simple (6 turns), agentic (10 turns), deep (12 turns)
  - Session management with SDK session IDs
  - Error handling and recovery
  - Automatic context retrieval from knowledge base
- **Files**: `apps/api/src/services/claude-agent.ts`, `apps/api/src/services/claude-agent-tools.ts`
- **Spec**: `ai_specs/claude-agent-sdk-fixes/`
- **Migrations**: `apps/api/migrations/0002_add_conversation_tables.sql`, `apps/api/migrations/0003_add_sdk_session_id.sql`

### 🔧 Backend Improvements

#### API Enhancements
- ➕ **NEW**: `/api/conversations` endpoint for conversation management
- ➕ **NEW**: Event storage service (`apps/api/src/services/event-storage.ts`)
- ➕ **NEW**: Cache service with TTL support (`apps/api/src/services/cache.ts`)
- ➕ **NEW**: Error handler service (`apps/api/src/services/error-handler.ts`)
- ➕ **NEW**: Analysis service (`apps/api/src/services/analysis-service.ts`)
- ➕ **NEW**: Google GenAI service (`apps/api/src/services/google-genai.ts`)
- 🔨 **REFACTOR**: `/chat-v2` endpoint with streaming improvements
- 🔨 **REFACTOR**: `/documents` endpoint with better validation
- 🔨 **REFACTOR**: `/search` endpoint with enhanced hybrid search
- 🔨 **REFACTOR**: `/projects` endpoint with optimized queries

#### Service Improvements
- 🔨 **REFACTOR**: `extractor.ts` - Improved multi-modal content extraction
  - Better PDF processing with OCR fallback
  - Enhanced image extraction with vision API
  - Audio/video transcription improvements
  - Web scraping with MarkItDown integration
- 🔨 **REFACTOR**: `summarizer.ts` - Better content summarization
  - Configurable summary lengths
  - Multi-language support
  - Fallback strategies
- 🔨 **REFACTOR**: `hybrid-search.ts` - Enhanced search algorithm
  - Vector search with pgvector IVFFlat index
  - Text search with full-text capabilities
  - Result reranking with Cohere
  - Recency boosting for recent documents
  - Metadata filtering
  - Caching layer for performance
- 🔨 **REFACTOR**: `ingestion.ts` - Optimized document processing pipeline
- 🔨 **REFACTOR**: `rerank.ts` - Improved relevance scoring

#### Database Changes
- ➕ **NEW**: `conversations` table for chat history
- ➕ **NEW**: `conversation_events` table for detailed event logs
- ➕ **NEW**: `canvas_positions` table for card positions
- ➕ **NEW**: `sdk_session_id` column in conversations
- 🔧 **FIX**: RLS policies for multi-tenant isolation
- 🔧 **FIX**: Missing RLS policies on auxiliary tables
- ➕ **NEW**: Migration script: `0002_add_conversation_tables.sql`
- ➕ **NEW**: Migration script: `0003_add_sdk_session_id.sql`
- ➕ **NEW**: Migration script: `0006_rls_missing_tables.sql`
- ➕ **NEW**: Migration script: `0007_add_org_id_to_processing_logs.sql`

### 🎨 Frontend Improvements

#### UI Components (shadcn/ui)
- ➕ **NEW**: `button.tsx` - Button component with variants
- ➕ **NEW**: `card.tsx` - Card layout component
- ➕ **NEW**: `dialog.tsx` - Modal dialog component
- ➕ **NEW**: `popover.tsx` - Popover component
- ➕ **NEW**: `select.tsx` - Select dropdown component
- ➕ **NEW**: `tabs.tsx` - Tabs navigation component
- ➕ **NEW**: `toggle.tsx` - Toggle switch component
- ➕ **NEW**: `tooltip.tsx` - Tooltip component
- ➕ **NEW**: `command.tsx` - Command menu component
- ➕ **NEW**: `context-menu.tsx` - Context menu component
- ➕ **NEW**: `scroll-area.tsx` - Scroll area component
- ➕ **NEW**: `separator.tsx` - Separator component
- ➕ **NEW**: `sheet.tsx` - Side sheet component
- ➕ **NEW**: `skeleton.tsx` - Loading skeleton component
- ➕ **NEW**: `switch.tsx` - Switch component
- ➕ **NEW**: `textarea.tsx` - Textarea component
- ➕ **NEW**: `checkbox.tsx` - Checkbox component
- ➕ **NEW**: `label.tsx` - Form label component
- ➕ **NEW**: `input.tsx` - Input component
- ➕ **NEW**: `button-group.tsx` - Button group component
- ➕ **NEW**: `toggle-group.tsx` - Toggle group component

#### Page Improvements
- 🔨 **REFACTOR**: `apps/web/app/page.tsx` - Main page with canvas integration
- ➕ **NEW**: `apps/web/app/memory/[id]/edit/` - Memory editor pages
- 🔨 **REFACTOR**: `apps/web/app/layout.tsx` - App layout improvements
- ➕ **NEW**: Error pages (error.tsx, not-found.tsx)

#### Component Improvements
- 🔨 **REFACTOR**: `chat-messages.tsx` - Enhanced chat UI with streaming
  - Better message rendering
  - Source citations with links
  - Loading indicators
  - Error handling
  - Markdown rendering improvements
- 🔨 **REFACTOR**: `memory-list-view.tsx` - Improved memory list
  - Virtual scrolling for performance
  - Better filtering and sorting
  - Card view and list view toggle
  - Infinite scroll
- 🔨 **REFACTOR**: `add-memory/index.tsx` - Enhanced memory creation
  - Rich editor integration
  - File upload improvements
  - URL import enhancements
- 🔨 **REFACTOR**: `menu.tsx` - Improved navigation menu
  - Responsive design
  - Better mobile support
  - Quick actions
- 🔨 **REFACTOR**: `project-selector.tsx` - Better project switching
- ➕ **NEW**: `error-boundary.tsx` - Global error boundary component
- ➕ **NEW**: `theme-provider.tsx` - Theme management

#### State Management
- ➕ **NEW**: `stores/canvas.ts` - Canvas state with Zustand
- ➕ **NEW**: `stores/chat.js` - Chat state management
- ➕ **NEW**: `stores/highlights.js` - Text highlighting state
- ➕ **NEW**: `stores/index.js` - Store index

#### Hooks
- ➕ **NEW**: `use-unsaved-changes.ts` - Hook for unsaved changes warning
- ➕ **NEW**: `use-resize-observer.js` - Resize observer hook
- ➕ **NEW**: `use-project-mutations.js` - Project mutation hooks

#### API Clients
- ➕ **NEW**: `lib/api/documents-client.ts` - Document API client
- ➕ **NEW**: `lib/api/documents.ts` - Document utilities
- ➕ **NEW**: `lib/api/memory-entries.ts` - Memory entries API
- ➕ **NEW**: `lib/api/upload.ts` - Upload utilities

#### Content Conversion
- ➕ **NEW**: `lib/editor/content-conversion.ts` - Convert between formats
- ➕ **NEW**: `lib/editor/content-conversion.test.ts` - Conversion tests

### 📦 Packages & Dependencies

#### New Dependencies
- `@anthropic-ai/sdk` - Claude AI integration
- `@tanstack/react-query` v5 - Data fetching and caching
- `zustand` - State management
- `react-dropzone` - File uploads
- `@radix-ui/*` - UI primitives (20+ components)
- `class-variance-authority` - Component variants
- `clsx` - Conditional classnames
- `tailwind-merge` - Tailwind class merging
- `lucide-react` - Icon library

#### Updated Dependencies
- Next.js 15 → 16 (with Turbopack)
- React 18 → 19 (RC)
- TypeScript 5.6+ with stricter types
- Bun runtime optimizations
- Supabase client updates

#### Removed Dependencies
- `ai` (Vercel AI SDK) - Replaced with Claude Agent SDK
- `packages/auth-server/` - Entire package removed, auth moved to API

### 🧪 Testing

#### New Test Files
- ➕ **NEW**: `apps/web/vitest.config.ts` - Vitest configuration
- ➕ **NEW**: `apps/web/vitest.setup.ts` - Test setup
- ➕ **NEW**: `apps/web/hooks/use-unsaved-changes.test.ts` - Hook tests
- ➕ **NEW**: `apps/web/lib/editor/content-conversion.test.ts` - Conversion tests
- ➕ **NEW**: `ai_testes/` - Integration test suite
  - `01-test-document-creation.ts`
  - `02-test-document-list.ts`
  - `03-test-schema-transformations.ts`
  - `04-test-atomic-function.ts`
  - `05-test-search.ts`
  - `run-all-tests.ts`

#### Test Scripts
- ➕ **NEW**: `test-chat-claude.ts` - Claude integration tests
- ➕ **NEW**: `test-chat-simple.sh` - Simple chat test
- ❌ **REMOVED**: `test-chat-modes.sh` - Old test script
- ❌ **REMOVED**: `test-chat-v2.sh` - Old test script
- ❌ **REMOVED**: `e2e/chat-modes.spec.ts` - Old E2E test

### 📚 Documentation

#### New Documentation
- ➕ **NEW**: `docs/README.md` - Documentation index
- ➕ **NEW**: `CHANGELOG.md` - This file
- ➕ **NEW**: `DATA_MODEL.md` - Complete data model documentation
- ➕ **NEW**: `SEARCH_QUALITY_FIX.md` - Search improvements documentation
- ➕ **NEW**: `ai_docs/CENTRALIZED_DATA_MODEL_SUMMARY.md`
- ➕ **NEW**: `ai_docs/CODE_GENERATION_GUARDRAILS.md`
- ➕ **NEW**: `ai_docs/CURRENT_STATE_ANALYSIS.md`
- ➕ **NEW**: `ai_docs/DATA_MODEL_IMPLEMENTATION_GUIDE.md`
- ➕ **NEW**: `ai_docs/DATA_MODEL_INDEX.md`
- ➕ **NEW**: `ai_docs/DATA_MODEL_REFERENCE.md`
- ➕ **NEW**: `ai_docs/DEPLOYMENT_CHECKLIST.md`
- ➕ **NEW**: `ai_docs/PHASE_5_6_IMPLEMENTATION_SUMMARY.md`
- ➕ **NEW**: `ai_docs/CLAUDE_AGENT_INTEGRATION_ANALYSIS.md`

#### Specification Documents
- ➕ **NEW**: `Spec/INFINITY_CANVAS_IMPLEMENTATION.md`
- ➕ **NEW**: `Spec/infinity-canvas/` (requirements, design, tasks)
- ➕ **NEW**: `Spec/menu-horizontal-top/tasks.md`
- ➕ **NEW**: `ai_specs/cards-to-full-markdown-pages/` (requirements, design, tasks, docs)
- ➕ **NEW**: `ai_specs/claude-agent-sdk-fixes/` (requirements, design, tasks)

#### API Documentation
- ➕ **NEW**: `apps/api/CLAUDE_AGENT_CONTINUE_FLAG.md`
- ➕ **NEW**: `apps/api/CLAUDE_AGENT_HISTORY_SOLUTION.md`
- ➕ **NEW**: `apps/api/CONVERSATION_RLS_FIX.md`
- ➕ **NEW**: `apps/api/IMPLEMENTATION_STATUS.md`
- ➕ **NEW**: `apps/api/MIGRATION_GUIDE.md`
- ➕ **NEW**: `apps/api/NEW_SDK_ARCHITECTURE.md`

#### Archived Documentation
- ↩️ **ARCHIVED**: Old implementation docs moved to `docs/archive/`
  - `BUG_FIXES_FINAL_STATUS.md`
  - `CRITICAL_ISSUE_RESOLVED.md`
  - `RLS_PROBLEM_ANALYSIS.md`
  - `SOLUCAO_FINAL_RLS.md`
  - `STATUS_FINAL.md`

#### Removed Documentation
- ❌ **REMOVED**: `ANALYSIS_REPORT.md` (outdated)
- ❌ **REMOVED**: `COMPARISON_AGENTSET_VS_SUPERMEMORY.md` (outdated)
- ❌ **REMOVED**: `EXTRACTOR_MARKITDOWN_RESULTS.md` (outdated)
- ❌ **REMOVED**: `IMPLEMENTATION_GUIDE.md` (replaced)
- ❌ **REMOVED**: `IMPLEMENTATION_STATUS.md` (replaced)
- ❌ **REMOVED**: `MANUAL_TESTING_GUIDE.md` (replaced)
- ❌ **REMOVED**: `RELEASE_NOTES_v1.2.md` (replaced by this changelog)
- ❌ **REMOVED**: `SEARCH_IMPROVEMENTS.md` (replaced)
- ❌ **REMOVED**: `SETUP_GUIDE.md` (replaced)
- ❌ **REMOVED**: `TESTE_FALLBACK_RESULTS.md` (outdated)
- ❌ **REMOVED**: `TESTING_CHAT_V2.md` (outdated)
- ❌ **REMOVED**: `TESTING_GUIDE.md` (replaced)
- ❌ **REMOVED**: `TESTING_RESULTS.md` (outdated)
- ❌ **REMOVED**: `spec/PRD.md` (outdated)
- ❌ **REMOVED**: `spec/TECH_SPEC.md` (outdated)
- ❌ **REMOVED**: `.playwright-mcp/*.png` (old screenshots)

### 🔧 Configuration Changes

#### Next.js Configuration
- 🔨 **REFACTOR**: `apps/web/next.config.ts`
  - Added API proxy for `/api` routes to backend
  - Turbopack configuration improvements
  - Image optimization settings
  - Webpack polyfills for Node.js modules
  - Experimental features enabled

#### Package.json Updates
- 🔨 **REFACTOR**: Root `package.json` with updated scripts
- 🔨 **REFACTOR**: `apps/api/package.json` with new dependencies
- 🔨 **REFACTOR**: `apps/web/package.json` with new dependencies
- ❌ **REMOVED**: `packages/auth-server/package.json`

#### Tailwind Configuration
- ➕ **NEW**: `apps/web/tailwind.config.ts` - Complete Tailwind setup
  - Custom colors and design tokens
  - Animation utilities
  - Typography plugin
  - Container queries

#### PostCSS Configuration
- 🔨 **REFACTOR**: `apps/web/postcss.config.mjs` - Updated PostCSS setup

#### TypeScript Configuration
- 🔨 **REFACTOR**: Updated `tsconfig.json` files with stricter rules
- ➕ **NEW**: Path aliases for imports

#### Components Configuration
- 🔨 **REFACTOR**: `apps/web/components.json` - shadcn/ui configuration

### 🐛 Bug Fixes

#### Critical Fixes
- 🔧 **FIX**: RLS policies header context bug - moved to application-layer authorization
- 🔧 **FIX**: Infinite loop in chat component resolved
- 🔧 **FIX**: Missing `current_request_org()` function removed from INSERT policies
- 🔧 **FIX**: ANON_KEY requirement enforcement
- 🔧 **FIX**: AI_PROVIDER configuration respect
- 🔧 **FIX**: React.Fragment key prop in menu items
- 🔧 **FIX**: Import React for Fragment usage

#### Search Fixes
- 🔧 **FIX**: Vector search fallback handling
- 🔧 **FIX**: Hybrid search result deduplication
- 🔧 **FIX**: Reranking score normalization
- 🔧 **FIX**: Cache invalidation strategy

#### UI Fixes
- 🔧 **FIX**: Canvas zoom limits and smooth scrolling
- 🔧 **FIX**: Editor block drag-and-drop edge cases
- 🔧 **FIX**: Image upload error handling
- 🔧 **FIX**: Memory list virtual scrolling performance
- 🔧 **FIX**: Mobile menu responsiveness

#### API Fixes
- 🔧 **FIX**: Rate limiting per-user calculation
- 🔧 **FIX**: CORS handling for Railway deployment
- 🔧 **FIX**: File upload size limits
- 🔧 **FIX**: URL validation security issues
- 🔧 **FIX**: Document extraction timeouts

### 🔒 Security Improvements

- ✅ **SECURITY**: Complete RLS policy coverage on all tables
- ✅ **SECURITY**: Application-layer authorization for complex policies
- ✅ **SECURITY**: Input validation with Zod schemas
- ✅ **SECURITY**: URL validator improvements for safety
- ✅ **SECURITY**: Rate limiting enhancements
- ✅ **SECURITY**: CORS policy tightening
- ✅ **SECURITY**: API key rotation support
- ✅ **SECURITY**: Session encryption with 32-char secrets

### ⚡ Performance Improvements

- ⚡ **PERF**: Canvas rendering optimized for 100+ cards
- ⚡ **PERF**: Virtual scrolling in memory list
- ⚡ **PERF**: Lazy loading of editor components
- ⚡ **PERF**: Image optimization with Next.js Image
- ⚡ **PERF**: Code splitting for better loading times
- ⚡ **PERF**: Database query optimization
- ⚡ **PERF**: Cache layer for search results
- ⚡ **PERF**: Parallel embedding generation
- ⚡ **PERF**: IVFFlat index for vector search

### 🎨 Style Changes

- 💄 **STYLE**: Improved chat and menu UI
- 💄 **STYLE**: Better responsive design across all components
- 💄 **STYLE**: Consistent color scheme with design tokens
- 💄 **STYLE**: Enhanced typography and spacing
- 💄 **STYLE**: Smooth animations and transitions
- 💄 **STYLE**: Dark mode improvements
- 💄 **STYLE**: Card shadow and border refinements

### ♻️ Code Refactoring

#### Major Refactors
- ♻️ **REFACTOR**: Complete UI migration to shadcn/ui components
- ♻️ **REFACTOR**: State management migration to Zustand
- ♻️ **REFACTOR**: Chat system migration to Claude Agent SDK
- ♻️ **REFACTOR**: Document processing pipeline simplification
- ♻️ **REFACTOR**: Error handling standardization

#### Service Refactors
- ♻️ **REFACTOR**: `hybrid-search.ts` - Cleaner search logic
- ♻️ **REFACTOR**: `extractor.ts` - Better extraction flow
- ♻️ **REFACTOR**: `summarizer.ts` - Improved summarization
- ♻️ **REFACTOR**: `ingestion.ts` - Streamlined pipeline
- ♻️ **REFACTOR**: `rerank.ts` - Better relevance scoring

#### Component Refactors
- ♻️ **REFACTOR**: Memory card components for consistency
- ♻️ **REFACTOR**: Content card components (Google Docs, Note, Tweet, Website)
- ♻️ **REFACTOR**: Chat components for better UX
- ♻️ **REFACTOR**: Project components for clarity

### 🗑️ Removals

#### Removed Services
- ❌ **REMOVED**: `apps/api/src/services/agentic-search.ts` (replaced)
- ❌ **REMOVED**: `apps/api/src/services/ai-provider.ts` (replaced)
- ❌ **REMOVED**: `apps/api/src/services/condense-query.ts` (integrated)
- ❌ **REMOVED**: `apps/api/src/services/llm.ts` (replaced)

#### Removed Components
- ❌ **REMOVED**: `apps/web/components/memories/memory-detail.tsx` (replaced by editor)
- ❌ **REMOVED**: `apps/web/components/views/add-memory/text-editor.tsx` (replaced)
- ❌ **REMOVED**: `apps/web/middleware.ts` (moved to Next.js proxy)

#### Removed Packages
- ❌ **REMOVED**: `packages/auth-server/` - Complete package deletion
  - Authentication moved to main API
  - Simplified auth architecture

#### Removed Scripts
- ❌ **REMOVED**: `apply_db_fixes.sh` (replaced by migration system)

### 📋 Migration Guide

For users upgrading from v1.x to v2.0:

1. **Database Migrations Required**:
   ```bash
   # Run new migrations
   cd apps/api
   bun run apply-migration-direct.ts
   ```

2. **Environment Variables**:
   ```ini
   # Add new required variables
   ANTHROPIC_API_KEY=your_claude_api_key

   # Optional: Keep existing Google API for embeddings
   GOOGLE_API_KEY=your_gemini_key
   ```

3. **Breaking Changes**:
   - AI SDK replaced with Claude Agent SDK
   - Chat endpoint now uses Server-Sent Events (SSE)
   - Memory detail page moved to `/memory/[id]/edit`
   - Auth server package removed

4. **New Features to Test**:
   - Infinity Canvas at main page
   - Rich text editor in memory creation
   - Memory editor at `/memory/[id]/edit`
   - Enhanced chat with tool use

See [MIGRATION_GUIDE.md](apps/api/MIGRATION_GUIDE.md) for detailed upgrade instructions.

---

## [1.2.0] - 2025-10-09

### Features
- Added Railway deployment support
- Implemented XAI integration
- Added data model documentation
- Improved search quality

### Bug Fixes
- Fixed RLS policies
- Resolved database connection issues
- Fixed authentication bugs

---

## [1.1.0] - 2025-09-22

### Features
- Initial public release
- Multi-modal content ingestion
- Vector search with pgvector
- Chat interface with streaming
- OAuth integrations

### Infrastructure
- Supabase backend
- Next.js frontend
- Bun API server

---

## Links

- **Repository**: https://github.com/guilhermexp/supermemory
- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/guilhermexp/supermemory/issues)
- **Discussions**: [GitHub Discussions](https://github.com/guilhermexp/supermemory/discussions)

---

**Note**: This changelog tracks changes in the `claudenewagent` branch. Main branch merge pending.
