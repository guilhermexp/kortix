# Supermemory - Data Model & Architecture

> **Last Updated**: October 2025
> **Status**: Production - Railway Deployment
> **Database**: Supabase Postgres with pgvector extension

## Overview

Supermemory uses a multi-layered data architecture designed for efficient semantic search and retrieval. The system processes documents through three main data layers, each optimized for specific use cases.

---

## Core Concepts

### 🔄 Data Flow Pipeline

```
User Input (File/URL/Text)
        ↓
   [Ingestion Service]
        ↓
    ┌──────────────────┐
    │  Document Layer  │  ← Original content + metadata
    └──────────────────┘
        ↓
    [Chunking Service]
        ↓
    ┌──────────────────┐
    │   Chunk Layer    │  ← Vectorized segments for search
    └──────────────────┘
        ↓
    [Memory Service]
        ↓
    ┌──────────────────┐
    │  Memory Layer    │  ← AI-processed insights (optional)
    └──────────────────┘
```

---

## Database Schema

### 1. **Core Tables**

#### **`organizations`**
Multi-tenant organization management.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `slug` | TEXT | URL-friendly identifier |
| `name` | TEXT | Organization name |
| `metadata` | JSONB | Additional settings |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### **`users`**
User authentication and profiles.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `email` | TEXT | User email (unique) |
| `password_hash` | TEXT | Scrypt password hash |
| `metadata` | JSONB | User preferences |
| `created_at` | TIMESTAMPTZ | Registration date |

#### **`organization_members`**
Many-to-many relationship between users and organizations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `organization_id` | UUID | FK to organizations |
| `user_id` | UUID | FK to users |
| `role` | TEXT | Member role (owner, admin, member) |
| `is_owner` | BOOLEAN | Owner flag |

---

### 2. **Document Storage Layer**

#### **`documents`** - Raw Document Storage
Stores original, unprocessed documents with metadata.

| Column | Type | Description | Used For |
|--------|------|-------------|----------|
| `id` | UUID | Primary key | Document identification |
| `org_id` | UUID | FK to organizations | Multi-tenancy |
| `user_id` | UUID | FK to users (nullable) | Ownership tracking |
| `title` | TEXT | Document title | Display, search ranking |
| `type` | TEXT | Document type | Content handling logic |
| `content` | TEXT | **Full original text** | Full-text retrieval |
| `summary` | TEXT | **AI-generated summary** | Quick previews, context |
| `embedding` | VECTOR(1536) | Document-level embedding | Coarse-grained search |
| `metadata` | JSONB | Custom metadata | URL, source, tags |
| `status` | TEXT | Processing status | Pipeline tracking |
| `created_at` | TIMESTAMPTZ | Upload timestamp | Recency sorting |
| `updated_at` | TIMESTAMPTZ | Last modification | Change tracking |

**Supported Document Types:**
- `text` - Plain text content
- `pdf` - PDF documents
- `tweet` - Twitter/X posts
- `google_doc`, `google_slide`, `google_sheet` - Google Workspace
- `image` - Image files (OCR processed)
- `video` - Video content (transcript extracted)
- `notion_doc` - Notion pages
- `webpage` - Web articles
- `onedrive` - OneDrive files
- `repository` - GitHub repositories

**Metadata Structure:**
```json
{
  "url": "https://example.com/article",
  "source": "web",
  "containerTags": ["sm_project_opensource"],
  "customId": "user-defined-id",
  "author": "Author Name",
  "publishedAt": "2025-10-28T00:00:00Z"
}
```

**Status Values:**
- `pending` - Queued for processing
- `processing` - Currently being processed
- `completed` - Successfully processed
- `failed` - Processing failed
- `chunking` - Being split into chunks
- `embedding` - Generating embeddings

---

### 3. **Vector Search Layer**

#### **`document_chunks`** - Vectorized Segments
Documents split into semantic chunks for precise vector search.

| Column | Type | Description | Used For |
|--------|------|-------------|----------|
| `id` | UUID | Primary key | Chunk identification |
| `org_id` | UUID | FK to organizations | Access control |
| `document_id` | UUID | FK to documents | Parent relationship |
| `content` | TEXT | **Chunk text (500-1000 tokens)** | Search matching |
| `embedding` | VECTOR(1536) | **Text embedding vector** | **Semantic similarity** |
| `metadata` | JSONB | Chunk-specific metadata | Filtering, context |
| `chunk_index` | INTEGER | Position in document | Ordering |
| `created_at` | TIMESTAMPTZ | Creation timestamp | Tracking |

