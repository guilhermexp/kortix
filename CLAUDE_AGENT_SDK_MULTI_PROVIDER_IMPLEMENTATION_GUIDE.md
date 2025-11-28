# Claude Agent SDK + Multi Provider Implementation Guide

> **Guia Completo**: Como implementar Claude Agent SDK com seleção dinâmica de AI providers em qualquer aplicação

Este guia documenta uma implementação inovadora que permite aos usuários escolher dinamicamente entre múltiplos providers de AI (GLM, MiniMax, Anthropic, Kimi) mantendo compatibilidade total com o Claude Agent SDK.

---

## 📋 Índice

1. [Visão Geral da Arquitetura](#visão-geral-da-arquitetura)
2. [Conceitos-Chave](#conceitos-chave)
3. [Implementação Backend](#implementação-backend)
4. [Implementação Frontend](#implementação-frontend)
5. [Fluxo de Dados Completo](#fluxo-de-dados-completo)
6. [Sessões e Continuidade](#sessões-e-continuidade)
7. [Testing e Debugging](#testing-e-debugging)
8. [Troubleshooting](#troubleshooting)

---

## 🏗️ Visão Geral da Arquitetura

### Stack Tecnológico

```
Backend:
├── Bun/Node.js - Runtime
├── Hono - Web framework
├── Claude Agent SDK (@anthropic-ai/claude-agent-sdk)
├── Supabase - Database
└── TypeScript

Frontend:
├── Next.js 15+ - React framework
├── Zustand - State management
├── TailwindCSS - Styling
└── TypeScript
```

### Arquitetura de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Provider        │  │ Chat Messages   │  │ Chat Store  │ │
│  │ Selector (UI)   │  │ Component       │  │ (Zustand)   │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
│           │                    │                   │         │
│           └────────────────────┴───────────────────┘         │
│                              │                               │
│                              │ HTTP POST /chat/v2            │
│                              │ (provider: "kimi")            │
└──────────────────────────────┼───────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────┐
│                         Backend                              │
├──────────────────────────────┼───────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 1. Chat Endpoint (chat-v2.ts)                          │ │
│  │    ├─ Parse request (message, provider, sessionId)     │ │
│  │    ├─ Validate payload with Zod                        │ │
│  │    └─ Stream SSE response                              │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────────┐ │
│  │ 2. Provider Config (providers.ts)                      │ │
│  │    ├─ getProviderConfig(providerId)                    │ │
│  │    ├─ Returns: { apiKey, baseURL, models, ... }       │ │
│  │    └─ Validates against whitelist                      │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────────┐ │
│  │ 3. Claude Agent Service (claude-agent.ts)              │ │
│  │    ├─ Apply provider config to env vars               │ │
│  │    ├─ Setup MCP tools server                           │ │
│  │    ├─ Execute query() with streaming                   │ │
│  │    └─ Capture SDK session ID for continuity           │ │
│  └────────────────┬───────────────────────────────────────┘ │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────────┐ │
│  │ 4. MCP Tools (claude-agent-tools.ts)                   │ │
│  │    └─ searchDatabase - Custom tool for knowledge base │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔑 Conceitos-Chave

### 1. Multi Provider System

**O que é?**
Sistema que permite usar múltiplos providers de AI mantendo a mesma interface do Claude SDK.

**Por que?**
- Flexibilidade de custos
- Diferentes capabilities (reasoning, speed, quality)
- Redundância e fallback
- User choice

**Como funciona?**
Todos os providers implementam a API Claude-compatible, mas com diferentes:
- Base URLs (endpoints)
- API keys
- Modelos disponíveis
- Características específicas

### 2. Claude Agent SDK

**O que é?**
SDK oficial da Anthropic para criar agentes AI com:
- Streaming de respostas
- MCP (Model Context Protocol) tools
- Session management
- System prompts

**Por que usar?**
- Oficial da Anthropic
- Suporte a tools nativamente
- Streaming built-in
- Session persistence

### 3. MCP (Model Context Protocol)

**O que é?**
Protocolo para conectar ferramentas externas ao modelo.

**Exemplo de tool:**
```typescript
tool(
  "searchDatabase",
  "Search documents in knowledge base",
  {
    query: z.string(),
    limit: z.number().default(20),
  },
  async ({ query, limit }) => {
    // Execute search
    return { results: [...] }
  }
)
```

### 4. Session Management

**3 Modos de Sessão:**

1. **NEW SESSION** - Primeira mensagem ou sem session ID
   ```typescript
   { message: "Hello", sdkSessionId: null }
   ```

2. **CONTINUE** - Mensagens sequenciais (< 30 minutos)
   ```typescript
   { message: "Tell me more", continueSession: true }
   ```

3. **RESUME** - Retomando conversa antiga (> 30 minutos)
   ```typescript
   { message: "Back to our talk", sdkSessionId: "123", resume: true }
   ```

---

## 🔧 Implementação Backend

### Passo 1: Provider Configuration

**Arquivo:** `config/providers.ts`

```typescript
/**
 * Provider Configuration System
 *
 * Define todos os AI providers disponíveis com suas configurações
 */

import { env } from "../env"

// Tipos TypeScript
export type ProviderId = "glm" | "minimax" | "anthropic" | "kimi"

export interface ProviderConfig {
  id: ProviderId
  name: string
  displayName: string
  apiKey: string
  baseURL: string
  models: {
    fast: string
    balanced: string
    advanced: string
  }
  settings?: {
    timeout?: number
    [key: string]: any
  }
}

// Configurações de cada provider
export const PROVIDER_CONFIGS: Record<ProviderId, ProviderConfig> = {
  glm: {
    id: "glm",
    name: "Z.AI (GLM)",
    displayName: "GLM-4.6",
    apiKey: env.GLM_API_KEY || "fallback-key",
    baseURL: "https://api.z.ai/api/anthropic",
    models: {
      fast: "GLM-4.5-Air",
      balanced: "GLM-4.6",
      advanced: "GLM-4.6",
    },
    settings: {
      timeout: 300000, // 5 minutes
    },
  },

  minimax: {
    id: "minimax",
    name: "MiniMax",
    displayName: "MiniMax-M2",
    apiKey: env.MINIMAX_API_KEY || "fallback-key",
    baseURL: "https://api.minimax.io/anthropic",
    models: {
      fast: "MiniMax-M2",
      balanced: "MiniMax-M2",
      advanced: "MiniMax-M2",
    },
    settings: {
      timeout: 300000,
      disableNonessentialTraffic: true,
    },
  },

  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    displayName: "Haiku 4.5",
    apiKey: env.ANTHROPIC_API_KEY || "fallback-key",
    baseURL: "https://api.anthropic.com",
    models: {
      fast: "claude-haiku-4-5-20251001",
      balanced: "claude-haiku-4-5-20251001",
      advanced: "claude-haiku-4-5-20251001",
    },
    settings: {
      timeout: 300000,
    },
  },

  kimi: {
    id: "kimi",
    name: "Kimi",
    displayName: "Kimi K2 Thinking",
    apiKey: env.KIMI_API_KEY || "fallback-key",
    baseURL: "https://api.kimi.com/coding/",
    models: {
      fast: "kimi-for-coding",
      balanced: "kimi-for-coding",
      advanced: "kimi-for-coding",
    },
    settings: {
      timeout: 300000,
    },
  },
}

/**
 * Get provider configuration by ID
 */
export function getProviderConfig(providerId: ProviderId): ProviderConfig {
  const config = PROVIDER_CONFIGS[providerId]
  if (!config) {
    throw new Error(`Provider '${providerId}' not found`)
  }
  return config
}

/**
 * Get default provider (when user doesn't select one)
 */
export function getDefaultProvider(): ProviderId {
  return "kimi" // ou outro provider padrão
}

/**
 * List all available providers
 */
export function listProviders(): ProviderConfig[] {
  return Object.values(PROVIDER_CONFIGS)
}

/**
 * Validate provider ID
 */
export function isValidProvider(providerId: string): providerId is ProviderId {
  return providerId in PROVIDER_CONFIGS
}
```

**Variáveis de Ambiente (.env):**
```bash
# AI Provider API Keys
GLM_API_KEY=your_glm_key_here
MINIMAX_API_KEY=your_minimax_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
KIMI_API_KEY=your_kimi_key_here

# Default Chat Model
CHAT_MODEL=claude-haiku-4-5-20251001
```

---

### Passo 2: MCP Tools Implementation

**Arquivo:** `services/claude-agent-tools.ts`

```typescript
/**
 * MCP Tools for Claude Agent SDK
 *
 * Define custom tools que o agente pode usar durante conversas
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

interface ToolContext {
  containerTags?: string[]
  scopedDocumentIds?: string[]
}

/**
 * Create MCP tools server for Supermemory
 */
export function createSupermemoryTools(
  client: SupabaseClient,
  orgId: string,
  context: ToolContext = {},
) {
  return createSdkMcpServer({
    name: "your-app-tools",
    version: "1.0.0",
    tools: [
      // Tool 1: Search Database
      tool(
        "searchDatabase",
        "Search documents and information in the user's knowledge base",
        {
          query: z
            .string()
            .min(1)
            .describe("Search query text - keywords, questions, or topics"),
          limit: z
            .number()
            .min(1)
            .max(50)
            .default(20)
            .describe("Maximum number of results to return"),
          includeSummary: z
            .boolean()
            .default(true)
            .describe("Include document summaries in results"),
        },
        async ({ query, limit, includeSummary }) => {
          try {
            // Execute search logic here
            const results = await searchYourDatabase(client, orgId, {
              q: query,
              limit,
              includeSummary,
            })

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(results, null, 2),
                },
              ],
            }
          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : "Unknown error"

            console.error("[searchDatabase] Tool error:", error)

            return {
              content: [
                {
                  type: "text",
                  text: `searchDatabase failed: ${message}`,
                },
              ],
              isError: true,
            }
          }
        },
      ),

      // Tool 2: Add more custom tools here
      // tool("yourToolName", "description", schema, handler),
    ],
  })
}
```

---

### Passo 3: Claude Agent Service

**Arquivo:** `services/claude-agent.ts`

```typescript
/**
 * Claude Agent Service with Multi Provider Support
 *
 * Core service que integra Claude Agent SDK com sistema multi-provider
 */

import { query } from "@anthropic-ai/claude-agent-sdk"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  getDefaultProvider,
  getProviderConfig,
  type ProviderId,
} from "../config/providers"
import { createSupermemoryTools } from "./claude-agent-tools"

// Types
export interface AgentMessage {
  role: "user" | "assistant"
  content: string
}

export interface ClaudeAgentOptions {
  message: string
  sdkSessionId?: string
  resume?: boolean
  continueSession?: boolean
  client: SupabaseClient
  orgId: string
  systemPrompt?: string
  model?: string
  provider?: ProviderId
  allowedTools?: string[]
  maxTurns?: number
}

export interface ClaudeAgentCallbacks {
  onEvent?: (event: unknown) => void | Promise<void>
}

/**
 * Execute Claude Agent with Multi Provider Support
 */
export async function executeClaudeAgent(
  options: ClaudeAgentOptions,
  callbacks: ClaudeAgentCallbacks = {},
): Promise<{
  events: unknown[]
  text: string
  sdkSessionId: string | null
}> {
  const {
    message,
    sdkSessionId,
    resume,
    continueSession,
    client,
    orgId,
    systemPrompt,
    model,
    provider,
    maxTurns = 10,
  } = options

  // 1. Get provider configuration
  const providerId = provider || getDefaultProvider()
  const providerConfig = getProviderConfig(providerId)

  console.log("[executeClaudeAgent] Using provider:", providerConfig.name)

  // 2. Validate baseURL against whitelist (security)
  const ALLOWED_BASE_URLS = [
    "https://api.anthropic.com",
    "https://api.z.ai/api/anthropic",
    "https://api.minimax.io/anthropic",
    "https://api.kimi.com/coding/",
  ]

  if (!ALLOWED_BASE_URLS.includes(providerConfig.baseURL)) {
    throw new Error(`Invalid provider base URL: ${providerConfig.baseURL}`)
  }

  // 3. Apply provider configuration to environment
  // ⚠️ IMPORTANT: This modifies global state
  // In production, consider using per-request client instances
  process.env.ANTHROPIC_API_KEY = providerConfig.apiKey
  process.env.ANTHROPIC_BASE_URL = providerConfig.baseURL

  // 4. Resolve model (use provider's default if not specified)
  const resolvedModel = model || providerConfig.models.balanced

  console.log("[executeClaudeAgent] Using model:", resolvedModel)

  try {
    // 5. Create prompt stream
    const userMessage: AgentMessage = {
      role: "user",
      content: message,
    }

    const prompt = createPromptStream([userMessage])

    // 6. Create MCP tools server
    const toolsServer = createSupermemoryTools(client, orgId)

    // 7. Configure query options
    const queryOptions: Record<string, unknown> = {
      model: resolvedModel,
      mcpServers: {
        "your-app-tools": toolsServer,
      },
      maxTurns,
      permissionMode: "bypassPermissions",
      includePartialMessages: Boolean(callbacks.onEvent),

      // System prompt (optional - pode vir de .claude/CLAUDE.md)
      ...(systemPrompt ? { systemPrompt } : {}),
    }

    // 8. Session management
    if (continueSession) {
      // Continue most recent session (< 30 min)
      queryOptions.continue = true
      console.log("[executeClaudeAgent] Continue mode (recent session)")
    } else if (sdkSessionId && resume) {
      // Resume old session (> 30 min)
      queryOptions.resume = sdkSessionId
      console.log("[executeClaudeAgent] Resume mode:", sdkSessionId)
    } else if (sdkSessionId) {
      // Legacy: resume without explicit flag
      queryOptions.resume = sdkSessionId
      console.log("[executeClaudeAgent] Resume (legacy):", sdkSessionId)
    }
    // else: new session

    // 9. Execute Claude Agent SDK query
    const agentIterator = query({
      prompt,
      options: queryOptions,
    })

    // 10. Process events stream
    const events: unknown[] = []
    let capturedSessionId: string | null = sdkSessionId || null

    for await (const event of agentIterator) {
      // Capture SDK session ID from events
      if (
        event &&
        typeof event === "object" &&
        "session_id" in event &&
        typeof (event as any).session_id === "string"
      ) {
        capturedSessionId = (event as any).session_id
      }

      events.push(event)

      // Call event callback for streaming
      if (callbacks.onEvent) {
        await callbacks.onEvent(event)
      }
    }

    // 11. Extract final text from events
    const text = extractAssistantText(events)

    return {
      events,
      text,
      sdkSessionId: capturedSessionId,
    }
  } catch (error) {
    console.error("[executeClaudeAgent] Error:", error)
    throw error
  }
}

/**
 * Helper: Create prompt stream for Claude SDK
 */
function createPromptStream(messages: AgentMessage[]) {
  return (async function* promptGenerator() {
    for (const message of messages) {
      if (message.role !== "user") continue

      yield {
        type: "user" as const,
        message: {
          role: "user" as const,
          content: [{ type: "text", text: message.content }],
        },
      }
    }
  })()
}

/**
 * Helper: Extract text from event stream
 */
function extractAssistantText(events: unknown[]): string {
  const parts: string[] = []

  for (const event of events) {
    if (!event || typeof event !== "object") continue
    const typed = event as Record<string, unknown>

    // Look for text in various event formats
    if (typeof typed.type === "string" && typed.type.includes("output_text")) {
      const delta = typed.delta ?? typed.output_text ?? typed.text
      if (typeof delta === "string") {
        parts.push(delta)
      }
    }

    // Look for assistant messages
    const message =
      typed.message && typeof typed.message === "object"
        ? (typed.message as Record<string, unknown>)
        : null

    if (message && message.role === "assistant" && message.content) {
      // Extract text from content blocks
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (
            block &&
            typeof block === "object" &&
            "text" in block &&
            typeof (block as any).text === "string"
          ) {
            parts.push((block as any).text)
          }
        }
      }
    }
  }

  return parts.join("")
}
```

---

### Passo 4: HTTP Endpoint (Chat V2)

**Arquivo:** `routes/chat-v2.ts`

```typescript
/**
 * Chat V2 Endpoint - Multi Provider Chat with Streaming
 *
 * Endpoint HTTP que processa requests de chat e retorna streaming SSE
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { executeClaudeAgent } from "../services/claude-agent"

// Request schema with Zod validation
const chatRequestSchema = z.object({
  message: z.string().min(1).max(50000),
  sdkSessionId: z.string().optional(),
  resume: z.boolean().optional(),
  continueSession: z.boolean().optional(),
  conversationId: z.string().uuid().optional(),
  model: z.string().optional(),
  provider: z.enum(["glm", "minimax", "anthropic", "kimi"]).optional(),
  scopedDocumentIds: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})

/**
 * Handle Chat V2 Request
 */
export async function handleChatV2({
  orgId,
  userId,
  client,
  body,
}: {
  orgId: string
  userId?: string
  client: SupabaseClient
  body: unknown
}) {
  // 1. Validate request
  const payload = chatRequestSchema.parse(body ?? {})

  console.log("[Chat V2] Received request:", {
    provider: payload.provider,
    hasSessionId: !!payload.sdkSessionId,
    continueSession: payload.continueSession,
  })

  // 2. Create SSE stream
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`))
        } catch (error) {
          console.error("[Chat V2] Failed to enqueue:", error)
        }
      }

      try {
        // 3. Execute Claude Agent
        const { text, sdkSessionId: returnedSessionId } =
          await executeClaudeAgent(
            {
              message: payload.message,
              sdkSessionId: payload.sdkSessionId,
              resume: payload.resume,
              continueSession: payload.continueSession,
              client,
              orgId,
              model: payload.model,
              provider: payload.provider, // Pass provider selection
              maxTurns: 10,
            },
            {
              // Stream events to client in real-time
              onEvent: async (event) => {
                try {
                  // Process event for UI updates
                  const delta = extractTextDeltaFromEvent(event)
                  if (delta && delta.length > 0) {
                    enqueue({ type: "assistant_delta", text: delta })
                  }

                  // Stream tool events
                  processToolEvents(event, enqueue)
                } catch (error) {
                  console.error("[Chat V2] Event processing error:", error)
                }
              },
            },
          )

        // 4. Send final response
        enqueue({
          type: "final",
          message: { role: "assistant", content: text },
          conversationId: payload.conversationId,
          sdkSessionId: returnedSessionId,
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Internal chat failure"
        console.error("[Chat V2] Streaming error:", error)

        enqueue({
          type: "error",
          message,
        })
      } finally {
        controller.close()
      }
    },
  })

  // 5. Return SSE response
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
    },
  })
}

