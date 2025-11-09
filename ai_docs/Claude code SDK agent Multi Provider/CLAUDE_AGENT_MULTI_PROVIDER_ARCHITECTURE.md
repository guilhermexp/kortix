# Claude Agent Multi-Provider Architecture

**Status**: ✅ Active - Production Ready
**Created**: November 9, 2025
**Last Updated**: November 9, 2025
**Version**: 2.0

---

## 📋 Executive Summary

O Supermemory implementa um sistema de chat agentic com **4 provedores de IA diferentes** que podem ser selecionados dinamicamente pelo usuário. Todos os provedores são compatíveis com a API da Anthropic (Claude), permitindo troca transparente entre eles usando o Claude Agent SDK.

### Key Features
- ✅ 4 provedores de IA intercambiáveis
- ✅ Seleção dinâmica na UI (dropdown)
- ✅ Persistência de preferência no localStorage
- ✅ API unificada (Anthropic-compatible)
- ✅ Claude Agent SDK para orquestração
- ✅ Ferramentas MCP personalizadas
- ✅ Gerenciamento de sessões
- ✅ Streaming de respostas
- ✅ Histórico de conversações

---

## 🎯 Os 4 Provedores

### 1. **GLM-4.6** (Z.AI)
```typescript
{
  id: "glm",
  name: "Z.AI (GLM)",
  displayName: "GLM-4.6",
  baseURL: "https://api.z.ai/api/anthropic",
  models: {
    fast: "GLM-4.5-Air",
    balanced: "GLM-4.6",
    advanced: "GLM-4.6",
  },
  description: "Fast and balanced general-purpose model"
}
```

**Características**:
- 🚀 Rápido e balanceado
- 🎯 Propósito geral
- 🔗 API compatível com Anthropic
- ⏱️ Timeout: 5 minutos

**Melhor para**:
- Tarefas gerais de conversação
- Resposta rápida com qualidade
- Uso diário

---

### 2. **MiniMax-M2**
```typescript
{
  id: "minimax",
  name: "MiniMax",
  displayName: "MiniMax-M2",
  baseURL: "https://api.minimax.io/anthropic",
  models: {
    fast: "MiniMax-M2",
    balanced: "MiniMax-M2",
    advanced: "MiniMax-M2",
  },
  description: "Advanced reasoning and creative tasks",
  settings: {
    disableNonessentialTraffic: true // Otimização específica
  }
}
```

**Características**:
- 🧠 Raciocínio avançado
- 🎨 Tarefas criativas
- 🔗 API compatível com Anthropic
- ⚡ Otimização de tráfego

**Melhor para**:
- Raciocínio complexo
- Criatividade e geração de conteúdo
- Análise profunda

---

### 3. **Claude Haiku 4.5** (Anthropic - Oficial)
```typescript
{
  id: "anthropic",
  name: "Anthropic",
  displayName: "Haiku 4.5",
  baseURL: "https://api.anthropic.com", // API oficial
  models: {
    fast: "claude-haiku-4-5-20251001",
    balanced: "claude-haiku-4-5-20251001",
    advanced: "claude-haiku-4-5-20251001",
  },
  description: "Claude's fastest model with frontier intelligence"
}
```

**Características**:
- ⚡ Modelo mais rápido da Claude
- 🧠 Inteligência de fronteira
- 🔒 API oficial da Anthropic
- 💯 Máxima compatibilidade

**Melhor para**:
- Respostas instantâneas
- Máxima confiabilidade
- Tarefas que exigem Claude oficial

---

### 4. **Kimi K2 Thinking** (Default)
```typescript
{
  id: "kimi",
  name: "Kimi",
  displayName: "Kimi K2 Thinking",
  baseURL: "https://api.kimi.com/coding/", // Nota: barra final obrigatória
  models: {
    fast: "kimi-for-coding",
    balanced: "kimi-for-coding",
    advanced: "kimi-for-coding",
  },
  description: "Advanced coding and reasoning with thinking mode"
}
```

**Características**:
- 💻 Especializado em código
- 🧠 Modo "thinking" avançado
- 🎯 Raciocínio profundo
- 🔗 API compatível com Anthropic
- ⭐ **Provedor padrão**

