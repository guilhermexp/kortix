# Canvas Agent Implementation Documentation

> **Data**: 2025-11-22
> **Status**: Em debugging - shapes não aparecem no canvas
> **Branch**: main

## Visão Geral

Implementação de um agente especializado para o canvas (Infinity view) que:
1. Detecta automaticamente quando o usuário está no canvas
2. Usa um system prompt específico focado em visualizações
3. Aplica mudanças no canvas via tool `canvasApplyChanges`

---

## Arquivos Modificados/Criados

### 1. Frontend

#### `apps/web/components/canvas/canvas-agent-provider.tsx` (NOVO)
Provider React que gerencia a conexão entre o agente e o editor TLDraw.

```typescript
// Principais funções:
- setEditor(editor) - Registra o editor TLDraw
- applyChanges(payload) - Aplica mudanças no canvas
- processToolOutput(toolName, outputText) - Processa output da tool
- buildContextForAgent() - Constrói contexto do canvas para o agente
- getViewportBounds() - Retorna bounds do viewport atual
- getCanvasContext() - Retorna seleções do usuário
```

**Fluxo de dados:**
1. TldrawCanvas registra o editor via `setEditor()`
2. ChatMessages recebe tool_event do backend
3. ChatMessages chama `processToolOutput()` com o JSON
4. Provider parseia e chama `applyChanges()`
5. `applyCanvasAgentChange()` executa no editor TLDraw

#### `apps/web/components/canvas/canvas-agent-changes.ts` (ATUALIZADO)
Executor de mudanças no canvas TLDraw.

```typescript
// Operações suportadas:
- createShape - Cria shapes (note, text, geo, arrow)
- updateShape - Atualiza shapes existentes
- deleteShape - Remove shapes
- selectShapes - Seleciona shapes
- zoomToFit - Zoom para ver tudo
- zoomToArea - Zoom em área específica
- focusOnShape - Foca em shape específico
```

**Funções auxiliares:**
- `ensureShapeId()` - Garante formato correto do ID (shape:xxx)
- `prepareShapeForCreate()` - Prepara shape para API do TLDraw

#### `apps/web/components/canvas/index.ts` (ATUALIZADO)
Exporta os novos módulos:
```typescript
export { CanvasAgentProvider, useCanvasAgent, useCanvasAgentOptional } from "./canvas-agent-provider"
export { applyCanvasAgentChange, type CanvasAgentChange } from "./canvas-agent-changes"
```

#### `apps/web/components/views/chat/chat-messages.tsx` (ATUALIZADO)
Modificações no hook `useChatAPI`:

**Imports adicionados:**
```typescript
import { useCanvasAgentOptional } from "@/components/canvas/canvas-agent-provider"
import { useViewMode } from "@/lib/view-mode-context"
```

**Contexto do canvas na requisição (linha ~1625):**
```typescript
// Add canvas context when user is viewing the canvas
if (viewMode === "infinity" && canvasAgent) {
    const canvasContext = canvasAgent.buildContextForAgent()
    if (canvasContext) {
        metadata.canvasContext = canvasContext
    }
}
```

**Interceptação de tool_events (linha ~1173):**
```typescript
} else if (record.type === "tool_event") {
    applyToolEvent(record)
    const toolName = typeof record.toolName === "string" ? record.toolName : ""
    const outputText = typeof record.outputText === "string" ? record.outputText : ""
    const toolState = typeof record.state === "string" ? record.state : ""

    if (
        toolName.includes("canvasApplyChanges") &&
        toolState === "output-available" &&
        outputText &&
        canvasAgent
    ) {
        const applied = canvasAgent.processToolOutput(toolName, outputText)
    }
}
```

#### `apps/web/app/page.tsx` (ATUALIZADO)
Envolvido com CanvasAgentProvider:
```typescript
import { CanvasAgentProvider } from "@/components/canvas/canvas-agent-provider"

return (
    <CanvasAgentProvider>
        <div className="relative h-screen bg-background overflow-hidden touch-none">
            {/* ... */}
        </div>
    </CanvasAgentProvider>
)
```