**Why Chunks?**
- **Better Precision**: Small chunks (500-1000 tokens) capture specific concepts
- **Efficient Search**: Faster vector similarity computation
- **Granular Matching**: Match exact passages instead of whole documents
- **Context Preservation**: Overlapping chunks maintain continuity

**Chunking Strategy:**
```typescript
// Default settings
const CHUNK_SIZE = 800 // tokens
const CHUNK_OVERLAP = 200 // tokens
const MIN_CHUNK_SIZE = 100 // tokens
```

**Vector Indexing:**
```sql
-- IVFFlat index for fast approximate nearest neighbor search
CREATE INDEX document_chunks_embedding_idx
ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

---

### 4. **Memory Processing Layer**

#### **`memories`** - AI-Processed Insights
Enriched, AI-processed information extracted from documents (optional advanced feature).

| Column | Type | Description | Used For |
|--------|------|-------------|----------|
| `id` | UUID | Primary key | Memory identification |
| `org_id` | UUID | FK to organizations | Multi-tenancy |
| `user_id` | UUID | FK to users | Ownership |
| `document_id` | UUID | FK to documents | Source tracking |
| `space_id` | UUID | FK to spaces | Organization |
| `content` | TEXT | Processed/extracted insight | Knowledge representation |
| `memory_embedding` | VECTOR(1536) | Legacy embedding | Backward compatibility |
| `memory_embedding_model` | TEXT | Model identifier | Versioning |
| `memory_embedding_new` | VECTOR(1536) | Updated embedding | Current embeddings |
| `memory_embedding_new_model` | TEXT | New model identifier | Migration tracking |
| `metadata` | JSONB | Memory-specific metadata | Enrichment |
| `is_latest` | BOOLEAN | Latest version flag | Versioning |
| `version` | INTEGER | Version number | Change tracking |
| `is_inference` | BOOLEAN | AI-generated flag | Source attribution |
| `is_forgotten` | BOOLEAN | Soft delete flag | Retention management |
| `forget_after` | TIMESTAMPTZ | Auto-deletion time | Privacy compliance |
| `forget_reason` | TEXT | Deletion reason | Audit trail |
| `source_count` | INTEGER | Source reference count | Reliability scoring |
| `created_at` | TIMESTAMPTZ | Creation time | Tracking |
| `updated_at` | TIMESTAMPTZ | Last update | Versioning |

**Memory Types:**
- **Factual Extractions**: Key facts, dates, names, entities
- **Conceptual Links**: Relationships between ideas
- **Summarizations**: Condensed knowledge representations
- **Inferences**: AI-derived insights

**Metadata Examples:**
```json
{
  "type": "factual",
  "confidence": 0.95,
  "entities": ["Person", "Organization", "Date"],
  "relationships": ["works_for", "located_in"],
  "tags": ["important", "verified"],
  "sourceDocumentIds": ["uuid1", "uuid2"]
}
```

---

### 5. **Conversation Tracking**

#### **`conversations`** - Chat Sessions
Tracks conversation history for the Claude Agent SDK integration.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `org_id` | UUID | FK to organizations |
| `user_id` | UUID | FK to users |
| `title` | TEXT | Conversation title |
| `metadata` | JSONB | Session metadata (mode, etc) |
| `created_at` | TIMESTAMPTZ | Start time |
| `updated_at` | TIMESTAMPTZ | Last activity |

**Access Control:**
- Uses `supabaseAdmin` (service_role) for CREATE/UPDATE/DELETE
- RLS policies exist but are bypassed for system operations
- Security validated at application layer

#### **`conversation_events`** - Message History
Stores individual messages and tool interactions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `conversation_id` | UUID | FK to conversations |
| `type` | TEXT | Event type (user, assistant, tool_use, tool_result, error) |
| `role` | TEXT | Message role (user, assistant) |
| `content` | JSONB | Message content |
| `metadata` | JSONB | Additional context |
| `created_at` | TIMESTAMPTZ | Event timestamp |

#### **`tool_results`** - Tool Execution Log
Tracks tool usage and results.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `event_id` | UUID | FK to conversation_events |
| `tool_name` | TEXT | Tool identifier |
| `tool_use_id` | TEXT | Execution ID |
| `input` | JSONB | Tool input parameters |
| `output` | JSONB | Tool output |
| `is_error` | BOOLEAN | Error flag |
| `error_message` | TEXT | Error details |
| `executed_at` | TIMESTAMPTZ | Execution time |
| `duration_ms` | INTEGER | Execution duration |

---

### 6. **Organization & Spaces**

#### **`spaces`** - Project/Tag Organization
Logical grouping of documents within organizations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `organization_id` | UUID | FK to organizations |
| `name` | TEXT | Space name |
| `container_tag` | TEXT | Unique tag identifier |
| `metadata` | JSONB | Space settings |
| `created_at` | TIMESTAMPTZ | Creation time |

**Container Tags:**
- Format: `sm_project_{name}` (e.g., `sm_project_opensource`)
- Used for scoping searches to specific projects
- Multiple spaces can share documents via `documents_to_spaces`

#### **`documents_to_spaces`** - Document-Space Mapping
Many-to-many relationship between documents and spaces.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `document_id` | UUID | FK to documents |
| `space_id` | UUID | FK to spaces |

---

## Search Architecture

### Vector Search Flow

```typescript
// 1. User Query
"What are my documents about machine learning?"

