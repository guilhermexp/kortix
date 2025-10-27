# Status da Implementação: Claude Agent SDK no Supermemory

**Data:** 27 de Outubro de 2025
**Status:** ✅ IMPLEMENTADO E FUNCIONANDO
**Versão SDK:** @anthropic-ai/claude-agent-sdk ^0.1.14

---

## 📊 Status Atual

### ✅ O que está funcionando

- ✅ Chat básico com Claude via Agent SDK
- ✅ Tool customizada `searchDatabase` via MCP
- ✅ Histórico de conversação (apenas mensagens do usuário)
- ✅ Múltiplas chamadas de tools na mesma conversa
- ✅ Streaming de respostas
- ✅ Busca em banco de dados Supabase

### ⚠️ Limitações Conhecidas

- ⚠️ **Histórico parcial**: Apenas mensagens do usuário são enviadas no histórico (workaround necessário)
- ⚠️ **Sem contexto de respostas do assistant**: Respostas anteriores do assistant não são incluídas no contexto

---

## 🐛 Problemas Encontrados e Soluções

### Problema 1: Schema Zod Incorreto na Tool

**Erro:**
```
[searchDatabase] Tool called with query: undefined
```

**Causa:**
Tool definida com `z.object({ ... })` ao invés de objeto direto com schemas Zod.

**Solução:**
```typescript
// ❌ ERRADO
tool("searchDatabase", "Description", z.object({
  query: z.string()
}), async (args) => { ... })

// ✅ CORRETO
tool("searchDatabase", "Description", {
  query: z.string()
}, async (args) => { ... })
```

**Arquivo:** `apps/api/src/services/claude-agent-tools.ts`

---

### Problema 2: Crash ao Enviar Histórico com Mensagens do Assistant

**Erro:**
```
error: Claude Code process exited with code 1
```

**Causa:**
O CLI do Claude Agent SDK crashava ao receber mensagens do assistant no histórico porque essas mensagens originalmente continham blocos `tool_use` que foram perdidos ao serem convertidas para texto simples.

**Comportamento:**
- ✅ Primeira mensagem (sem histórico): Funciona
- ❌ Segunda mensagem (com histórico incluindo assistant): Crash antes de processar eventos

**Solução (Workaround):**
Filtrar mensagens para enviar apenas as do usuário:

```typescript
// Filtrar apenas mensagens do usuário
const userOnlyMessages = messages.filter(m => m.role === 'user')
const prompt = createPromptStream(userOnlyMessages)
```

**Arquivo:** `apps/api/src/services/claude-agent.ts:174-182`

**Logs indicativos:**
```
[executeClaudeAgent] Filtered to 2 user messages (assistant messages removed from history)
```

---

### Problema 3: Path do CLI Não Encontrado

**Erro inicial:**
```
Claude Code executable not found
```

**Solução:**
Especificar explicitamente o caminho absoluto para o CLI:

```typescript
const pathToClaudeCodeExecutable = "/Users/guilhermevarela/Public/supermemory/node_modules/@anthropic-ai/claude-agent-sdk/cli.js"

const queryOptions = {
  // ... outras opções
  pathToClaudeCodeExecutable
}
```

**Arquivo:** `apps/api/src/services/claude-agent.ts:188-195`

---

## 🏗️ Arquitetura da Solução

### Fluxo de Execução

```
Frontend (chat-messages.tsx)
    ↓
HTTP POST /chat/v2
    ↓
chat-v2.ts → handleChatV2()
    ↓
claude-agent.ts → executeClaudeAgent()
    ↓
1. Filtra mensagens (apenas user)
2. Cria prompt stream
3. Cria MCP server com tools
4. Chama query() do SDK
    ↓
Claude Agent SDK CLI (subprocess)
    ↓
MCP Tool: searchDatabase
    ↓
claude-agent-tools.ts
    ↓
Supabase search
    ↓
Retorno para Claude → Resposta ao usuário
```

### Componentes Principais

#### 1. MCP Tool Server (`claude-agent-tools.ts`)