#### `apps/web/components/canvas/tldraw-canvas.tsx` (ATUALIZADO)
Registra o editor no provider:
```typescript
const canvasAgent = useCanvasAgentOptional()
useEffect(() => {
    if (canvasAgent) {
        canvasAgent.setEditor(editor)
    }
}, [editor, canvasAgent])
```

#### `apps/web/lib/view-mode-context.tsx` (ATUALIZADO)
Estado inicial mudado para sempre abrir em "list":
```typescript
// Start with "list" as default for SSR and initial state
const [viewMode, setViewModeState] = useState<ViewMode>("list")

useEffect(() => {
    if (!isInitialized) {
        // Always start with "list" view
        setViewModeState("list")
        persistViewMode("list")
        setIsInitialized(true)
    }
}, [isInitialized])
```

---

### 2. Backend

#### `apps/api/src/prompts/chat.ts` (ATUALIZADO)
Adicionado `CANVAS_SYSTEM_PROMPT`:

```typescript
export const CANVAS_SYSTEM_PROMPT = `You are the Canvas Assistant, a visual organization specialist...

## Your Primary Role
You are a **visual canvas manipulation expert**...

## Your Tools

### canvasApplyChanges (PRIMARY TOOL)
This is your MAIN tool. Use it proactively when users:
- Ask for any visual organization or diagram
- Want to see something "on the canvas" or "visually"
...

### Shape Types
- **note**: Sticky notes with colored backgrounds
- **text**: Plain text labels
- **geo**: Geometric shapes (rectangle, ellipse, diamond, etc.)
- **arrow**: Connectors between shapes

## How to Respond

### When User Opens Canvas
ALWAYS greet the user with an invitation to create something visual:
- "Olá! 🎨 Estou pronto para ajudar você a criar visualizações no canvas."
...

## Guidelines
1. **Be proactive** - When user asks to "organize" or "visualize", immediately create shapes
2. **Don't just explain** - CREATE the visual, then explain what you created
...
`
```

#### `apps/api/src/routes/chat-v2.ts` (ATUALIZADO)
Modificações para suportar canvas context:

**Import:**
```typescript
import { ENHANCED_SYSTEM_PROMPT, CANVAS_SYSTEM_PROMPT } from "../prompts/chat"
```

**Tipo CanvasContextPayload:**
```typescript
type CanvasContextPayload = {
    viewport?: { x: number; y: number; w: number; h: number }
    shapesInViewport?: Array<{
        id: string
        type: string
        x: number
        y: number
        width: number
        height: number
        text?: string
    }>
    userSelections?: Array<{...}>
}
```

**Extração do canvas context (linha ~552):**
```typescript
const canvasContext = metadata.canvasContext as CanvasContextPayload | undefined
```

**Instruções dinâmicas para o canvas (linha ~597):**
```typescript
if (canvasContext) {
    instructions.push(
        "\n## CANVAS VIEW ACTIVE\nThe user is currently viewing the Infinity Canvas..."
    )

    if (canvasContext.viewport) {
        instructions.push(
            `Current viewport bounds: x=${vp.x}, y=${vp.y}, width=${vp.w}, height=${vp.h}...`
        )
    }

    if (canvasContext.shapesInViewport?.length > 0) {
        // Lista shapes visíveis
    } else {
        instructions.push(
            "The canvas is currently empty. This is a great opportunity to create new shapes..."
        )
    }
}
```

**Seleção do prompt base (linha ~653):**
```typescript
// Use canvas-specific prompt when canvas context is present
const basePrompt = canvasContext ? CANVAS_SYSTEM_PROMPT : ENHANCED_SYSTEM_PROMPT
```

#### `apps/api/src/services/claude-agent.ts` (ATUALIZADO)
Passa system prompt inline quando fornecido:

```typescript
if (systemPrompt && isNewSession) {
    queryOptions.systemPrompt = systemPrompt
    // Don't use settingSources when we have a custom prompt
    delete queryOptions.settingSources
    console.log(
        "[executeClaudeAgent] Using custom system prompt (canvas or special mode) - length:",
        systemPrompt.length, "chars"
    )
}
```

