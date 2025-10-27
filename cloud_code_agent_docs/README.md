# Claude Agent SDK - Documentação de Referência

Este diretório contém referências à documentação oficial do Claude Agent SDK.

## Documentação Oficial

**SEMPRE consulte a documentação oficial atualizada:**

- **Documentação Principal**: https://docs.claude.com/en/api/agent-sdk/overview
- **TypeScript SDK Reference**: https://docs.claude.com/en/api/agent-sdk/typescript
- **Custom Tools Guide**: https://docs.claude.com/en/docs/claude-code/sdk/custom-tools
- **MCP in the SDK**: https://docs.claude.com/en/api/agent-sdk/mcp

## Instalação

```bash
npm install @anthropic-ai/claude-agent-sdk
```

## Conceitos Chave para Implementação

### 1. Custom Tools via MCP (In-Process)

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
      { param: z.string() },
      async (args) => ({
        content: [{ type: "text", text: "result" }]
      })
    )
  ]
})
```

### 2. Query com Streaming Input (OBRIGATÓRIO com MCP)

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk"

async function* generateMessages() {
  yield {
    type: "user" as const,
    message: { role: "user" as const, content: "prompt" }
  }
}

for await (const msg of query({
  prompt: generateMessages(), // Async generator obrigatório
  options: {
    mcpServers: { "my-tools": server },
    allowedTools: ["mcp__my-tools__toolName"]
  }
})) {
  // Processar mensagens
}
```

### 3. Tool Naming Convention

Tools MCP seguem o padrão: `mcp__{server_name}__{tool_name}`

Exemplo: `mcp__my-tools__searchDatabase`

## 📋 Para Implementação no Supermemory

**Consulte o arquivo:** [`IMPLEMENTATION_PRD.md`](./IMPLEMENTATION_PRD.md)

Este PRD contém:
- ⚠️ **Instruções de REFATORAÇÃO (substituição, não adição)**
- Plano de implementação passo a passo
- Código completo pronto para copiar
- Checklist de refatoração
- **Seção crítica:** Remoção do código antigo (AI SDK)
- Validação e testes automatizados

**LEIA O PRD ANTES DE IMPLEMENTAR** - Ele contém avisos importantes sobre não duplicar código.