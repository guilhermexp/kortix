# Multi-Provider AI Integration Guide

> **Complete guide to integrate multiple AI providers (GLM, MiniMax, Anthropic, Kimi) with Anthropic-compatible APIs**
>
> **Last Updated**: November 9, 2025
> **Status**: ✅ Production Ready
> **Tech Stack**: TypeScript, Bun/Node.js, Anthropic SDK, Zod

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Requirements](#requirements)
3. [Architecture](#architecture)
4. [Step-by-Step Implementation](#step-by-step-implementation)
5. [Adding New Providers](#adding-new-providers)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)
8. [Production Considerations](#production-considerations)

---

## 🎯 Overview

This guide shows how to integrate multiple AI providers that are **Anthropic API-compatible** into a single application. Users can switch between providers seamlessly while using the same codebase.

### What You'll Build

- ✅ Unified provider configuration system
- ✅ Dynamic provider selection (backend + frontend)
- ✅ Automatic API routing based on provider
- ✅ Tools/functions that work across all providers
- ✅ User-facing provider selector UI

### Supported Providers (Example)

| Provider | API Endpoint | Compatibility |
|----------|--------------|---------------|
| **GLM (Z.AI)** | `api.z.ai/api/anthropic` | Anthropic-compatible |
| **MiniMax** | `api.minimax.io/anthropic` | Anthropic-compatible |
| **Anthropic** | `api.anthropic.com` | Official API |
| **Kimi** | `api.kimi.com/coding/` | Anthropic-compatible |

---

## 🔧 Requirements

### Technical Requirements

```json
{
  "runtime": "Bun 1.2.17+ or Node.js 20+",
  "language": "TypeScript 5.0+",
  "dependencies": {
    "@anthropic-ai/sdk": "^0.67.0",
    "zod": "^3.25.5"
  }
}
```

### Provider Requirements

Each provider must:
1. ✅ Support **Anthropic Messages API format**
2. ✅ Accept same request/response structure
3. ✅ Support tools/function calling (optional but recommended)
4. ✅ Provide valid API key

### API Keys Needed

- GLM API Key (from Z.AI)
- MiniMax API Key (JWT token)
- Anthropic API Key (from console.anthropic.com)
- Kimi API Key (from kimi.com membership)

---

## 🏗️ Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│ Frontend (UI)                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Provider Selector Component                         │ │
│ │ - Dropdown with 4 providers                        │ │
│ │ - LocalStorage persistence                         │ │
│ └─────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │ POST /chat/v2
                     │ { message: "...", provider: "kimi" }
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Backend (API)                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Provider Config (providers.ts)                      │ │
│ │ - Maps provider ID → API endpoint + key            │ │
│ │ - Validates provider selection                      │ │
│ └─────────────────────────────────────────────────────┘ │
│                     ↓                                    │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Claude Direct Service (claude-direct.ts)           │ │
│ │ - Initializes Anthropic SDK with provider config   │ │
│ │ - Handles tool calls (searchDatabase, etc)         │ │
│ │ - Manages conversation loop                         │ │
│ └─────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────┘
                     │ Anthropic SDK
                     │ new Anthropic({ apiKey, baseURL })
                     ↓
┌─────────────────────────────────────────────────────────┐
│ Provider Endpoint                                       │
│ - GLM: api.z.ai/api/anthropic                          │
│ - MiniMax: api.minimax.io/anthropic                    │
│ - Anthropic: api.anthropic.com                         │
│ - Kimi: api.kimi.com/coding/                           │
└─────────────────────────────────────────────────────────┘
```

### Key Principle

**All providers speak the same language (Anthropic API), but live at different addresses.**

---

## 📝 Step-by-Step Implementation

### Step 1: Create Provider Configuration

**File**: `src/config/providers.ts`

```typescript
/**
 * Provider Configuration
 *
 * Defines all available AI providers with their API endpoints,
 * authentication, and model configurations.
 */

export const PROVIDER_CONFIGS = {
  glm: {
    id: "glm" as const,
    name: "Z.AI (GLM)",
    displayName: "GLM-4.6",
    apiKey: process.env.GLM_API_KEY || "your-glm-key",
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
    id: "minimax" as const,
    name: "MiniMax",
    displayName: "MiniMax-M2",
    apiKey: process.env.MINIMAX_API_KEY || "your-minimax-jwt",
    baseURL: "https://api.minimax.io/anthropic",
    models: {
      fast: "MiniMax-M2",
      balanced: "MiniMax-M2",
      advanced: "MiniMax-M2",
    },
    settings: {
      timeout: 300000,
      disableNonessentialTraffic: true, // Provider-specific optimization
    },
  },

  anthropic: {
    id: "anthropic" as const,
    name: "Anthropic",
    displayName: "Haiku 4.5",
    apiKey: process.env.ANTHROPIC_API_KEY || "sk-ant-...",
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
    id: "kimi" as const,
    name: "Kimi",
    displayName: "Kimi K2 Thinking",
    apiKey: process.env.KIMI_API_KEY || "sk-kimi-...",
    baseURL: "https://api.kimi.com/coding/", // Note: trailing slash required
    models: {
      fast: "kimi-for-coding",
      balanced: "kimi-for-coding",
      advanced: "kimi-for-coding",
    },
    settings: {
      timeout: 300000,
    },
  },
} as const;

export type ProviderId = keyof typeof PROVIDER_CONFIGS;
export type ProviderConfig = (typeof PROVIDER_CONFIGS)[ProviderId];

/**
 * Get provider configuration by ID
 */
export function getProviderConfig(providerId: ProviderId): ProviderConfig {
  const config = PROVIDER_CONFIGS[providerId];
  if (!config) {
    throw new Error(`Provider '${providerId}' not found`);
  }
  return config;
}

/**
 * List all available providers
 */
export function listProviders(): ProviderConfig[] {
  return Object.values(PROVIDER_CONFIGS);
}

/**
 * Validate provider ID
 */
export function isValidProvider(providerId: string): providerId is ProviderId {
  return providerId in PROVIDER_CONFIGS;
}

/**
 * Get default provider
 */
export function getDefaultProvider(): ProviderId {
  return "kimi"; // Change this to your preferred default
}
```

---

### Step 2: Create Backend Service

**File**: `src/services/claude-direct.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getProviderConfig, getDefaultProvider, type ProviderId } from "../config/providers";

export type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ClaudeDirectOptions = {
  messages: AgentMessage[];
  provider?: ProviderId; // ✅ Provider selection parameter
  model?: string;
  maxTurns?: number;
  // Add your app-specific context here
};

/**
 * Execute Claude with any provider using Anthropic SDK
 */
export async function executeClaudeDirect({
  messages,
  provider,
  model,
  maxTurns = 10,
}: ClaudeDirectOptions): Promise<{ text: string; toolCalls: number }> {

  // 1️⃣ Get provider configuration
  const providerId = provider || getDefaultProvider();
  const providerConfig = getProviderConfig(providerId);

  console.log("[executeClaudeDirect] Using provider:", providerConfig.name, `(${providerId})`);
  console.log("[executeClaudeDirect] Base URL:", providerConfig.baseURL);

  // 2️⃣ Initialize Anthropic SDK with provider config
  const anthropic = new Anthropic({
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL, // ✅ This is the magic!
  });

  // 3️⃣ Define your tools (same schema for all providers)
  const tools: Anthropic.Tool[] = [
    {
      name: "searchDatabase",
      description: "Search documents in the user's database",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
        },
        required: ["query"],
      },
    },
  ];

  // 4️⃣ Convert messages to Anthropic format
  const anthropicMessages: Anthropic.MessageParam[] = messages.map((msg) => ({
    role: msg.role === "assistant" ? "assistant" : "user",
    content: msg.content,
  }));

  let currentMessages = [...anthropicMessages];
  let toolCallCount = 0;
  let turn = 0;

  // 5️⃣ Agentic loop (tool calling)
  while (turn < maxTurns) {
    turn++;

    const response = await anthropic.messages.create({
      model: model || providerConfig.models.balanced,
      max_tokens: 4096,
      messages: currentMessages,
      tools,
    });

    // If no tool use, return final response
    if (response.stop_reason !== "tool_use") {
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => (block as Anthropic.TextBlock).text)
        .join("");
      return { text, toolCalls: toolCallCount };
    }

    // Handle tool calls
    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use"
    ) as Anthropic.ToolUseBlock[];

    if (toolUseBlocks.length === 0) {
      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => (block as Anthropic.TextBlock).text)
        .join("");
      return { text, toolCalls: toolCallCount };
    }

    // Add assistant response to conversation
    currentMessages.push({
      role: "assistant",
      content: response.content,
    });

    // Execute tools and add results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      toolCallCount++;

      if (toolUse.name === "searchDatabase") {
        const input = toolUse.input as { query: string };

        // ✅ Execute your app logic here
        const result = await handleSearchDatabase(input.query);

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }
    }

    // Add tool results to conversation
    currentMessages.push({
      role: "user",
      content: toolResults,
    });
  }

  // Max turns reached, make final call without tools
  const finalResponse = await anthropic.messages.create({
    model: model || providerConfig.models.balanced,
    max_tokens: 4096,
    messages: currentMessages,
  });

  const text = finalResponse.content
    .filter((block) => block.type === "text")
    .map((block) => (block as Anthropic.TextBlock).text)
    .join("");

  return { text, toolCalls: toolCallCount };
}