**Melhor para**:
- Tarefas de programação
- Raciocínio passo-a-passo
- Debugging e análise de código
- Arquitetura de software

---

## 🏗️ Arquitetura do Sistema

### Fluxo Completo de uma Mensagem

```
[UI] Usuário seleciona provider e escreve mensagem
  ↓
[UI] ProviderSelector salva escolha no localStorage
  ↓
[Frontend] useChat hook envia para /api/chat-v2
  {
    message: "user message",
    provider: "kimi",  // ← Provider selecionado
    continueSession: true,
    mode: "agentic"
  }
  ↓
[Backend] chat-v2.ts valida request
  ↓
[Backend] Busca configuração do provider
  getProviderConfig("kimi") → config
  ↓
[Backend] executeClaudeAgent({
  message: string,
  provider: "kimi",  // ← Passa provider
  client: SupabaseClient,
  orgId: string,
  context: { scopedDocumentIds },
  maxTurns: number
})
  ↓
[Agent] claude-agent.ts configura ambiente
  - process.env.ANTHROPIC_API_KEY = config.apiKey
  - process.env.ANTHROPIC_BASE_URL = config.baseURL
  - model = config.models.balanced
  ↓
[Agent] Cria ferramentas MCP
  - supermemory-tools (searchDatabase)
  - deepwiki (pesquisa web)
  - sequential-thinking (raciocínio)
  ↓
[Agent] Chama Claude Agent SDK query()
  - prompt: user message
  - options: { model, mcpServers, maxTurns }
  - continue/resume session
  ↓
[SDK] Orquestra conversa com IA
  - Envia mensagem para baseURL do provider
  - IA pode chamar ferramentas MCP
  - Streaming de resposta
  ↓
[Agent] Processa eventos do SDK
  - Extrai texto da resposta
  - Rastreia chamadas de ferramentas
  - Captura session ID
  ↓
[Backend] Streaming SSE para frontend
  events:
    - { type: "assistant_delta", text: "..." }
    - { type: "tool-searchMemories", ... }
    - { type: "session-sdk-id", id: "..." }
    - { type: "done", ... }
  ↓
[UI] Renderiza resposta em tempo real
  - Texto
  - Ferramentas usadas
  - Documentos mencionados
```

---

## 🔑 Componentes Principais

### 1. **Provider Configuration** (`apps/api/src/config/providers.ts`)

```typescript
export const PROVIDER_CONFIGS = {
  glm: { /* Z.AI config */ },
  minimax: { /* MiniMax config */ },
  anthropic: { /* Anthropic config */ },
  kimi: { /* Kimi config */ },
}

// Funções utilitárias
export function getProviderConfig(providerId: ProviderId): ProviderConfig
export function getDefaultProvider(): ProviderId  // Retorna "kimi"
export function listProviders(): ProviderConfig[]
export function isValidProvider(providerId: string): boolean
```

**Responsabilidades**:
- ✅ Define configuração de todos os providers
- ✅ Armazena API keys e endpoints
- ✅ Define modelos disponíveis (fast/balanced/advanced)
- ✅ Configurações específicas por provider
- ✅ Validação de provider ID

---

### 2. **Claude Agent Service** (`apps/api/src/services/claude-agent.ts`)

```typescript
export async function executeClaudeAgent(
  options: ClaudeAgentOptions,
  callbacks: ClaudeAgentCallbacks
): Promise<{
  events: unknown[]
  text: string
  parts: AgentPart[]
  sdkSessionId: string | null
}>
```

**Parâmetros principais**:
```typescript
{
  message: string                    // Mensagem do usuário
  sdkSessionId?: string             // Retomar sessão específica
  continueSession?: boolean         // Continuar última sessão
  client: SupabaseClient            // Cliente do Supabase
  orgId: string                     // ID da organização
  systemPrompt?: string             // Prompt do sistema (carregado de .claude/CLAUDE.md)
  model?: string                    // Modelo específico (opcional)
  provider?: ProviderId             // 🎯 Provider selecionado
  context?: AgentContextOptions     // Contexto (documentos, tags)
  allowedTools?: string[]           // Ferramentas permitidas
  maxTurns?: number                 // Máximo de turnos de conversa
}
```