// 2. Generate Query Embedding
const queryEmbedding = await generateEmbedding(query)
// Returns: [0.123, -0.456, 0.789, ...] (1536 dimensions)

// 3. Vector Similarity Search
const { data } = await supabase.rpc('search_chunks_vector', {
  query_embedding: queryEmbedding,
  org_id_param: orgId,
  limit_param: 50
})

// 4. Similarity Calculation (Cosine Distance)
similarity = 1 - (embedding1 <=> embedding2)
// Returns: 0.0 (no match) to 1.0 (perfect match)

// 5. Chunk Aggregation
// Group chunks by parent document
// Calculate best score per document
// Filter by threshold (default: 0.1)

// 6. Result Ranking
// - Semantic score (primary)
// - Recency boost (optional, weighted)
// - Reranking (Cohere API, optional)

// 7. Return Results
{
  "documentId": "uuid",
  "title": "ML Tutorial",
  "summary": "Introduction to machine learning...",
  "score": 0.87,
  "chunks": [
    {
      "content": "Machine learning is a subset...",
      "score": 0.92
    }
  ],
  "metadata": { "url": "...", "containerTags": [...] }
}
```

### Search Performance Optimization

**1. Multi-Path Search Strategy:**
```typescript
searchPath:
  | "rpc_vector"        // Fast: RPC function with IVFFlat index
  | "fallback_local"    // Medium: Client-side cosine similarity
  | "raw_no_scores"     // Slow: No scoring, metadata only
  | "broad_recent"      // Fallback: Recent documents
```

**2. Caching Layer:**
```typescript
// In-memory cache with 1-hour TTL
const cacheKey = `search:${orgId}:${hash(params)}`
await cache.set(cacheKey, results, { ttl: 3600 })
```

**3. Recency Boosting:**
```typescript
// Optional score adjustment for recent documents
finalScore = (alpha × semanticScore) + (beta × recencyScore)
recencyScore = exp(-ageInDays / halfLifeDays)
```

**4. Result Reranking:**
```typescript
// Cohere API for improved relevance
results = await rerankSearchResults(query, results, {
  useTitle: true,
  useSummary: true,
  useChunks: true,
  maxLength: 512
})
```

---

## Claude Agent SDK Integration

### Tool: `searchDatabase`

The AI assistant accesses the knowledge base through this MCP tool.

**Tool Definition:**
```typescript
tool(
  "searchDatabase",
  "Search documents and memories in the user's knowledge base",
  {
    query: z.string().min(1),
    limit: z.number().min(1).max(50).default(20),
    includeSummary: z.boolean().default(true),
    includeFullDocs: z.boolean().default(false),
    containerTags: z.array(z.string()).optional(),
    scopedDocumentIds: z.array(z.string()).optional()
  }
)
```

**Data Flow:**
```
User: "What documents do I have about AI?"
    ↓
Claude Agent SDK
    ↓
searchDatabase Tool
    ↓
searchDocuments() API
    ↓
Vector Search in document_chunks
    ↓
Fetch parent documents
    ↓
Return JSON to agent:
{
  "count": 15,
  "results": [
    {
      "documentId": "...",
      "title": "Introduction to AI",
      "summary": "A comprehensive guide...",
      "score": 0.91,
      "chunks": [
        { "content": "AI is...", "score": 0.95 }
      ],
      "url": "https://...",
      "metadata": {...}
    }
  ]
}
    ↓
