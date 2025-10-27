# PRD: Refatoração do Chat - Substituição do AI SDK pelo Claude Agent SDK

**Autor:** Gemini (Validado Tecnicamente)
**Data:** 27 de Outubro de 2025
**Status:** Pronto para Implementação
**Tipo:** REFATORAÇÃO COMPLETA (Substituição, não Adição)

---

## ⚠️ IMPORTANTE: Esta é uma REFATORAÇÃO, NÃO uma Adição

**Este PRD descreve a SUBSTITUIÇÃO COMPLETA do Vercel AI SDK pelo Claude Agent SDK.**

**O que significa:**
- ❌ NÃO adicionar código novo ao lado do antigo
- ❌ NÃO manter ambos os sistemas funcionando
- ✅ REMOVER completamente o código do AI SDK
- ✅ SUBSTITUIR por implementação do Claude Agent SDK
- ✅ DELETAR dependências antigas após migração

**Arquivos que serão MODIFICADOS (não duplicados):**
- `apps/api/src/routes/chat.ts` - Reescrito
- `apps/api/src/routes/chat-v2.ts` - Reescrito
- `apps/web/components/views/chat/chat-messages.tsx` - Reescrito
- `apps/api/package.json` - Dependências removidas e adicionadas
- `apps/web/package.json` - Dependências removidas

---

## 1. Introdução

O chat atual usa Vercel AI SDK com capacidades básicas de busca em banco de dados. Esta refatoração substitui completamente o AI SDK pelo **Claude Agent SDK** da Anthropic para expandir as capacidades do agente.

**Objetivo:** Substituir (não adicionar) o sistema de chat atual por implementação usando Claude Agent SDK.

---

## 2. Objetivos

### Primário
- **SUBSTITUIR** (não adicionar) o backend do chat pelo Claude Agent SDK
- **REMOVER** todas as dependências do AI SDK após migração

### Secundário
- Manter funcionalidade de busca no banco de dados como tool customizada MCP
- Preservar interface visual do chat (apenas internals mudam)

### Experiência do Usuário
- Usuário não percebe mudança na UI
- Funcionalidades existentes continuam funcionando
- Capacidades expandidas sem quebrar UX

---

## 3. Requisitos Funcionais

### 3.1 Backend
1. **Substituir** endpoints existentes (`/api/chat`, `/api/chat-v2`)
   - Manter URLs (frontend não muda)
   - Trocar implementação interna

2. **Comunicação com Claude Agent SDK**
   - Usar função `query()` do SDK
   - Implementar streaming via async generator
   - Gerenciar sessões do agente

3. **Tool Customizada MCP**
   - Criar `searchDatabase` tool via `createSdkMcpServer()`
   - Encapsular função `searchDocuments` existente
   - Retornar resultados no formato MCP

### 3.2 Frontend
1. **Substituir** hook `useChat` do AI SDK
   - Implementar gerenciamento de estado manual
   - Manter interface dos componentes
   - Adaptar parsing de streaming

---

## 4. Requisitos Não-Funcionais

1. **Performance**
   - Streaming de respostas mantido
   - Latência similar ou melhor que sistema atual

2. **Segurança**
   - `ANTHROPIC_API_KEY` em variáveis de ambiente
   - Permissões restritivas do agente (sem file/shell access)

3. **Manutenibilidade**
   - Código modular e documentado
   - Sem código legado do AI SDK após migração

---

## 5. Escopo da Refatoração

### Dentro do Escopo (SUBSTITUIR)

**Backend:**
- ✅ Reescrever `apps/api/src/routes/chat.ts`
- ✅ Reescrever `apps/api/src/routes/chat-v2.ts`
- ✅ Criar `apps/api/src/services/claude-agent-tools.ts` (tool MCP)
- ✅ Remover `apps/api/src/services/ai-provider.ts` (fallback Google/OpenRouter)
- ✅ Atualizar `apps/api/src/services/condense-query.ts`
- ✅ Atualizar `apps/api/src/services/agentic-search.ts`

**Frontend:**
- ✅ Reescrever `apps/web/components/views/chat/chat-messages.tsx`
- ✅ Remover hooks do AI SDK

**Dependências:**
- ✅ Adicionar: `@anthropic-ai/claude-agent-sdk`, `zod`
- ✅ Remover: `ai`, `@ai-sdk/google`, `@ai-sdk/xai`, `@ai-sdk/react`, `@ai-sdk/ui-utils`

### Fora do Escopo

- ❌ Mudanças em componentes UI não relacionados ao chat
- ❌ Alterações em autenticação/gerenciamento de usuários
- ❌ Novas features além da substituição

---

## 6. Plano de Implementação Detalhado

### 6.1 Preparação

```bash
# 1. Criar branch de segurança
git checkout -b refactor/claude-agent-sdk

# 2. Configurar ambiente
echo "ANTHROPIC_API_KEY=sk-ant-..." >> apps/api/.env

# 3. Instalar dependências
cd apps/api
npm install @anthropic-ai/claude-agent-sdk zod
```

