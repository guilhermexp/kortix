# RELATÓRIO TÉCNICO: INTEGRAÇÃO DO CLAUDE AI AGENT COM TLDRAW

## Análise Completa da Arquitetura

**Data do Relatório**: 22 de Novembro de 2025
**Repositório Analisado**: `/Users/guilhermevarela/Documents/Projetos/tldraw-claude-agent-temp`
**Branch**: `max/add-claude-agent`
**Versão SDK**: @tldraw/ai v3.15.1

---

## 1. VISÃO GERAL DA ARQUITETURA

A integração do Claude AI (ou qualquer IA) com tldraw segue um padrão bem estruturado de transformação de dados em camadas. O sistema é composto por **três camadas principais**:

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (React)                           │
│  - Tldraw Editor + useTldrawAi Hook                         │
│  - Transforms (SimpleIds, ShapeDescriptions, etc)           │
└────────────────┬────────────────────────────────────────────┘
                 │ TLAiSerializedPrompt (JSON)
                 │ Viewport, Canvas Content, Screenshot
                 │
                 ↓
┌─────────────────────────────────────────────────────────────┐
│           WORKER (Cloudflare Workers)                       │
│  - TldrawAiDurableObject                                    │
│  - Routes: /generate, /stream                               │
└────────────────┬────────────────────────────────────────────┘
                 │ Simplified Prompt (ISimpleEvent schema)
                 │
                 ↓
┌─────────────────────────────────────────────────────────────┐
│          AI SERVICE (OpenAI/Claude/Gemini)                  │
│  - System Prompt Engineering                                │
│  - Model: gpt-4o-2024-08-06 (ou equivalente)                │
│  - Response: Structured JSON (events)                       │
└────────────────┬────────────────────────────────────────────┘
                 │ TLAiChange[] (mutations)
                 │
                 ↓
┌─────────────────────────────────────────────────────────────┐
│          CLIENT (React)                                     │
│  - Apply Changes to Editor State                            │
│  - Update Canvas                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. ESTRUTURA DE ARQUIVOS PRINCIPAIS

### Pacote Core: `/packages/ai`

**Responsabilidade**: Exportar APIs públicas e gerenciar o módulo de IA no tldraw.

```
packages/ai/
├── src/
│   ├── index.ts                        # Ponto de entrada (exportações públicas)
│   ├── lib/
│   │   ├── types.ts                    # Definições de tipos (TLAiPrompt, TLAiChange, etc)
│   │   ├── TldrawAiModule.ts           # Gerenciador central de IA
│   │   ├── useTldrawAi.ts              # Hook React para integração
│   │   ├── TldrawAiTransform.ts        # Classe abstrata para transformações
│   │   ├── utils.ts                    # Utilitários (asMessage)
│   │   └── test/ai.test.ts             # Testes
│   └── index.ts
└── package.json                        # @tldraw/ai ^18.2.0 React
```

### Template/Exemplo: `/templates/ai`

**Responsabilidade**: Implementação completa de exemplo usando OpenAI.