/**
 * Helper: Extract text delta from event
 */
function extractTextDeltaFromEvent(event: unknown): string | null {
  if (!event || typeof event !== "object") return null

  const typed = event as Record<string, unknown>

  // Look for text deltas in various formats
  if (typed.type === "content_block_delta") {
    const delta = typed.delta as Record<string, unknown> | undefined
    if (delta?.type === "text_delta" && typeof delta.text === "string") {
      return delta.text
    }
  }

  return null
}

/**
 * Helper: Process tool events for streaming
 */
function processToolEvents(
  event: unknown,
  enqueue: (payload: Record<string, unknown>) => void,
) {
  if (!event || typeof event !== "object") return

  const typed = event as Record<string, unknown>

  // Tool use started
  if (typed.type === "content_block_start") {
    const block = typed.content_block as Record<string, unknown> | undefined
    if (block?.type === "tool_use") {
      enqueue({
        type: "tool_event",
        toolName: block.name,
        state: "input-streaming",
      })
    }
  }

  // Tool result received
  if (typed.type === "content_block_stop") {
    // Process tool completion
    enqueue({
      type: "tool_event",
      state: "output-available",
    })
  }
}
```

**Registrar Rota (Hono example):**
```typescript
import { Hono } from "hono"
import { handleChatV2 } from "./routes/chat-v2"

