# API Overview

Complete REST API documentation for Supermemory v2.0.

## Base URL

```
Development: http://localhost:4000
Production:  https://your-domain.com/api
```

## Authentication

### Session-based Auth

All authenticated endpoints require session cookie from login.

```bash
# Sign up
POST /api/auth/sign-up
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}

# Sign in
POST /api/auth/sign-in
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword"
}

# Sign out
POST /api/auth/sign-out
```

### API Key Auth

For programmatic access, use API keys:

```bash
# All requests with API key
Authorization: Bearer <your-api-key>
```

Create API keys in dashboard: Settings → API Keys

## Core Endpoints

### Documents

#### Add Text/URL Document

```bash
POST /v3/documents
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Your text content here",
  "url": "https://example.com",  # Optional
  "title": "Document Title",      # Optional
  "description": "Description",   # Optional
  "projectId": "uuid",            # Optional
  "tags": ["tag1", "tag2"]        # Optional
}

Response: {
  "id": "uuid",
  "title": "Document Title",
  "content": "...",
  "summary": "AI-generated summary",
  "status": "processing" | "completed" | "failed",
  "createdAt": "2025-10-30T..."
}
```

#### Upload File

```bash
POST /v3/documents/file
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <file>
title: "Optional title"
description: "Optional description"
projectId: "uuid"

Response: {
  "id": "uuid",
  "fileName": "document.pdf",
  "fileType": "application/pdf",
  "fileSize": 102400,
  "status": "processing",
  "url": "https://storage.supabase.co/..."
}
```

#### List Documents

```bash
GET /v3/documents?page=1&limit=50&projectId=uuid
Authorization: Bearer <token>

Response: {
  "documents": [
    {
      "id": "uuid",
      "title": "...",
      "summary": "...",
      "createdAt": "...",
      "type": "text" | "url" | "pdf" | "image" | "video" | "audio"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 50
}
```

#### Get Document

```bash
GET /v3/documents/:id
Authorization: Bearer <token>

Response: {
  "id": "uuid",
  "title": "...",
  "content": "...",
  "summary": "...",
  "metadata": {...},
  "chunks": [
    {
      "id": "uuid",
      "content": "...",
      "embedding": [...]
    }
  ]
}
```

#### Update Document

```bash
PUT /v3/documents/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Title",
  "content": "Updated content",
  "description": "Updated description",
  "tags": ["tag1", "tag2"]
}
```

#### Delete Document

```bash
DELETE /v3/documents/:id
Authorization: Bearer <token>

Response: {
  "success": true
}
```

### Search

#### Vector Search

```bash
POST /v3/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "search query",
  "limit": 10,
  "projectId": "uuid",        # Optional
  "filters": {                # Optional
    "type": ["pdf", "text"],
    "tags": ["important"],
    "dateRange": {
      "start": "2025-01-01",
      "end": "2025-12-31"
    }
  }
}

Response: {
  "results": [
    {
      "id": "uuid",
      "documentId": "uuid",
      "title": "...",
      "content": "...",
      "similarity": 0.87,
      "highlights": ["...highlighted text..."]
    }
  ],
  "total": 25,
  "took": 187  # milliseconds
}
```

#### Hybrid Search

```bash
POST /v3/search/hybrid
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "search query",
  "limit": 10,
  "useReranking": true,       # Optional (requires Cohere API key)
  "boostRecent": true,        # Optional
  "projectId": "uuid"
}

Response: {
  "results": [
    {
      "id": "uuid",
      "title": "...",
      "content": "...",
      "score": 0.92,           # Combined score
      "method": "vector" | "text" | "hybrid",
      "highlights": ["..."]
    }
  ],
  "total": 30,
  "took": 342
}
```

### Chat

#### Stream Chat (SSE)

```bash
POST /chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "What did I save about machine learning?",
  "conversationId": "uuid",   # Optional, for continuing conversation
  "mode": "agentic",          # "simple" | "agentic" | "deep"
  "projectId": "uuid"         # Optional
}

Response: text/event-stream

event: message
data: {"type": "content", "content": "Based on your memories, "}

event: message
data: {"type": "content", "content": "you saved several articles about "}

event: message
data: {"type": "tool_use", "tool": "searchDatabase", "input": {...}}

event: message
data: {"type": "tool_result", "result": [...]}

event: message
data: {"type": "content", "content": "machine learning..."}

event: done
data: {"conversationId": "uuid", "messageId": "uuid"}
```