```
templates/ai/
├── worker/
│   ├── worker.ts                       # Entry point Cloudflare Worker
│   ├── types.ts                        # Environment vars interface
│   ├── TldrawAiBaseService.ts          # Abstract base service
│   ├── routes/
│   │   ├── generate.ts                 # Rota POST /generate
│   │   └── stream.ts                   # Rota POST /stream
│   └── do/
│       ├── TldrawAiDurableObject.ts    # Durable Object principal
│       ├── openai/
│       │   ├── OpenAiService.ts        # Implementação OpenAI
│       │   ├── system-prompt.ts        # Prompt do sistema
│       │   ├── schema.ts               # Zod schemas para validação
│       │   ├── prompt.ts               # Construção de mensagens
│       │   ├── generate.ts             # Generate (one-off)
│       │   ├── stream.ts               # Stream (eventos em tempo real)
│       │   ├── conversions.ts          # Mapeamento de tipos
│       │   ├── getSimpleContentFromCanvasContent.ts  # Simplificação
│       │   ├── getTldrawAiChangesFromSimpleEvents.ts # Conversão reversa
│       │   └── README.md               # Documentação técnica
│       └── custom/
│           └── CustomProviderService.ts # Template para providers custom
├── client/
│   ├── App.tsx                         # UI principal
│   ├── useTldrawAiExample.ts           # Hook configurado com opções
│   ├── transforms/
│   │   ├── SimpleIds.ts                # Transforma IDs (long → short)
│   │   ├── ShapeDescriptions.ts        # Adiciona descrições ao meta
│   │   └── SimpleCoordinates.ts        # Normaliza coordenadas
│   ├── utils.ts                        # Utilitários cliente
│   └── main.tsx / index.css
├── wrangler.toml                       # Configuração Cloudflare
├── package.json                        # Dependências
├── vite.config.ts                      # Build config
└── README.md
```

---

## 3. TIPOS DE DADOS E INTERFACES

### TLAiPrompt (Enviado do Cliente)

```typescript
interface TLAiPrompt {
  message: string | TLAiMessage[]           // Mensagem do usuário
  image?: string                             // Screenshot em base64
  canvasContent: TLAiContent                 // Shapes + Bindings
  contextBounds: Box                         // Viewport do usuário
  promptBounds: Box                          // Área onde criar mudanças
  meta?: any                                 // Dados adicionais
}

interface TLAiMessage {
  type: 'text' | 'image'
  text?: string
  src?: string
}

interface TLAiContent {
  shapes: TLShape[]                          // Array de formas
  bindings: TLBinding[]                      // Conexões entre formas
  assets: TLAsset[]                          // Mídia/ativos
}
```

### TLAiChange (Retornado pela IA)

```typescript
type TLAiChange =
  | TLAiCreateShapeChange
  | TLAiUpdateShapeChange
  | TLAiDeleteShapeChange
  | TLAiCreateBindingChange
  | TLAiUpdateBindingChange
  | TLAiDeleteBindingChange

interface TLAiCreateShapeChange {
  type: 'createShape'
  description: string                        // Por que criar?
  shape: TLShapePartial                      // Dados da forma
}

interface TLAiUpdateShapeChange {
  type: 'updateShape'
  description: string
  shape: TLShapePartial
}

interface TLAiDeleteShapeChange {
  type: 'deleteShape'
  description: string
  shapeId: TLShapeId
}

interface TLAiCreateBindingChange {
  type: 'createBinding'
  description: string
  binding: TLBindingCreate
}
```

### ISimpleEvent (Schema Interno para IA)

```typescript
type ISimpleEvent =
  | ISimpleThinkEvent
  | ISimpleCreateEvent
  | ISimpleDeleteEvent
  | ISimpleMoveEvent

interface ISimpleCreateEvent {
  type: 'create' | 'update'
  shape: ISimpleShape
  intent: string
}

type ISimpleShape =
  | ISimpleRectangleShape
  | ISimpleEllipseShape
  | ISimpleTextShape
  | ISimpleArrowShape
  | ISimpleNoteShape
  | ISimpleLineShape
  | ISimpleCloudShape
  | ISimpleUnknownShape

interface ISimpleRectangleShape {
  type: 'rectangle'
  shapeId: string                            // ID simplificado (ex: "0", "1")
  note: string                               // Descrição/propósito
  x: number
  y: number
  width: number
  height: number
  color?: ISimpleColor
  fill?: ISimpleFill
  text?: string | { type: string; content: any[] }
}
```

---

## 4. FLUXO DE DADOS DETALHADO

### Passo 1: Usuário Entra com Prompt

```typescript
// client/App.tsx
const { promise, cancel } = ai.prompt({
  message: "Draw a snowman",
  stream: true  // Streaming de eventos em tempo real
})
```

### Passo 2: Coleta de Contexto (TldrawAiModule.getPrompt)