**Processo interno**:
1. **Validação de segurança**:
   ```typescript
   const ALLOWED_BASE_URLS = [
     "https://api.anthropic.com",
     "https://api.z.ai/api/anthropic",
     "https://api.minimax.io/anthropic",
     "https://api.kimi.com/coding/",
   ]
   ```

2. **Configuração do provider**:
   ```typescript
   const providerId = provider || getDefaultProvider()
   const providerConfig = getProviderConfig(providerId)

   // Aplica configuração ao ambiente (global state)
   process.env.ANTHROPIC_API_KEY = providerConfig.apiKey
   process.env.ANTHROPIC_BASE_URL = providerConfig.baseURL

   const resolvedModel = model || providerConfig.models.balanced
   ```

3. **Criação de ferramentas MCP**:
   ```typescript
   const toolsServer = createSupermemoryTools(client, orgId, context)

   mcpServers: {
     "supermemory-tools": toolsServer,          // 🔧 Busca no banco
     "deepwiki": { /* ... */ },                  // 🌐 Pesquisa web
     "sequential-thinking": { /* ... */ },       // 🧠 Raciocínio
   }
   ```

4. **Chamada ao SDK**:
   ```typescript
   const agentIterator = query({
     prompt: createPromptStream([userMessage]),
     options: {
       model: resolvedModel,
       mcpServers,
       maxTurns,
       continue: continueSession,
       resume: sdkSessionId,
       settingSources: ["project"],  // Carrega .claude/CLAUDE.md
       // ...
     }
   })
   ```

5. **Processamento de eventos**:
   ```typescript
   for await (const event of agentIterator) {
     // Captura session ID
     if (event.session_id) capturedSessionId = event.session_id

     // Log de ferramentas
     if (event.type === "assistant") {
       // Log tool calls
     }

     // Callback de streaming
     if (callbacks.onEvent) await callbacks.onEvent(event)

     events.push(event)
   }
   ```

6. **Construção da resposta**:
   ```typescript
   const { text, parts } = buildAssistantResponse(events)

   return {
     events,     // Todos os eventos do SDK
     text,       // Texto extraído
     parts,      // Partes estruturadas (texto + ferramentas)
     sdkSessionId: capturedSessionId  // Session ID para próximas msgs
   }
   ```

---

### 3. **Chat API Route** (`apps/api/src/routes/chat-v2.ts`)

**Schema de Request**:
```typescript
const chatRequestSchema = z.object({
  message: z.string().min(1).max(50000),
  sdkSessionId: z.string().optional(),
  continueSession: z.boolean().optional(),
  conversationId: z.string().uuid().optional(),
  mode: z.enum(["simple", "agentic", "deep"]).default("simple"),
  metadata: z.record(z.string(), z.any()).optional(),
  model: z.string().optional(),
  provider: z.enum(["glm", "minimax", "anthropic", "kimi"]).optional(), // 🎯
  scopedDocumentIds: z.array(z.string()).optional(),
})
```

**Modos de conversa**:
```typescript
const maxTurns = {
  simple: 6,    // Conversação simples
  agentic: 10,  // Com ferramentas
  deep: 12      // Raciocínio profundo
}[mode]
```

**Fluxo de processamento**:
```typescript
// 1. Validação e autenticação
const payload = chatRequestSchema.parse(await c.req.json())
const { user, orgId } = await authenticateRequest(c)

// 2. Resolução do modelo
const resolvedModel = payload.provider
  ? undefined  // Usa modelo padrão do provider
  : normalizeModel(payload.model, env.CHAT_MODEL)

// 3. Contexto de ferramentas
const toolContext = {
  containerTags: projectId ? [projectId] : undefined,
  scopedDocumentIds: effectiveScopedIds,
}

// 4. Execução do agente
const { events, text, parts, sdkSessionId } = await executeClaudeAgent(
  {
    message: messageForAgent,
    sdkSessionId: payload.sdkSessionId,
    continueSession: payload.continueSession,
    client,
    orgId,
    systemPrompt,
    model: resolvedModel,
    provider: payload.provider, // 🎯 Passa provider
    context: toolContext,
    maxTurns,
  },
  {
    onEvent: async (event) => {
      // Streaming de deltas para o frontend
      const delta = extractTextDeltaFromEvent(event)
      if (delta) enqueue({ type: "assistant_delta", text: delta })
    }
  }
)

// 5. Persistência
await persistToolEvents({ eventStorage, conversationId, events })

// 6. Retorno via SSE
return streamSSE(c, async (stream) => {
  await stream.write({ data: JSON.stringify({ type: "done", ... }) })
})
```