#### `apps/api/src/services/claude-agent-tools.ts` (ATUALIZADO)
Tool `canvasApplyChanges` com Zod schemas detalhados:

```typescript
tool(
    "canvasApplyChanges",
    "Planeja e descreve operações de baixo nível para o canvas TLDraw...",
    {
        changes: z.array(CanvasChangeSchema).min(1).describe("..."),
    },
    async ({ changes }) => {
        // Retorna JSON para o frontend aplicar
        return {
            content: [{
                type: "text",
                text: JSON.stringify({
                    kind: "canvasChanges",
                    changes,
                }, null, 2),
            }],
        }
    }
)
```

**Schemas definidos:**
- `NoteShapeSchema` - Sticky notes
- `TextShapeSchema` - Text labels
- `GeoShapeSchema` - Geometric shapes
- `ArrowShapeSchema` - Arrows/connectors
- `ShapeSchema` - Union de todos
- `CanvasChangeSchema` - Discriminated union das operações

---

## Fluxo de Dados Completo

```
1. Usuário abre view "Infinity" (canvas)
   ↓
2. TldrawCanvas registra editor no CanvasAgentProvider
   ↓
3. Usuário envia mensagem no chat
   ↓
4. ChatMessages detecta viewMode === "infinity"
   ↓
5. Chama canvasAgent.buildContextForAgent() para obter:
   - viewport bounds
   - shapes visíveis
   - seleções do usuário
   ↓
6. Envia para backend com metadata.canvasContext
   ↓
7. Backend detecta canvasContext e:
   - Usa CANVAS_SYSTEM_PROMPT ao invés de ENHANCED_SYSTEM_PROMPT
   - Adiciona instruções com viewport/shapes no prompt
   ↓
8. Claude Agent SDK executa e chama tool canvasApplyChanges
   ↓
9. Tool retorna JSON: { kind: "canvasChanges", changes: [...] }
   ↓
10. Backend emite tool_event com outputText contendo o JSON
    ↓
11. Frontend recebe tool_event no stream
    ↓
12. ChatMessages intercepta e verifica:
    - toolName.includes("canvasApplyChanges")
    - toolState === "output-available"
    - outputText não vazio
    - canvasAgent não null
    ↓
13. Chama canvasAgent.processToolOutput(toolName, outputText)
    ↓
14. CanvasAgentProvider parseia JSON e chama applyChanges()
    ↓
15. Para cada change, chama applyCanvasAgentChange(editor, change)
    ↓
16. Editor TLDraw cria/modifica/deleta shapes
```

---

## Debugging

### Logs adicionados

**Frontend (console do browser):**
```
[CanvasAgentProvider] Editor registered: true/false
[ChatMessages] Including canvas context in request: {...}
[ChatMessages] Canvas tool event received: {...}
[ChatMessages] Canvas tool conditions not met: {...}
[ChatMessages] Processing canvas changes from tool: ...
[CanvasAgentProvider] processToolOutput called: {...}
[CanvasAgentProvider] Parsed output: {...}
[CanvasAgentProvider] Applying N changes to canvas
[applyCanvasAgentChange] Creating shape: {...}
```

**Backend (terminal):**
```
[Chat V2] Canvas context active, added canvas instructions to prompt
[Chat V2] Using CANVAS_SYSTEM_PROMPT (canvas view active)
[executeClaudeAgent] Using custom system prompt (canvas or special mode) - length: X chars
[executeClaudeAgent] 🔧 Tool called: mcp__supermemory-tools__canvasApplyChanges with input: {...}
[Chat V2] Canvas tool_result block started: { toolName, toolUseId, initialBufferLength, initialBufferPreview }
[Chat V2] Canvas tool delta received: { deltaLength, totalBufferLength }
[Chat V2] Canvas tool_event payload: { toolName, state, hasOutputText, outputTextLength, outputTextPreview }
```

### Checklist de Debug

