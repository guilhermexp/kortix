# Claude Agent SDK Multi-Provider Integration Guide

> **Complete guide to integrate Claude Agent SDK with multiple AI providers in any application**
>
> **Last Updated**: November 9, 2025
> **Status**: ✅ Production Ready
> **Tech Stack**: Claude Agent SDK CLI + MCP Tools

---

## 📋 Table of Contents

1. [What is Claude Agent SDK](#what-is-claude-agent-sdk)
2. [How It Works](#how-it-works)
3. [Installation](#installation)
4. [Multi-Provider Setup](#multi-provider-setup)
5. [MCP Tools (Custom Functions)](#mcp-tools-custom-functions)
6. [System Prompt Configuration](#system-prompt-configuration)
7. [Integration in Any App](#integration-in-any-app)
8. [Complete Example](#complete-example)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## 🎯 What is Claude Agent SDK

**Claude Agent SDK** is Anthropic's official **CLI-based agent system** that:

- ✅ Runs as a **subprocess** (not in-process like normal SDK)
- ✅ Manages **conversation history automatically**
- ✅ Supports **MCP tools** (custom functions)
- ✅ Loads **system prompt from file** (`.claude/CLAUDE.md`)
- ✅ Works with **Anthropic-compatible providers** via environment variables

### Claude Agent SDK vs Regular SDK

| Feature | Regular SDK | Claude Agent SDK |
|---------|-------------|------------------|
| **Architecture** | In-process library | CLI subprocess |
| **History** | You manage | SDK manages |
| **Tools** | Inline definition | MCP server (in-process) |
| **System Prompt** | Inline code | File-based (`.claude/CLAUDE.md`) |
| **Session Management** | Manual | Automatic (resume/continue) |
| **Multi-provider** | Manual baseURL | Environment variables |

---

## 🔧 How It Works

### Architecture

```
Your App (Node.js/Bun)
    ↓
executeClaudeAgent({ message, provider: "kimi" })
    ↓
Set environment variables:
  - ANTHROPIC_API_KEY = provider.apiKey
  - ANTHROPIC_BASE_URL = provider.baseURL
    ↓
query() function spawns Claude CLI subprocess
    ↓
Claude CLI reads:
  - .claude/CLAUDE.md (system prompt)
  - MCP server (your custom tools)
  - Environment variables (API key + base URL)
    ↓
Claude CLI calls provider API
    ↓ (if needs data)
MCP tool executed (your function)
    ↓
Results returned to your app via event stream
```

### Key Concepts

1. **Claude CLI runs as subprocess** - You communicate via stdin/stdout
2. **Environment variables control provider** - Change them to switch providers
3. **MCP tools are functions** - Registered via `createSdkMcpServer()`
4. **System prompt is a file** - `.claude/CLAUDE.md` loaded automatically
5. **Sessions are managed** - SDK saves state in `~/.claude/projects/`

---

## 📦 Installation

### Step 1: Install Claude Agent SDK

```bash
npm install @anthropic-ai/claude-agent-sdk zod
```

### Step 2: Verify CLI Installation

The CLI is bundled with the SDK:

```bash
# Find the CLI
node_modules/@anthropic-ai/claude-agent-sdk/cli.js

# Or use global installation
npm install -g @anthropic-ai/claude-agent-sdk
```

### Step 3: Create Project Structure

```bash
mkdir -p .claude
touch .claude/CLAUDE.md
```

---

## 🎨 Multi-Provider Setup

### Provider Configuration

**File**: `src/config/providers.ts`

```typescript
/**
 * Provider configurations for Claude Agent SDK
 * Each provider must support Anthropic Messages API format
 */

export const PROVIDER_CONFIGS = {
  glm: {
    id: "glm" as const,
    name: "Z.AI (GLM)",
    displayName: "GLM-4.6",
    apiKey: process.env.GLM_API_KEY || "your-key",
    baseURL: "https://api.z.ai/api/anthropic",
    models: {
      fast: "GLM-4.5-Air",
      balanced: "GLM-4.6",
    },
  },

  minimax: {
    id: "minimax" as const,
    name: "MiniMax",
    displayName: "MiniMax-M2",
    apiKey: process.env.MINIMAX_API_KEY || "your-jwt-token",
    baseURL: "https://api.minimax.io/anthropic",
    models: {
      fast: "MiniMax-M2",
      balanced: "MiniMax-M2",
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
    },
  },

  kimi: {
    id: "kimi" as const,
    name: "Kimi",
    displayName: "Kimi K2 Thinking",
    apiKey: process.env.KIMI_API_KEY || "sk-kimi-...",
    baseURL: "https://api.kimi.com/coding/", // Trailing slash required!
    models: {
      fast: "kimi-for-coding",
      balanced: "kimi-for-coding",
    },
  },
} as const;

export type ProviderId = keyof typeof PROVIDER_CONFIGS;
export type ProviderConfig = (typeof PROVIDER_CONFIGS)[ProviderId];

export function getProviderConfig(providerId: ProviderId): ProviderConfig {
  const config = PROVIDER_CONFIGS[providerId];
  if (!config) {
    throw new Error(`Provider '${providerId}' not found`);
  }
  return config;
}

export function getDefaultProvider(): ProviderId {
  return "kimi"; // Your default
}
```

### Important Security: URL Whitelist

To prevent credential leakage, validate provider URLs:

```typescript
const ALLOWED_BASE_URLS = [
  "https://api.anthropic.com",
  "https://api.z.ai/api/anthropic",
  "https://api.minimax.io/anthropic",
  "https://api.kimi.com/coding/",
];

export function validateProviderURL(url: string): boolean {
  return ALLOWED_BASE_URLS.includes(url);
}
```

---

## 🛠️ MCP Tools (Custom Functions)

### What are MCP Tools?

MCP (Model Context Protocol) tools are **custom functions** that Claude can call during conversation.

### Creating MCP Server

**File**: `src/services/claude-agent-tools.ts`

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Create MCP server with custom tools
 *
 * This runs IN-PROCESS (not as separate server)
 * Claude CLI will call these functions when needed
 */
export function createSupermemoryTools(
  client: SupabaseClient,
  orgId: string,
  context?: { containerTags?: string[] }
) {
  return createSdkMcpServer({
    name: "supermemory-tools", // ✅ MCP server name
    version: "1.0.0",
    tools: [
      tool(
        "searchDatabase", // ✅ Tool name (Claude will call this)
        "Search documents and memories in user's database", // ✅ Description for Claude
        {
          // ✅ Input schema (Zod validation)
          query: z.string().min(1).describe("Search query text"),
          limit: z.number().min(1).max(50).default(10).describe("Max results"),
          includeSummary: z.boolean().default(true).describe("Include summaries"),
        },
        async (args) => {
          // ✅ Your function implementation
          console.log("[searchDatabase] Called with:", args);

          try {
            // Call your database/API
            const results = await searchDocuments(client, orgId, {
              q: args.query,
              limit: args.limit,
              includeSummary: args.includeSummary,
              containerTags: context?.containerTags,
            });

            // Format results for Claude
            const formatted = {
              count: results.length,
              results: results.map((doc) => ({
                title: doc.title,
                content: doc.content?.slice(0, 300),
                score: doc.score,
                url: doc.url,
              })),
            };

            // ✅ Return in MCP format
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(formatted, null, 2),
                },
              ],
            };
          } catch (error) {
            console.error("[searchDatabase] Error:", error);

            // ✅ Return error in MCP format
            return {
              content: [
                {
                  type: "text",
                  text: `Error: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        }
      ),

      // ✅ Add more tools here
      tool(
        "createDocument",
        "Create a new document in user's database",
        {
          title: z.string(),
          content: z.string(),
          tags: z.array(z.string()).optional(),
        },
        async (args) => {
          // Your implementation
          const doc = await createDocument(client, orgId, args);
          return {
            content: [{ type: "text", text: `Created: ${doc.id}` }],
          };
        }
      ),
    ],
  });
}

// ✅ Your actual database function
async function searchDocuments(
  client: SupabaseClient,
  orgId: string,
  options: any
) {
  // Your Supabase/database logic here
  const { data } = await client
    .from("documents")
    .select("*")
    .eq("org_id", orgId)
    .ilike("content", `%${options.q}%`)
    .limit(options.limit);

  return data || [];
}
```

### Tool Naming Convention

When registered, tools are named: `mcp__<server-name>__<tool-name>`

Example: `mcp__supermemory-tools__searchDatabase`

---

## 📝 System Prompt Configuration

### System Prompt as File

Claude Agent SDK loads system prompt from **file**, not code!

**File**: `.claude/CLAUDE.md`

```markdown
# Supermemory AI Assistant

You are an AI assistant integrated into Supermemory, a personal knowledge management system.

## Your Capabilities

You have access to the following tools:

### searchDatabase
Search through the user's saved documents, notes, and memories.
Use this when the user asks about their saved content.

**When to use:**
- "What did I save about X?"
- "Find my notes on Y"
- "Search for Z"

**Example:**
User: "What did I save about AI?"
You: I'll search your database for content about AI.
[Use searchDatabase tool with query="AI"]

### createDocument
Create new documents in the user's database.
Use this when the user wants to save something.

## Guidelines

1. **Always search first** - Check if information exists before answering
2. **Be concise** - Users prefer short, direct answers
3. **Cite sources** - Mention which documents you found information in
4. **Ask for clarification** - If query is ambiguous, ask before searching
5. **Respect privacy** - Only access what the user explicitly asks for

## Response Format

When using tools:
1. Tell user what you're doing ("I'll search your documents...")
2. Use the tool
3. Summarize results clearly
4. Provide relevant excerpts if helpful

## Important

- NEVER fabricate information - only use search results
- If no results found, say so clearly
- Always respect the user's data and privacy
```

### Why File-based?

**Benefits:**
- ✅ **No tokens consumed** - Prompt not sent in API request
- ✅ **Easy to edit** - Change without redeploying
- ✅ **Version control** - Track changes in git
- ✅ **Hot reload** - SDK picks up changes automatically
- ✅ **Cleaner logs** - Prompt doesn't clutter debug output

---

## 🚀 Integration in Any App

### Main Integration File

**File**: `src/services/claude-agent.ts`

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { resolve } from "path";
import { getProviderConfig, getDefaultProvider, type ProviderId } from "../config/providers";
import { createSupermemoryTools } from "./claude-agent-tools";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaudeAgentOptions = {
  message: string; // ✅ Single message (SDK manages history)
  sdkSessionId?: string; // ✅ Resume specific session
  continueSession?: boolean; // ✅ Continue most recent session
  provider?: ProviderId; // ✅ Which AI provider to use
  client: SupabaseClient; // Your database client
  orgId: string; // Your app context
  model?: string; // Override model
  maxTurns?: number; // Max tool call rounds
};

export async function executeClaudeAgent({
  message,
  sdkSessionId,
  continueSession = false,
  provider,
  client,
  orgId,
  model,
  maxTurns = 10,
}: ClaudeAgentOptions) {
  console.log("[executeClaudeAgent] Starting...");

  // 1️⃣ Get provider configuration
  const providerId = provider || getDefaultProvider();
  const providerConfig = getProviderConfig(providerId);

  console.log("[executeClaudeAgent] Using provider:", providerConfig.name);

  // 2️⃣ Validate provider URL (security)
  const ALLOWED_URLS = [
    "https://api.anthropic.com",
    "https://api.z.ai/api/anthropic",
    "https://api.minimax.io/anthropic",
    "https://api.kimi.com/coding/",
  ];

  if (!ALLOWED_URLS.includes(providerConfig.baseURL)) {
    throw new Error(`Invalid provider base URL: ${providerConfig.baseURL}`);
  }

  // 3️⃣ Set environment variables for provider
  // ✅ This is how Claude CLI knows which provider to use!
  process.env.ANTHROPIC_API_KEY = providerConfig.apiKey;
  process.env.ANTHROPIC_BASE_URL = providerConfig.baseURL;

  console.log("[executeClaudeAgent] Provider configured:", {
    baseURL: providerConfig.baseURL,
    model: model || providerConfig.models.balanced,
  });

  // 4️⃣ Create MCP tools server
  const toolsServer = createSupermemoryTools(client, orgId);

  // 5️⃣ Find Claude CLI executable
  const cliPath = await findClaudeCLI();

  // 6️⃣ Prepare prompt stream (SDK format)
  async function* createPromptStream() {
    yield {
      type: "user" as const,
      message: {
        role: "user" as const,
        content: message,
      },
    };
  }

  // 7️⃣ Build query options
  const queryOptions: any = {
    model: model || providerConfig.models.balanced,
    maxTurns,

    // ✅ MCP tools (in-process)
    mcpServers: {
      "supermemory-tools": toolsServer,
    },

    // ✅ System prompt from file
    settingSources: ["project"], // Loads from .claude/CLAUDE.md
    cwd: resolve(process.cwd()),

    // ✅ Session management
    pathToClaudeCodeExecutable: cliPath,

    // For streaming events
    includePartialMessages: true,

    // Bypass permissions (for automated use)
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
  };

  // ✅ Session management: continue vs resume
  if (continueSession) {
    // Continue most recent session (< 30min)
    queryOptions.continue = true;
  } else if (sdkSessionId) {
    // Resume specific session (> 30min or explicit)
    queryOptions.resume = sdkSessionId;
  }
  // else: new session

  console.log("[executeClaudeAgent] Query options:", {
    model: queryOptions.model,
    maxTurns: queryOptions.maxTurns,
    session: continueSession ? "continue" : sdkSessionId ? "resume" : "new",
  });

  // 8️⃣ Execute query (spawns CLI subprocess)
  const agentIterator = query({
    prompt: createPromptStream(),
    options: queryOptions,
  });

  // 9️⃣ Collect events
  const events: unknown[] = [];
  let capturedSessionId: string | null = sdkSessionId || null;
  let fullText = "";

  for await (const event of agentIterator) {
    events.push(event);

    // ✅ Capture SDK session ID from events
    if (
      event &&
      typeof event === "object" &&
      "session_id" in event &&
      typeof (event as any).session_id === "string"
    ) {
      capturedSessionId = (event as any).session_id;
      if (!sdkSessionId) {
        console.log("[executeClaudeAgent] New session ID:", capturedSessionId);
      }
    }

    // ✅ Extract text from content blocks
    if (
      event &&
      typeof event === "object" &&
      "type" in event &&
      event.type === "message" &&
      "message" in event
    ) {
      const msg = (event as any).message;
      if (msg.content) {
        for (const block of msg.content) {
          if (block.type === "text") {
            fullText += block.text;
          }
        }
      }
    }
  }

  console.log("[executeClaudeAgent] Completed with", events.length, "events");

  // 🔟 Return results
  return {
    events,
    text: fullText,
    sdkSessionId: capturedSessionId, // ✅ For next message
  };
}

/**
 * Find Claude CLI executable
 * Tries multiple common paths
 */
async function findClaudeCLI(): Promise<string> {
  const { access } = await import("fs/promises");

  const paths = [
    resolve(process.cwd(), "node_modules/@anthropic-ai/claude-agent-sdk/cli.js"),
    resolve(process.cwd(), "..", "node_modules/@anthropic-ai/claude-agent-sdk/cli.js"),
    "/usr/local/lib/node_modules/@anthropic-ai/claude-agent-sdk/cli.js",
  ];

  for (const path of paths) {
    try {
      await access(path);
      console.log("[executeClaudeAgent] Found CLI at:", path);
      return path;
    } catch {
      // Try next path
    }
  }

  throw new Error("Claude CLI not found. Install: npm install @anthropic-ai/claude-agent-sdk");
}
```

---

## 🎯 Complete Example

### API Endpoint

**File**: `src/routes/chat.ts`

```typescript
import { z } from "zod";
import { executeClaudeAgent } from "../services/claude-agent";
import { createClient } from "@supabase/supabase-js";

const chatSchema = z.object({
  message: z.string().min(1),
  provider: z.enum(["glm", "minimax", "anthropic", "kimi"]).optional(),
  sdkSessionId: z.string().optional(),
  conversationId: z.string().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const { message, provider, sdkSessionId } = chatSchema.parse(body);

  // Your auth logic
  const orgId = "user-org-id";
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  );

  // ✅ Execute with Claude Agent SDK
  const result = await executeClaudeAgent({
    message,
    provider,
    sdkSessionId,
    client: supabase,
    orgId,
  });

  return Response.json({
    text: result.text,
    sdkSessionId: result.sdkSessionId, // For next message
  });
}
```

### Frontend

```typescript
const [provider, setProvider] = useState("kimi");
const [sessionId, setSessionId] = useState<string | null>(null);

async function sendMessage(message: string) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      provider, // ✅ User-selected provider
      sdkSessionId: sessionId, // ✅ Resume session
    }),
  });

  const data = await response.json();

  // ✅ Save session ID for next message
  setSessionId(data.sdkSessionId);

  return data.text;
}
```

---

## 🧪 Testing

### Test Script

```typescript
import { executeClaudeAgent } from "./src/services/claude-agent";
import { createClient } from "@supabase/supabase-js";

async function testProvider(provider: "glm" | "minimax" | "anthropic" | "kimi") {
  console.log(`\n🧪 Testing ${provider}...`);

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  );

  try {
    const result = await executeClaudeAgent({
      message: "Say hello in one word",
      provider,
      client: supabase,
      orgId: "test-org",
    });

    console.log(`✅ ${provider}: ${result.text}`);
    console.log(`   Session ID: ${result.sdkSessionId}`);
  } catch (error) {
    console.error(`❌ ${provider} failed:`, error.message);
  }
}

async function testAll() {
  await testProvider("kimi");
  await testProvider("glm");
  await testProvider("minimax");
  await testProvider("anthropic");
}

testAll();
```

---

## 🐛 Troubleshooting

### 1. "Claude CLI not found"

**Solution**: Install SDK and verify path

```bash
npm install @anthropic-ai/claude-agent-sdk
ls node_modules/@anthropic-ai/claude-agent-sdk/cli.js
```

### 2. "Invalid provider base URL"

**Solution**: Add to whitelist in `claude-agent.ts`:

```typescript
const ALLOWED_URLS = [
  "https://api.anthropic.com",
  "https://api.kimi.com/coding/",
  "https://your-provider.com/api", // Add here
];
```

### 3. Tools not being called

**Checklist:**
- ✅ MCP server registered: `mcpServers: { "name": toolsServer }`
- ✅ Tool description is clear
- ✅ System prompt mentions tool usage
- ✅ User query triggers tool usage

**Debug:**
```typescript
console.log("[MCP] Registered tools:", toolsServer);
```

### 4. System prompt not loading

**Check:**
- ✅ File exists: `.claude/CLAUDE.md`
- ✅ `settingSources: ["project"]` in options
- ✅ `cwd: resolve(process.cwd())` is correct

### 5. Session not resuming

**Check:**
- ✅ `sdkSessionId` is being passed
- ✅ Session exists in `~/.claude/projects/`
- ✅ Session not expired (> 24 hours)

---

## 📚 Summary

### What You Built

✅ **Multi-provider chat system** using Claude Agent SDK
✅ **MCP tools** for custom functions
✅ **File-based system prompt** for easy editing
✅ **Session management** for conversation continuity
✅ **Provider switching** via environment variables

### Key Takeaways

1. **Claude Agent SDK is a CLI** - Runs as subprocess
2. **Environment variables control provider** - `ANTHROPIC_API_KEY` + `ANTHROPIC_BASE_URL`
3. **MCP tools are in-process functions** - Registered via `createSdkMcpServer()`
4. **System prompt is a file** - `.claude/CLAUDE.md` loaded automatically
5. **SDK manages sessions** - You just need to pass `sdkSessionId`

---

## 🚀 Next Steps

1. Add more MCP tools (web search, code execution, etc)
2. Implement streaming for real-time responses
3. Add conversation history UI
4. Implement cost tracking per provider
5. Set up monitoring and alerts

---

**Questions?** Check [Claude Agent SDK Docs](https://docs.claude.com/en/api/agent-sdk)

**This guide is production-ready!** 🎉