```typescript
// packages/ai/src/lib/TldrawAiModule.ts
async getPrompt(prompt: TLAiMessages) {
  // 1. Coleta conteúdo do canvas dentro do viewport
  const content = this.getContent(promptBounds)

  // 2. Gera screenshot em base64
  const image = await this.getImage(content)

  // 3. Retorna TLAiPrompt estruturado
  return {
    message: asMessage(prompt),
    canvasContent: content,
    contextBounds: roundBox(contextBounds),
    promptBounds: roundBox(promptBounds),
    image
  }
}
```

### Passo 3: Aplicação de Transforms (Client-side)

Antes de enviar ao servidor, três transforms são aplicados **em série**:

#### A. SimpleIds
Converte IDs complexos em números simples para reduzir tamanho do prompt:
```
Antes: shape.id = "shape:LQqrLV59Z6LVTQ9g3FnGd"
Depois: shape.id = "0"

Mantém maps internos para converter de volta no response
```

#### B. ShapeDescriptions
Adiciona descrições ao campo `meta` de formas criadas:
```typescript
// Transforma description em meta.description
if (description) {
  shape.meta = { ...shape.meta, description }
}
```

#### C. SimpleCoordinates
Normaliza coordenadas relativas ao viewport para reduzir magnitude dos números:
```
Antes: x=5000, y=3000 (em coordenadas absolutas da canvas)
Depois: x=100, y=50 (relativo ao contextBounds.x/y)
```

### Passo 4: Serialização e Envio ao Worker

```typescript
// templates/ai/client/useTldrawAiExample.ts
const serializedPrompt: TLAiSerializedPrompt = {
  ...prompt,
  promptBounds: prompt.promptBounds.toJson(),
  contextBounds: prompt.contextBounds.toJson()
}

// POST request ao backend
const res = await fetch('/stream', {
  method: 'POST',
  body: JSON.stringify(serializedPrompt),
  headers: { 'Content-Type': 'application/json' }
})
```

### Passo 5: Processamento no Worker

```typescript
// templates/ai/worker/do/TldrawAiDurableObject.ts
private async stream(request: Request): Promise<Response> {
  const prompt = await request.json() as TLAiSerializedPrompt

  // Delega ao OpenAiService
  for await (const change of this.service.stream(prompt)) {
    // Envia cada mudança ao cliente como Server-Sent Event
    const data = `data: ${JSON.stringify(change)}\n\n`
    await writer.write(encoder.encode(data))
  }
}
```

### Passo 6: Chamada ao Modelo OpenAI

```typescript
// templates/ai/worker/do/openai/stream.ts
export async function* streamEvents(model: OpenAI, prompt: TLAiSerializedPrompt) {
  const stream = model.beta.chat.completions.stream({
    model: 'gpt-4o-2024-08-06',
    messages: buildPromptMessages(prompt),
    response_format: RESPONSE_FORMAT  // JSON Schema Zod
  })

  // Parse incremental JSON chunks com best-effort-json-parser
  for await (const chunk of stream) {
    const json = parse(accumulatedText)
    // Yield eventos validados conforme ficam prontos
    if (SimpleEvent.parse(part)) {
      yield part
    }
  }
}
```

### Passo 7: Construção das Mensagens para a IA

```typescript
// templates/ai/worker/do/openai/prompt.ts
function buildPromptMessages(prompt: TLAiSerializedPrompt) {
  return [
    buildSystemPrompt(prompt),      // OPENAI_SYSTEM_PROMPT (135 linhas)
    buildDeveloperMessage(prompt),  // Contexto + canvas simplificado
    buildUserMessages(prompt)       // Mensagem do usuário + screenshot
  ]
}
```

**Exemplo de Developer Message**:
```
The user's current viewport is: { x: 0, y: 0, width: 1000, height: 500 }

Here are all of the shapes that are in the user's current viewport:
[
  { shapeId: "0", type: "rectangle", x: 100, y: 100, width: 200, height: 100, ... },
  { shapeId: "1", type: "text", x: 350, y: 150, text: "Hello" }
]
```

