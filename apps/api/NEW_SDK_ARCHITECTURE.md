# Nova Arquitetura: Claude Agent SDK Session Management

**Data:** 28 de Outubro de 2025
**Status:** ✅ Implementado
**Versão:** 3.0 (Arquitetura Simplificada)

---

## 🎯 Objetivo

Simplificar a integração com Claude Agent SDK, permitindo que o SDK gerencie **TODA** a sessão e histórico de conversação internamente, enquanto nossa aplicação atua apenas como um **proxy** que:

1. Envia mensagens para o SDK
2. Faz streaming de eventos para o frontend
3. Salva eventos no banco para **display/analytics apenas**
4. Usa MCP tools para fornecer dados do nosso banco quando o Claude precisa

---

## 🏗️ Arquitetura

### Antes (Arquitetura Híbrida - Incorreta)

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend                                                     │
└────────────┬────────────────────────────────────────────────┘
             │ POST /chat/v2
             │ { messages: [...], useStoredHistory: true }
             ↓
┌─────────────────────────────────────────────────────────────┐
│ API Backend                                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 1. Carregar histórico do nosso DB                      │ │
│ │ 2. Construir resumo de conversação                     │ │
│ │ 3. Injetar resumo no system prompt                     │ │
│ │ 4. Tentar passar histórico para SDK                    │ │
│ │    ❌ SDK rejeita mensagens assistant                  │ │
│ │ 5. Passar só última mensagem user                      │ │
│ └─────────────────────────────────────────────────────────┘ │
└────────────┬────────────────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────────────────┐
│ Claude Agent SDK                                             │
│ • Não tem contexto completo                                 │
│ • Perde tool results                                        │
│ • Não mantém sessão corretamente                           │
└─────────────────────────────────────────────────────────────┘
```

**Problemas:**
- ❌ Lutando contra o SDK ao invés de trabalhar com ele
- ❌ Perda de contexto e tool results
- ❌ Complexidade desnecessária
- ❌ Não escalável em produção

### Depois (Arquitetura Simplificada - Correta) ✅

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend                                                     │
└────────────┬────────────────────────────────────────────────┘
             │ POST /chat/v2
             │ { message: "...", sdkSessionId: "..." }
             ↓
┌─────────────────────────────────────────────────────────────┐
│ API Backend (Proxy Simples)                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 1. Receber mensagem única                              │ │
│ │ 2. Passar para SDK com resume: sdkSessionId            │ │
│ │ 3. Fazer streaming de eventos                          │ │
│ │ 4. Salvar eventos no DB (display only)                 │ │
│ │ 5. Retornar sdkSessionId para próxima mensagem         │ │
│ └─────────────────────────────────────────────────────────┘ │
└────────────┬─────────────┬──────────────────────────────────┘
             │             │
             │             └──→ Salvar em DB
             ↓                  (para usuário ver)
┌─────────────────────────────────────────────────────────────┐
│ Claude Agent SDK                                             │
│ • Gerencia TODA a sessão internamente                       │
│ • Mantém histórico completo                                 │
│ • Preserva tool results                                     │
│ • Usa resume: sessionId para continuidade                   │
│                                                              │
│ Quando precisa de dados:                                    │
│    ↓                                                         │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ MCP Tools (searchDatabase, etc)                        │  │
│ │ • Busca no nosso DB via MCP                            │  │
│ │ • Retorna dados para o Claude                          │  │
│ └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Benefícios:**
- ✅ SDK gerencia toda a complexidade de sessão
- ✅ Contexto e tool results preservados nativamente
- ✅ Código simples e maintível
- ✅ Escalável em produção
- ✅ Alinhado com best practices do SDK

---

## 📋 Mudanças Implementadas

### 1. `/apps/api/src/services/claude-agent.ts`

#### Antes:
```typescript
export type ClaudeAgentOptions = {
  messages: AgentMessage[]  // ❌ Array de mensagens
  conversationId?: string   // ❌ Nosso DB ID
  useStoredHistory?: boolean // ❌ Flag para carregar do DB
  // ...
}

