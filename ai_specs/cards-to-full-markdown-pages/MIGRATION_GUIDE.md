# Migration Guide: Card UI to Full Markdown Pages

## Overview

This document guides you through migrating from the legacy card-based UI to the new full markdown pages with rich text editing.

## Timeline

- **Version 2.0 (Current)**: Both systems available, card UI is default
- **Version 2.1 (Recommended)**: New markdown pages as default with opt-in card view
- **Version 3.0 (Future)**: Card UI fully deprecated

## Migration Strategy

### For End Users

#### Automatic Migration

All existing memories will be automatically migrated to the new format. The migration happens transparently:

1. **Text Content**: Simple text memories are converted to markdown format
2. **Formatting**: Basic formatting (bold, italic) is preserved
3. **Links**: External links remain functional
4. **Media**: Images and videos continue to work

#### Manual Steps

1. **Review your memories**: Check that formatting is preserved correctly
2. **Update bookmarks**: The URL structure remains the same (`/memory/:id`)
3. **Try the new editor**: Create a new memory to experience the rich text editor

#### Rollback Option

If you encounter issues:
1. Enable "Legacy Card View" in Settings > Display
2. Report issues to support
3. Your data is safe - both views access the same underlying content

### For Developers

#### Database Migration

No database schema changes are required. The migration is primarily frontend-focused.

**Content Storage**:
- Existing `content` TEXT field stores markdown
- New `content_type` field (optional): `'markdown' | 'html' | 'text'`
- Backward compatible: old records treated as `'text'`

```sql
-- Optional enhancement (not required)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'text';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_documents_content_type ON documents(content_type);
```

#### API Backward Compatibility

All existing API endpoints continue to work:

```typescript
// Old format (still supported)
POST /v3/documents
{
  "type": "text",
  "content": "Simple text content"
}

// New format (recommended)
POST /v3/documents
{
  "type": "text",
  "content": "# Markdown Title\n\nContent with **formatting**",
  "contentType": "markdown"
}
```

#### Frontend Migration

**Option 1: Gradual Migration (Recommended)**

Keep both UIs available during transition:

```typescript
// Feature flag approach
import { useFeatureFlag } from '@/lib/feature-flags';

function MemoryView() {
  const useNewEditor = useFeatureFlag('use-markdown-editor');

  return useNewEditor ? <MarkdownMemoryView /> : <CardMemoryView />;
}
```

**Option 2: Full Migration**

Replace card components with markdown views:

```typescript
// Before
import { MemoryCard } from '@/components/memory-card';

// After
import { MemoryPage } from '@/components/memory-page';
```

#### Component Mapping

| Old Component | New Component | Notes |
|--------------|---------------|-------|
| `MemoryCard` | `MemoryPage` | Full page layout |
| `CardEditor` | `RichTextEditor` | Slate-based editor |
| `CardContent` | `MarkdownRenderer` | Renders markdown |
| `CardActions` | `MemoryActions` | Updated toolbar |

#### Hook Migration

```typescript
// Before
import { useMemoryCard } from '@/hooks/use-memory-card';

// After
import { useMemoryPage } from '@/hooks/use-memory-page';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
```

#### Content Conversion

Use the provided utilities for content conversion:

```typescript
import {
  textToEditorContent,
  editorContentToText,
  editorContentToMarkdown,
} from '@/lib/editor/content-conversion';

// Convert plain text to editor format
const editorContent = textToEditorContent(memory.content);

// Convert editor content back to text/markdown
const text = editorContentToText(editorContent);
const markdown = editorContentToMarkdown(editorContent);
```

## Testing Your Migration

### Unit Tests

```bash
# Run content conversion tests
bun test lib/editor/content-conversion.test.ts

# Run all editor tests
bun test --grep "editor"
```

### Manual Testing Checklist

- [ ] Create a new memory with rich formatting
- [ ] Edit an existing memory
- [ ] Verify markdown rendering
- [ ] Test image/video embedding
- [ ] Check mobile responsiveness
- [ ] Verify search functionality
- [ ] Test export features

### Performance Testing

Monitor these metrics post-migration:

- Page load time: Should remain < 2s
- Time to interactive: Target < 3s
- Memory footprint: No significant increase
- Search performance: No degradation

## Common Issues & Solutions

### Issue: Content Rendering Incorrectly

**Symptom**: Markdown not rendering, showing raw syntax

**Solution**:
```typescript
// Ensure content type is set correctly
const contentType = memory.contentType || 'text';

// Use appropriate renderer
{contentType === 'markdown' ? (
  <MarkdownRenderer content={content} />
) : (
  <TextRenderer content={content} />
)}
```

### Issue: Lost Formatting on Save

**Symptom**: Bold/italic formatting disappears after saving

**Solution**:
```typescript
// Ensure you're converting to markdown, not plain text
const markdown = editorContentToMarkdown(editorState);

// Save with correct content type
await saveMemory({
  content: markdown,
  contentType: 'markdown'
});
```

### Issue: Performance Degradation

**Symptom**: Slow rendering with large documents

**Solution**:
```typescript
// Implement virtualization for large content
import { useVirtualization } from '@tanstack/react-virtual';

// Or lazy load content
import { lazy, Suspense } from 'react';
const MarkdownRenderer = lazy(() => import('@/components/markdown-renderer'));
```

## Rollback Procedure

If you need to rollback to the card UI:

### For Users

1. Go to Settings > Display
2. Enable "Use Legacy Card View"
3. Refresh the page

### For Administrators

```bash
# Revert to previous version
git checkout v2.0.0

# Or use feature flag
# Set ENABLE_MARKDOWN_EDITOR=false in environment
```

### Database Rollback

No database changes to rollback. Content remains compatible with both UIs.

## Support

- **Documentation**: [/docs/features/markdown-editor](link)
- **Issues**: [GitHub Issues](https://github.com/Dhravya/supermemory/issues)
- **Community**: [Discord](link)

## Timeline & Milestones

- ✅ **v2.0.0** - Initial release with both UIs
- 🔄 **v2.1.0** - Markdown editor as default (Q2 2025)
- 📅 **v2.5.0** - Deprecation notice for card UI (Q3 2025)
- 📅 **v3.0.0** - Card UI removed (Q4 2025)

## Feedback

We value your feedback during this migration:

- Report issues: [GitHub Issues](link)
- Feature requests: [Discussions](link)
- General feedback: support@supermemory.ai