### Passo 8: Conversão de Eventos para Mudanças

```typescript
// templates/ai/worker/do/openai/getTldrawAiChangesFromSimpleEvents.ts
export function getTldrawAiChangesFromSimpleEvents(
  prompt: TLAiSerializedPrompt,
  event: ISimpleEvent
): TLAiChange[] {
  switch (event.type) {
    case 'create': {
      const shape = event.shape
      switch (shape.type) {
        case 'rectangle':
          // Cria TLAiCreateShapeChange com tipo 'geo'
          return [{
            type: 'createShape',
            description: shape.note,
            shape: {
              id: originalId,
              type: 'geo',
              x: shape.x, y: shape.y,
              props: {
                geo: 'rectangle',
                w: shape.width,
                h: shape.height,
                color: shape.color ?? 'black',
                fill: simpleFillToShapeFill(shape.fill ?? 'none'),
                richText: toRichTextIfNeeded(shape.text ?? '')
              }
            }
          }]
        case 'arrow':
          // Cria shape + 2 bindings (start e end)
          return [
            { type: 'createShape', ... },
            { type: 'createBinding', ... },
            { type: 'createBinding', ... }
          ]
      }
    }
    case 'delete':
      return [{ type: 'deleteShape', shapeId }]
    case 'move':
      return [{ type: 'updateShape', shape: { id, x, y } }]
    case 'think':
      return [] // Ignorado
  }
}
```

### Passo 9: Streaming de Volta ao Cliente

```typescript
// Client streaming loop
for await (const change of streamFn({ prompt, signal })) {
  editor.run(() => {
    handleChange(change)
  }, { history: 'record' })
}
```

### Passo 10: Aplicação Reversa de Transforms

Os transforms são aplicados em **ordem reversa** para "desfazer" as transformações:

```typescript
// SimpleIds: "0" → "shape:LQqrLV59Z6LVTQ9g3FnGd"
// ShapeDescriptions: move meta.description para description
// SimpleCoordinates: x=100 → x=5000 (adiciona offset)
```

### Passo 11: Aplicação ao Editor

```typescript
applyChange(change: TLAiChange) {
  switch (change.type) {
    case 'createShape':
      editor.createShape(change.shape)
    case 'updateShape':
      editor.updateShape(change.shape)
    case 'deleteShape':
      editor.deleteShape(change.shapeId)
    case 'createBinding':
      editor.createBinding(change.binding)
    // ... etc
  }
}
```

---

## 5. SYSTEM PROMPT DETALHADO

O prompt do sistema (135 linhas) instrui o modelo a:

### Responsabilidades Principais:
1. **Atuar como assistente de desenho/diagramação**
2. **Responder com JSON estruturado** usando schema predefinido
3. **Entender estrutura de formas**: retângulo, elipse, texto, nota, linha, seta
4. **Gerar eventos estruturados**: `think`, `create`, `update`, `move`, `label`, `delete`
5. **Manter IDs únicos** consistentes através de eventos relacionados

### Regras de Ouro:
- Sempre retornar JSON válido
- Descrever estratégia em `long_description_of_strategy`
- Colocar mudanças dentro do viewport do usuário
- Usar `note` para documentar propósito de formas
- Coordenadas: (0,0) = canto superior-esquerdo, x cresce para direita, y para baixo
- Formas geométricas padrão: 100x100 (ou maiores se tiverem texto)
- Notas padrão: 200x200
- Texto: 32pt altura, ~12px por caractere

### Exemplo de Resposta da IA:

