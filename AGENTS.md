# Supermemory - Agent Context & Integration Guide

> **Last Updated**: October 30, 2025
> **For**: Claude Code & AI Development Agents
> **Version**: 2.0.0

## 🤖 Agent Onboarding

This document provides AI agents with complete context about Supermemory architecture, conventions, and integration points.

### Quick Context Summary
- **Project**: Supermemory - Self-hosted AI memory layer
- **Tech Stack**: Next.js 16, Bun, Hono, Supabase + pgvector, Claude 3.5
- **Status**: Production-ready, actively developed
- **Key Features**: Infinity Canvas, Rich Editor, Claude Agent SDK integration
- **Deployment**: Railway with GitHub integration

---

## 🗂️ Documentation Maps for Agents

### Essential Reading (Start Here)
1. **Project Overview**: `CLAUDE.md` (this is your main guide)
2. **Current State**: `ai_docs/CURRENT_STATE_ANALYSIS.md`
3. **Recent Changes**: `ai_changelog/CHANGELOG.md`

### Architecture Understanding
- **System Design**: `docs/architecture/SYSTEM_ARCHITECTURE.md`
- **Data Model**: `ai_docs/DATA_MODEL_REFERENCE.md`
- **Search System**: `docs/architecture/SEARCH_SYSTEM.md`
- **Chat System**: `docs/architecture/CHAT_SYSTEM.md`

### Implementation Guides
- **Implementation Status**: `ai_docs/IMPLEMENTATION_SUMMARY.md`
- **Code Standards**: `ai_docs/CODE_GENERATION_GUARDRAILS.md`
- **Claude Integration**: `ai_docs/CLAUDE_AGENT_INTEGRATION_ANALYSIS.md`

### Feature Specifications
- **Cards to Markdown**: `ai_specs/cards-to-full-markdown-pages/`
- **Claude Agent SDK**: `ai_specs/claude-agent-sdk-fixes/`
- **Infrastructure**: `ai_specs/infra/`

### Known Issues & Research
- **Active Issues**: `ai_issues/` (check for blockers)
- **Research Findings**: `ai_research/` (experiments & learnings)

---

## 🎯 Agent Tasks & Patterns

### Task Types & Approaches

#### 1. Feature Implementation
**When**: Building new features from specification
**Approach**:
1. Read feature spec in `ai_specs/<feature>/`
2. Understand requirements (REQUIREMENTS.md)
3. Review design (DESIGN.md)
4. Check implementation tasks (TASKS.md)
5. Follow code standards (`ai_docs/CODE_GENERATION_GUARDRAILS.md`)
6. Test per acceptance criteria (ACCEPTANCE_CRITERIA.md)
7. Update documentation with implementation details
8. Move spec status to "Completed"

**Reference Files**:
- Spec location: `ai_specs/<feature-name>/`
- Code standards: `ai_docs/CODE_GENERATION_GUARDRAILS.md`
- Related service code in `apps/api/src/services/` or `apps/web/components/`

#### 2. Bug Fixing
**When**: Resolving identified issues
**Approach**:
1. Review issue in `ai_issues/<issue-name>.md`
2. Understand reproduction steps
3. Locate affected code (reference file paths in issue)
4. Create minimal fix with tests
5. Verify no regressions
6. Document fix in issue file
7. Update changelog entry
8. Close issue (move to `ai_issues/archived/`)

**Reference Files**:
- Issue templates: `ai_issues/` directory
- Recent fixes: Check `ai_changelog/CHANGELOG.md` Bug Fixes section

#### 3. Architecture/Design Changes
**When**: Modifying system design or introducing new patterns
**Approach**:
1. Create decision record in `ai_docs/`
2. Document current vs. proposed approach
3. Identify affected components
4. Plan migration path
5. Create spec document if needed
6. Update architecture documentation
7. Implement with tests
8. Update related service files

**Reference Files**:
- Architecture docs: `docs/architecture/`
- Implementation guides: `ai_docs/`
- Related services: `apps/api/src/services/`