Agent processes and presents results to user
```

**What the Agent Receives:**

| Field | Source | Purpose |
|-------|--------|---------|
| `count` | Aggregated | Total results found |
| `documentId` | `documents.id` | Unique identifier |
| `title` | `documents.title` | Display name |
| `type` | `documents.type` | Document classification |
| `summary` | `documents.summary` | AI-generated overview |
| `content` | `documents.content` | Full text (optional) |
| `score` | `document_chunks.embedding` | Relevance (0-1) |
| `chunks[]` | `document_chunks` | Matching excerpts |
| `url` | `documents.metadata.url` | Source link |
| `metadata` | `documents.metadata` | Additional context |
| `createdAt` | `documents.created_at` | Timestamp |
| `updatedAt` | `documents.updated_at` | Last modified |

---

## Ingestion Pipeline

### Document Processing Flow

```
1. Document Upload/URL
   ↓
2. Content Extraction
   - Text: Direct processing
   - PDF: Text extraction + OCR fallback
   - Images: Vision API (OCR)
   - Videos: Audio transcription
   - Web: HTML → Markdown conversion
   - GitHub: Repository clone + file extraction
   ↓
3. Document Creation
   - Store in `documents` table
   - Status: "pending"
   - Generate document-level embedding
   ↓
4. Chunking
   - Split content into 800-token chunks
   - 200-token overlap
   - Store in `document_chunks` table
   ↓
5. Embedding Generation
   - Generate embeddings for each chunk
   - Model: text-embedding-004 (1536 dimensions)
   - Parallel processing for performance
   ↓
6. Space Assignment
   - Link document to spaces via `documents_to_spaces`
   - Apply containerTags for filtering
   ↓
7. Optional: Memory Processing
   - Extract insights
   - Generate memory embeddings
   - Store in `memories` table
   ↓
8. Status Update
   - Mark document as "completed"
   - Update timestamps
```

### Embedding Generation

**Provider:** Google Gemini (configurable)
```typescript
const embedding = await generateEmbedding(text)
// Uses: models/text-embedding-004
// Returns: Float32Array of 1536 dimensions
```

**Fallback Strategy:**
```typescript
// If API fails:
// 1. Use deterministic embedding (hash-based)
// 2. Retry with exponential backoff
// 3. Mark for reprocessing
```

---

## Data Access Patterns

### 1. Search Query (Most Common)

```sql
-- Vector search with document join
SELECT
  c.id, c.content, c.document_id,
  d.title, d.summary, d.metadata,
  (1 - (c.embedding <=> $1)) AS similarity
FROM document_chunks c
JOIN documents d ON c.document_id = d.id
WHERE c.org_id = $2
  AND (1 - (c.embedding <=> $1)) >= 0.1
ORDER BY c.embedding <=> $1
LIMIT 50;
```

### 2. Document Retrieval

```sql
-- Get document with chunks
SELECT
  d.*,
  array_agg(
    json_build_object(
      'id', c.id,
      'content', c.content,
      'chunk_index', c.chunk_index
    ) ORDER BY c.chunk_index
  ) AS chunks
FROM documents d
LEFT JOIN document_chunks c ON d.id = c.document_id
WHERE d.id = $1
  AND d.org_id = $2
GROUP BY d.id;
```

### 3. Recent Documents (Fallback)

```sql
-- When no semantic matches found
SELECT *
FROM documents
WHERE org_id = $1
  AND status = 'completed'
ORDER BY created_at DESC
LIMIT 20;
```

---

## Performance Metrics

### Typical Query Performance

| Operation | Avg Time | Notes |
|-----------|----------|-------|
| Vector Search (RPC) | 50-200ms | IVFFlat index |
| Chunk Aggregation | 10-50ms | In-memory grouping |
| Reranking (Cohere) | 100-300ms | Optional, improves quality |
| Total Search | 200-500ms | End-to-end |
| Document Upload | 1-5s | Sync processing |
| Chunk Generation | 500ms-2s | Depends on size |
| Embedding (per chunk) | 100-300ms | API call |

### Database Indexes

**Vector Indexes:**
```sql
-- Chunks (primary search target)
CREATE INDEX document_chunks_embedding_idx
ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Documents (coarse search)
CREATE INDEX documents_embedding_idx
ON documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

**Metadata Indexes:**
```sql
-- Organization filtering
CREATE INDEX documents_org_id_idx ON documents(org_id);
CREATE INDEX document_chunks_org_id_idx ON document_chunks(org_id);

-- Recency sorting
CREATE INDEX documents_created_at_idx ON documents(created_at DESC);

-- Status filtering
CREATE INDEX documents_status_idx ON documents(status);
```