```json
{
  "long_description_of_strategy": "I will create a snowman using three circles stacked vertically...",
  "events": [
    {
      "type": "create",
      "intent": "Creating bottom circle of snowman",
      "shape": {
        "type": "ellipse",
        "shapeId": "new-1",
        "note": "Bottom circle - largest part of snowman",
        "x": 400,
        "y": 300,
        "width": 150,
        "height": 150,
        "color": "light-blue",
        "fill": "solid"
      }
    },
    {
      "type": "create",
      "intent": "Creating middle circle of snowman",
      "shape": {
        "type": "ellipse",
        "shapeId": "new-2",
        "note": "Middle circle",
        "x": 425,
        "y": 200,
        "width": 100,
        "height": 100,
        "color": "light-blue",
        "fill": "solid"
      }
    }
  ]
}
```

---

## 6. CAPACIDADES DO AGENTE

### Tipos de Formas Suportadas

| Tipo Simples | Tipo tldraw | Descrição |
|--------------|-------------|-----------|
| rectangle | geo | Retângulo |
| ellipse | geo | Elipse/Círculo |
| text | text | Texto livre |
| note | note | Post-it (sticky note) |
| arrow | arrow | Seta com bindings |
| line | line | Linha simples |
| cloud | geo | Forma de nuvem |

### Ações Disponíveis

| Evento | Descrição |
|--------|-----------|
| `think` | Pensamento interno (não gera mudança) |
| `create` | Criar nova forma |
| `update` | Atualizar forma existente |
| `move` | Mover forma para nova posição |
| `delete` | Remover forma |

### Propriedades de Estilo

**Cores disponíveis**:
- black, grey, light-violet, violet, blue, light-blue, yellow, orange, green, light-green, light-red, red, white

**Preenchimentos**:
- none, semi, solid, pattern

---

## 7. TRANSFORMS (OTIMIZAÇÕES)

### Por que usar Transforms?

1. **Reduzir tokens** - IDs curtos economizam ~50% de tokens
2. **Simplificar coordenadas** - Números menores são mais fáceis para IA
3. **Adicionar metadata** - Descrições ajudam debugging

### SimpleIds Transform

```typescript
class SimpleIds extends TldrawAiTransform {
  private idMap = new Map<string, string>()
  private reverseMap = new Map<string, string>()
  private nextId = 0

  beforeSend(prompt: TLAiPrompt): TLAiPrompt {
    // Converte todos os IDs longos para números curtos
    return mapIds(prompt, (id) => {
      if (!this.idMap.has(id)) {
        const shortId = String(this.nextId++)
        this.idMap.set(id, shortId)
        this.reverseMap.set(shortId, id)
      }
      return this.idMap.get(id)!
    })
  }

  afterReceive(change: TLAiChange): TLAiChange {
    // Converte IDs curtos de volta para originais
    return mapIds(change, (id) => {
      return this.reverseMap.get(id) ?? createShapeId()
    })
  }
}
```

### SimpleCoordinates Transform

```typescript
class SimpleCoordinates extends TldrawAiTransform {
  private offset = { x: 0, y: 0 }

  beforeSend(prompt: TLAiPrompt): TLAiPrompt {
    this.offset = {
      x: prompt.contextBounds.x,
      y: prompt.contextBounds.y
    }

    // Subtrai offset de todas as coordenadas
    return mapCoordinates(prompt, (x, y) => ({
      x: x - this.offset.x,
      y: y - this.offset.y
    }))
  }

  afterReceive(change: TLAiChange): TLAiChange {
    // Adiciona offset de volta
    return mapCoordinates(change, (x, y) => ({
      x: x + this.offset.x,
      y: y + this.offset.y
    }))
  }
}
```

---

## 8. CONFIGURAÇÃO E SETUP

### Variáveis de Ambiente

```bash
# wrangler.toml ou .dev.vars
OPENAI_API_KEY=sk-...
```

### Dependências Principais

```json
{
  "dependencies": {
    "@tldraw/ai": "^3.15.1",
    "tldraw": "^3.15.1",
    "openai": "^4.x",
    "zod": "^3.x",
    "best-effort-json-parser": "^1.x"
  }
}
```

### Inicialização do Hook