### 6.2 Backend - Criar Tool MCP Customizada

**Criar arquivo:** `apps/api/src/services/claude-agent-tools.ts`

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import { searchDocuments } from "../routes/search"

/**
 * MCP Server com tools customizadas para o Supermemory
 */
export function createSupermemoryTools(
  client: SupabaseClient,
  orgId: string
) {
  return createSdkMcpServer({
    name: "supermemory-tools",
    version: "1.0.0",
    tools: [
      tool(
        "searchDatabase",
        "Busca documentos e memórias no banco de dados do usuário",
        {
          query: z.string().describe("Texto de busca"),
          limit: z.number().optional().default(10).describe("Número máximo de resultados"),
          includeSummary: z.boolean().optional().default(true).describe("Incluir resumos dos documentos")
        },
        async (args) => {
          try {
            const results = await searchDocuments(client, orgId, {
              q: args.query,
              limit: args.limit,
              includeSummary: args.includeSummary,
              includeFullDocs: false,
              chunkThreshold: 0.1,
              documentThreshold: 0.1
            })
            
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  count: results.total,
                  results: results.results.map(r => ({
                    documentId: r.documentId,
                    title: r.title,
                    content: r.content,
                    score: r.score,
                    url: r.metadata?.url
                  }))
                }, null, 2)
              }]
            }
          } catch (error) {
            return {
              content: [{
                type: "text",
                text: `Erro ao buscar documentos: ${error.message}`
              }],
              isError: true
            }
          }
        }
      )
    ]
  })
}
```

### 6.3 Backend - Reescrever Chat Handler

**Substituir conteúdo de:** `apps/api/src/routes/chat-v2.ts`

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { env } from "../env"
import { ENHANCED_SYSTEM_PROMPT } from "../prompts/chat"
import { createSupermemoryTools } from "../services/claude-agent-tools"

const chatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string()
    })
  )
})

/**
 * Handler do chat usando Claude Agent SDK
 * SUBSTITUI a implementação anterior do AI SDK
 */
export async function handleChatV2({
  orgId,
  client,
  body
}: {
  orgId: string
  client: SupabaseClient
  body: unknown
}) {
  const payload = chatRequestSchema.parse(body ?? {})
  const messages = payload.messages

  // Criar MCP server com tools customizadas
  const toolsServer = createSupermemoryTools(client, orgId)

  // OBRIGATÓRIO: Converter mensagens para async generator
  async function* generateMessages() {
    for (const msg of messages) {
      if (msg.role === "user") {
        yield {
          type: "user" as const,
          message: {
            role: "user" as const,
            content: msg.content
          }
        }
      }
    }
  }

  try {
    // Iniciar query com Claude Agent SDK
    const agentQuery = query({
      prompt: generateMessages(), // Streaming input OBRIGATÓRIO com MCP
      options: {
        systemPrompt: ENHANCED_SYSTEM_PROMPT,
        model: env.CHAT_MODEL || "claude-3-5-sonnet-20241022",
        mcpServers: {
          "supermemory-tools": toolsServer
        },
        allowedTools: [
          "mcp__supermemory-tools__searchDatabase"
        ],
        permissionMode: "default",
        maxTurns: 10,
        maxThinkingTokens: 8192
      }
    })

    // Converter stream do SDK para Response
    return createStreamResponse(agentQuery)
  } catch (error) {
    console.error("Chat V2 failed", error)
    return new Response(
      JSON.stringify({ error: "Chat indisponível" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}

/**
 * Converte stream do Claude Agent SDK para Response HTTP
 */
async function createStreamResponse(agentQuery: AsyncGenerator<any>) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const message of agentQuery) {
          // Processar diferentes tipos de mensagens
          if (message.type === "assistant") {
            // Mensagem do assistente
            const content = message.message.content
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === "text") {
                  controller.enqueue(encoder.encode(block.text))
                }
              }
            }
          } else if (message.type === "result") {
            // Resultado final
            if (message.subtype === "success") {
              controller.enqueue(encoder.encode(`\n\n[Completed in ${message.duration_ms}ms]`))
            }
          }
        }
      } catch (error) {
        console.error("Stream error", error)
        controller.enqueue(encoder.encode(`\nErro: ${error.message}`))
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache"
    }
  })
}
```

### 6.4 Frontend - Reescrever Chat Component

**Substituir hook `useChat` em:** `apps/web/components/views/chat/chat-messages.tsx`

**REMOVER:**
```typescript
import { useChat } from "@ai-sdk/react"
```