---

## Storage Estimates

### Data Size Projections

**Per Document (Average):**
- Raw text: 5-50 KB
- Summary: 0.5-2 KB
- Chunks (×10): 5-10 KB each
- Embeddings (×10): 6 KB each (1536 floats)
- Metadata: 1-5 KB

**Total per document:** ~100-200 KB

**Example Calculations:**
- 1,000 documents ≈ 100-200 MB
- 10,000 documents ≈ 1-2 GB
- 100,000 documents ≈ 10-20 GB

---

## Security & Privacy

### Row-Level Security (RLS)

**Current Implementation:**
- RLS enabled on `conversations`, `conversation_events`, `tool_results`
- Uses `supabaseAdmin` (service_role) for write operations
- Application-layer validation for organization/user access
- Read operations use scoped client for RLS enforcement

**Future Enhancement:**
- Implement custom RLS function for proper header-based filtering
- Migrate from service_role to ANON_KEY with proper context

### Data Isolation

**Organization-Level:**
- All queries filtered by `org_id`
- No cross-organization data access
- Separate encryption keys per organization (planned)

**User-Level:**
- User associations tracked via `user_id`
- Personal vs shared documents distinguished
- Access control via organization membership

---

## API Integration Points

### Documents API

```typescript
// Create document
POST /v3/documents
Body: {
  content: string
  title?: string
  url?: string
  type?: DocumentType
  containerTags?: string[]
  metadata?: Record<string, unknown>
}

// Search documents
POST /v3/search
Body: {
  q: string
  limit?: number
  includeSummary?: boolean
  includeFullDocs?: boolean
  containerTags?: string[]
}

// Get document
GET /v3/documents/:id
```

### Chat API

```typescript
// Chat with agent (has access to searchDatabase)
POST /chat/v2
Body: {
  messages: Message[]
  conversationId?: string
  mode?: "simple" | "agentic" | "deep"
  metadata?: {
    projectId?: string
    expandContext?: boolean
    preferredTone?: string
  }
  scopedDocumentIds?: string[]
}
```

---

## Monitoring & Observability

### Key Metrics to Track

**Search Quality:**
- Average search latency
- Cache hit rate
- Vector index performance
- Reranking effectiveness

**Ingestion Pipeline:**
- Documents processed per hour
- Failure rate by document type
- Average chunk count per document
- Embedding generation time

**Storage:**
- Total documents
- Total chunks
- Database size growth
- Index size vs data size ratio

**User Engagement:**
- Searches per user/day
- Most searched topics
- Average results per query
- Tool usage frequency (searchDatabase)

---

## Future Enhancements

### Planned Features

1. **Memory Layer Activation**
   - Enable AI-processed memory search
   - Implement memory versioning
   - Add memory relationship graphs

2. **Full-Text Search**
   - Hybrid search: vectors + FTS
   - PostgreSQL `tsvector` integration
   - Weighted ranking (semantic + lexical)

3. **Advanced Chunking**
   - Semantic chunking (paragraph-aware)
   - Multi-resolution chunks (summary, detail)
   - Overlapping context windows

4. **Multi-Modal Embeddings**
   - Image embeddings (CLIP)
   - Audio embeddings
   - Cross-modal search

5. **Real-Time Updates**
   - WebSocket-based live search
   - Streaming ingestion
   - Incremental indexing

---

## Troubleshooting

### Common Issues

**1. Slow Vector Search**
```sql
-- Check index usage
EXPLAIN ANALYZE
SELECT * FROM document_chunks
WHERE embedding <=> '[...]' < 0.5
LIMIT 10;

-- Rebuild index if needed
REINDEX INDEX document_chunks_embedding_idx;
```

**2. Poor Search Results**
- Check embedding model consistency
- Verify chunk size settings
- Adjust similarity threshold
- Enable reranking

**3. Out of Memory**
- Reduce chunk size
- Limit concurrent embeddings
- Enable result pagination
- Use streaming responses

---

## References

- **pgvector**: https://github.com/pgvector/pgvector
- **Supabase**: https://supabase.com/docs
- **Claude Agent SDK**: https://github.com/anthropics/claude-agent-sdk
- **Google Embeddings**: https://ai.google.dev/gemini-api/docs/embeddings

---

**Maintained by:** Supermemory Development Team
**Last Review:** October 2025
**Deployment:** Railway (Production)