export async function executeClaudeAgent({
  messages,
  conversationId,
  useStoredHistory,
  // ...
}: ClaudeAgentOptions) {
  // ❌ Carregar histórico do DB
  // ❌ Construir resumo
  // ❌ Modificar system prompt
  // ❌ Passar só última mensagem
}
```

#### Depois:
```typescript
export type ClaudeAgentOptions = {
  message: string           // ✅ Mensagem única
  sdkSessionId?: string     // ✅ SDK session ID (do SDK, não nosso)
  // ...
}

export async function executeClaudeAgent({
  message,
  sdkSessionId,
  // ...
}: ClaudeAgentOptions): Promise<{
  events: unknown[]
  text: string
  parts: AgentPart[]
  sdkSessionId: string | null  // ✅ Retorna SDK session ID
}> {
  // ✅ Criar prompt com mensagem única
  const userMessage: AgentMessage = {
    role: "user",
    content: message,
  }
  const prompt = createPromptStream([userMessage])

  // ✅ Usar resume do SDK
  const queryOptions = {
    systemPrompt: effectiveSystemPrompt,  // ✅ Sem modificações
    resume: sdkSessionId,                 // ✅ SDK gerencia contexto
    // ...
  }

  // ✅ Capturar SDK session ID dos eventos
  let capturedSessionId: string | null = sdkSessionId || null
  for await (const event of agentIterator) {
    if ('session_id' in event) {
      capturedSessionId = event.session_id
    }
    // ...
  }

  return {
    events,
    text,
    parts,
    sdkSessionId: capturedSessionId  // ✅ Retornar para próxima request
  }
}
```

**Principais Mudanças:**
- ✅ Removido `useStoredHistory` flag
- ✅ Removido carregamento de histórico do DB
- ✅ Removido `buildConversationHistorySummary()`
- ✅ System prompt usado sem modificações
- ✅ Usa `resume: sdkSessionId` para continuidade
- ✅ Captura e retorna SDK session ID

---

### 2. `/apps/api/src/routes/chat-v2.ts`

#### Schema de Request:

**Antes:**
```typescript
const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string()
  })),
  useStoredHistory: z.boolean().default(false),
  conversationId: z.string().uuid().optional(),
  // ...
});
```

**Depois:**
```typescript
const chatRequestSchema = z.object({
  message: z.string().min(1),              // ✅ Mensagem única
  sdkSessionId: z.string().optional(),     // ✅ SDK session ID
  conversationId: z.string().uuid().optional(), // ✅ Nosso DB ID (display)
  mode: z.enum(["simple", "agentic", "deep"]).default("simple"),
  // ...
});
```

#### Lógica do Endpoint:

**Antes:**
```typescript
// ❌ Complexo: carregar do DB, construir mensagens, etc
const { items: agentMessages, extraSystem } = buildAgentMessages(payload.messages)
const historyMessages = await loadFromDB(conversationId)
const lastUserMessage = findLastUserMessage(historyMessages)
// ...
```

**Depois:**
```typescript
// ✅ Simples: passar mensagem única
const { events, text, parts, sdkSessionId: returnedSessionId } = await executeClaudeAgent({
  message: payload.message,
  sdkSessionId: payload.sdkSessionId,
  client,
  orgId,
  systemPrompt,
  model: resolvedModel,
  context: toolContext,
  maxTurns,
}, {
  onEvent: async (event) => {
    // Stream para frontend
    processProgressEvent(event)

    const delta = extractTextDeltaFromEvent(event)
    if (delta) {
      enqueue({ type: "assistant_delta", text: delta })
    }
  }
})