const app = new Hono()

app.post("/chat/v2", async (c) => {
  const body = await c.req.json()

  // Get authenticated user/org from context
  const { orgId, userId, supabase } = c.get("auth")

  const response = await handleChatV2({
    orgId,
    userId,
    client: supabase,
    body,
  })

  return response
})
```

---

## 💻 Implementação Frontend

### Passo 5: Provider Selector Component

**Arquivo:** `components/provider-selector.tsx`

```typescript
/**
 * Provider Selector UI Component
 *
 * Dropdown que permite usuário escolher AI provider
 */

"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEffect, useState } from "react"

export type ProviderId = "glm" | "minimax" | "anthropic" | "kimi"

interface ProviderConfig {
  id: ProviderId
  name: string
  displayName: string
  description: string
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "glm",
    name: "Z.AI",
    displayName: "GLM-4.6",
    description: "Fast and balanced general-purpose model",
  },
  {
    id: "minimax",
    name: "MiniMax",
    displayName: "MiniMax-M2",
    description: "Advanced reasoning and creative tasks",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    displayName: "Haiku 4.5",
    description: "Claude's fastest model with frontier intelligence",
  },
  {
    id: "kimi",
    name: "Kimi",
    displayName: "Kimi K2 Thinking",
    description: "Advanced coding and reasoning with thinking mode",
  },
]