#### 4. Performance Optimization
**When**: Improving system speed/efficiency
**Approach**:
1. Create research document in `ai_research/`
2. Document baseline metrics
3. Identify bottleneck
4. Propose optimization
5. Implement with benchmarking
6. Document findings and results
7. Move research to completed
8. Update performance section in CLAUDE.md

**Reference Files**:
- Performance baselines: `CLAUDE.md` (Performance Metrics section)
- Research structure: `ai_research/README.md`
- Related services: search, extractor, embeddings

#### 5. Documentation Updates
**When**: Improving or creating documentation
**Approach**:
1. Identify documentation gap/outdated content
2. Review DOCUMENTATION_STATUS.md for status
3. Update or create documentation
4. Maintain consistent style and structure
5. Add code examples where helpful
6. Update index/README files
7. Verify all links work
8. Update DOCUMENTATION_STATUS.md

**Reference Files**:
- Doc index: `ai_docs/README.md`, `docs/README.md`
- Status tracker: `ai_docs/DOCUMENTATION_STATUS.md`
- Style guide: Check existing markdown files for consistency

---

## 🔧 Code Organization Patterns

### Frontend Structure
```
apps/web/
├── app/                    # Next.js 16 App Router
│   ├── layout.tsx
│   ├── page.tsx           # Homepage
│   ├── auth/              # Authentication pages
│   ├── memory/            # Memory detail pages
│   │   ├── [id]/          # Dynamic routes
│   │   └── [id]/edit/     # Edit page
│   └── dashboard/         # Dashboard pages
│
├── components/
│   ├── canvas/            # Infinity Canvas
│   │   └── infinity-canvas.tsx
│   ├── editor/            # Memory Editor
│   │   ├── editor.tsx
│   │   └── auto-save.tsx
│   ├── ui/                # UI Components
│   │   ├── rich-editor/   # Rich text editor
│   │   └── [other components]
│   └── views/             # Page views
│
└── stores/                # Zustand stores
    ├── canvas.ts          # Canvas state
    ├── auth.ts            # Auth state
    └── ui.ts              # UI state
```

**Patterns to Follow**:
- Use Server Components for static content
- Use Client Components for interactivity
- Store reusable logic in `stores/`
- Keep components focused on single responsibility
- Use Zustand for complex state
- Import types from shared packages

### Backend Structure
```
apps/api/
├── src/
│   ├── routes/            # API endpoints
│   │   ├── auth.ts
│   │   ├── documents.ts
│   │   ├── chat.ts
│   │   ├── search.ts
│   │   └── [other routes]
│   │
│   ├── services/          # Business logic
│   │   ├── claude-agent.ts      # AI chat
│   │   ├── hybrid-search.ts     # Search
│   │   ├── extractor.ts         # Content processing
│   │   ├── embeddings.ts        # Vector generation
│   │   ├── database.ts          # DB operations
│   │   └── [other services]
│   │
│   ├── middleware/        # Auth, validation, etc.
│   ├── types/             # Shared TypeScript types
│   └── index.ts           # App entry point
│
└── migrations/            # Database migrations
    ├── 0001_init.sql
    ├── 0002_add_conversation_tables.sql
    └── [other migrations]
```

**Patterns to Follow**:
- Services handle business logic
- Routes are thin wrappers around services
- Use Zod for input validation
- Implement proper error handling
- Log important events
- Use TypeScript strict mode
- Add JSDoc comments for complex functions

### Database Patterns
```typescript
// Query pattern
const { data, error } = await supabase
  .from('documents')
  .select('*')
  .eq('org_id', orgId)
  .limit(10)

// Mutation pattern
const { data, error } = await supabase
  .from('documents')
  .insert({ title, content, org_id: orgId })
  .select()
  .single()

// RLS enabled on all tables
-- Only users can see their org's data
SELECT * FROM documents WHERE org_id = auth.claims() ->> 'org_id'
```

---

## 📊 Data Model Reference