// ✅ Salvar eventos no DB (display only)
if (conversationId) {
  await storeEvent(/* ... */)

  // ✅ Atualizar SDK session ID no DB
  if (returnedSessionId) {
    await updateSdkSessionId(conversationId, returnedSessionId)
  }
}

// ✅ Retornar SDK session ID para frontend
enqueue({
  type: "final",
  message: { role: "assistant", content: text, parts },
  conversationId,
  sdkSessionId: returnedSessionId,  // ✅ Frontend usa isso na próxima request
  events,
})
```

**Funções Removidas:**
- ❌ `buildAgentMessages()` - Não mais necessário
- ❌ `extractText()` - Não mais necessário
- ❌ `isLegacyContent()` - Não mais necessário
- ❌ `buildConversationHistorySummary()` - Não mais necessário

---

### 3. `/apps/api/src/services/event-storage.ts`

#### Tipo Conversation:

```typescript
export type Conversation = {
  id: string;
  org_id: string;
  user_id?: string;
  title?: string;
  sdk_session_id?: string;  // ✅ Novo campo
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
```

#### Novos Métodos:

```typescript
/**
 * Create conversation with optional SDK session ID
 */
async createConversation(
  orgId: string,
  userId?: string,
  title?: string,
  metadata?: Record<string, unknown>,
  sdkSessionId?: string,  // ✅ Novo parâmetro
): Promise<Conversation> {
  const { data, error } = await this.client
    .from("conversations")
    .insert({
      org_id: orgId,
      user_id: userId,
      title,
      sdk_session_id: sdkSessionId,  // ✅ Salvar SDK session ID
      metadata: metadata ?? {},
    })
    .select()
    .single();
  // ...
}

/**
 * Update SDK session ID for existing conversation
 */
async updateSdkSessionId(
  conversationId: string,
  sdkSessionId: string,
): Promise<void> {
  const { error } = await this.client
    .from("conversations")
    .update({ sdk_session_id: sdkSessionId })
    .eq("id", conversationId);
  // ...
}
```

---

### 4. Database Migration

**Arquivo:** `/apps/api/migrations/0003_add_sdk_session_id.sql`

```sql
-- Add SDK session ID to conversations table
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS sdk_session_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_sdk_session_id
ON public.conversations(sdk_session_id)
WHERE sdk_session_id IS NOT NULL;
```

**Status:** ✅ Aplicada com sucesso via `mcp__supabase__apply_migration`

---

## 🔄 Fluxo de Dados

### Nova Conversa (Primeira Mensagem)

```
1. Frontend envia:
   POST /chat/v2
   {
     "message": "Olá, como você está?",
     "mode": "simple"
   }

2. Backend:
   - Cria conversation no DB (sem sdkSessionId ainda)
   - Chama executeClaudeAgent({ message, sdkSessionId: undefined })

3. SDK:
   - Cria nova sessão internamente
   - Processa mensagem
   - Retorna eventos + session_id

4. Backend:
   - Captura sdkSessionId dos eventos
   - Atualiza conversation.sdk_session_id no DB
   - Retorna response com sdkSessionId

5. Frontend recebe:
   {
     "type": "final",
     "message": { "role": "assistant", "content": "..." },
     "conversationId": "uuid-123",
     "sdkSessionId": "sdk-session-456"  // ✅ Guardar para próxima request
   }
```

### Continuar Conversa (Mensagens Seguintes)

```
1. Frontend envia:
   POST /chat/v2
   {
     "message": "E sobre machine learning?",
     "conversationId": "uuid-123",
     "sdkSessionId": "sdk-session-456"  // ✅ Passa SDK session ID
   }

2. Backend:
   - Chama executeClaudeAgent({
       message,
       sdkSessionId: "sdk-session-456"  // ✅ SDK resume sessão
     })

3. SDK:
   - Resume sessão existente via resume: "sdk-session-456"
   - TEM TODO O CONTEXTO anterior
   - TEM TODOS os tool results anteriores
   - Processa nova mensagem com contexto completo

4. Backend:
   - Salva eventos no DB (display only)
   - Atualiza sdk_session_id (mesmo valor)
   - Retorna response

5. Frontend:
   - Recebe resposta contextualizada
   - Claude lembra da conversa anterior ✅
```

### Quando Claude Precisa Buscar Dados

```
1. Claude decide usar tool durante processamento

2. SDK chama MCP tool:
   mcp__supermemory-tools__searchDatabase({
     query: "machine learning",
     orgId: "org-123",
     // ...
   })

3. MCP Tool:
   - Faz query no nosso Supabase
   - Retorna resultados estruturados

4. SDK:
   - Recebe resultados do tool
   - PRESERVA resultado no contexto da sessão
   - Continua processamento com os dados

5. Próxima mensagem:
   - SDK AINDA TEM os tool results disponíveis ✅
   - Claude pode referenciar dados buscados anteriormente
```

---

## 🧪 Como Testar

### Pré-requisitos

1. Servidor rodando: `bun run dev`
2. Supabase configurado
3. Claude API key configurada

### Script de Teste

Criado em `/apps/api/scripts/test-sdk-sessions.sh`:

```bash
./apps/api/scripts/test-sdk-sessions.sh
```

**O que o script testa:**

1. ✅ **Test 1**: Nova conversa sem sdkSessionId
   - Verifica que conversationId é criado
   - Verifica que sdkSessionId é retornado

2. ✅ **Test 2**: Continuar conversa com sdkSessionId
   - Passa sdkSessionId da resposta anterior
   - Verifica que Claude lembra do contexto

3. ✅ **Test 3**: Continuar só com sdkSessionId (sem conversationId)
   - Demonstra que SDK gerencia sessão independentemente do nosso DB
   - Conversa continua mesmo sem nosso conversation ID

4. ✅ **Test 4**: Nova conversa retorna IDs diferentes
   - Verifica isolamento entre conversas

### Teste Manual via cURL

#### 1. Primeira mensagem:
```bash
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Olá! Busque informações sobre inteligência artificial na minha base.",
    "mode": "agentic"
  }'