/**
 * Example tool handler - replace with your app logic
 */
async function handleSearchDatabase(query: string): Promise<string> {
  // Your database search logic here
  return `Found results for: ${query}`;
}
```

---

### Step 3: Create API Endpoint

**File**: `src/routes/chat.ts`

```typescript
import { z } from "zod";
import { executeClaudeDirect } from "../services/claude-direct";

// Request schema with provider validation
const chatRequestSchema = z.object({
  message: z.string().min(1).max(50000),
  provider: z.enum(["glm", "minimax", "anthropic", "kimi"]).optional(),
  model: z.string().optional(),
});

/**
 * POST /chat
 * Main chat endpoint with provider selection
 */
export async function handleChat(body: unknown) {
  // 1️⃣ Validate request
  const payload = chatRequestSchema.parse(body);

  // 2️⃣ Execute with selected provider
  const result = await executeClaudeDirect({
    messages: [
      { role: "user", content: payload.message }
    ],
    provider: payload.provider, // ✅ Pass provider selection
    model: payload.model,
  });

  // 3️⃣ Return response
  return {
    text: result.text,
    toolCalls: result.toolCalls,
    provider: payload.provider,
  };
}
```

---

### Step 4: Create Frontend Provider Selector

**File**: `components/ProviderSelector.tsx`

```typescript
"use client";

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

