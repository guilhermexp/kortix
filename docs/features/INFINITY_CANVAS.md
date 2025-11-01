# Infinity Canvas

Visual, spatial organization system for memories with drag-and-drop interaction.

## Overview

The Infinity Canvas is a revolutionary feature that allows users to organize their memories visually in a 2D space. Instead of a traditional list view, memories appear as draggable cards on an infinite canvas that can be zoomed and panned.

## Features

### Core Capabilities

- **Drag-and-Drop Positioning** - Move cards freely across the canvas
- **Zoom Controls** - Scale from 25% to 200% for overview or detailed view
- **Pan Navigation** - Click and drag to navigate the canvas
- **Visual Clustering** - Group related memories spatially
- **Persistent Positions** - Card positions saved to database
- **Smooth Animations** - 60 FPS rendering with CSS transforms
- **Touch Support** - Full mobile and tablet support

### User Interface

- **Floating Controls**
  - Zoom in/out buttons
  - Reset zoom button
  - Add document button
  - Minimap (future feature)

- **Document Selector Modal**
  - Search existing documents
  - Filter by type and project
  - Bulk add to canvas

- **Card Components**
  - Document preview with icon
  - Title and description
  - Timestamp and metadata
  - Quick actions menu

## Architecture

### Components

```
apps/web/components/canvas/
├── infinity-canvas.tsx          # Main canvas component
├── draggable-card.tsx          # Individual memory card
├── document-card.tsx           # Document display component
├── document-selector-modal.tsx # Add documents modal
└── index.ts                    # Exports
```

### State Management

```typescript
// apps/web/stores/canvas.ts
interface CanvasState {
  // Canvas state
  zoom: number;
  offset: { x: number; y: number };

  // Card positions
  cardPositions: Map<string, { x: number; y: number }>;

  // Actions
  setZoom: (zoom: number) => void;
  setOffset: (offset: { x: number; y: number }) => void;
  updateCardPosition: (id: string, x: number, y: number) => void;
  loadPositions: () => Promise<void>;
  savePositions: () => Promise<void>;
}
```

### Database Schema

```sql
-- Stores card positions on canvas
CREATE TABLE canvas_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  org_id UUID NOT NULL REFERENCES organizations(id),
  document_id UUID NOT NULL REFERENCES documents(id),
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, document_id)
);

-- RLS Policies
ALTER TABLE canvas_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own positions" ON canvas_positions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own positions" ON canvas_positions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own positions" ON canvas_positions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own positions" ON canvas_positions
  FOR DELETE USING (user_id = auth.uid());
```

## Implementation

### Basic Usage

```tsx
import { InfinityCanvas } from '@/components/canvas';

export default function HomePage() {
  return (
    <div className="h-screen">
      <InfinityCanvas documents={documents} />
    </div>
  );
}
```

### Canvas Controls

```tsx
// Zoom controls
const handleZoomIn = () => {
  setZoom(Math.min(zoom + 0.25, 2.0)); // Max 200%
};

const handleZoomOut = () => {
  setZoom(Math.max(zoom - 0.25, 0.25)); // Min 25%
};

const handleResetZoom = () => {
  setZoom(1.0);
  setOffset({ x: 0, y: 0 });
};

// Mouse wheel zoom
const handleWheel = (e: WheelEvent) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(Math.max(0.25, Math.min(2.0, zoom + delta)));
  }
};
```

### Drag and Drop

```tsx
// Card drag handling
const handleDragStart = (e: React.DragEvent, cardId: string) => {
  setDraggingId(cardId);
  e.dataTransfer.effectAllowed = 'move';
};

const handleDrag = (e: React.DragEvent) => {
  if (e.clientX === 0 && e.clientY === 0) return; // Ignore end event

  const canvasRect = canvasRef.current?.getBoundingClientRect();
  if (!canvasRect) return;

  const x = (e.clientX - canvasRect.left - offset.x) / zoom;
  const y = (e.clientY - canvasRect.top - offset.y) / zoom;

  updateCardPosition(draggingId, x, y);
};

const handleDragEnd = () => {
  setDraggingId(null);
  savePositions(); // Persist to database
};
```

### Pan Navigation

```tsx
// Canvas pan handling
const handleMouseDown = (e: React.MouseEvent) => {
  if (e.target === canvasRef.current) {
    setIsPanning(true);
    setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  }
};

const handleMouseMove = (e: React.MouseEvent) => {
  if (isPanning) {
    setOffset({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y,
    });
  }
};

const handleMouseUp = () => {
  setIsPanning(false);
};
```

