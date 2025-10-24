# Developer Documentation: Markdown Editor Implementation

## Architecture Overview

The markdown editor implementation consists of several key layers:

1. **Editor Core**: Slate.js-based rich text editor
2. **Content Conversion**: Utilities for format transformation
3. **State Management**: React hooks and context
4. **API Layer**: REST endpoints for CRUD operations
5. **Storage Layer**: PostgreSQL with markdown content

## Project Structure

```
apps/web/
├── components/
│   ├── memory-page/           # Full-page memory view
│   ├── editor/                # Editor components
│   │   ├── toolbar.tsx
│   │   ├── formatting.tsx
│   │   └── index.tsx
│   └── ui/
│       └── rich-editor/       # Reusable editor UI
├── lib/
│   └── editor/
│       ├── content-conversion.ts    # Format converters
│       └── content-conversion.test.ts
├── hooks/
│   ├── use-unsaved-changes.ts      # Unsaved changes detection
│   └── use-memory-page.ts          # Memory page logic
└── stores/
    └── editor.ts               # Editor state management

apps/api/
└── src/
    └── routes/
        └── v3/
            └── documents.ts    # Memory API endpoints
```

## Core Components

### 1. Memory Page Component

**Location**: `apps/web/app/memory/[id]/page.tsx`

The main component that renders a full-page memory view with editing capabilities.

```typescript
import { MemoryPage } from '@/components/memory-page';

export default async function MemoryPageRoute({ params }: { params: { id: string } }) {
  const memory = await getMemory(params.id);

  return <MemoryPage memory={memory} />;
}
```

**Props**:
```typescript
interface MemoryPageProps {
  memory: Memory;
  isEditing?: boolean;
  onSave?: (content: string) => Promise<void>;
  onCancel?: () => void;
}
```

### 2. Rich Text Editor

**Location**: `apps/web/components/editor/index.tsx`

Slate.js-based editor with markdown support.

```typescript
import { RichTextEditor } from '@/components/editor';

function MyEditor() {
  const [value, setValue] = useState<Descendant[]>([]);

  return (
    <RichTextEditor
      value={value}
      onChange={setValue}
      placeholder="Start typing..."
    />
  );
}
```

**Features**:
- Markdown shortcuts
- Formatting toolbar
- Image/video embedding
- Syntax highlighting (code blocks)
- Auto-save support
- Collaborative editing ready

### 3. Content Conversion Utilities

**Location**: `apps/web/lib/editor/content-conversion.ts`

Utilities for converting between formats:

```typescript
import {
  textToEditorContent,
  editorContentToText,
  editorContentToMarkdown,
  isContentEmpty,
} from '@/lib/editor/content-conversion';

// Convert plain text to editor format
const editorContent = textToEditorContent("Hello **world**");

// Convert editor content to markdown
const markdown = editorContentToMarkdown(editorContent);

// Convert editor content to plain text
const text = editorContentToText(editorContent);

// Check if content is empty
const isEmpty = isContentEmpty(content);
```

**Type Definitions**:
```typescript
interface ContainerNode {
  id: string;
  type: 'container';
  attributes?: NodeAttributes;
  children: EditorNode[];
}

interface TextNode {
  id: string;
  type: NodeType;
  content?: string;
  children?: InlineText[];
  attributes?: NodeAttributes;
}

interface InlineText {
  content: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  href?: string;
  className?: string;
}
```

### 4. Unsaved Changes Hook

**Location**: `apps/web/hooks/use-unsaved-changes.ts`

Detects and warns about unsaved changes:

```typescript
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';

function Editor() {
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');

  const hasChanges = content !== savedContent;

  const { confirmNavigation } = useUnsavedChanges({
    hasUnsavedChanges: hasChanges,
    message: 'You have unsaved changes. Leave anyway?',
  });

  const handleNavigate = () => {
    if (confirmNavigation()) {
      router.push('/somewhere');
    }
  };

  return (
    // ...
  );
}
```

## API Integration

### Endpoints

#### Get Memory
```http
GET /v3/documents/:id
Authorization: Bearer <token>
```

**Response**:
```json
{
  "id": "123",
  "title": "My Memory",
  "content": "# Title\n\nContent here",
  "contentType": "markdown",
  "createdAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-02T00:00:00Z"
}
```

#### Create Memory
```http
POST /v3/documents
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "text",
  "content": "# My Note\n\nContent",
  "contentType": "markdown",
  "spaceId": "space-123"
}
```

#### Update Memory
```http
PATCH /v3/documents/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "# Updated Title\n\nNew content",
  "contentType": "markdown"
}
```

#### Delete Memory
```http
DELETE /v3/documents/:id
Authorization: Bearer <token>
```

### API Client

**Location**: `packages/lib/api.ts`

```typescript
import { api } from '@repo/lib/api';

// Get memory
const memory = await api.documents.get(memoryId);

// Create memory
const newMemory = await api.documents.create({
  type: 'text',
  content: markdown,
  contentType: 'markdown',
  spaceId: currentSpace.id,
});

// Update memory
await api.documents.update(memoryId, {
  content: updatedMarkdown,
});

// Delete memory
await api.documents.delete(memoryId);
```

## State Management

### React Query Integration

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@repo/lib/api';

function useMemory(id: string) {
  return useQuery({
    queryKey: ['memory', id],
    queryFn: () => api.documents.get(id),
  });
}