interface ProviderSelectorProps {
  value?: ProviderId
  onChange?: (provider: ProviderId) => void
  disabled?: boolean
}

export function ProviderSelector({
  value,
  onChange,
  disabled = false,
}: ProviderSelectorProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(
    value || "kimi",
  )

  useEffect(() => {
    if (value && value !== selectedProvider) {
      setSelectedProvider(value)
    }
  }, [value, selectedProvider])

  const handleChange = (newProvider: string) => {
    const providerId = newProvider as ProviderId
    setSelectedProvider(providerId)

    if (onChange) {
      onChange(providerId)
    }

    // Save to localStorage for persistence
    if (typeof window !== "undefined") {
      localStorage.setItem("preferred_provider", providerId)
    }
  }

  const currentProvider = PROVIDERS.find((p) => p.id === selectedProvider)

  return (
    <Select
      disabled={disabled}
      onValueChange={handleChange}
      value={selectedProvider}
    >
      <SelectTrigger className="w-fit">
        <SelectValue placeholder="Select provider">
          {currentProvider && (
            <span>{currentProvider.displayName}</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PROVIDERS.map((provider) => (
          <SelectItem key={provider.id} value={provider.id}>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{provider.name}</span>
                <span className="text-xs text-muted-foreground font-mono">
                  {provider.displayName}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {provider.description}
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Hook to manage provider selection with localStorage persistence
 */
export function useProviderSelection() {
  const [provider, setProvider] = useState<ProviderId>("kimi")

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("preferred_provider") as ProviderId | null
      if (saved && ["glm", "minimax", "anthropic", "kimi"].includes(saved)) {
        setProvider(saved)
      }
    }
  }, [])

  return {
    provider,
    setProvider,
  }
}
```

---

### Passo 6: Chat Store (Zustand)

**Arquivo:** `stores/chat.ts`

```typescript
/**
 * Chat Store - Persistent State Management
 *
 * Gerencia conversas, mensagens e SDK session IDs com localStorage
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  parts?: Array<unknown>
}

interface ConversationRecord {
  messages: Message[]
  title?: string
  lastUpdated: string
  sdkSessionId?: string | null // SDK session ID for continuity
}

interface ChatStoreState {
  conversations: Record<string, ConversationRecord>
  currentChatId: string | null

  setCurrentChatId: (chatId: string | null) => void
  setConversation: (chatId: string, messages: Message[]) => void
  deleteConversation: (chatId: string) => void
  setConversationTitle: (chatId: string, title: string) => void
  setSdkSessionId: (chatId: string, sdkSessionId: string | null) => void
  getSdkSessionId: (chatId: string) => string | null | undefined
  getCurrentConversation: () => Message[] | undefined
}

export const useChatStore = create<ChatStoreState>()(
  persist(
    (set, get) => ({
      conversations: {},
      currentChatId: null,

      setCurrentChatId(chatId) {
        set({ currentChatId: chatId })
      },

      setConversation(chatId, messages) {
        const now = new Date().toISOString()
        set((state) => ({
          conversations: {
            ...state.conversations,
            [chatId]: {
              messages,
              title: state.conversations[chatId]?.title,
              lastUpdated: now,
              sdkSessionId: state.conversations[chatId]?.sdkSessionId,
            },
          },
        }))
      },

      deleteConversation(chatId) {
        set((state) => {
          const { [chatId]: _, ...rest } = state.conversations
          return {
            conversations: rest,
            currentChatId: state.currentChatId === chatId ? null : state.currentChatId,
          }
        })
      },

      setConversationTitle(chatId, title) {
        set((state) => {
          const existing = state.conversations[chatId]
          if (!existing) return state

          return {
            conversations: {
              ...state.conversations,
              [chatId]: { ...existing, title },
            },
          }
        })
      },

      setSdkSessionId(chatId, sdkSessionId) {
        console.log("[Store] Saving SDK session ID:", sdkSessionId)
        set((state) => {
          const existing = state.conversations[chatId]
          if (!existing) return state

          return {
            conversations: {
              ...state.conversations,
              [chatId]: { ...existing, sdkSessionId },
            },
          }
        })
      },

      getSdkSessionId(chatId) {
        const conversation = get().conversations[chatId]
        return conversation?.sdkSessionId
      },

      getCurrentConversation() {
        const { currentChatId, conversations } = get()
        if (!currentChatId) return undefined
        return conversations[currentChatId]?.messages
      },
    }),
    {
      name: "app-chat-storage", // localStorage key
    },
  ),
)
```

---

### Passo 7: Chat Component (Main UI)

**Arquivo:** `components/chat.tsx`

```typescript
/**
 * Chat Component - Main Chat UI
 *
 * Componente principal que integra tudo: provider selector, messages, input
 */

"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { ProviderSelector, useProviderSelection } from "./provider-selector"
import { useChatStore } from "@/stores/chat"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || ""
const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

export function Chat() {
  const { provider, setProvider } = useProviderSelection()
  const {
    currentChatId,
    setCurrentChatId,
    setConversation,
    setSdkSessionId,
    getSdkSessionId,
    getCurrentConversation,
  } = useChatStore()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)

  // Session management
  const sdkSessionIdRef = useRef<string | null>(null)
  const lastMessageTimeRef = useRef<number>(0)

  // Load SDK session ID when chat changes
  useEffect(() => {
    if (currentChatId) {
      const savedSessionId = getSdkSessionId(currentChatId)
      if (savedSessionId) {
        sdkSessionIdRef.current = savedSessionId
        lastMessageTimeRef.current = 0 // Force resume mode
        console.log("[Chat] Loaded SDK session:", savedSessionId)
      } else {
        sdkSessionIdRef.current = null
        lastMessageTimeRef.current = 0
        console.log("[Chat] No SDK session found - will create new")
      }
    }
  }, [currentChatId, getSdkSessionId])

  /**
   * Send message to backend
   */
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return

    // Calculate session continuity
    const now = Date.now()
    const timeSinceLastMessage = now - lastMessageTimeRef.current
    const hasRecentSession =
      sdkSessionIdRef.current !== null &&
      timeSinceLastMessage < SESSION_TIMEOUT_MS

    // Determine session mode
    const continueSession = hasRecentSession
    const sdkSessionId = continueSession ? null : sdkSessionIdRef.current

    console.log("[Chat] Sending message with session:", {
      mode: continueSession
        ? "CONTINUE (recent)"
        : sdkSessionId
        ? "RESUME (old)"
        : "NEW SESSION",
      continueSession,
      sdkSessionId,
    })

    // Add user message to UI
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: text,
    }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsStreaming(true)

    try {
      // Make request
      const response = await fetch(`${BACKEND_URL}/chat/v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: text,
          provider, // Include provider selection
          ...(sdkSessionId ? { sdkSessionId, resume: true } : {}),
          ...(continueSession ? { continueSession: true } : {}),
        }),
      })

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`)
      }

      // Process SSE stream
      const reader = response.body?.getReader()
      if (!reader) throw new Error("Streaming not supported")

      const decoder = new TextDecoder()
      let buffer = ""
      let assistantText = ""

      const assistantMessage = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: "",
      }
      setMessages((prev) => [...prev, assistantMessage])

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process line-by-line
        let newlineIndex = buffer.indexOf("\n")
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          newlineIndex = buffer.indexOf("\n")

          if (!line) continue

          try {
            const event = JSON.parse(line)

            // Handle different event types
            if (event.type === "assistant_delta" && event.text) {
              assistantText += event.text
              setMessages((prev) => {
                const updated = [...prev]
                const last = updated[updated.length - 1]
                if (last && last.role === "assistant") {
                  last.content = assistantText
                }
                return updated
              })
            } else if (event.type === "final") {
              // Capture SDK session ID
              if (event.sdkSessionId) {
                sdkSessionIdRef.current = event.sdkSessionId
                lastMessageTimeRef.current = Date.now()
                console.log("[Chat] Captured SDK session:", event.sdkSessionId)

                // Save to store
                if (currentChatId) {
                  setSdkSessionId(currentChatId, event.sdkSessionId)
                }
              }
            } else if (event.type === "error") {
              throw new Error(event.message || "Chat error")
            }
          } catch (error) {
            console.error("[Chat] Parse error:", error)
          }
        }
      }
    } catch (error) {
      console.error("[Chat] Error:", error)
      // Handle error UI
    } finally {
      setIsStreaming(false)
    }
  }, [provider, currentChatId, isStreaming, setSdkSessionId])

  return (
    <div className="flex flex-col h-full">
      {/* Header with provider selector */}
      <div className="p-4 border-b">
        <ProviderSelector value={provider} onChange={setProvider} disabled={isStreaming} />
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-4 ${
              message.role === "user" ? "text-right" : "text-left"
            }`}
          >
            <div
              className={`inline-block p-3 rounded-lg ${
                message.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-black"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
      </div>

      {/* Input area */}
      <form
        className="p-4 border-t"
        onSubmit={(e) => {
          e.preventDefault()
          sendMessage(input)
        }}
      >
        <input
          type="text"
          className="w-full p-2 border rounded"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isStreaming}
        />
      </form>
    </div>
  )
}
```

---

## 🔄 Fluxo de Dados Completo

### 1. Primeira Mensagem (New Session)

```
User selects provider: "kimi"
  ↓