```

**Resposta esperada:**
```json
{"type":"conversation","conversationId":"uuid-123-..."}
{"type":"assistant_delta","text":"Vou "}
{"type":"assistant_delta","text":"buscar "}
{"type":"tool_event","toolName":"mcp__supermemory-tools__searchDatabase","state":"input-streaming"}
{"type":"tool_event","toolName":"mcp__supermemory-tools__searchDatabase","state":"output-available","output":{...}}
{"type":"assistant_delta","text":"informações"}
...
{"type":"final","message":{...},"conversationId":"uuid-123","sdkSessionId":"sdk-456"}
```

**Capturar:**
- `conversationId`: "uuid-123"
- `sdkSessionId`: "sdk-456"

#### 2. Segunda mensagem (continuação):
```bash
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Quantos documentos você encontrou?",
    "conversationId": "uuid-123",
    "sdkSessionId": "sdk-456",
    "mode": "simple"
  }'
```

**Resultado esperado:**
- ✅ Claude responde referenciando a busca anterior
- ✅ Não precisa fazer nova busca
- ✅ Contexto preservado pelo SDK

---

## 📊 Comparação: Antes vs Depois

| Aspecto | Antes (Híbrido) | Depois (SDK Puro) |
|---------|----------------|-------------------|
| **Complexidade** | 🔴 Alta (500+ linhas) | 🟢 Baixa (300 linhas) |
| **Manutenibilidade** | 🔴 Difícil | 🟢 Fácil |
| **Contexto** | 🔴 Parcial/Perdido | 🟢 Completo |
| **Tool Results** | 🔴 Perdidos | 🟢 Preservados |
| **Escalabilidade** | 🔴 Questionável | 🟢 Escalável |
| **Alinhamento SDK** | 🔴 Lutando contra | 🟢 Trabalhando com |
| **Token Usage** | 🟡 Médio-Alto | 🟢 Otimizado |
| **Bugs Potenciais** | 🔴 Muitos | 🟢 Poucos |

---

## 🎓 Lições Aprendidas

### 1. Trabalhe COM o SDK, não CONTRA ele

❌ **Errado:**
```typescript
// Tentar forçar histórico no SDK
const resume = buildHistorySummary(dbMessages)
systemPrompt += `\n\nHistórico: ${resume}`
```

✅ **Certo:**
```typescript
// Deixar SDK gerenciar com resume
const options = { resume: sdkSessionId }
```

### 2. Separação de Responsabilidades

**SDK (Gerencia):**
- ✅ Sessões e contexto
- ✅ Histórico de mensagens
- ✅ Tool results
- ✅ Estado da conversa

**Nosso Backend (Gerencia):**
- ✅ Autenticação/Autorização
- ✅ Persistência para display
- ✅ Streaming para frontend
- ✅ MCP tools (acesso a dados)

### 3. Database é para Display, não para Claude

❌ **Errado:**
```typescript
// Carregar do DB para alimentar Claude
const history = await loadMessagesFromDB()
// Tentar passar para SDK...
```

✅ **Certo:**
```typescript
// Salvar no DB só para usuário ver
await saveEventToDB(event)  // Display only

