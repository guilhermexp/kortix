# Design Document: Infinity Canvas

## Overview

O Infinity Canvas é uma funcionalidade que permite aos usuários selecionar documentos específicos de um projeto (space) e organizá-los em um canvas infinito, onde cada documento se torna um card arrastável. O chat responderá exclusivamente com base nos documentos presentes no canvas, criando um escopo de conversa dinâmico e isolado por projeto.

## Architecture Design

### System Architecture Diagram

```mermaid
graph TB
    A[User Interface] --> B[Infinity Canvas Component]
    B --> C[Document Selector Modal]
    B --> D[Canvas with Draggable Cards]
    B --> E[Canvas Store]
    
    C --> F[Document List API]
    F --> G[Project Filter]
    
    D --> H[Card Component]
    D --> I[Drag & Drop System]
    
    E --> J[Scoped Document IDs]
    J --> K[Chat API]
    
    L[Project Store] --> E
    L --> G
    
    M[Memory Graph] --> D
    N[Chat Component] --> K
    
    O[Database Layer] --> F
    O --> P[Document Chunks Search]
    O --> Q[Memory Search]
```

### Data Flow Diagram

```mermaid
graph LR
    A[User clicks Infinity] --> B[Show empty canvas]
    B --> C[User clicks Add Documents]
    C --> D[Open Document Selector]
    D --> E[Query documents table]
    E --> F[Filter by org_id and space_id]
    F --> G[User selects documents]
    G --> H[Add cards to canvas]
    H --> I[Update scoped document IDs]
    I --> J[Chat uses scoped context]
    
    K[User drags card] --> L[Update card position]
    M[User removes card] --> N[Remove from scope]
    N --> O[Update chat context]
    
    P[Project change] --> Q[Clear canvas]
    Q --> R[Reset scope]
```

## Component Design

### InfinityCanvas Component
- **Responsibilities**: 
  - Renderizar o canvas vazio ou com cards
  - Gerenciar o estado do seletor de documentos
  - Coordenar a comunicação entre sub-componentes
- **Interfaces**: 
  - `onAddDocuments(documentIds: string[])`
  - `onRemoveDocument(documentId: string)`
  - `onCardPositionChange(documentId: string, x: number, y: number)`
- **Dependencies**: CanvasStore, DocumentSelector, DraggableCard, MemoryGraph

### DocumentSelector Component
- **Responsibilities**:
  - Exibir lista paginada de documentos do projeto atual
  - Suportar multi-seleção via checkboxes
  - Reutilizar componentes visuais da MemoryListView
- **Interfaces**:
  - `onSelectionChange(selectedIds: string[])`
  - `onConfirm(selectedIds: string[])`
  - `onCancel()`
- **Dependencies**: MemoryListView components, useProject hook, Supabase client

### DraggableCard Component
- **Responsibilities**:
  - Renderizar preview do documento
  - Implementar drag & drop
  - Manter estado de posição
- **Interfaces**:
  - `onPositionChange(x: number, y: number)`
  - `onRemove()`
  - `document: DocumentWithMemories`
- **Dependencies**: @dnd-kit, existing card components

## Data Model

### Canvas State Management

```typescript
interface CanvasState {
  // Document IDs placed on canvas
  placedDocumentIds: string[]
  // Document IDs currently scoped for chat
  scopedDocumentIds: string[]
  // Card positions {documentId: {x, y}}
  cardPositions: Record<string, {x: number, y: number}>
  
  // Actions
  setPlacedDocumentIds: (ids: string[]) => void
  addPlacedDocuments: (ids: string[]) => void
  removePlacedDocument: (id: string) => void
  clearCanvas: () => void
  setScopedDocumentIds: (ids: string[]) => void
  updateCardPosition: (id: string, x: number, y: number) => void
}
```

### Enhanced Chat Request Schema

```typescript
interface ChatRequest {
  messages: Message[]
  // New field for scoped document IDs
  scopedDocumentIds?: string[]
  projectId: string  // space_id from spaces table
  orgId: string      // org_id from organizations table
  metadata?: Record<string, any>
}
```

### Database Integration Points

#### Document Query Pattern
```typescript
// Query documents for selector (filtered by space/project)
const getDocumentsForSelector = async (orgId: string, spaceId: string) => {
  const { data } = await supabase
    .from("documents")
    .select(`
      id,
      custom_id,
      title,
      summary,
      url,
      type,
      status,
      created_at,
      updated_at,
      token_count,
      word_count,
      og_image,
      document_chunks(count)
    `)
    .eq("org_id", orgId)  // Mandatory org isolation
    .eq("status", "done")   // Only processed documents
    .order("updated_at", { ascending: false })
  
  return data
}
```

#### Scoped Search Pattern
```typescript
// Search only within scoped documents
const searchScopedDocuments = async (
  orgId: string, 
  scopedDocumentIds: string[], 
  query: string
) => {
  const { data } = await supabase
    .from("document_chunks")
    .select(`
      id,
      content,
      position,
      document_id,
      documents!inner(
        id,
        title,
        custom_id,
        org_id
      )
    `)
    .eq("org_id", orgId)
    .in("document_id", scopedDocumentIds)  // Scope restriction
    .textSearch("fts", query)  // Full-text search
    .order("created_at", { ascending: false })
  
  return data
}
```

## Business Process

### Process 1: Opening Infinity Canvas

```mermaid
flowchart TD
    A[User clicks Infinity button] --> B[Switch to graphEmpty view]
    B --> C[Initialize InfinityCanvas component]
    C --> D[Load canvas state from store]
    D --> E[Check for existing scoped documents]
    E --> F{Has scoped documents?}
    F -->|Yes| G[Query documents by IDs]
    G --> H[Render cards from stored positions]
    F -->|No| I[Render empty canvas with Add button]
    H --> J[Show canvas with cards]
    I --> J
```