**ADICIONAR:**
```typescript
import { useState, useCallback } from "react"

/**
 * Hook customizado para gerenciar chat com Claude Agent SDK
 * SUBSTITUI useChat do AI SDK
 */
function useClaudeChat() {
  const [messages, setMessages] = useState<Array<{role: string, content: string}>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const sendMessage = useCallback(async (content: string) => {
    setIsLoading(true)
    setError(null)

    // Adicionar mensagem do usuário
    const userMessage = { role: "user", content }
    setMessages(prev => [...prev, userMessage])

    try {
      const response = await fetch("/api/chat-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage]
        })
      })

      if (!response.ok) throw new Error("Chat request failed")
      if (!response.body) throw new Error("No response body")

      // Processar streaming
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ""

      // Adicionar mensagem vazia do assistente
      setMessages(prev => [...prev, { role: "assistant", content: "" }])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        assistantContent += chunk

        // Atualizar última mensagem (assistente)
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "assistant", content: assistantContent }
        ])
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"))
    } finally {
      setIsLoading(false)
    }
  }, [messages])

  return { messages, sendMessage, isLoading, error }
}

// Usar no componente
export function ChatMessages() {
  const { messages, sendMessage, isLoading } = useClaudeChat()
  // ... resto do componente
}
```

### 6.5 Remoção do Código Antigo

**CRÍTICO: DELETAR os seguintes arquivos/código após validação:**

```bash
# 1. Remover dependências antigas
cd apps/api
npm uninstall ai @ai-sdk/google @ai-sdk/xai @ai-sdk/ui-utils

cd ../web
npm uninstall @ai-sdk/react

# 2. Deletar arquivo de fallback (não mais necessário)
rm apps/api/src/services/ai-provider.ts

# 3. Atualizar imports nos arquivos que usavam AI SDK
# Buscar e substituir em:
# - apps/api/src/services/condense-query.ts
# - apps/api/src/services/agentic-search.ts

# 4. Verificar que nenhum import de "ai" ou "@ai-sdk/*" existe
grep -r "from ['\"]ai['\"]" apps/
grep -r "from ['\"]@ai-sdk" apps/
# Deve retornar vazio
```

### 6.6 Validação e Testes

```bash
# 1. Verificar que não há imports antigos
npm run build  # Deve compilar sem erros

# 2. Testar chat endpoint
curl -X POST http://localhost:3000/api/chat-v2 \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Olá"}]}'

# 3. Verificar logs do agente
# Deve mostrar "Claude Agent SDK" iniciando

# 4. Testar tool de busca
curl -X POST http://localhost:3000/api/chat-v2 \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Busque documentos sobre IA"}]}'

# Deve ver logs indicando tool "searchDatabase" sendo chamada
```

---

## 7. Checklist de Implementação

**Antes de começar:**
- [ ] Criar branch `refactor/claude-agent-sdk`
- [ ] Configurar `ANTHROPIC_API_KEY` em `.env`
- [ ] Fazer backup do código atual

**Backend:**
- [ ] Instalar `@anthropic-ai/claude-agent-sdk` e `zod`
- [ ] Criar `apps/api/src/services/claude-agent-tools.ts`
- [ ] Reescrever `apps/api/src/routes/chat-v2.ts` (substituir, não adicionar)
- [ ] Testar endpoint localmente

**Frontend:**
- [ ] Reescrever hook de chat em `chat-messages.tsx`
- [ ] Remover imports de `@ai-sdk/react`
- [ ] Testar UI localmente

**Limpeza (CRÍTICO):**
- [ ] Remover dependências antigas do `package.json`
- [ ] Deletar `apps/api/src/services/ai-provider.ts`
- [ ] Verificar que nenhum import de AI SDK existe
- [ ] Executar `npm run build` sem erros
- [ ] Executar testes E2E

**Finalização:**
- [ ] Validar que chat funciona end-to-end
- [ ] Validar que tool de busca é chamada corretamente
- [ ] Commit e push da branch
- [ ] Criar PR com descrição detalhada

---

## 8. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Streaming quebra | Média | Alto | Testar extensivamente; implementar fallback |
| Tool não é chamada | Baixa | Médio | Validar formato de naming `mcp__*__*` |
| Frontend não processa stream | Média | Alto | Implementar parsing robusto com testes |
| Código antigo permanece | Alta | Médio | **Checklist obrigatório de limpeza** |

---

## 9. Rollback Plan

Se a refatoração falhar:

```bash
# 1. Voltar para branch anterior
git checkout main

# 2. Ou reverter commits
git revert <commit-hash>

# 3. Reinstalar dependências antigas
cd apps/api && npm install ai @ai-sdk/google @ai-sdk/xai
cd apps/web && npm install @ai-sdk/react
```

---

## 10. Critérios de Sucesso

- ✅ Chat funciona com Claude Agent SDK
- ✅ Tool `searchDatabase` é chamada quando usuário pergunta sobre documentos
- ✅ Streaming funciona sem interrupções
- ✅ UI permanece inalterada visualmente
- ✅ **NENHUM** código do AI SDK permanece no projeto
- ✅ **NENHUMA** dependência do AI SDK no `package.json`
- ✅ Build passa sem warnings sobre imports faltando
