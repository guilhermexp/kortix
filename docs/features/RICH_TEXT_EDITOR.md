# Rich Text Editor

Advanced WYSIWYG markdown editor with full formatting capabilities, drag-and-drop, and inline editing.

## Overview

The Rich Text Editor is a powerful, block-based editing system that provides a seamless writing experience similar to Notion, Google Docs, and modern content editors. Built from scratch with React and TypeScript, it offers 20,000+ lines of carefully crafted editor code.

## Features

### Text Formatting

**Inline Styles**
- **Bold** (`Cmd+B`)
- *Italic* (`Cmd+I`)
- <u>Underline</u> (`Cmd+U`)
- ~~Strikethrough~~ (`Cmd+Shift+X`)
- `Inline code` (`Cmd+E`)
- [Links](#) (`Cmd+K`)
- Text color and background color
- Font size (10px - 72px)

**Block Types**
- Paragraphs
- Headers (H1-H6)
- Quotes
- Code blocks with syntax highlighting
- Ordered lists
- Unordered lists
- Checklists (todo items)

### Rich Content

**Media**
- Image upload (drag-and-drop, paste, file picker)
- Image galleries with multiple images
- Video embedding (YouTube, Vimeo)
- Video upload
- Image optimization and lazy loading

**Tables**
- Table builder with visual interface
- Markdown table import/export
- Add/remove rows and columns
- Merge and split cells
- Header rows
- Cell formatting

**Layout**
- Flex containers for image grouping
- Multi-column layouts
- Nested blocks
- Block indentation

### Editing Experience

**Block Operations**
- Drag-and-drop reordering
- Copy/paste blocks
- Duplicate blocks
- Delete blocks
- Merge blocks
- Split blocks

**Keyboard Shortcuts**
```
Text Formatting:
  Cmd+B          - Bold
  Cmd+I          - Italic
  Cmd+U          - Underline
  Cmd+Shift+X    - Strikethrough
  Cmd+E          - Inline code
  Cmd+K          - Insert link

Block Operations:
  Enter          - New block
  Shift+Enter    - Soft break (in code blocks)
  Backspace      - Merge with previous
  Tab            - Indent
  Shift+Tab      - Outdent
  Cmd+Z          - Undo
  Cmd+Shift+Z    - Redo

Quick Actions:
  Cmd+K          - Command menu
  /              - Quick commands
  Cmd+D          - Duplicate block
```

**Command Menu**
- Quick search for commands
- Insert blocks by type
- Apply formatting
- Keyboard-first interface

**Context Menu**
- Right-click on blocks
- Quick actions
- Style customization

## Architecture

### Component Structure

```
apps/web/components/ui/rich-editor/
├── editor.tsx                      # Main editor component
├── block.tsx                       # Block component
├── editor-toolbar.tsx              # Floating toolbar
├── command-menu.tsx                # Quick command palette
├── block-context-menu.tsx          # Right-click menu
├── add-block-button.tsx            # Add new block
│
├── context/
│   └── editor-context.tsx          # Editor state context
│
├── reducer/
│   ├── editor-reducer.ts           # State reducer
│   └── actions.ts                  # Action creators
│
├── handlers/
│   ├── keyboard-handlers.ts        # Keyboard events
│   ├── drag-drop-handlers.ts       # Drag-and-drop
│   ├── selection-handlers.ts       # Text selection
│   ├── file-upload-handlers.ts     # File uploads
│   ├── node-operation-handlers.ts  # Block operations
│   ├── image-selection-handlers.ts # Image selection
│   └── flex-container-handlers.ts  # Layout containers
│
├── utils/
│   ├── editor-helpers.ts           # Helper functions
│   ├── inline-formatting.ts        # Inline styles
│   ├── tree-operations.ts          # Block tree ops
│   ├── image-upload.ts             # Image processing
│   ├── serialize-to-html.ts        # HTML export
│   ├── markdown-table-parser.ts    # Table parsing
│   └── drag-auto-scroll.ts         # Auto-scroll on drag
│
├── types.ts                        # TypeScript types
├── tailwind-classes.ts             # Tailwind utilities
├── class-mappings.ts               # CSS class mappings
└── demo-content.ts                 # Demo/example content
```

### State Management

```typescript
interface EditorState {
  // Document structure
  blocks: BlockNode[];        // Tree of blocks
  selectedBlockId: string | null;
  focusedBlockId: string | null;

  // Selection state
  selectionStart: SelectionPoint | null;
  selectionEnd: SelectionPoint | null;

  // UI state
  commandMenuOpen: boolean;
  contextMenuOpen: boolean;
  toolbarVisible: boolean;

  // History
  history: EditorState[];
  historyIndex: number;

  // Flags
  isDragging: boolean;
  isSelecting: boolean;
}

interface BlockNode {
  id: string;
  type: BlockType;
  content: string;
  children: BlockNode[];
  styles: InlineStyles[];
  metadata: Record<string, any>;
}
```

### Block Types

```typescript
type BlockType =
  | 'paragraph'
  | 'heading1' | 'heading2' | 'heading3'
  | 'heading4' | 'heading5' | 'heading6'
  | 'quote'
  | 'code'
  | 'orderedList'
  | 'unorderedList'
  | 'checkList'
  | 'image'
  | 'video'
  | 'table'
  | 'flexContainer';
```

## Implementation

### Basic Usage

```tsx
import { RichEditor } from '@/components/ui/rich-editor';

export default function MyEditor() {
  const [content, setContent] = useState(initialContent);

  return (
    <RichEditor
      initialContent={content}
      onChange={setContent}
      placeholder="Start writing..."
      readOnly={false}
    />
  );
}
```

### With Auto-Save

```tsx
import { RichEditor } from '@/components/ui/rich-editor';
import { useAutoSave } from '@/components/editor/auto-save-service';

export default function MyEditor() {
  const [content, setContent] = useState(initialContent);
  const { saveStatus } = useAutoSave(content, saveFunction);

  return (
    <div>
      <div className="text-sm text-gray-500">
        {saveStatus}
      </div>
      <RichEditor
        initialContent={content}
        onChange={setContent}
      />
    </div>
  );
}
```

### Custom Toolbar

```tsx
<RichEditor
  initialContent={content}
  onChange={setContent}
  toolbarConfig={{
    showBoldButton: true,
    showItalicButton: true,
    showUnderlineButton: true,
    showLinkButton: true,
    showImageButton: true,
    showTableButton: true,
    customButtons: [
      {
        icon: <CustomIcon />,
        label: 'Custom Action',
        onClick: handleCustomAction,
      },
    ],
  }}
/>
```

## Content Format

### JSON Structure

```json
{
  "blocks": [
    {
      "id": "block-1",
      "type": "heading1",
      "content": "Welcome to Supermemory",
      "children": [],
      "styles": [],
      "metadata": {}
    },
    {
      "id": "block-2",
      "type": "paragraph",
      "content": "This is a rich text editor with formatting.",
      "children": [],
      "styles": [
        { "start": 10, "end": 25, "type": "bold" },
        { "start": 31, "end": 41, "type": "italic" }
      ],
      "metadata": {}
    },
    {
      "id": "block-3",
      "type": "image",
      "content": "https://example.com/image.jpg",
      "children": [],
      "styles": [],
      "metadata": {
        "alt": "Example image",
        "width": 800,
        "height": 600
      }
    }
  ]
}
```

### Markdown Export

```typescript
import { serializeToMarkdown } from '@/components/ui/rich-editor';

const markdown = serializeToMarkdown(editorState.blocks);
```

### HTML Export

```typescript
import { serializeToHTML } from '@/components/ui/rich-editor';

const html = serializeToHTML(editorState.blocks);
```

## Advanced Features

### Custom Block Types

```typescript
// Register custom block type
registerBlockType('callout', {
  render: (block) => (
    <div className="callout">
      {block.content}
    </div>
  ),
  serialize: (block) => {
    return `> **Note**: ${block.content}`;
  },
});
```

### Plugins

```typescript
// Add custom plugin
const myPlugin = {
  name: 'myPlugin',
  onKeyDown: (event, state, dispatch) => {
    // Handle key press
  },
  onPaste: (event, state, dispatch) => {
    // Handle paste
  },
  decorateBlock: (block) => {
    // Add decorations
  },
};

<RichEditor plugins={[myPlugin]} />
```

### Collaborative Editing (Future)

```typescript
// Planned: Operational Transform or CRDT-based sync
const editor = useCollaborativeEditor({
  documentId: 'doc-123',
  userId: 'user-456',
  websocketUrl: 'wss://api.supermemory.app/collab',
});
```

## Performance

### Optimization Strategies

1. **Virtualization** - Only render visible blocks
2. **Memoization** - React.memo on block components
3. **Lazy Loading** - Code-split large features
4. **Debouncing** - Batch state updates
5. **RAF Scheduling** - Smooth drag animations
6. **Image Lazy Loading** - Load images on viewport entry

### Benchmarks

| Operation | Performance |
|-----------|-------------|
| Initial render (100 blocks) | <500ms |
| Typing responsiveness | <16ms (60 FPS) |
| Block drag | 60 FPS continuous |
| Image upload | Progressive loading |
| Command menu search | <50ms |
| Save to JSON | <100ms |
| HTML export | <200ms |

## Browser Support

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support
- **Mobile browsers**: Touch-optimized

## Accessibility

- ✅ **ARIA labels** on all interactive elements
- ✅ **Keyboard navigation** for all features
- ✅ **Screen reader** compatibility
- ✅ **Focus management** proper tab order
- ✅ **Color contrast** WCAG AA compliant
- ✅ **Reduced motion** respects user preferences

## Troubleshooting

### Common Issues

**Toolbar not showing**
- Check if text is selected
- Verify toolbar is not hidden behind other elements
- Check z-index styles

**Drag-and-drop not working**
- Ensure dragging by block handle, not content
- Check if drag handlers are attached
- Verify browser permissions

**Images not uploading**
- Check file size limits (10MB default)
- Verify upload endpoint is configured
- Check network tab for errors
- Ensure correct MIME types

**Paste not formatting correctly**
- Check if HTML paste is enabled
- Verify content sanitization settings
- Try paste as plain text (Cmd+Shift+V)

## Integration Examples

### With Memory Editor

```tsx
// apps/web/components/editor/memory-edit-client.tsx
import { RichEditor } from '@/components/ui/rich-editor';
import { useAutoSave } from './auto-save-service';

export function MemoryEditClient({ memoryId, initialContent }) {
  const [content, setContent] = useState(initialContent);
  const { saveStatus } = useAutoSave(content, async (data) => {
    await updateMemory(memoryId, data);
  });

  return (
    <div className="memory-editor">
      <div className="save-status">{saveStatus}</div>
      <RichEditor
        initialContent={content}
        onChange={setContent}
      />
    </div>
  );
}
```

### With Form Validation

```tsx
import { RichEditor } from '@/components/ui/rich-editor';
import { z } from 'zod';

const schema = z.object({
  content: z.object({
    blocks: z.array(z.any()).min(1, 'Content required'),
  }),
});

export function ValidatedEditor() {
  const { register, handleSubmit } = useForm({
    resolver: zodResolver(schema),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <RichEditor {...register('content')} />
      <button type="submit">Save</button>
    </form>
  );
}
```

## API Reference

See component props and methods in:
- [Editor Component](../../apps/web/components/ui/rich-editor/editor.tsx)
- [Type Definitions](../../apps/web/components/ui/rich-editor/types.ts)
- [Actions API](../../apps/web/components/ui/rich-editor/reducer/actions.ts)

## Related Documentation

- [Memory Editor](./MEMORY_EDITOR.md)
- [Content Conversion](../../apps/web/lib/editor/content-conversion.md)
- [Auto-Save Service](../../apps/web/components/editor/auto-save-service.ts)
- [Form Validation](../../apps/web/components/editor/form-validation.ts)

## Future Enhancements

- [ ] Collaborative editing with OT/CRDT
- [ ] Comments and annotations
- [ ] Version history with diffs
- [ ] AI writing assistant
- [ ] Voice input
- [ ] Math equation support (LaTeX)
- [ ] Diagrams (Mermaid, Excalidraw)
- [ ] PDF export
- [ ] Template system
- [ ] Macros and shortcuts