---

### 4. **Provider Selector UI** (`apps/web/components/views/chat/provider-selector.tsx`)

**Componente**:
```typescript
export function ProviderSelector({
  value,
  onChange,
  disabled = false,
}: ProviderSelectorProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(
    value || "kimi"  // Default
  )

  const handleChange = (newProvider: string) => {
    setSelectedProvider(providerId)
    if (onChange) onChange(providerId)

    // Persistência
    localStorage.setItem("preferred_provider", providerId)
  }

  return (
    <Select value={selectedProvider} onValueChange={handleChange}>
      {/* UI com dropdown dos 4 providers */}
    </Select>
  )
}
```

**Hook personalizado**:
```typescript
export function useProviderSelection() {
  const [provider, setProvider] = useState<ProviderId>("kimi")

  useEffect(() => {
    // Carrega preferência salva
    const saved = localStorage.getItem("preferred_provider")
    if (saved && isValidProvider(saved)) {
      setProvider(saved)
    }
  }, [])

  return { provider, setProvider }
}
```

**UI Rendering**:
```typescript
<SelectItem value="kimi">
  <div>
    <span>Kimi</span>
    <span>Kimi K2 Thinking</span>
    <span>Advanced coding and reasoning with thinking mode</span>
  </div>
</SelectItem>
```

---

## 🔧 Ferramentas MCP (Model Context Protocol)

O sistema usa 3 servidores MCP:

### 1. **supermemory-tools** (Interno)
```typescript
createSupermemoryTools(client, orgId, context) → {
  searchDatabase: {
    description: "Search the user's memory database",
    inputSchema: {
      query: string,
      limit: number,
      scopedDocumentIds?: string[]
    },
    handler: async (input) => {
      // Busca híbrida (vector + text)
      const results = await hybridSearch(...)
      return { count, results }
    }
  }
}
```

**Funcionalidade**:
- 🔍 Busca semântica no banco de dados
- 📄 Suporta filtro por documentos específicos
- 🎯 Usado automaticamente pelo agente para acessar memórias

---

### 2. **deepwiki** (HTTP MCP)
```typescript
deepwiki: {
  type: "http",
  url: "https://mcp.deepwiki.com/mcp",
}
```

**Funcionalidade**:
- 🌐 Pesquisa na web
- 📚 Acesso a conhecimento externo
- 🔗 Integração via HTTP MCP

---

### 3. **sequential-thinking** (Stdio MCP)
```typescript
"sequential-thinking": {
  command: "zed-mcp-server-sequential-thinking",
  args: []
}
```

**Funcionalidade**:
- 🧠 Raciocínio passo-a-passo
- 📝 Pensamento estruturado
- 🎯 Melhora qualidade de respostas complexas

---

## 🔐 Segurança e Restrições

### Ferramentas Desabilitadas
```typescript
disallowedTools: [
  "Bash",         // Execução de comandos
  "Grep",         // Busca em arquivos
  "KillShell",    // Encerrar processos
  "Agent",        // Subagentes
  "ExitPlanMode", // Controle de fluxo
]
```

**Razão**: Evitar operações perigosas no servidor de produção.

---

### Whitelist de Base URLs
```typescript
const ALLOWED_BASE_URLS = [
  "https://api.anthropic.com",
  "https://api.z.ai/api/anthropic",
  "https://api.minimax.io/anthropic",
  "https://api.kimi.com/coding/",
]

if (!ALLOWED_BASE_URLS.includes(providerConfig.baseURL)) {
  throw new Error(`Invalid provider base URL`)
}
```

**Razão**: Prevenir vazamento de credenciais para endpoints não autorizados.

---

## 💾 Gerenciamento de Sessões

### Session Modes