```typescript
export function createSupermemoryTools(
  client: SupabaseClient,
  orgId: string,
  context: ToolContext = {}
) {
  return createSdkMcpServer({
    name: "supermemory-tools",
    version: "1.0.0",
    tools: [
      tool(
        "searchDatabase",
        "Search documents and memories ingested into Supermemory",
        {
          query: z.string().min(1).describe("Search query text"),
          limit: z.number().min(1).max(50).default(10),
          includeSummary: z.boolean().default(true),
          includeFullDocs: z.boolean().default(false),
          containerTags: z.array(z.string()).optional(),
          scopedDocumentIds: z.array(z.string()).optional(),
        },
        async ({ query, limit, includeSummary, ... }) => {
          // Implementação da busca
        }
      )
    ]
  })
}
```

**Pontos importantes:**
- ✅ Schema é objeto direto, não `z.object()`
- ✅ Usa `createSdkMcpServer` para registrar tools
- ✅ Retorna formato MCP padrão: `{ content: [{ type: "text", text: "..." }] }`

#### 2. Agent Executor (`claude-agent.ts`)

```typescript
export async function executeClaudeAgent({
  messages, client, orgId, systemPrompt, model, context, maxTurns
}: ClaudeAgentOptions) {
  // 1. Filtrar apenas mensagens do usuário (workaround)
  const userOnlyMessages = messages.filter(m => m.role === 'user')

  // 2. Criar stream de prompt
  const prompt = createPromptStream(userOnlyMessages)

  // 3. Criar MCP server com tools
  const toolsServer = createSupermemoryTools(client, orgId, context)

  // 4. Configurar opções do query
  const queryOptions = {
    systemPrompt: systemPrompt ?? ENHANCED_SYSTEM_PROMPT,
    model: model ?? env.CHAT_MODEL,
    mcpServers: { "supermemory-tools": toolsServer },
    permissionMode: "bypassPermissions",
    pathToClaudeCodeExecutable: "/path/to/cli.js", // Caminho explícito
    maxTurns
  }

  // 5. Executar query e processar eventos
  const agentIterator = query({ prompt, options: queryOptions })
  const events = []
  for await (const event of agentIterator) {
    events.push(event)
  }

  // 6. Extrair texto e parts da resposta
  const { text, parts } = buildAssistantResponse(events)
  return { events, text, parts }
}
```

**Pontos importantes:**
- ⚠️ Filtra mensagens do assistant (workaround necessário)
- ✅ Usa `permissionMode: "bypassPermissions"` para evitar prompts interativos
- ✅ Especifica path explícito do CLI
- ✅ Processa eventos e extrai resposta estruturada

#### 3. Prompt Stream Generator

```typescript
function createPromptStream(messages: AgentMessage[]) {
  return (async function* promptGenerator() {
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i]
      const text = sanitizeContent(message.content)
      if (!text) continue

      const payload = {
        role: message.role === "assistant" ? "assistant" : "user",
        content: [{ type: "text", text }],
      }

      yield message.role === "assistant"
        ? { type: "assistant", message: payload }
        : { type: "user", message: payload }
    }
  })()
}
```

**Pontos importantes:**
- ✅ Async generator (obrigatório pelo SDK)
- ✅ Formato específico: `{ type: "user"|"assistant", message: { role, content } }`
- ✅ Content sempre como array de blocos

---

## 🔧 Configuração Necessária

### Variáveis de Ambiente

```bash
ANTHROPIC_API_KEY=sk-ant-...
CHAT_MODEL=claude-haiku-4-5-20251001  # ou outro modelo
```

### Dependências

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.14",
    "zod": "^3.25.5"
  }
}
```

### Estrutura de Arquivos

```
apps/api/src/
├── services/
│   ├── claude-agent.ts          # Executor principal do agent
│   └── claude-agent-tools.ts    # Definição das MCP tools
├── routes/
│   └── chat-v2.ts              # Endpoint HTTP do chat
└── prompts/
    └── chat.ts                  # ENHANCED_SYSTEM_PROMPT