1. **Editor registrado?**
   - Procure: `[CanvasAgentProvider] Editor registered: true`
   - Se false: TldrawCanvas não está dentro do CanvasAgentProvider

2. **Canvas context enviado?**
   - Procure: `[ChatMessages] Including canvas context in request:`
   - Se não aparece: viewMode não é "infinity" ou canvasAgent é null

3. **Tool foi chamada?**
   - Procure no terminal: `[executeClaudeAgent] 🔧 Tool called: mcp__supermemory-tools__canvasApplyChanges`
   - Se não: O agente não decidiu usar a tool

4. **Tool_event recebido?**
   - Procure: `[ChatMessages] Canvas tool event received:`
   - Se não: Backend não está emitindo o evento corretamente

5. **Condições satisfeitas?**
   - Procure: `[ChatMessages] Canvas tool conditions not met:`
   - Mostra qual condição falhou (toolState, outputText, canvasAgent)

6. **ProcessToolOutput chamado?**
   - Procure: `[CanvasAgentProvider] processToolOutput called:`
   - Se não: Condições no ChatMessages falharam

7. **JSON parseado?**
   - Procure: `[CanvasAgentProvider] Parsed output:`
   - Se erro: outputText não é JSON válido ou não tem `kind: "canvasChanges"`

8. **Changes aplicados?**
   - Procure: `[CanvasAgentProvider] Applying N changes to canvas`
   - Se não: applyChanges() não foi chamado

---

## Problemas Conhecidos

### 1. System prompt exposto nos logs
O Claude Agent SDK CLI loga o system prompt completo quando usa `--verbose`.
**Workaround**: Em produção, removemos o flag verbose.

### 2. Shapes não aparecem (ATUAL)
O agente executa a tool e retorna o JSON, mas os shapes não aparecem no canvas.

**Possíveis causas:**
- `canvasAgent` é null no momento da interceptação do tool_event
- `outputText` está vazio no evento
- Editor não foi registrado no provider
- Provider não está envolvendo corretamente ChatMessages e TldrawCanvas

**Como investigar:**
1. Abrir DevTools do browser (F12)
2. Ir para aba Console
3. Enviar mensagem pedindo diagrama
4. Verificar logs em sequência

---

## Arquivos de Referência

### Projeto original (referência)
`/Users/guilhermevarela/Documents/Projetos/tldraw-claude-agent-temp`

### Estrutura de arquivos criados
```
apps/
├── api/
│   └── src/
│       ├── prompts/
│       │   └── chat.ts (CANVAS_SYSTEM_PROMPT)
│       ├── routes/
│       │   └── chat-v2.ts (canvas context handling)
│       └── services/
│           ├── claude-agent.ts (system prompt handling)
│           └── claude-agent-tools.ts (canvasApplyChanges tool)
└── web/
    ├── app/
    │   └── page.tsx (CanvasAgentProvider wrapper)
    ├── components/
    │   ├── canvas/
    │   │   ├── canvas-agent-provider.tsx (NEW)
    │   │   ├── canvas-agent-changes.ts
    │   │   ├── tldraw-canvas.tsx
    │   │   └── index.ts
    │   └── views/
    │       └── chat/
    │           └── chat-messages.tsx
    └── lib/
        └── view-mode-context.tsx
```

---

## Próximos Passos

1. **Debug do fluxo** - Identificar exatamente onde está falhando usando os logs
2. **Verificar Provider** - Garantir que CanvasAgentProvider envolve todos os componentes necessários
3. **Verificar timing** - O editor pode não estar pronto quando o tool_event chega
4. **Testar tool output** - Verificar se o outputText está chegando no formato correto

---

## Comandos Úteis

```bash
# Iniciar dev servers
bun dev

# Ver logs no terminal (backend)
# Procure por [Chat V2], [executeClaudeAgent], 🔧

# Ver logs no browser (frontend)
# F12 → Console → Procure por [ChatMessages], [CanvasAgentProvider]

# Limpar portas ocupadas
lsof -ti:3001 -ti:4000 | xargs kill -9
```