1. **Nova Sessão** (New Session)
   ```typescript
   executeClaudeAgent({
     message: "Hello",
     // Sem sdkSessionId, sem continueSession
   })
   ```
   - Cria nova conversa
   - SDK gera novo session ID
   - System prompt carregado de `.claude/CLAUDE.md`

2. **Continuar Sessão** (Continue)
   ```typescript
   executeClaudeAgent({
     message: "Next question",
     continueSession: true,  // ← Continua a mais recente
   })
   ```
   - Continua a sessão mais recente automaticamente
   - Mantém contexto e histórico
   - Ideal para conversação sequencial

3. **Retomar Sessão** (Resume)
   ```typescript
   executeClaudeAgent({
     message: "Back to old topic",
     sdkSessionId: "abc123",  // ← ID específico
   })
   ```
   - Retoma conversa antiga específica
   - Usa session ID salvo
   - Ideal para múltiplas conversas paralelas

---

### Persistência de Sessões

```typescript
// SDK retorna session ID nos eventos
for await (const event of agentIterator) {
  if (event.session_id) {
    capturedSessionId = event.session_id
    console.log("Session ID:", capturedSessionId)
  }
}

// Retorna session ID para próximas requisições
return {
  sdkSessionId: capturedSessionId,
  // ...
}
```

**Armazenamento**:
- **Frontend**: Armazena `sdkSessionId` no estado local
- **Backend**: Salva eventos em `conversations` e `events` (Supabase)

---

## 📊 Event Storage (Histórico)

### Schema do Banco

```sql
-- Conversas
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  sdk_session_id TEXT,  -- ID da sessão do SDK
  org_id UUID,
  user_id UUID,
  title TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Eventos individuais
CREATE TABLE events (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  type TEXT,           -- "user", "assistant", "tool_use", etc.
  content JSONB,       -- Conteúdo completo do evento
  created_at TIMESTAMP
)
```

### Persistência de Eventos

```typescript
await persistToolEvents({
  eventStorage,
  conversationId,
  events  // Todos os eventos do SDK
})
```

**O que é salvo**:
- ✅ Mensagens do usuário
- ✅ Respostas do assistente
- ✅ Chamadas de ferramentas (tool_use)
- ✅ Resultados de ferramentas (tool_result)
- ✅ Timestamps de cada evento
- ✅ Metadata (model, provider, etc.)

---

## 🎨 UI/UX Features

### 1. **Provider Dropdown**
- 📍 Localização: Acima do input de chat
- 🎨 Estilo: Glassmorphism com backdrop blur
- 💾 Persistência: localStorage
- 🔄 Atualização: Tempo real

### 2. **Streaming de Resposta**
```typescript
onEvent: async (event) => {
  const delta = extractTextDeltaFromEvent(event)
  if (delta) {
    enqueue({ type: "assistant_delta", text: delta })
  }
}
```

**Efeito**:
- ✍️ Texto aparece palavra por palavra
- ⚡ Feedback instantâneo
- 🎯 UX fluída

### 3. **Tool Visualization**
```typescript
parts: [
  { type: "text", text: "..." },
  {
    type: "tool-searchMemories",
    state: "output-available",
    output: {
      count: 5,
      results: [
        { documentId, title, url, score },
        // ...
      ]
    }
  }
]
```

**Renderização**:
- 🔧 Mostra ferramentas usadas
- 📄 Lista documentos encontrados
- 📊 Exibe scores de relevância

### 4. **Error Handling**
```typescript
try {
  const result = await executeClaudeAgent(...)
} catch (error) {
  if (error instanceof ConversationStorageUnavailableError) {
    // Log warning, continua execução
  } else {
    // Propaga erro para UI
  }
}
```

---

## 🚀 Performance e Otimizações

### 1. **Timeout Configuration**
```typescript
settings: {
  timeout: 300000  // 5 minutos
}
```

### 2. **MiniMax Traffic Optimization**
```typescript
settings: {
  disableNonessentialTraffic: true
}
```

### 3. **Streaming Efficiency**
- Eventos processados em tempo real
- Sem buffer de acumulação
- Latência mínima

### 4. **Session Reuse**
- Evita recarregar system prompt
- Mantém contexto de ferramentas
- Reduz overhead de inicialização

---