### Process 2: Adding Documents to Canvas

```mermaid
flowchart TD
    A[User clicks Add Documents] --> B[Open DocumentSelector modal]
    B --> C[Query documents table]
    C --> D[Filter by org_id and space_id]
    D --> E[Render paginated document list]
    E --> F[User selects documents]
    F --> G[User confirms selection]
    G --> H[Add selected IDs to canvas store]
    H --> I[Create draggable cards]
    I --> J[Position cards in grid layout]
    J --> K[Update scoped document IDs]
    K --> L[Close selector modal]
```

### Process 3: Chat with Scoped Documents

```mermaid
flowchart TD
    A[User sends chat message] --> B[Check canvas state]
    B --> C{Has scoped documents?}
    C -->|Yes| D[Include scopedDocumentIds in request]
    C -->|No| E[Send request without scope]
    D --> F[Search document_chunks with document_id IN scopedIds]
    E --> G[Search all project document_chunks]
    F --> H[Generate response from scoped context]
    G --> I[Generate response from full context]
    H --> J[Display response]
    I --> J
```

### Process 4: Project Switching

```mermaid
flowchart TD
    A[User switches project] --> B[ProjectStore updates space_id]
    B --> C[Clear canvas store]
    C --> D[Clear scoped document IDs]
    E[DocumentSelector updates space filter]
    F[Chat context resets to new project]
    G[Canvas renders empty for new project]
    D --> E
    E --> F
    F --> G
```

## Database Schema Considerations

### Current Schema Utilization
- **documents table**: Primary source for document metadata
- **document_chunks table**: Used for scoped search functionality
- **spaces table**: Represents projects (space_id = project_id)
- **memories table**: Could be extended for canvas-specific metadata

### No Schema Changes Required
The current schema supports the Infinity Canvas functionality without modifications:

1. **Document Selection**: Uses existing `documents` table with `org_id` and `space_id` filtering
2. **Scoped Search**: Leverages `document_chunks` table with `document_id` filtering
3. **Project Isolation**: Uses existing `spaces` table and multi-tenancy patterns
4. **Chat Scoping**: Extends existing chat API with document ID filtering

### Optional Future Extensions
If persistence of canvas state is needed, could add:
```sql
-- Optional: canvas_states table for persistent canvas layouts
CREATE TABLE canvas_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  document_ids uuid[] NOT NULL DEFAULT '{}',
  card_positions jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, space_id, user_id)
);
```

## Error Handling Strategy

### Canvas State Management
- **Error**: Falha ao carregar estado do canvas
- **Recovery**: Iniciar com estado limpo, logar erro para debug
- **User Feedback**: Toast message informando sobre reset do canvas

### Document Loading
- **Error**: Falha ao carregar lista de documentos
- **Recovery**: Retry automático com exponential backoff
- **User Feedback**: Skeleton loading + error message com retry

### Database Query Errors
- **Error**: Falha em query com scopedDocumentIds
- **Recovery**: Fallback para busca sem escopo, logar erro
- **User Feedback**: Notificação sobre escopo temporariamente desabilitado

### Chat Scoping
- **Error**: Documentos no escopo não encontrados
- **Recovery**: Remover IDs inválidos do escopo automaticamente
- **User Feedback**: Notificação sutil sobre documentos removidos

### Drag & Drop
- **Error**: Falha ao salvar posição do card
- **Recovery**: Manter posição em memória, retry em background
- **User Feedback**: Nenhum (silent retry)

## Integration Points

### Database Integration
- **Document Queries**: Filter by `org_id` and `space_id` following multi-tenancy
- **Scoped Search**: Use `document_chunks` with `document_id IN (...)` filtering
- **Chat API**: Extend existing `/chat` endpoint with document scoping
- **No Schema Changes**: Leverage existing tables and relationships

### MemoryGraph Integration
- Reutilizar componentes existentes do MemoryGraph
- Aproveitar sistema de zoom/pan do canvas
- Manter consistência visual com graph mode

### Chat Integration
- Modificar API endpoint `/chat` para aceitar `scopedDocumentIds`
- Atualizar frontend para passar escopo do canvas
- Manter backward compatibility (sem escopo = comportamento atual)

### Project Store Integration
- Usar `useProject()` para filtrar documentos por `space_id`
- Limpar canvas automaticamente ao trocar projeto
- Isolar estado por projeto no CanvasStore

## Performance Considerations

### Database Optimization
- **Scoped Queries**: Use `IN` clause with indexed `document_id` field
- **Chunk Search**: Leverage existing `fts` (full-text search) vector
- **Query Patterns**: Follow established multi-tenancy filtering patterns

### Canvas Rendering
- Virtualização para grandes números de cards
- Lazy loading de conteúdo dos cards
- Debounce de posições durante drag

### State Management
- Persistir apenas IDs e posições essenciais
- Evitar re-renders desnecessários
- Usar React.memo para componentes pesados

### API Optimization
- Batch requests para múltiplos documentos
- Cache de resultados de busca por escopo
- Streaming de respostas do chat mantidas

## Testing Strategy

### Unit Tests
- CanvasStore actions e estado
- Component rendering com diferentes estados
- Drag & drop interactions
- Database query patterns

### Integration Tests
- Fluxo completo de seleção e adição de documentos
- Chat com escopo vs sem escopo
- Troca de projeto e isolamento de estado
- Database query filtering by org_id and space_id

### E2E Tests
- User journey completo: adicionar documentos → conversar → trocar projeto
- Performance com grande número de cards
- Mobile responsiveness e touch interactions
- Multi-tenancy isolation verification