```

---

## 📝 Logs de Desenvolvimento

Os logs implementados ajudam a debugar:

```typescript
// Logs úteis (podem ser removidos em produção)
console.log("[executeClaudeAgent] Starting with", messages.length, "messages")
console.log("[executeClaudeAgent] Filtered to", userOnlyMessages.length, "user messages")
console.log("[executeClaudeAgent] Event", eventCount, ":", event.type)
console.log("[searchDatabase] Tool called with query:", query)
console.log("[searchDatabase] Found", response.total, "results")
```

**Exemplo de output esperado:**
```
[executeClaudeAgent] Starting with 3 messages
[executeClaudeAgent] Filtered to 2 user messages (assistant messages removed from history)
[executeClaudeAgent] Using CLI at: /Users/.../cli.js
[executeClaudeAgent] Event 1: system
[executeClaudeAgent] Event 2: assistant
[executeClaudeAgent] Event 3: assistant
[searchDatabase] Tool called with query: memorias
[searchDatabase] Found 3 results
[executeClaudeAgent] Event 4: user
[executeClaudeAgent] Event 5: assistant
[executeClaudeAgent] Event 6: result
[executeClaudeAgent] Completed with 6 events
```

---

## 🚀 Como Usar

### Exemplo de Requisição

```bash
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "messages": [
      {"role": "user", "content": "quantas memorias tenho?"}
    ],
    "mode": "simple"
  }'
```

### Exemplo de Resposta

```json
{
  "message": {
    "role": "assistant",
    "content": "Você tem 3 memórias armazenadas...",
    "parts": [
      { "type": "text", "text": "Você tem 3 memórias..." },
      {
        "type": "tool-searchMemories",
        "state": "output-available",
        "output": {
          "count": 3,
          "results": [...]
        }
      }
    ]
  },
  "events": [...]
}
```

---

## 🔮 Próximos Passos

### Melhorias Necessárias

1. **Implementar histórico completo**
   - Armazenar eventos originais do assistant (incluindo tool_use blocks)
   - Reconstruir mensagens com tool_use ao reenviar histórico
   - Isso permitirá contexto completo das conversas

2. **Otimização de performance**
   - Cache de resultados de busca
   - Limitar tamanho do histórico enviado

3. **Remover logs de debug**
   - Manter apenas logs essenciais em produção

4. **Testes automatizados**
   - Testar tool calls
   - Testar histórico
   - Testar edge cases

### Solução Ideal para Histórico

O ideal seria armazenar e reenviar os eventos completos:

```typescript
// Ao receber resposta do assistant
const assistantEvent = {
  type: "assistant",
  message: {
    role: "assistant",
    content: [
      { type: "text", text: "Texto da resposta" },
      {
        type: "tool_use",
        id: "toolu_xxx",
        name: "searchDatabase",
        input: { query: "memorias" }
      }
    ]
  }
}

// E o tool_result correspondente
const toolResultEvent = {
  type: "user",
  content: [{
    type: "tool_result",
    tool_use_id: "toolu_xxx",
    content: "Resultados..."
  }]
}
```

Mas isso requer:
- Armazenar eventos originais no banco de dados
- Reconstruir formato correto ao reenviar

---

## 📚 Referências

- **Claude Agent SDK Docs**: https://docs.claude.com/en/api/agent-sdk/overview
- **MCP Tools Guide**: https://docs.claude.com/en/api/agent-sdk/mcp
- **Bug Report #4619**: https://github.com/anthropics/claude-code/issues/4619 (sobre variáveis de ambiente)

---

## ✅ Checklist de Validação

- [x] SDK instalado e CLI acessível
- [x] Tool MCP registrada corretamente
- [x] Schema sem `z.object()` wrapper
- [x] Path do CLI configurado
- [x] Histórico funcionando (com workaround)
- [x] Tool calls retornando resultados
- [x] Multiple turns funcionando
- [x] Busca no Supabase operacional
- [ ] Histórico completo (incluindo assistant) - TODO
- [ ] Testes automatizados - TODO
- [ ] Logs de debug removidos - TODO

---

**Última atualização:** 27 de Outubro de 2025
**Autor:** Claude Code (com validação técnica)