#### Get Conversation History

```bash
GET /api/conversations/:id
Authorization: Bearer <token>

Response: {
  "id": "uuid",
  "title": "Conversation about ML",
  "createdAt": "...",
  "events": [
    {
      "type": "user",
      "content": "What did I save about ML?",
      "timestamp": "..."
    },
    {
      "type": "assistant",
      "content": "You saved...",
      "sources": [...]
    }
  ]
}
```

### Projects

#### List Projects

```bash
GET /v3/projects
Authorization: Bearer <token>

Response: {
  "projects": [
    {
      "id": "uuid",
      "name": "Work",
      "description": "...",
      "documentCount": 42,
      "createdAt": "..."
    }
  ]
}
```

#### Create Project

```bash
POST /v3/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "New Project",
  "description": "Project description",
  "isDefault": false
}
```

#### Update Project

```bash
PUT /v3/projects/:id
Authorization: Bearer <token>

{
  "name": "Updated Name",
  "description": "Updated description"
}
```

#### Delete Project

```bash
DELETE /v3/projects/:id
Authorization: Bearer <token>
```

### Canvas

#### Get Canvas Positions

```bash
GET /api/canvas/positions
Authorization: Bearer <token>

Response: {
  "positions": [
    {
      "id": "uuid",
      "documentId": "uuid",
      "x": 100,
      "y": 200
    }
  ]
}
```

#### Update Position

```bash
PUT /api/canvas/positions/:id
Authorization: Bearer <token>

{
  "x": 150,
  "y": 250
}
```

#### Bulk Update Positions

```bash
PUT /api/canvas/positions/bulk
Authorization: Bearer <token>

{
  "positions": [
    { "documentId": "uuid1", "x": 100, "y": 100 },
    { "documentId": "uuid2", "x": 200, "y": 200 }
  ]
}
```

## Rate Limiting

- **Authenticated requests**: 1000 requests per hour per user
- **Anonymous requests**: 100 requests per hour per IP
- **File uploads**: 50 MB per request, 1 GB per hour

Rate limit headers:
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1635724800
```

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional context"
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Webhooks

Configure webhooks for real-time events:

```bash
POST /api/webhooks
Authorization: Bearer <token>

{
  "url": "https://your-server.com/webhook",
  "events": ["document.created", "document.updated"],
  "secret": "your-webhook-secret"
}
```

### Webhook Events

- `document.created` - New document added
- `document.updated` - Document modified
- `document.deleted` - Document removed
- `search.performed` - Search executed
- `chat.message` - Chat message sent

## OpenAPI Spec

Full OpenAPI 3.0 specification available at:

```
GET /mcp/reference
```

Or download:
```
GET /api/openapi.json
```

## SDK Libraries

### JavaScript/TypeScript

```typescript
import { SupermemoryClient } from '@supermemory/sdk';

const client = new SupermemoryClient({
  apiKey: process.env.SUPERMEMORY_API_KEY,
  baseUrl: 'https://api.supermemory.app'
});

// Add document
const doc = await client.documents.create({
  content: 'Hello world',
  title: 'My First Doc'
});

// Search
const results = await client.search({
  query: 'hello',
  limit: 10
});

// Chat
const stream = await client.chat.stream({
  message: 'What did I save about AI?',
  mode: 'agentic'
});

for await (const chunk of stream) {
  console.log(chunk.content);
}
```

### Python (Coming Soon)

```python
from supermemory import SupermemoryClient

client = SupermemoryClient(api_key=os.env['SUPERMEMORY_API_KEY'])

# Add document
doc = client.documents.create(
    content='Hello world',
    title='My First Doc'
)

# Search
results = client.search(query='hello', limit=10)

# Chat
for chunk in client.chat.stream(message='What did I save about AI?'):
    print(chunk.content, end='')
```

## Related Documentation

- [Authentication](./AUTHENTICATION.md)
- [Search System](../architecture/SEARCH_SYSTEM.md)
- [Chat System](../architecture/CHAT_SYSTEM.md)
- [Webhooks Guide](./WEBHOOKS.md)
