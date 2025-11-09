# Multi-Provider Integration - Quick Start

> **⚡ 5-minute setup guide for adding multiple AI providers**

---

## 📦 What You Need

```bash
npm install @anthropic-ai/sdk zod
```

**3 Files to Create/Edit:**
1. `config/providers.ts` - Provider configs
2. `services/claude-direct.ts` - Execution service
3. `components/ProviderSelector.tsx` - UI selector

---

## 🚀 Quick Setup

### 1. Provider Config (30 seconds)

**File**: `config/providers.ts`

```typescript
export const PROVIDER_CONFIGS = {
  anthropic: {
    id: "anthropic",
    apiKey: "sk-ant-...",
    baseURL: "https://api.anthropic.com",
    models: { fast: "claude-haiku-4-5-20251001" },
  },
  kimi: {
    id: "kimi",
    apiKey: "sk-kimi-...",
    baseURL: "https://api.kimi.com/coding/",
    models: { fast: "kimi-for-coding" },
  },
} as const;

export type ProviderId = keyof typeof PROVIDER_CONFIGS;
export const getProviderConfig = (id: ProviderId) => PROVIDER_CONFIGS[id];
export const getDefaultProvider = (): ProviderId => "kimi";
```

### 2. Backend Service (1 minute)

**File**: `services/claude-direct.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { getProviderConfig, type ProviderId } from "../config/providers";

export async function executeClaudeDirect({
  messages,
  provider = "kimi",
}: {
  messages: { role: string; content: string }[];
  provider?: ProviderId;
}) {
  const config = getProviderConfig(provider);

  const anthropic = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseURL, // 🎯 The magic line!
  });

  const response = await anthropic.messages.create({
    model: config.models.fast,
    max_tokens: 4096,
    messages,
  });

  return {
    text: response.content.find((b) => b.type === "text")?.text || "",
  };
}
```

### 3. Frontend Selector (2 minutes)

**File**: `components/ProviderSelector.tsx`

```typescript
"use client";
import { useState } from "react";

export function ProviderSelector({ onChange }: { onChange: (p: string) => void }) {
  const [provider, setProvider] = useState("kimi");

  const handleChange = (p: string) => {
    setProvider(p);
    onChange(p);
    localStorage.setItem("preferred_provider", p);
  };

  return (
    <select value={provider} onChange={(e) => handleChange(e.target.value)}>
      <option value="anthropic">Anthropic - Haiku 4.5</option>
      <option value="kimi">Kimi - K2 Thinking</option>
    </select>
  );
}
```

### 4. API Endpoint (1 minute)

**File**: `routes/chat.ts`

```typescript
import { executeClaudeDirect } from "../services/claude-direct";

export async function POST(req: Request) {
  const { message, provider } = await req.json();

  const result = await executeClaudeDirect({
    messages: [{ role: "user", content: message }],
    provider,
  });

  return Response.json(result);
}
```

---

## ✅ Test It

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello!","provider":"kimi"}'
```

**Expected**:
```json
{
  "text": "Hello! How can I help you today?"
}
```

---

## ➕ Add New Provider (30 seconds)

**Step 1**: Add to `providers.ts`
```typescript
glm: {
  id: "glm",
  apiKey: process.env.GLM_API_KEY,
  baseURL: "https://api.z.ai/api/anthropic",
  models: { fast: "GLM-4.6" },
},
```

**Step 2**: Add to frontend dropdown
```typescript
<option value="glm">GLM - 4.6</option>
```

**Done!** 🎉

---

## 🔑 Key Principles

1. **Same SDK, Different URLs** - `new Anthropic({ baseURL: "..." })`
2. **Provider = API Key + Base URL + Model Name**
3. **All providers must support Anthropic API format**

---

## 📚 Full Guide

For complete implementation with tools, validation, error handling, and production tips:

👉 **[Read Full Guide](./MULTI_PROVIDER_INTEGRATION_GUIDE.md)**

---

## 🐛 Common Issues

| Error | Solution |
|-------|----------|
| `Invalid provider base URL` | Add URL to whitelist in validation |
| `400 Bad Request` | Update Zod schema with new provider ID |
| `401 Unauthorized` | Check API key is correct |

---

## 🎯 What's Next?

- [ ] Add more providers (see full guide)
- [ ] Implement tool calling
- [ ] Add provider-specific settings
- [ ] Set up monitoring
- [ ] Implement cost tracking

---

**Total Setup Time: ~5 minutes ⚡**

**Questions?** Check the [Full Guide](./MULTI_PROVIDER_INTEGRATION_GUIDE.md)
