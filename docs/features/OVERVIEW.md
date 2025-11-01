# Features Overview

Complete guide to all Supermemory v2.0 features.

## Core Features

### 🎨 [Infinity Canvas](./INFINITY_CANVAS.md)
Visual, spatial organization of memories with drag-and-drop.

**Key Capabilities:**
- Drag-and-drop card positioning
- Zoom (25%-200%) and pan controls
- Visual clustering of related content
- Persistent positions saved to database
- Touch-optimized for mobile

**Use Cases:**
- Project organization by visual proximity
- Knowledge mapping and relationships
- Quick overview of all memories
- Spatial learning and memory palace techniques

---

### 📝 [Rich Text Editor](./RICH_TEXT_EDITOR.md)
Advanced WYSIWYG markdown editor with full formatting.

**Key Capabilities:**
- Block-based editing (20,000+ lines of code)
- Inline formatting (bold, italic, links, colors)
- Tables, images, videos, code blocks
- Drag-and-drop block reordering
- Markdown and HTML export
- Command menu (Cmd+K) for quick actions
- Keyboard shortcuts for power users

**Use Cases:**
- Writing detailed notes and documentation
- Creating structured content
- Rich formatting for better readability
- Image galleries and media embedding

---

### 🎯 [Memory Editor](./MEMORY_EDITOR.md)
Full-featured editing experience for memories.

**Key Capabilities:**
- Rich editor integration
- Auto-save (every 2 seconds)
- Offline support with IndexedDB
- Form validation
- Performance monitoring
- Unsaved changes warning
- Error boundaries for stability

**Use Cases:**
- Editing existing memories
- Long-form writing
- Offline editing during travel
- Distraction-free writing

---

### 🤖 Claude Agent SDK Integration
Advanced AI chat with tool use and streaming.

**Key Capabilities:**
- Claude 3.5 Sonnet integration
- Custom `searchDatabase` tool via MCP
- Streaming responses with SSE
- Conversation history preservation
- Three chat modes (simple, agentic, deep)
- Tool execution tracking

**Use Cases:**
- Intelligent search across knowledge base
- Multi-turn conversations with context
- Ask questions about stored memories
- AI-powered content analysis

See: [Claude Agent Documentation](./CLAUDE_AGENT.md)

---

## Content Management

### Multi-Modal Ingestion
Support for diverse content types:

- **Text** - Direct text input, copy-paste
- **URLs** - Web page scraping and extraction
- **PDFs** - Text extraction with OCR fallback
- **Images** - Vision API for OCR and description
- **Audio** - Transcription with Whisper
- **Video** - Audio extraction and transcription
- **Code** - Syntax-aware processing
- **GitHub Repos** - Clone and ingest entire repositories

### Document Processing Pipeline

```
Input → Extraction → Summary → Chunking → Embedding → Index → Search
```

**Steps:**
1. **Extraction** - Content pulled from source
2. **Summary** - AI-generated overview
3. **Chunking** - Split into 800-token chunks with 200-token overlap
4. **Embedding** - Generate 1536-dim vectors with Gemini
5. **Indexing** - Store in pgvector with IVFFlat index
6. **Search** - Vector similarity + hybrid search ready

---

## Search System

### Vector Search
Semantic search using embeddings and cosine similarity.

**Features:**
- pgvector IVFFlat index for speed
- 1536-dimensional embeddings
- Cosine similarity scoring
- Sub-second query latency (50-200ms)
- Fallback strategies for reliability

### Hybrid Search
Combined vector + text search with reranking.

**Features:**
- Vector search results
- Full-text search results
- Result deduplication
- Cohere reranking for relevance
- Recency boosting
- Metadata filtering
- Caching layer (1-hour TTL)

**Performance:**
- Total time: 200-500ms end-to-end
- Vector search: 50-200ms
- Reranking: +100-300ms (optional)
- Cache hit: <50ms

See: [Search System Architecture](../architecture/SEARCH_SYSTEM.md)

---

## Integrations

### OAuth Connections
Connect external data sources:

- **Google Drive** - Import documents and files
- **Notion** - Sync pages and databases
- **OneDrive** - Microsoft file integration
- **Slack** - Message history (planned)
- **Discord** - Server content (planned)