export type ProviderId = "glm" | "minimax" | "anthropic" | "kimi";

interface ProviderConfig {
  id: ProviderId;
  name: string;
  displayName: string;
  description: string;
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
];

interface ProviderSelectorProps {
  value?: ProviderId;
  onChange?: (provider: ProviderId) => void;
  disabled?: boolean;
}

export function ProviderSelector({
  value,
  onChange,
  disabled = false,
}: ProviderSelectorProps) {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(
    value || "kimi"
  );

  useEffect(() => {
    if (value && value !== selectedProvider) {
      setSelectedProvider(value);
    }
  }, [value]);

  const handleChange = (newProvider: string) => {
    const providerId = newProvider as ProviderId;
    setSelectedProvider(providerId);

    if (onChange) {
      onChange(providerId);
    }

    // Save to localStorage for persistence
    if (typeof window !== "undefined") {
      localStorage.setItem("preferred_provider", providerId);
    }
  };

  const currentProvider = PROVIDERS.find((p) => p.id === selectedProvider);

  return (
    <Select
      value={selectedProvider}
      onValueChange={handleChange}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue>
          {currentProvider?.displayName}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {PROVIDERS.map((provider) => (
          <SelectItem key={provider.id} value={provider.id}>
            <div>
              <div>{provider.name} - {provider.displayName}</div>
              <div className="text-xs text-muted-foreground">
                {provider.description}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Hook to manage provider selection with persistence
 */
export function useProviderSelection() {
  const [provider, setProvider] = useState<ProviderId>("kimi");

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("preferred_provider") as ProviderId | null;
      if (saved && ["glm", "minimax", "anthropic", "kimi"].includes(saved)) {
        setProvider(saved);
      }
    }
  }, []);

  return {
    provider,
    setProvider,
  };
}
```

---

### Step 5: Use in Your Chat Component

**File**: `components/Chat.tsx`

```typescript
"use client";

import { useState } from "react";
import { ProviderSelector, useProviderSelection } from "./ProviderSelector";

export function Chat() {
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const { provider, setProvider } = useProviderSelection();

  const handleSend = async () => {
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          provider, // ✅ Send selected provider
        }),
      });

      const data = await res.json();
      setResponse(data.text);
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <label>Select AI Provider:</label>
        <ProviderSelector
          value={provider}
          onChange={setProvider}
          disabled={loading}
        />
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask anything..."
        disabled={loading}
      />

      <button onClick={handleSend} disabled={loading}>
        {loading ? "Sending..." : "Send"}
      </button>

      {response && (
        <div className="response">
          <strong>Response ({provider}):</strong>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
}
```

---

## ➕ Adding New Providers

### Checklist for New Provider

1. ✅ Verify provider supports **Anthropic Messages API format**
2. ✅ Obtain API key from provider
3. ✅ Find correct base URL endpoint
4. ✅ Test with curl or Postman first
5. ✅ Add to configuration
6. ✅ Update validation schemas
7. ✅ Test in your app

### Example: Adding "DeepSeek"

**Step 1**: Add to `providers.ts`

```typescript
export const PROVIDER_CONFIGS = {
  // ... existing providers

  deepseek: {
    id: "deepseek" as const,
    name: "DeepSeek",
    displayName: "DeepSeek V3",
    apiKey: process.env.DEEPSEEK_API_KEY || "sk-...",
    baseURL: "https://api.deepseek.com/v1", // Check docs for correct URL
    models: {
      fast: "deepseek-chat",
      balanced: "deepseek-chat",
      advanced: "deepseek-coder",
    },
    settings: {
      timeout: 300000,
    },
  },
} as const;
```

**Step 2**: Update TypeScript types (automatic via `as const`)

**Step 3**: Update validation schema in `chat.ts`

```typescript
const chatRequestSchema = z.object({
  message: z.string().min(1).max(50000),
  provider: z.enum(["glm", "minimax", "anthropic", "kimi", "deepseek"]).optional(),
  //                                                          ^^^^^^^^^ Add here
  model: z.string().optional(),
});
```

**Step 4**: Add to frontend `ProviderSelector.tsx`

```typescript
export type ProviderId = "glm" | "minimax" | "anthropic" | "kimi" | "deepseek";

const PROVIDERS: ProviderConfig[] = [
  // ... existing providers
  {
    id: "deepseek",
    name: "DeepSeek",
    displayName: "DeepSeek V3",
    description: "Advanced reasoning and coding model",
  },
];
```

**Step 5**: Test!

```bash
curl -X POST http://localhost:4000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello!","provider":"deepseek"}'
```

---

## 🧪 Testing

### Test Script

**File**: `test-providers.ts`

```typescript
import { executeClaudeDirect } from "./src/services/claude-direct";

async function testAllProviders() {
  const providers = ["glm", "minimax", "anthropic", "kimi"] as const;

  for (const provider of providers) {
    console.log(`\n🧪 Testing ${provider}...`);

    try {
      const result = await executeClaudeDirect({
        messages: [
          { role: "user", content: "Say 'Hello' in one word" }
        ],
        provider,
      });

      console.log(`✅ ${provider}: ${result.text}`);
    } catch (error) {
      console.error(`❌ ${provider} failed:`, error);
    }
  }
}

testAllProviders();
```

Run:
```bash
bun run test-providers.ts
```

Expected output:
```
🧪 Testing glm...
✅ glm: Hello

🧪 Testing minimax...
✅ minimax: Hello

🧪 Testing anthropic...
✅ anthropic: Hello

🧪 Testing kimi...
✅ kimi: Hello
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. "Invalid provider base URL"

**Cause**: Provider URL not in whitelist (security feature)

**Solution**: Add to allowed URLs list:

```typescript
// In your agent service
const ALLOWED_BASE_URLS = [
  "https://api.anthropic.com",
  "https://api.z.ai/api/anthropic",
  "https://api.minimax.io/anthropic",
  "https://api.kimi.com/coding/",
  "https://your-new-provider.com/api", // Add here
];
```

#### 2. "Request failed with status 400"

**Cause**: Provider not in validation schema

**Solution**: Update Zod schema:

```typescript
provider: z.enum([
  "glm",
  "minimax",
  "anthropic",
  "kimi",
  "your-new-provider" // Add here
]).optional()
```

#### 3. "Unauthorized" or 401 errors

**Cause**: Invalid API key or wrong authentication method

**Solutions**:
- Verify API key is correct
- Check if provider uses Bearer token vs API key
- Some providers need custom headers:

```typescript
const anthropic = new Anthropic({
  apiKey: providerConfig.apiKey,
  baseURL: providerConfig.baseURL,
  defaultHeaders: {
    // Add provider-specific headers if needed
    "X-Custom-Header": "value",
  },
});
```

#### 4. Tools not working

**Cause**: Provider doesn't support Anthropic tools format

**Solution**:
- Check provider documentation for tool support
- Use `executeClaudeDirect` without tools for providers that don't support them
- Implement fallback logic:

```typescript
const supportsTools = ["anthropic", "kimi"]; // Known to support tools
const tools = supportsTools.includes(providerId) ? toolsArray : undefined;
```

#### 5. Response format errors

**Cause**: Provider returns slightly different format

**Solution**: Add response normalization:

```typescript
function normalizeResponse(response: any, providerId: ProviderId) {
  if (providerId === "some-provider") {
    // Provider-specific normalization
    return {
      text: response.message || response.content,
      // ... normalize other fields
    };
  }

  return response; // Standard format
}
```

---

## 🚀 Production Considerations

### Security

1. **Environment Variables**
   ```bash
   # .env
   GLM_API_KEY=xxx
   MINIMAX_API_KEY=xxx
   ANTHROPIC_API_KEY=xxx
   KIMI_API_KEY=xxx
   ```

2. **API Key Rotation**
   - Store keys in secrets manager (AWS Secrets, Vault, etc)
   - Implement key rotation without downtime
   - Monitor for leaked keys

3. **Rate Limiting**
   ```typescript
   // Per-provider rate limits
   const RATE_LIMITS = {
     glm: { rpm: 100, tpm: 100000 },
     minimax: { rpm: 60, tpm: 90000 },
     anthropic: { rpm: 1000, tpm: 400000 },
     kimi: { rpm: 100, tpm: 100000 },
   };
   ```

4. **Request Validation**
   - Always validate provider ID
   - Sanitize user input
   - Implement CSRF protection

### Performance

1. **Caching**
   ```typescript
   // Cache provider configs
   const configCache = new Map<ProviderId, ProviderConfig>();

   export function getProviderConfig(id: ProviderId): ProviderConfig {
     if (!configCache.has(id)) {
       configCache.set(id, PROVIDER_CONFIGS[id]);
     }
     return configCache.get(id)!;
   }
   ```

2. **Connection Pooling**
   ```typescript
   // Reuse Anthropic client instances
   const clientCache = new Map<ProviderId, Anthropic>();

   function getAnthropicClient(providerId: ProviderId): Anthropic {
     if (!clientCache.has(providerId)) {
       const config = getProviderConfig(providerId);
       clientCache.set(providerId, new Anthropic({
         apiKey: config.apiKey,
         baseURL: config.baseURL,
       }));
     }
     return clientCache.get(providerId)!;
   }
   ```

3. **Timeouts**
   - Set appropriate timeouts per provider
   - Implement retry logic with exponential backoff
   - Circuit breaker pattern for failing providers

### Monitoring

1. **Metrics to Track**
   ```typescript
   interface ProviderMetrics {
     requestCount: number;
     errorCount: number;
     avgLatency: number;
     totalTokens: number;
     lastError?: string;
     lastErrorTime?: Date;
   }
   ```

2. **Logging**
   ```typescript
   console.log({
     event: "provider_request",
     provider: providerId,
     model: model,
     latency: responseTime,
     tokens: tokensUsed,
     success: !error,
   });
   ```

3. **Alerting**
   - Alert on high error rates (>5%)
   - Alert on slow responses (>5s P95)
   - Alert on provider downtime

### Cost Management

1. **Track Usage**
   ```typescript
   interface UsageTracking {
     providerId: ProviderId;
     tokensUsed: number;
     cost: number;
     timestamp: Date;
   }
   ```

2. **Budget Limits**
   ```typescript
   const DAILY_BUDGETS = {
     glm: 100, // $100/day
     minimax: 50,
     anthropic: 200,
     kimi: 100,
   };
   ```

3. **Automatic Failover**
   ```typescript
   async function executeWithFailover(options: ClaudeDirectOptions) {
     const providers = ["kimi", "glm", "minimax"];

     for (const provider of providers) {
       try {
         return await executeClaudeDirect({ ...options, provider });
       } catch (error) {
         console.warn(`Provider ${provider} failed, trying next...`);
       }
     }

     throw new Error("All providers failed");
   }
   ```

---

## 📚 Additional Resources

### Documentation

- [Anthropic API Docs](https://docs.anthropic.com/en/api)
- [Z.AI (GLM) Docs](https://open.bigmodel.cn/dev/api)
- [MiniMax Docs](https://platform.minimaxi.com/document)
- [Kimi Docs](https://www.kimi.com/coding/docs)

### Example Projects

- [Supermemory Multi-Provider](https://github.com/supermemoryai/supermemory)
- See `apps/api/src/config/providers.ts` for complete implementation

### Community

- [Anthropic Discord](https://discord.gg/anthropic)
- [GitHub Discussions](https://github.com/anthropics/anthropic-sdk-typescript/discussions)

---

## 🎉 Summary

You now have:

✅ Multi-provider configuration system
✅ Dynamic provider selection (backend + frontend)
✅ Anthropic SDK with custom base URLs
✅ Tool support across all providers
✅ Production-ready error handling
✅ User-facing provider selector UI

### Key Takeaways

1. **Anthropic API format is the standard** - Any provider that implements it can be added
2. **Configuration is centralized** - One place to manage all providers
3. **Frontend is provider-agnostic** - Same UI works for all providers
4. **Tools work universally** - Same tool schema for all providers
5. **Easy to extend** - Add new providers in minutes

---

**Questions or Issues?**
Open an issue or PR at your repository!

**Happy Building! 🚀**