User types: "Hello"
  ↓
Frontend:
  - provider: "kimi"
  - message: "Hello"
  - sdkSessionId: null
  - continueSession: false
  ↓
POST /chat/v2
{
  "message": "Hello",
  "provider": "kimi"
}
  ↓
Backend:
  1. getProviderConfig("kimi")
     → { apiKey, baseURL: "https://api.kimi.com/coding/" }

  2. Set env vars:
     process.env.ANTHROPIC_API_KEY = kimi_key
     process.env.ANTHROPIC_BASE_URL = kimi_baseurl

  3. Execute Claude SDK query()
     → SDK creates NEW session
     → Returns session_id: "abc123"

  4. Stream events to frontend:
     {"type": "assistant_delta", "text": "Hello!"}
     {"type": "final", "sdkSessionId": "abc123"}
  ↓
Frontend:
  1. Update UI with "Hello!"
  2. Capture sdkSessionId: "abc123"
  3. Save to localStorage:
     conversations["chat-1"] = {
       sdkSessionId: "abc123",
       lastUpdated: now
     }
```

### 2. Continue Session (< 30 min)

```
User types: "Tell me more" (20 minutes later)
  ↓
Frontend:
  - Check: timeSinceLastMessage = 20min < 30min
  - Decision: CONTINUE mode
  - sdkSessionIdRef.current = "abc123"
  ↓