function useUpdateMemory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.documents.update(id, { content }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['memory', id] });
    },
  });
}
```

### Zustand Store

**Location**: `apps/web/stores/editor.ts`

```typescript
import { create } from 'zustand';

interface EditorStore {
  isEditing: boolean;
  isDirty: boolean;
  content: string;
  setEditing: (editing: boolean) => void;
  setContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  isEditing: false,
  isDirty: false,
  content: '',
  setEditing: (editing) => set({ isEditing: editing }),
  setContent: (content) => set({ content, isDirty: true }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  reset: () => set({ isEditing: false, isDirty: false, content: '' }),
}));
```

## Testing

### Unit Tests

**Location**: `apps/web/lib/editor/content-conversion.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { textToEditorContent, editorContentToText } from './content-conversion';

describe('content-conversion', () => {
  it('should convert text to editor format', () => {
    const text = 'Hello World';
    const result = textToEditorContent(text);

    expect(result.children).toHaveLength(1);
    expect(result.children[0].children[0].content).toBe('Hello World');
  });

  it('should preserve formatting in round-trip', () => {
    const original = 'First\n\nSecond';
    const editor = textToEditorContent(original);
    const result = editorContentToText(editor);

    expect(result).toBe('First\nSecond');
  });
});
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test lib/editor/content-conversion.test.ts

# Run with coverage
bun test --coverage

# Run in watch mode
bun test --watch
```

### Test Configuration

**Location**: `apps/web/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    css: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

## Performance Optimization

### Code Splitting

```typescript
// Lazy load heavy components
import { lazy, Suspense } from 'react';

const RichTextEditor = lazy(() => import('@/components/editor'));

function MemoryPage() {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <RichTextEditor />
    </Suspense>
  );
}
```

### Memoization

```typescript
import { memo, useMemo } from 'react';

const MemoryCard = memo(({ memory }: { memory: Memory }) => {
  const formattedDate = useMemo(
    () => formatDate(memory.createdAt),
    [memory.createdAt]
  );

  return (
    <div>
      <h3>{memory.title}</h3>
      <time>{formattedDate}</time>
    </div>
  );
});
```

### Virtualization

For large lists of memories:

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function MemoryList({ memories }: { memories: Memory[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: memories.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
          >
            <MemoryCard memory={memories[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Security Considerations

### Content Sanitization

Always sanitize user-generated content:

```typescript
import DOMPurify from 'isomorphic-dompurify';

function sanitizeMarkdown(markdown: string): string {
  // Remove potentially dangerous HTML
  return DOMPurify.sanitize(markdown, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'code', 'pre', 'h1', 'h2', 'h3', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'class'],
  });
}
```

### XSS Prevention

```typescript
// Use react-markdown for safe rendering
import ReactMarkdown from 'react-markdown';

function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        // Customize rendering
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
```

### Authentication

All API requests require authentication:

```typescript
// API client automatically includes auth header
import { api } from '@repo/lib/api';

// Requests are authenticated via session cookie
const memory = await api.documents.get(id);
```

## Deployment

### Build Process

```bash
# Build for production
bun run build

# Preview production build
bun run start

# Run linting
bun run lint

# Run type checking
bun run check-types
```

### Environment Variables

**Required**:
```bash
NEXT_PUBLIC_BACKEND_URL=https://api.supermemory.ai
NEXT_PUBLIC_APP_URL=https://supermemory.ai
```

**Optional**:
```bash
NEXT_PUBLIC_ENABLE_MARKDOWN_EDITOR=true
NEXT_PUBLIC_ANALYTICS_ID=your-analytics-id
```

### Docker Deployment

```dockerfile
FROM oven/bun:1 as builder

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["bun", "start"]
```

## Troubleshooting

### Common Issues

#### Editor not loading
```typescript
// Check if Slate.js is initialized
console.log('Editor state:', editor);

// Ensure initial value is valid
const initialValue = useMemo(() => [
  {
    type: 'paragraph',
    children: [{ text: '' }],
  },
], []);
```

#### Content not saving
```typescript
// Add error handling
try {
  await api.documents.update(id, { content });
} catch (error) {
  console.error('Save failed:', error);
  // Show user-friendly error message
  toast.error('Failed to save. Please try again.');
}
```

#### Performance issues
```typescript
// Debounce auto-save
import { useDebouncedCallback } from 'use-debounce';

const debouncedSave = useDebouncedCallback(
  (content) => {
    api.documents.update(id, { content });
  },
  1000 // Save after 1 second of inactivity
);
```

## Contributing

### Code Style

- Use TypeScript for all new code
- Follow the existing naming conventions
- Write tests for new features
- Use Biome for formatting and linting

### Pull Request Process

1. Create feature branch from `main`
2. Implement changes with tests
3. Run `bun run format-lint`
4. Submit PR with clear description
5. Wait for code review

### Commit Messages

Follow conventional commits:

```
feat: add markdown table support
fix: resolve editor crash on empty content
docs: update API documentation
test: add unit tests for content conversion
refactor: simplify editor state management
```

## Resources

- [Slate.js Documentation](https://docs.slatejs.org/)
- [React Query Documentation](https://tanstack.com/query/latest)
- [Next.js Documentation](https://nextjs.org/docs)
- [Markdown Specification](https://spec.commonmark.org/)
- [Project Repository](https://github.com/Dhravya/supermemory)

---

*Last updated: January 2025*
*Version: 2.0.0*