### Essential Tables

**organizations**
- `id` (UUID, PK)
- `name` (TEXT)
- `created_at` (TIMESTAMP)

**documents**
- `id` (UUID, PK)
- `org_id` (UUID, FK)
- `title` (TEXT)
- `content` (TEXT)
- `summary` (TEXT) - AI-generated
- `source_type` (TEXT) - url, pdf, text, etc.
- `created_at` (TIMESTAMP)

**chunks**
- `id` (UUID, PK)
- `document_id` (UUID, FK)
- `content` (TEXT)
- `embedding` (vector, pgvector)
- `chunk_number` (INT)

**conversations**
- `id` (UUID, PK)
- `org_id` (UUID, FK)
- `user_id` (UUID, FK)
- `title` (TEXT)
- `mode` (TEXT) - simple, agentic, deep
- `created_at` (TIMESTAMP)

**canvas_positions**
- `id` (UUID, PK)
- `org_id` (UUID, FK)
- `document_id` (UUID, FK)
- `x` (FLOAT)
- `y` (FLOAT)
- `z_index` (INT)

**Reference**: `ai_docs/DATA_MODEL_REFERENCE.md` for complete schema

---

## 🔌 Service Integration Points

### Claude Agent Service
**Location**: `apps/api/src/services/claude-agent.ts`

```typescript
// Initialize agent
const agent = new ClaudeAgent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-5-sonnet-20241022'
})

// Add tools
agent.addTool({
  name: 'searchDatabase',
  description: 'Search knowledge base',
  handler: async (query) => { /* ... */ }
})

// Process message with streaming
for await (const chunk of agent.stream(userMessage, { mode: 'agentic' })) {
  console.log(chunk.text)
}
```

**Integration Points**:
- `/api/chat-v2` endpoint calls this service
- Receives user message, retrieves context
- Streams response back via SSE
- Stores conversation history in DB

### Hybrid Search Service
**Location**: `apps/api/src/services/hybrid-search.ts`

```typescript
// Vector + text search combination
const results = await hybridSearch({
  query: userQuery,
  vectorWeight: 0.7,
  textWeight: 0.3,
  limit: 10,
  orgId: orgId
})
```

**Integration Points**:
- `/api/search` endpoint
- Called by Claude Agent for context retrieval
- Uses pgvector for similarity
- BM25 for text ranking

### Content Extractor Service
**Location**: `apps/api/src/services/extractor.ts`

```typescript
// Extract content from various sources
const extracted = await extractor.extract({
  type: 'pdf',
  source: fileBuffer,
  metadata: { title: 'Document Title' }
})
// Returns: { text, images, metadata }
```

**Supported Types**:
- `text` - Plain text or markdown
- `pdf` - PDF documents
- `image` - Images (vision extraction)
- `url` - Web pages (HTML scraping)
- `repository` - GitHub repositories
- `video` - Video transcription

### Database Service
**Location**: `apps/api/src/services/database.ts`

Handles all Supabase queries with:
- Automatic org_id filtering (multi-tenancy)
- Error handling
- Type safety with TypeScript
- RLS policy compliance

---

## 🧪 Testing Patterns

### API Endpoint Testing
```typescript
// apps/api/tests/routes/chat.test.ts
describe('POST /api/chat-v2', () => {
  it('should stream chat response', async () => {
    const response = await request(app)
      .post('/api/chat-v2')
      .send({ message: 'Hello', mode: 'simple' })

    expect(response.status).toBe(200)
    expect(response.type).toContain('application/json')
  })
})
```

### Component Testing
```typescript
// apps/web/__tests__/components/canvas.test.tsx
describe('Infinity Canvas', () => {
  it('should handle drag and drop', () => {
    render(<InfinityCanvas documents={[]} />)
    // Test interactions
  })
})
```

### Integration Testing
```typescript
// Test full flow from ingestion to search
describe('Document ingestion flow', () => {
  it('should extract, chunk, embed, and make searchable', async () => {
    // 1. Upload document
    // 2. Verify extraction
    // 3. Check vector storage
    // 4. Test search retrieval
  })
})
```