// Claude usa MCP tools quando precisa de dados
// SDK gerencia próprio histórico
```

### 4. SDK Session ID ≠ Conversation ID

- **SDK Session ID**: Gerenciado pelo SDK, identifica sessão no SDK
- **Conversation ID**: Nosso UUID no DB, para display/analytics

Ambos são independentes mas relacionados:
```typescript
{
  conversationId: "uuid-123",      // Nosso DB
  sdkSessionId: "sdk-session-456"  // SDK interno
}
```

---

## 🚀 Próximos Passos (Futuro)

### Scaling Considerations

1. **SDK Session Persistence**
   - SDK armazena sessões em `~/.claude/projects/` localmente
   - Para produção distribuída, considerar:
     - Session storage compartilhado
     - Redis para session cache
     - Ou aceitar que sessões são efêmeras por servidor

2. **Session Expiry**
   - Implementar cleanup de sessões antigas
   - Definir TTL para sessões no SDK

3. **Session Recovery**
   - Se sessão SDK expirar, como recuperar?
   - Opções:
     - Aceitar início de nova sessão
     - Ou criar resumo do DB para nova sessão (fallback)

---

## 📚 Referências

- **Claude Agent SDK Docs**: https://docs.claude.com/en/api/agent-sdk/typescript
- **MCP Protocol**: https://docs.anthropic.com/mcp
- **Migration 0002**: `/apps/api/migrations/0002_add_conversation_tables.sql`
- **Migration 0003**: `/apps/api/migrations/0003_add_sdk_session_id.sql`
- **Previous Documentation**:
  - `CLAUDE_AGENT_HISTORY_SOLUTION.md` (solução híbrida - descontinuada)
  - `CLAUDE_AGENT_CONTINUE_FLAG.md` (abordagem de flag - descontinuada)

---

## ✅ Checklist de Implementação

- [x] Refatorar `claude-agent.ts` para usar `resume`
- [x] Simplificar `chat-v2.ts` para ser proxy
- [x] Atualizar schema de request
- [x] Adicionar campo `sdk_session_id` no DB
- [x] Criar migration para `sdk_session_id`
- [x] Aplicar migration no Supabase
- [x] Implementar `updateSdkSessionId()`
- [x] Capturar SDK session ID nos eventos
- [x] Retornar SDK session ID para frontend
- [x] Criar script de teste
- [ ] Executar testes (aguardando servidor)
- [x] Documentar arquitetura

---

**Última atualização:** 28 de Outubro de 2025
**Versão:** 3.0
**Status:** ✅ Produção Ready (após testes)
