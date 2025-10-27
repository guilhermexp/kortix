# Claude Agent SDK - Documentação Supermemory

**Status:** ✅ IMPLEMENTADO E FUNCIONANDO
**Versão SDK:** @anthropic-ai/claude-agent-sdk ^0.1.14
**Data:** 27 de Outubro de 2025

---

## 📋 Documentos Neste Diretório

1. **[IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)** ⭐ **LEIA PRIMEIRO**
   - Status atual da implementação
   - Problemas encontrados e soluções
   - Arquitetura completa
   - Workarounds necessários
   - Próximos passos

2. **[IMPLEMENTATION_PRD.md](./IMPLEMENTATION_PRD.md)**
   - PRD original da migração
   - Planejamento inicial
   - Referência histórica

---

## ⚡ Quick Start

### Instalação

```bash
npm install @anthropic-ai/claude-agent-sdk zod
```

### Configuração

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
CHAT_MODEL=claude-haiku-4-5-20251001
```

### Uso Básico

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk"
import { createSupermemoryTools } from "./services/claude-agent-tools"

const toolsServer = createSupermemoryTools(client, orgId, context)

const agentIterator = query({
  prompt: generateMessages(),
  options: {
    mcpServers: { "supermemory-tools": toolsServer },
    permissionMode: "bypassPermissions",
    pathToClaudeCodeExecutable: "/path/to/cli.js"
  }
})

for await (const event of agentIterator) {
  // Processar eventos
}
```

---

## ⚠️ Pontos Críticos

### ✅ O que FUNCIONA

- Chat com Claude via Agent SDK
- Tool customizada `searchDatabase` via MCP
- Múltiplas chamadas de tools
- Busca em banco Supabase
- Histórico parcial (apenas user messages)

### ⚠️ Workarounds Necessários

#### 1. Schema de Tool SEM `z.object()`

```typescript
// ❌ ERRADO - Parâmetros chegam undefined
tool("name", "desc", z.object({ query: z.string() }), async (args) => {})

// ✅ CORRETO - Parâmetros funcionam
tool("name", "desc", { query: z.string() }, async (args) => {})
```

#### 2. Histórico Apenas com User Messages

```typescript
// ⚠️ NECESSÁRIO: Filtrar assistant messages do histórico
const userOnlyMessages = messages.filter(m => m.role === 'user')
const prompt = createPromptStream(userOnlyMessages)
```

**Por quê?** Assistant messages com tool_use blocks causam crash no CLI quando reenviadas como texto simples.

#### 3. Path Explícito do CLI

```typescript
const queryOptions = {
  pathToClaudeCodeExecutable: "/absolute/path/to/node_modules/@anthropic-ai/claude-agent-sdk/cli.js"
}
```

---

## 🐛 Problemas Resolvidos

| Problema | Causa | Solução |
|----------|-------|---------|
| `query: undefined` | Schema com `z.object()` | Usar objeto direto |
| CLI crash com histórico | Assistant messages sem tool_use blocks | Filtrar apenas user messages |
| CLI não encontrado | Path relativo | Path absoluto explícito |

Detalhes completos em [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md#-problemas-encontrados-e-soluções)

---

## 📚 Documentação Oficial

**SEMPRE consulte a documentação oficial atualizada:**

- **Documentação Principal**: https://docs.claude.com/en/api/agent-sdk/overview
- **TypeScript SDK Reference**: https://docs.claude.com/en/api/agent-sdk/typescript
- **Custom Tools Guide**: https://docs.claude.com/en/docs/claude-code/sdk/custom-tools
- **MCP in the SDK**: https://docs.claude.com/en/api/agent-sdk/mcp

---

## 🔑 Conceitos Chave

### 1. MCP Tools (In-Process)

Tools customizadas são registradas via MCP (Model Context Protocol) in-process:

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

const server = createSdkMcpServer({
  name: "my-tools",
  version: "1.0.0",
  tools: [
    tool(
      "toolName",
      "Description",
      { param: z.string() },  // ⚠️ Objeto direto, NÃO z.object()
      async (args) => ({
        content: [{ type: "text", text: "result" }]
      })
    )
  ]
})
```

### 2. Query com Async Generator

O SDK requer async generator para mensagens:

```typescript
async function* generateMessages() {
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: [{ type: "text" as const, text: "prompt" }]
    }
  }
}

for await (const msg of query({
  prompt: generateMessages(),  // ⚠️ Async generator obrigatório
  options: { mcpServers: { "my-tools": server } }
})) {
  // Processar mensagens
}
```

### 3. Tool Naming Convention

Tools MCP seguem o padrão: `mcp__{server_name}__{tool_name}`

Exemplo: `mcp__supermemory-tools__searchDatabase`

---

## 🏗️ Arquitetura

```
Frontend
    ↓
POST /chat/v2
    ↓
handleChatV2() → executeClaudeAgent()
    ↓
1. Filtrar mensagens (user only)
2. Criar prompt stream (async generator)
3. Registrar MCP server com tools
4. Executar query() do SDK
    ↓
Claude Agent SDK CLI (subprocess)
    ↓
Tool: searchDatabase (via MCP)
    ↓
Supabase search
    ↓
Resposta ao usuário
```

---

## 🔮 Próximos Passos

1. **Histórico completo** - Armazenar eventos originais com tool_use blocks
2. **Remover logs de debug** - Apenas logs essenciais em produção
3. **Testes automatizados** - Validar tool calls e edge cases
4. **Performance** - Cache e otimizações

Ver detalhes em [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md#-próximos-passos)

---

## 📞 Troubleshooting

### CLI crash: "Claude Code process exited with code 1"

**Causa:** Mensagens do assistant no histórico sem tool_use blocks

**Solução:** Filtrar apenas user messages (já implementado)

### Tool recebe parâmetros `undefined`

**Causa:** Schema definido com `z.object()`

**Solução:** Usar objeto direto: `{ param: z.string() }`

### CLI não encontrado

**Causa:** Path relativo ou ambiente incorreto

**Solução:** Especificar path absoluto em `pathToClaudeCodeExecutable`

---

## 🧪 Validação

Para testar se está funcionando:

```bash
# 1. Iniciar servidor
bun dev

# 2. Fazer pergunta que usa tool
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"messages":[{"role":"user","content":"quantas memorias tenho?"}]}'

# 3. Verificar logs
# Deve aparecer:
# [searchDatabase] Tool called with query: ...
# [searchDatabase] Found X results
```

---

**Para documentação completa, consulte [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)**

---

**Última atualização:** 27 de Outubro de 2025
**Mantido por:** Equipe Supermemory