POST /chat/v2
{
  "message": "Tell me more",
  "provider": "kimi",
  "continueSession": true
}
  ↓
Backend:
  - Claude SDK uses queryOptions.continue = true
  - SDK automatically finds most recent session
  - Continues conversation context
  ↓
Frontend:
  - Receives response with same context
  - No new session ID needed
```

### 3. Resume Session (> 30 min)

```
User returns after 2 hours
  ↓
User clicks on old conversation
  ↓
Frontend:
  - Load sdkSessionId: "abc123" from localStorage
  - Check: timeSinceLastMessage = 2h > 30min
  - Decision: RESUME mode
  ↓
POST /chat/v2
{
  "message": "What were we talking about?",
  "provider": "kimi",
  "sdkSessionId": "abc123",
  "resume": true
}
  ↓
Backend:
  - Claude SDK uses queryOptions.resume = "abc123"
  - SDK loads old session with --resume flag
  - Restores full conversation context
  ↓
Frontend:
  - Receives response with restored context
  - Session continues from where it left off
```

### 4. Switch Provider

```
User switches from "kimi" to "anthropic"
  ↓
Frontend:
  - Reset: sdkSessionIdRef.current = null
  - New session will be created
  ↓
POST /chat/v2
{
  "message": "Hello with new provider",
  "provider": "anthropic"
}
  ↓