### Browser Extension
Quick save from any webpage:

- Save current page with one click
- Highlight and save text selections
- Screenshot capture
- Tags and project assignment
- Keyboard shortcuts

### API Access
Programmatic access to your memory:

- RESTful API with OpenAPI spec
- API key authentication
- Rate limiting per user
- Webhook support for events
- GraphQL API (planned)

---

## Organization

### Projects
Organize memories into projects:

- Create unlimited projects
- Assign memories to projects
- Project-specific search
- Shared projects (multi-user)
- Project templates

### Tags
Flexible tagging system:

- Custom tags for categorization
- Tag autocomplete
- Tag-based filtering
- Tag cloud visualization
- Hierarchical tags (planned)

### Collections
Curated memory collections:

- Smart collections (auto-updated)
- Manual collections
- Collection sharing
- Nested collections
- Collection templates

---

## Collaboration (Planned)

### Team Workspaces
Collaborate with others:

- [ ] Shared workspaces
- [ ] Real-time collaboration on canvas
- [ ] Commenting and annotations
- [ ] Permissions and roles
- [ ] Activity feed

### Sharing
Share memories externally:

- [ ] Public links with optional password
- [ ] Embed codes for websites
- [ ] Export to various formats
- [ ] Social media integration

---

## AI Features

### Summarization
AI-generated summaries:

- Document-level summaries
- Multi-paragraph documents
- Configurable length
- Multi-language support

### Analysis
Content analysis and insights:

- Topic extraction
- Entity recognition
- Sentiment analysis
- Key phrase extraction
- Relationship discovery

### Chat Modes
Three levels of AI interaction:

**Simple Mode** (6 turns)
- Quick Q&A
- Fast responses
- Limited context

**Agentic Mode** (10 turns)
- Tool use enabled
- Knowledge base search
- Multi-step reasoning

**Deep Mode** (12 turns)
- Extended conversations
- Complex analysis
- Maximum context

---

## Performance

### Optimizations
System-wide performance improvements:

- **Canvas** - GPU acceleration, 60 FPS rendering
- **Editor** - Virtualization, lazy loading
- **Search** - Caching, parallel queries
- **Images** - Lazy loading, optimization
- **Database** - Connection pooling, prepared statements

### Metrics

| Feature | Performance |
|---------|-------------|
| Canvas render (100 cards) | <100ms |
| Editor typing | <16ms (60 FPS) |
| Vector search | 50-200ms |
| Chat first token | 500ms-1s |
| Auto-save | 2s debounced |
| Image upload | Progressive |

---

## Security

### Authentication
Secure user authentication:

- Session-based auth with secure cookies
- Scrypt password hashing
- API key authentication
- OAuth 2.0 for integrations
- 2FA (planned)

### Authorization
Fine-grained access control:

- Row-level security (RLS) on all tables
- Organization-based isolation
- User role permissions
- API key scopes

### Data Protection
Your data is protected:

- End-to-end encryption (planned)
- Regular backups
- Data export tools
- Right to deletion (GDPR)

---

## Mobile Support

### Responsive Design
Works on all screen sizes:

- Mobile-optimized UI
- Touch gestures
- Responsive canvas
- Mobile keyboard support

### Progressive Web App (PWA)
Install as mobile app:

- [ ] Offline support
- [ ] Push notifications
- [ ] Home screen icon
- [ ] Native feel

### Native Apps (Planned)
- [ ] iOS app
- [ ] Android app
- [ ] Sync across devices

---

## Customization

### Themes
Personalize your experience:

- Light and dark themes
- Custom color schemes (planned)
- Font customization (planned)
- Layout preferences

### Settings
Configurable options:

- Default project
- Auto-save interval
- Search preferences
- Notification settings
- Keyboard shortcuts

---

## Related Documentation

- [System Architecture](../architecture/SYSTEM_ARCHITECTURE.md)
- [API Reference](../api/OVERVIEW.md)
- [Deployment Guide](../deployment/RAILWAY.md)
- [Contributing](../development/CONTRIBUTING.md)