## 🧪 Testing e Debugging

### Logs Importantes

```typescript
// Provider selection
console.log("[executeClaudeAgent] Provider:", providerConfig.name)
console.log("[executeClaudeAgent] Using base URL:", providerConfig.baseURL)
console.log("[executeClaudeAgent] Using model:", resolvedModel)

// Session management
console.log("[executeClaudeAgent] Captured SDK session ID:", sessionId)

// Tool usage
console.log("[executeClaudeAgent] 🔧 Tool called:", toolName, input)
console.log("[executeClaudeAgent] ✅ Tool result:", resultPreview)

// Event summary
console.log(`[executeClaudeAgent] Completed with ${events.length} events`)
```

### Como Testar Providers

1. **Via UI**:
   ```
   - Abrir chat
   - Selecionar provider no dropdown
   - Enviar mensagem
   - Verificar resposta
   ```

2. **Via API**:
   ```bash
   curl -X POST http://localhost:4000/api/chat-v2 \
     -H "Content-Type: application/json" \
     -d '{
       "message": "Hello",
       "provider": "kimi",
       "mode": "agentic"
     }'
   ```

3. **Verificar Logs**:
   ```
   [executeClaudeAgent] Starting new session
   [executeClaudeAgent] Provider: Kimi (kimi)
   [executeClaudeAgent] Using base URL: https://api.kimi.com/coding/
   [executeClaudeAgent] Using model: kimi-for-coding
   ```

---

## 📚 Arquivos-Chave

| Arquivo | Propósito | Linhas |
|---------|-----------|--------|
| `apps/api/src/config/providers.ts` | Configuração dos 4 providers | 108 |
| `apps/api/src/services/claude-agent.ts` | Orquestração do agente + SDK | 709 |
| `apps/api/src/routes/chat-v2.ts` | API endpoint do chat | ~1500 |
| `apps/web/components/views/chat/provider-selector.tsx` | UI de seleção | 153 |
| `apps/api/src/services/claude-agent-tools.ts` | Ferramentas MCP | ~200 |
| `apps/api/.claude/CLAUDE.md` | System prompt | ~1000 |

---

## 🎓 Lições Aprendidas

### ✅ O que funciona bem

1. **Abstração consistente**: Todos os providers usam API compatível com Anthropic
2. **Configuração centralizada**: Único arquivo define todos os providers
3. **Hot-swapping**: Troca de provider sem reiniciar servidor
4. **Persistência de preferência**: UX consistente entre sessões
5. **Segurança em camadas**: Whitelist + validation + permission mode

### 🔄 Melhorias Futuras

1. **Per-request Anthropic client**: Evitar modificar `process.env` (global state)
2. **Provider health checks**: Detectar providers offline
3. **Fallback automático**: Se um provider falhar, tentar outro
4. **Rate limiting por provider**: Limites diferentes por provider
5. **Metrics por provider**: Track performance e custos
6. **A/B testing**: Comparar qualidade entre providers

### 🐛 Gotchas

1. **Kimi trailing slash**: `https://api.kimi.com/coding/` requer `/` final
2. **Global env mutation**: `process.env.ANTHROPIC_BASE_URL` é compartilhado
3. **Session ID persistence**: Frontend deve armazenar `sdkSessionId`
4. **Provider API keys**: Hardcoded (mover para env vars em produção)

---

## 🔗 Referências

- **Claude Agent SDK**: https://github.com/anthropics/claude-agent-sdk
- **MCP Specification**: https://modelcontextprotocol.io/
- **Anthropic API**: https://docs.anthropic.com/
- **GLM (Z.AI)**: https://z.ai/
- **MiniMax**: https://www.minimaxi.com/
- **Kimi**: https://kimi.moonshot.cn/

---

## 📝 Changelog

### v2.0 (November 9, 2025)
- ✅ 4 providers implementados
- ✅ UI de seleção completa
- ✅ Persistência de preferência
- ✅ Documentação criada

### v1.0 (October 2025)
- ✅ Claude Agent SDK integrado
- ✅ MCP tools implementadas
- ✅ Session management

---

**Última atualização**: November 9, 2025
**Autor**: Claude (AI Assistant)
**Status**: ✅ Produção