Backend:
  1. getProviderConfig("anthropic")
     → Different API key and baseURL

  2. Update env vars for Anthropic

  3. Claude SDK creates NEW session with Anthropic

  4. Returns new session ID: "xyz789"
  ↓
Frontend:
  - Save new session ID for Anthropic conversations
```

---

## 🧪 Testing e Debugging

### Logging Strategy

```typescript
// Backend (claude-agent.ts)
console.log("[executeClaudeAgent] Using provider:", providerConfig.name)
console.log("[executeClaudeAgent] Session mode:", sessionMode)
console.log("[executeClaudeAgent] Captured SDK session ID:", capturedSessionId)

// Frontend (chat.tsx)
console.log("[Chat] Sending with session:", { mode, continueSession, sdkSessionId })
console.log("[Chat] Captured SDK session:", event.sdkSessionId)

// Store (chat.ts)
console.log("[Store] Saving SDK session ID:", sdkSessionId)
```

### Testing Checklist

**1. Provider Switching:**
```bash
✓ Switch from GLM → MiniMax → Anthropic → Kimi
✓ Verify each uses correct API endpoint
✓ Check API keys in network tab (obfuscated)
✓ Confirm responses come from selected provider
```

**2. Session Continuity:**
```bash
✓ Send first message (NEW session)
✓ Send second message immediately (CONTINUE)
✓ Wait 31 minutes, send message (RESUME)
✓ Check localStorage for saved session IDs
✓ Verify session context is maintained
```

**3. Streaming:**
```bash
✓ Message streams token by token
✓ Tool events appear in real-time
✓ Thinking indicator shows/hides correctly
✓ Final response matches streamed content
```

**4. Error Handling:**
```bash
✓ Invalid provider → error message
✓ Network timeout → graceful failure
✓ Invalid API key → auth error
✓ Tool execution error → displayed to user
```

### Debug Commands

**Check localStorage:**
```javascript
// Browser console
JSON.parse(localStorage.getItem('app-chat-storage'))
```

**Monitor network:**
```bash
# Backend logs
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -d '{"message":"test","provider":"kimi"}'
```

**Test provider config:**
```typescript
import { getProviderConfig } from './config/providers'

console.log(getProviderConfig('kimi'))
// Should print full config with API key and baseURL
```

---

## 🚨 Troubleshooting

### Issue 1: Provider Not Switching

**Symptoms:**
- UI shows new provider but responses come from old one
- Base URL not changing in requests

**Solution:**
```typescript
// Verify env vars are being updated
console.log("Before:", process.env.ANTHROPIC_BASE_URL)
process.env.ANTHROPIC_BASE_URL = providerConfig.baseURL
console.log("After:", process.env.ANTHROPIC_BASE_URL)

// Clear any cached clients
anthropicClient = null
```

### Issue 2: Session Not Resuming

**Symptoms:**
- Context lost after waiting 30+ minutes
- SDK session ID not found

**Solution:**
```typescript
// Check if session ID was saved
const savedSession = getSdkSessionId(currentChatId)
console.log("Saved session:", savedSession)

// Verify session ID format
if (savedSession && savedSession.startsWith("session_")) {
  console.log("Valid session ID format")
}

// Check resume flag is set
console.log("Resume flag:", payload.resume)
```

### Issue 3: Streaming Not Working

**Symptoms:**
- Messages appear all at once instead of streaming
- No text deltas received

**Solution:**
```typescript
// Ensure callback is properly set
const agentIterator = query({
  prompt,
  options: {
    ...queryOptions,
    includePartialMessages: true, // ← Required for streaming
  },
})

// Check event callback is called
onEvent: async (event) => {
  console.log("Event received:", event.type)
  // Should see: content_block_delta, content_block_start, etc.
}
```

### Issue 4: Tool Not Found

**Symptoms:**
- "Tool not found" error
- searchDatabase not executing

**Solution:**
```typescript
// Verify MCP server is registered
const queryOptions = {
  mcpServers: {
    "your-app-tools": toolsServer, // ← Must match tool name prefix
  },
}

// Check tool name in createSupermemoryTools
tool(
  "searchDatabase", // ← Full name: mcp__your-app-tools__searchDatabase
  "description",
  schema,
  handler,
)
```

### Issue 5: Invalid Base URL

**Symptoms:**
- "Invalid provider base URL" error
- Request blocked by security check

**Solution:**
```typescript
// Add your provider to whitelist
const ALLOWED_BASE_URLS = [
  "https://api.anthropic.com",
  "https://api.z.ai/api/anthropic",
  "https://api.minimax.io/anthropic",
  "https://api.kimi.com/coding/",
  "https://your-provider.com/v1/", // ← Add here
]
```

---

## 📚 Advanced Topics

### Custom Provider Integration

Para adicionar um novo provider:

```typescript
// 1. Add to providers.ts
export const PROVIDER_CONFIGS = {
  // ... existing providers

  custom: {
    id: "custom",
    name: "Custom Provider",
    displayName: "Custom AI",
    apiKey: env.CUSTOM_API_KEY || "fallback",
    baseURL: "https://api.custom-provider.com/v1",
    models: {
      fast: "custom-fast-v1",
      balanced: "custom-balanced-v1",
      advanced: "custom-advanced-v1",
    },
    settings: {
      timeout: 300000,
      customSetting: true,
    },
  },
}