```typescript
// client/App.tsx
import { useTldrawAi } from '@tldraw/ai'

function App() {
  const [editor, setEditor] = useState<Editor | null>(null)

  const ai = useTldrawAi({
    editor,
    transforms: [
      new SimpleIds(),
      new ShapeDescriptions(),
      new SimpleCoordinates()
    ],
    stream: async function* ({ prompt, signal }) {
      const res = await fetch('/stream', {
        method: 'POST',
        body: JSON.stringify(prompt),
        signal
      })

      // Parse SSE stream
      for await (const chunk of parseSSE(res.body)) {
        yield JSON.parse(chunk)
      }
    }
  })

  return (
    <Tldraw onMount={setEditor}>
      <PromptInput onSubmit={(msg) => ai.prompt({ message: msg })} />
    </Tldraw>
  )
}
```

---

## 9. IMPLEMENTAÇÃO DE PROVIDER CUSTOMIZADO

Para usar Claude, Gemini ou outro modelo, implemente `TldrawAiBaseService`:

```typescript
// worker/do/claude/ClaudeService.ts
import { TldrawAiBaseService } from '../TldrawAiBaseService'
import Anthropic from '@anthropic-ai/sdk'

export class ClaudeService extends TldrawAiBaseService {
  private client: Anthropic

  constructor(apiKey: string) {
    super()
    this.client = new Anthropic({ apiKey })
  }

  async *stream(prompt: TLAiSerializedPrompt): AsyncGenerator<TLAiChange> {
    const simpleContent = getSimpleContentFromCanvasContent(prompt)

    const stream = await this.client.messages.stream({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: buildDeveloperMessage(prompt, simpleContent) },
            { type: 'image', source: { type: 'base64', data: prompt.image } },
            { type: 'text', text: prompt.message }
          ]
        }
      ]
    })

    for await (const event of stream) {
      // Parse JSON e converte para TLAiChange
      const changes = getTldrawAiChangesFromSimpleEvents(prompt, event)
      for (const change of changes) {
        yield change
      }
    }
  }

  async generate(prompt: TLAiSerializedPrompt): Promise<TLAiChange[]> {
    // Implementação não-streaming
  }
}
```

---

## 10. CONSIDERAÇÕES PARA PRODUÇÃO

### Performance
- Use streaming para feedback imediato
- Transforms reduzem tokens em ~40-60%
- Cache de screenshots quando possível

### Segurança
- Valide todos os inputs com Zod
- Rate limiting no worker
- Sanitize IDs antes de criar shapes

### UX
- Mostre indicador de loading
- Permita cancelamento
- Suporte undo/redo (history: 'record')

### Custos
- gpt-4o: ~$5-15/1000 prompts
- Claude: similar
- Gemini: mais barato

---

## 11. PRÓXIMOS PASSOS PARA IMPLEMENTAÇÃO

1. **Adaptar para seu projeto**: Copie a estrutura de `/templates/ai`
2. **Escolher provider**: OpenAI, Claude ou Gemini
3. **Implementar service**: Baseie em `OpenAiService.ts`
4. **Adaptar system prompt**: Customize para seu caso de uso
5. **Adicionar UI**: Input de prompt e indicadores
6. **Testar**: Use prompts simples primeiro

---

## 12. ARQUIVOS DE REFERÊNCIA

Os arquivos mais importantes para estudar:

- `packages/ai/src/lib/TldrawAiModule.ts` - Core do módulo
- `packages/ai/src/lib/useTldrawAi.ts` - Hook React
- `packages/ai/src/lib/types.ts` - Todos os tipos
- `templates/ai/worker/do/openai/system-prompt.ts` - System prompt
- `templates/ai/worker/do/openai/schema.ts` - Schemas Zod
- `templates/ai/worker/do/openai/getTldrawAiChangesFromSimpleEvents.ts` - Conversões
- `templates/ai/client/transforms/` - Implementações de transforms

---

**Localização do código fonte**: `/Users/guilhermevarela/Documents/Projetos/tldraw-claude-agent-temp`