## Performance

### Optimization Techniques

1. **CSS Transforms** - Use `transform: translate3d()` for GPU acceleration
2. **Virtualization** - Only render cards in viewport (future enhancement)
3. **Debounced Saves** - Batch position updates to reduce DB writes
4. **Memoization** - React.memo on card components
5. **RAF for Drag** - Use requestAnimationFrame for smooth dragging

### Benchmarks

| Operation | Performance |
|-----------|-------------|
| Initial render | <500ms for 100 cards |
| Drag update | 60 FPS (16ms per frame) |
| Zoom animation | Smooth at all levels |
| Pan navigation | 60 FPS continuous |
| Save positions | <200ms (debounced) |

## User Guide

### Adding Documents to Canvas

1. Click the "+" button in canvas controls
2. Search or filter documents
3. Select documents to add
4. They appear at default position (center)
5. Drag to desired location

### Organizing Memories

**Spatial Clustering**
- Group related documents by proximity
- Create visual zones (work, personal, projects)
- Use distance to indicate relationship strength

**Zoom Levels**
- **25-50%** - Overview of all memories
- **75-100%** - Normal working view
- **150-200%** - Detailed view for reading

**Pan Navigation**
- Click and drag background to move around
- Use minimap for quick jumps (future feature)

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl` + Mouse Wheel | Zoom in/out |
| `Space` + Drag | Pan canvas |
| `Cmd/Ctrl` + `0` | Reset zoom |
| `Cmd/Ctrl` + `+` | Zoom in |
| `Cmd/Ctrl` + `-` | Zoom out |

## API

### Endpoints

```typescript
// Get canvas positions for user
GET /api/canvas/positions
Response: {
  positions: Array<{
    id: string;
    documentId: string;
    x: number;
    y: number;
  }>;
}

// Update card position
PUT /api/canvas/positions/:id
Body: {
  x: number;
  y: number;
}

// Bulk update positions
PUT /api/canvas/positions/bulk
Body: {
  positions: Array<{
    documentId: string;
    x: number;
    y: number;
  }>;
}

// Remove card from canvas
DELETE /api/canvas/positions/:id
```

## Future Enhancements

### Planned Features

- [ ] **Minimap** - Small overview map in corner
- [ ] **Connection Lines** - Draw relationships between cards
- [ ] **Card Grouping** - Select and move multiple cards
- [ ] **Auto-Layout** - Automatic spatial organization algorithms
- [ ] **Themes** - Custom canvas backgrounds and card styles
- [ ] **Collaboration** - Real-time multi-user editing
- [ ] **History** - Undo/redo for card movements
- [ ] **Snapshots** - Save and restore canvas layouts
- [ ] **Search on Canvas** - Highlight matching cards
- [ ] **Card Linking** - Explicit connections with labels

### Performance Improvements

- [ ] Canvas virtualization for 1000+ cards
- [ ] Web Workers for position calculations
- [ ] IndexedDB caching for offline support
- [ ] WebGL rendering for advanced effects

## Troubleshooting

### Common Issues

**Cards not dragging smoothly**
- Check browser performance
- Reduce number of visible cards
- Disable browser extensions
- Try different zoom level

**Positions not saving**
- Check network connection
- Verify authentication status
- Check browser console for errors
- Ensure RLS policies are correct

**Canvas scrolls instead of pans**
- Ensure clicking on background, not cards
- Check if pan mode is enabled
- Verify mouse event handlers

**Zoom not working**
- Try keyboard shortcuts instead
- Check browser zoom level (should be 100%)
- Verify Cmd/Ctrl key is pressed with wheel

## Related Documentation

- [System Architecture](../architecture/SYSTEM_ARCHITECTURE.md)
- [Memory Editor](./MEMORY_EDITOR.md)
- [Database Schema](../migrations/DATABASE.md)
- [API Reference](../api/OVERVIEW.md)

## Implementation Details

See specification documents:
- [Requirements](../../Spec/infinity-canvas/requirements.md)
- [Design](../../Spec/infinity-canvas/design.md)
- [Tasks](../../Spec/infinity-canvas/tasks.md)
- [Implementation Summary](../../Spec/INFINITY_CANVAS_IMPLEMENTATION.md)