// 2. Update ProviderId type
export type ProviderId = "glm" | "minimax" | "anthropic" | "kimi" | "custom"

// 3. Add to whitelist
const ALLOWED_BASE_URLS = [
  // ... existing URLs
  "https://api.custom-provider.com/v1",
]

// 4. Add to frontend
const PROVIDERS: ProviderConfig[] = [
  // ... existing providers
  {
    id: "custom",
    name: "Custom Provider",
    displayName: "Custom AI",
    description: "Your custom AI provider",
  },
]
```

### Environment Variables

```bash
# Required for each provider
GLM_API_KEY=your_glm_key
MINIMAX_API_KEY=your_minimax_key
ANTHROPIC_API_KEY=your_anthropic_key
KIMI_API_KEY=your_kimi_key

# Optional
CHAT_MODEL=claude-haiku-4-5-20251001
SEQ_MCP_COMMAND=/path/to/sequential-thinking
SEQ_MCP_ARGS='["--flag","value"]'

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key
```

### Performance Optimization

```typescript
// 1. Cache provider configs
const providerConfigCache = new Map<ProviderId, ProviderConfig>()

export function getProviderConfig(providerId: ProviderId): ProviderConfig {
  if (providerConfigCache.has(providerId)) {
    return providerConfigCache.get(providerId)!
  }

  const config = PROVIDER_CONFIGS[providerId]
  providerConfigCache.set(providerId, config)
  return config
}

// 2. Reuse Anthropic client instances
const clientCache = new Map<string, Anthropic>()

function getAnthropicClient(baseURL: string, apiKey: string) {
  const key = `${baseURL}:${apiKey.slice(0, 10)}`

  if (!clientCache.has(key)) {
    clientCache.set(key, new Anthropic({ apiKey, baseURL }))
  }

  return clientCache.get(key)!
}

// 3. Debounce localStorage saves
import { debounce } from 'lodash'

const debouncedSave = debounce((chatId, sessionId) => {
  setSdkSessionId(chatId, sessionId)
}, 1000)
```

---

## ✅ Checklist de Implementação

### Backend Setup
- [ ] Criar `config/providers.ts` com configurações
- [ ] Implementar `services/claude-agent-tools.ts`
- [ ] Implementar `services/claude-agent.ts`
- [ ] Criar endpoint `routes/chat-v2.ts`
- [ ] Configurar variáveis de ambiente
- [ ] Adicionar validação Zod
- [ ] Implementar error handling
- [ ] Adicionar logging estruturado

### Frontend Setup
- [ ] Criar `components/provider-selector.tsx`
- [ ] Criar `stores/chat.ts` com Zustand
- [ ] Implementar `components/chat.tsx`
- [ ] Adicionar streaming SSE
- [ ] Implementar session management
- [ ] Adicionar localStorage persistence
- [ ] Criar UI para tool events
- [ ] Adicionar loading states

### Testing
- [ ] Testar cada provider individualmente
- [ ] Testar switch entre providers
- [ ] Testar session continuity (continue/resume)
- [ ] Testar streaming de texto
- [ ] Testar tool execution
- [ ] Testar error handling
- [ ] Testar localStorage persistence
- [ ] Verificar segurança (API keys não expostas)

### Production Ready
- [ ] Adicionar rate limiting
- [ ] Implementar proper error logging (Sentry, etc)
- [ ] Adicionar monitoring (Datadog, etc)
- [ ] Configurar CORS corretamente
- [ ] Implementar request timeout
- [ ] Adicionar analytics
- [ ] Criar documentação de API
- [ ] Setup CI/CD pipeline

---

## 🎓 Conceitos Aprendidos

Após implementar este sistema, você terá dominado:

1. **Claude Agent SDK** - Como usar o SDK oficial da Anthropic
2. **Multi Provider Architecture** - Como abstrair diferentes AI providers
3. **Streaming SSE** - Server-Sent Events para real-time updates
4. **MCP Tools** - Model Context Protocol para custom tools
5. **Session Management** - Continue vs Resume vs New sessions
6. **State Management** - Zustand + localStorage persistence
7. **TypeScript Advanced** - Complex types e type safety
8. **Security Best Practices** - API key management, whitelisting

---

## 📞 Suporte e Recursos

### Documentação Oficial
- [Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Anthropic API](https://docs.anthropic.com/)

### Exemplos de Código
- Repository original: [Supermemory](https://github.com/guilhermexp/supermemory)
- Este guia: Baseado em implementação real de produção

### Troubleshooting
- Check logs em ambos frontend e backend
- Use browser DevTools Network tab
- Verifique localStorage no console
- Test providers individualmente primeiro

---

## 🚀 Próximos Passos

Depois de implementar o básico, considere:

1. **Adicionar mais providers**: Gemini, OpenAI, Cohere, etc
2. **Implementar cost tracking**: Monitor usage por provider
3. **Provider auto-selection**: Baseado em task type ou custo
4. **Advanced caching**: Redis para session data
5. **Real-time collaboration**: Multiple users na mesma conversa
6. **Voice input/output**: Integrar speech-to-text
7. **Mobile app**: React Native com mesma arquitetura
8. **Analytics dashboard**: Track usage, performance, costs

---

**Criado por**: Supermemory Team
**Data**: Janeiro 2025
**Versão**: 1.0.0
**Licença**: MIT