---

## 🚢 Deployment Considerations

### Before Deploying
- [ ] All tests pass
- [ ] Type checking clean
- [ ] No console errors
- [ ] Database migrations ready
- [ ] Environment variables configured
- [ ] Documentation updated
- [ ] Performance impact assessed

### Environment Variables Needed

**API Service**:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sk_service_xxx
SUPABASE_ANON_KEY=eyJhbGc...
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_API_KEY=AIzaSyDxxxx
AUTH_SECRET=your_32_char_secret
```

**Web Service**:
```env
NEXT_PUBLIC_BACKEND_URL=""  # Empty for same-origin
NEXT_PUBLIC_APP_URL=https://your-app.railway.app
```

### Railway Deployment
```bash
# Service 1: API
Repository: /apps/api
Start Command: bun run start
Build Command: bun install && bun run build

# Service 2: Web
Repository: /apps/web
Start Command: bun run start
Build Command: bun install && bun run build
```

---

## 🐛 Common Agent Scenarios

### Scenario 1: User Reports Chat Not Working
**Steps**:
1. Check recent commits in `ai_changelog/CHANGELOG.md`
2. Review Claude Agent SDK integration code
3. Check `/api/chat-v2` endpoint
4. Verify streaming is working (SSE)
5. Check conversation table structure
6. Test with simple message first
7. Review API logs on Railway

**Reference Files**:
- Service: `apps/api/src/services/claude-agent.ts`
- Endpoint: `apps/api/src/routes/chat.ts`
- Recent fixes: `ai_changelog/CHANGELOG.md`

### Scenario 2: Search Results Not Relevant
**Steps**:
1. Check hybrid search weights in `hybrid-search.ts`
2. Verify embeddings are generated correctly
3. Test vector similarity scores
4. Review BM25 text search
5. Check if documents are chunked properly
6. Verify RLS policies aren't filtering results
7. Consider reranking adjustments

**Reference Files**:
- Service: `apps/api/src/services/hybrid-search.ts`
- Config: Check search weight constants
- Related: Chunk size in `apps/api/src/services/extractor.ts`

### Scenario 3: Performance Degradation
**Steps**:
1. Check current metrics in `CLAUDE.md` Performance section
2. Identify slow endpoint/component
3. Review recent code changes
4. Check database query performance
5. Look for N+1 query problems
6. Test with profiling tools
7. Create performance benchmark

**Reference Files**:
- Performance baseline: `CLAUDE.md`
- Research pattern: `ai_research/` directory
- Optimization examples: Previous performance work

### Scenario 4: Database Migration Failure
**Steps**:
1. Check recent migration files in `apps/api/migrations/`
2. Verify migration syntax is correct
3. Test on development database first
4. Check for existing data conflicts
5. Add rollback procedure
6. Document migration in changelog
7. Update schema documentation

**Reference Files**:
- Migration folder: `apps/api/migrations/`
- Schema docs: `ai_docs/DATA_MODEL.md`
- Related: `ai_issues/` for database problems

---

## 📋 Agent Workflow Checklist

### Before Starting Any Task
- [ ] Read relevant spec/issue document
- [ ] Review related code files
- [ ] Check CLAUDE.md for context
- [ ] Look at recent commits
- [ ] Understand expected changes
- [ ] Plan implementation approach

### During Implementation
- [ ] Follow code patterns in existing files
- [ ] Write tests alongside code
- [ ] Add error handling
- [ ] Log important operations
- [ ] Add TypeScript types
- [ ] Update JSDoc comments
- [ ] Test with multiple scenarios

### Before Submitting Work
- [ ] All tests pass
- [ ] Type checking clean
- [ ] Code is formatted
- [ ] Documentation updated
- [ ] No breaking changes (unless intentional)
- [ ] Performance acceptable
- [ ] Security reviewed
- [ ] Changelog entry added

### After Submitting
- [ ] Update related docs
- [ ] Update spec status
- [ ] Archive issues if resolved
- [ ] Link related PRs/commits
- [ ] Notify team if needed
- [ ] Plan follow-up work

---

## 🎓 Learning Resources for Agents

### Quick Start Path
1. Read `CLAUDE.md` (this project's main guide)
2. Check `ai_docs/CURRENT_STATE_ANALYSIS.md`
3. Review `docs/architecture/SYSTEM_ARCHITECTURE.md`
4. Look at `apps/api/src/services/` for backend patterns
5. Check `apps/web/components/` for frontend patterns
6. Review tests for usage examples

### Deep Dive Resources
- **Data Model**: `ai_docs/DATA_MODEL_REFERENCE.md`
- **Search**: `docs/architecture/SEARCH_SYSTEM.md`
- **Chat**: `docs/architecture/CHAT_SYSTEM.md`
- **Implementation**: `ai_docs/IMPLEMENTATION_SUMMARY.md`
- **Code Standards**: `ai_docs/CODE_GENERATION_GUARDRAILS.md`

### Code Examples to Study
- Canvas implementation: `apps/web/components/canvas/infinity-canvas.tsx`
- Rich editor: `apps/web/components/ui/rich-editor/`
- Chat service: `apps/api/src/services/claude-agent.ts`
- Search service: `apps/api/src/services/hybrid-search.ts`
- Database ops: `apps/api/src/services/database.ts`

---

## 🤝 Agent Collaboration

### Leaving Context for Next Agent
When completing work:
1. Update `ai_changelog/CHANGELOG.md` with changes
2. Update related spec status to "Completed"
3. Add implementation notes if complex
4. Reference commits in documentation
5. Update `ai_docs/CURRENT_STATE_ANALYSIS.md` if major changes
6. Flag any blockers in `ai_issues/`

### Picking Up Incomplete Work
When continuing work:
1. Check `ai_specs/<feature>/` for requirements
2. Review related `ai_issues/` for blockers
3. Check recent commits for context
4. Read existing implementation notes
5. Test current state before proceeding
6. Document progress in spec

---

## 🔒 Security Considerations

### Data Handling
- Always respect RLS policies
- Validate all user input with Zod
- Never expose service role keys
- Use API keys only in backend
- Implement rate limiting on endpoints

### API Security
- Validate request body size
- Check authentication before sensitive ops
- Log security events
- Use HTTPS in production
- Add CORS headers appropriately

### Database Security
- Enable RLS on all tables
- Use parameterized queries
- Never concatenate user input
- Check org_id before returning data
- Audit sensitive operations

---

## 📞 Getting Help as an Agent

### When Stuck
1. Check related documentation in `docs/` and `ai_docs/`
2. Review similar code in existing components
3. Check tests for usage patterns
4. Look at related specs in `ai_specs/`
5. Search issue history in `ai_issues/`
6. Check research findings in `ai_research/`

### When Code Breaks
1. Check recent commits
2. Review database migrations
3. Verify environment variables
4. Check type errors with `bun run check-types`
5. Run tests to identify issue
6. Check API logs on Railway
7. Review related service code

### How to Learn Code
1. Start with entry point (routes)
2. Follow service calls
3. Check service implementations
4. Review data models
5. Look at tests for examples
6. Study similar features

---

## 📈 Continuous Improvement

### Updating This Guide
When this guide becomes outdated:
1. Update relevant sections
2. Add new patterns discovered
3. Remove deprecated information
4. Update timestamps
5. Reference new documentation
6. Test links still work

### Contributing Back
When you discover:
- New patterns → Add to AGENTS.md
- Issues → Create in `ai_issues/`
- Research → Document in `ai_research/`
- Improvements → Update relevant docs
- Best practices → Add to `CLAUDE.md`

---

**Last Updated**: October 30, 2025
**Maintained By**: Development Team
**Version**: 2.0.0

**Remember**: This is a collaborative project. Leave good context for the next agent!
