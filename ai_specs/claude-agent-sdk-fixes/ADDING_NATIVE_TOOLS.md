# Adding Native MCP Tools to Claude Agent SDK

**Created**: 2025-01-XX  
**Status**: ✅ ACTIVE GUIDE  
**Version**: 1.0.0

---

## 📋 Overview

This guide explains how to add new native tools to the Claude Agent SDK in Supermemory. All tools must use the **MCP (Model Context Protocol)** wrapper to be accessible by Claude Code.

**Key Principle**: Claude Agent SDK can ONLY call tools registered via `createSdkMcpServer` and the `tool()` function.

---

## 🎯 Quick Start

### Minimal Example

```typescript
// apps/api/src/services/claude-agent-tools.ts

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

export function createSupermemoryTools(client, orgId, context) {
  return createSdkMcpServer({
    name: "supermemory-tools",
    version: "1.0.0",
    tools: [
      // Your new tool here
      tool(
        "toolName",                    // Tool identifier
        "Tool description",             // What it does
        {                               // Schema (Zod)
          param1: z.string().min(1),
          param2: z.number().default(10),
        },
        async ({ param1, param2 }) => { // Implementation
          // Your logic here
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ result: "data" })
            }]
          };
        }
      ),
    ],
  });
}
```

---

## 📁 File Structure

```
apps/api/
├── src/
│   ├── services/
│   │   ├── claude-agent-tools.ts    ← Register tools here
│   │   ├── your-service.ts          ← Business logic (optional)
│   │   └── cache.ts                 ← Shared cache service
│   ├── env.ts                       ← Environment variables
│   └── routes/
│       └── chat-v2.ts               ← Tool usage happens here
└── .claude/
    └── CLAUDE.md                    ← System prompt (tool instructions)
```

---

## 🔧 Step-by-Step Guide

### Step 1: Define Your Service (Optional)

If your tool needs complex logic, create a service file:

```typescript
// apps/api/src/services/my-new-service.ts

export type MyServiceOptions = {
  limit?: number;
  filter?: string;
};

export async function myServiceFunction(
  param: string,
  options: MyServiceOptions = {}
): Promise<MyResult[]> {
  // Your implementation
  const results = await fetchData(param);
  return results;
}
```

### Step 2: Register the Tool

Open `apps/api/src/services/claude-agent-tools.ts`:

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { myServiceFunction } from "./my-new-service"; // Import your service

export function createSupermemoryTools(
  client: SupabaseClient,
  orgId: string,
  context: ToolContext = {},
) {
  const cache = getCacheService();
  const CACHE_TTL = 3600; // 1 hour

  return createSdkMcpServer({
    name: "supermemory-tools",
    version: "1.0.0",
    tools: [
      // Existing tools...
      tool("searchDatabase", ...),
      tool("searchWeb", ...),
      
      // YOUR NEW TOOL
      tool(
        "myNewTool",                                    // 1. Tool name
        "Description of what this tool does",          // 2. Description
        {                                               // 3. Schema (Zod)
          query: z.string().min(1).describe("Search query"),
          limit: z.number().min(1).max(50).default(10),
          advanced: z.boolean().default(false).optional(),
        },
        async ({ query, limit, advanced }) => {        // 4. Implementation
          const startTime = Date.now();
          
          try {
            // Your logic
            const results = await myServiceFunction(query, {
              limit,
              filter: advanced ? "advanced" : "simple"
            });
            
            const duration = Date.now() - startTime;
            console.log(`[myNewTool] Found ${results.length} results (${duration}ms)`);
            
            // Format response
            const result = {
              count: results.length,
              results: results.map(item => ({
                id: item.id,
                data: item.data,
              })),
            };
            
            // Return MCP format
            return {
              content: [{
                type: "text",
                text: JSON.stringify(result, null, 2),
              }],
            };
          } catch (error) {
            console.error("[myNewTool] Error:", error);
            return {
              content: [{
                type: "text",
                text: `Tool failed: ${error instanceof Error ? error.message : "Unknown error"}`,
              }],
              isError: true as const,
            };
          }
        },
      ),
    ],
  });
}
```

### Step 3: Add Cache Support (Recommended)

```typescript
tool(
  "myNewTool",
  "Description...",
  { /* schema */ },
  async ({ query, limit }) => {
    const startTime = Date.now();
    
    // Generate cache key
    const cacheKey = generateCacheKey({
      type: "myNewTool",
      query,
      limit,
    });
    
    // Try cache first
    const cached = await cache.get<unknown>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      console.log(`[myNewTool] Cache hit (${duration}ms)`);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(cached, null, 2),
        }],
      };
    }
    
    console.log(`[myNewTool] Cache miss`);
    
    // Fetch data
    const results = await myServiceFunction(query, { limit });
    
    const result = { count: results.length, results };
    
    // Store in cache
    await cache.set(cacheKey, result, { ttl: CACHE_TTL });
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
),
```

### Step 4: Update System Prompt

Add instructions to `.claude/CLAUDE.md`:

```markdown
### 6. My New Tool

You have access to the "myNewTool" tool that does X.

**When to use myNewTool:**
- When the user asks about Y
- When you need to retrieve Z
- When searching for W

**How to use:**
The myNewTool returns JSON with:
- count: total number of results
- results: array of items with id, data

**Example usage:**
- "Find information about topic X"
- "Search for recent updates on Y"
```

### Step 5: Add Environment Variables (If Needed)

If your tool needs API keys or config:

1. **Add to `apps/api/src/env.ts`:**

```typescript
const envSchema = z.object({
  // Existing vars...
  ANTHROPIC_API_KEY: z.string().min(1),
  
  // Your new var
  MY_SERVICE_API_KEY: z.string().min(1).optional(),
  MY_SERVICE_BASE_URL: z.string().url().default("https://api.example.com"),
});
```

2. **Add to `apps/api/.env`:**

```bash
MY_SERVICE_API_KEY=your_key_here
MY_SERVICE_BASE_URL=https://api.example.com
```

3. **Use in your service:**

```typescript
import { env } from "../env";

export async function myServiceFunction(param: string) {
  if (!env.MY_SERVICE_API_KEY) {
    console.warn("[myService] API key not configured");
    return [];
  }
  
  const response = await fetch(`${env.MY_SERVICE_BASE_URL}/endpoint`, {
    headers: {
      "x-api-key": env.MY_SERVICE_API_KEY,
    },
  });
  
  // ...
}
```

---

## 📊 Tool Schema Patterns

### Basic Types

```typescript
{
  stringParam: z.string().min(1),
  numberParam: z.number().min(1).max(100),
  boolParam: z.boolean().default(false),
  optionalParam: z.string().optional(),
  arrayParam: z.array(z.string()),
}
```

### With Descriptions

```typescript
{
  query: z.string()
    .min(1)
    .describe("Search query - be specific and clear"),
  
  limit: z.number()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum number of results to return"),
  
  filter: z.enum(["all", "recent", "popular"])
    .default("all")
    .describe("Filter type: all, recent, or popular results"),
}
```

### Complex Objects

```typescript
{
  filters: z.object({
    tags: z.array(z.string()).optional(),
    dateRange: z.object({
      start: z.string(),
      end: z.string(),
    }).optional(),
  }).optional(),
}
```

---

## 🎯 Return Format

### Success Response

```typescript
return {
  content: [{
    type: "text",
    text: JSON.stringify({
      // Your data structure
      count: 5,
      results: [...],
      metadata: {...},
    }, null, 2),
  }],
};
```

### Error Response

```typescript
return {
  content: [{
    type: "text",
    text: `Tool failed: ${errorMessage}. Additional context here.`,
  }],
  isError: true as const,
};
```

### Empty Response

```typescript
return {
  content: [{
    type: "text",
    text: JSON.stringify({ count: 0, results: [] }, null, 2),
  }],
};
```

---

## ✅ Best Practices

### 1. Naming Conventions

- **Tool name**: camelCase, descriptive (`searchDatabase`, `analyzeCode`)
- **Parameters**: camelCase, clear (`query`, `maxResults`, not `q`, `max`)
- **Service files**: kebab-case (`my-new-service.ts`)

### 2. Logging

```typescript
// Start of tool
console.log(`[toolName] Starting with query: "${query}"`);

// Cache hit
console.log(`[toolName] Cache hit (${duration}ms)`);

// Cache miss
console.log(`[toolName] Cache miss`);

// Success
console.log(`[toolName] Found ${count} results (${duration}ms)`);

// Error
console.error(`[toolName] Error:`, error);
```

### 3. Performance

- ✅ Always add caching for expensive operations
- ✅ Set reasonable default limits (5-20 results)
- ✅ Allow max limits (20-100) but document performance impact
- ✅ Log execution time
- ✅ Use async/await properly

### 4. Error Handling

```typescript
try {
  // Your logic
  const results = await fetchData();
  return { content: [{ type: "text", text: JSON.stringify(results) }] };
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("[toolName] Error:", error);
  
  return {
    content: [{
      type: "text",
      text: `Tool failed: ${message}. Please try again or contact support.`,
    }],
    isError: true as const,
  };
}
```

### 5. Descriptions

Write descriptions that help Claude decide when to use the tool:

**Bad:**
```typescript
"Search tool"
```

**Good:**
```typescript
"Search the user's documents and memories in their knowledge base. 
Use this when the user asks about their saved content, documents, 
or wants to retrieve information they've previously stored."
```

---

## 🧪 Testing

### Create a Test File

```typescript
// apps/api/test-mytool.ts

import { createSupermemoryTools } from "./src/services/claude-agent-tools";
import { createClient } from "@supabase/supabase-js";
import { env } from "./src/env";

async function testMyTool() {
  console.log("Testing myNewTool...");
  
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  const toolsConfig = createSupermemoryTools(client, "test-org", {});
  const mcpServer = toolsConfig.instance;
  
  // Access registered tools
  const tools = (mcpServer as any)._registeredTools;
  
  if (tools.myNewTool) {
    console.log("✅ myNewTool registered");
    
    // Test invocation
    const result = await tools.myNewTool.callback({
      query: "test query",
      limit: 5,
    });
    
    console.log("Result:", result);
  } else {
    console.error("❌ myNewTool NOT registered");
  }
}

testMyTool();
```

Run:
```bash
cd apps/api
bun run test-mytool.ts
```

---

## 📝 Real-World Examples

### Example 1: Database Query Tool

```typescript
tool(
  "queryUsers",
  "Query user data from the database",
  {
    email: z.string().email().optional(),
    role: z.enum(["admin", "user", "guest"]).optional(),
    limit: z.number().min(1).max(100).default(10),
  },
  async ({ email, role, limit }) => {
    const query = client
      .from("users")
      .select("id, email, role, created_at")
      .limit(limit);
    
    if (email) query.eq("email", email);
    if (role) query.eq("role", role);
    
    const { data, error } = await query;
    
    if (error) {
      return {
        content: [{ type: "text", text: `Query failed: ${error.message}` }],
        isError: true,
      };
    }
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ count: data.length, users: data }, null, 2),
      }],
    };
  },
),
```

### Example 2: External API Tool

```typescript
tool(
  "getWeather",
  "Get current weather for a location",
  {
    city: z.string().min(1).describe("City name"),
    units: z.enum(["metric", "imperial"]).default("metric"),
  },
  async ({ city, units }) => {
    const cacheKey = `weather:${city}:${units}`;
    const cached = await cache.get(cacheKey);
    
    if (cached) {
      return { content: [{ type: "text", text: JSON.stringify(cached) }] };
    }
    
    const response = await fetch(
      `https://api.weather.com/v1/current?city=${encodeURIComponent(city)}&units=${units}`,
      { headers: { "x-api-key": env.WEATHER_API_KEY } }
    );
    
    if (!response.ok) {
      return {
        content: [{ type: "text", text: `Weather API error: ${response.statusText}` }],
        isError: true,
      };
    }
    
    const data = await response.json();
    await cache.set(cacheKey, data, { ttl: 1800 }); // 30min cache
    
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  },
),
```

---

## 🚫 Common Mistakes

### ❌ NOT Using MCP Wrapper

```typescript
// WRONG - This won't work!
export async function myTool(query: string) {
  return { result: "data" };
}
```

```typescript
// CORRECT - Use createSdkMcpServer + tool()
return createSdkMcpServer({
  name: "supermemory-tools",
  version: "1.0.0",
  tools: [
    tool("myTool", "Description", schema, implementation)
  ],
});
```

### ❌ Wrong Return Format

```typescript
// WRONG
return { result: "data" };

// CORRECT
return {
  content: [{
    type: "text",
    text: JSON.stringify({ result: "data" })
  }]
};
```

### ❌ Missing Error Handling

```typescript
// WRONG - Will crash on error
const data = await riskyOperation();
return { content: [{ type: "text", text: JSON.stringify(data) }] };

// CORRECT
try {
  const data = await riskyOperation();
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
} catch (error) {
  return {
    content: [{ type: "text", text: `Error: ${error.message}` }],
    isError: true,
  };
}
```

### ❌ Not Adding to System Prompt

Tools won't be used effectively if Claude doesn't know about them!

---

## 🔍 Debugging

### Check if Tool is Registered

```typescript
// apps/api/test-tools.ts
const toolsConfig = createSupermemoryTools(client, "test-org", {});
const mcpServer = toolsConfig.instance;
const tools = (mcpServer as any)._registeredTools;

console.log("Registered tools:", Object.keys(tools));
// Should show: ['searchDatabase', 'searchWeb', 'myNewTool']
```

### Enable Verbose Logging

In chat logs, you'll see:
```
[executeClaudeAgent] Using CLI at: ...
[executeClaudeAgent] Query options: { hasTools: true, ... }
[myNewTool] Cache miss for query "..."
[myNewTool] Found 5 results (234ms)
```

### Check Claude's Tool Usage

When Claude uses your tool, logs show:
```
@repo/api:dev: [myNewTool] Cache miss for query "test query"
@repo/api:dev: [myNewTool] Found 3 results (150ms)
```

---

## 🌐 Adding External MCP Servers

You can also integrate **external MCP servers** (HTTP-based tools from third parties) instead of building tools from scratch.

### Example: DeepWiki for Repository Analysis

DeepWiki provides MCP tools for deep GitHub repository analysis.

#### Step 1: Add to MCP Config

In `apps/api/src/services/claude-agent.ts`, add to the `mcpServers` object:

```typescript
const queryOptions: Record<string, unknown> = {
  model: resolvedModel,
  mcpServers: {
    "supermemory-tools": toolsServer,  // Our native tools
    
    // External MCP server
    deepwiki: {
      type: "http",
      url: "https://mcp.deepwiki.com/mcp",
    },
  },
  // ... rest of config
};
```

#### Step 2: Update System Prompt

Add instructions in `.claude/CLAUDE.md`:

```markdown
### DeepWiki Repository Analysis

You have access to **DeepWiki MCP tools** for deep repository analysis:

**Available Tools:**
- `get_file_tree` - Get complete file structure
- `get_folder_structure` - Get detailed folder hierarchy  
- `read_file` - Read specific files from repositories
- `search_code` - Search for code patterns
- `ask_question` - Ask questions about implementation

**When to use:**
- User asks about a specific GitHub repository
- User wants to understand code structure or architecture
- User asks "how does X work" in a repository

**Example workflow:**
1. Use `get_file_tree` to understand structure
2. Use `read_file` for specific files
3. Use `search_code` for patterns
4. Use `ask_question` for complex analysis
```

#### Step 3: Test the Integration

```bash
# Restart the server
bun dev

# In chat, test:
# "Analyze the repository https://github.com/user/repo"
```

### Other External MCP Servers

You can add any HTTP-based MCP server using the same pattern:

```typescript
mcpServers: {
  "supermemory-tools": toolsServer,
  
  // Weather service
  weather: {
    type: "http",
    url: "https://api.weather-mcp.com/mcp",
  },
  
  // Database analyzer
  dbanalyzer: {
    type: "http", 
    url: "https://mcp.dbanalyzer.io/v1",
  },
}
```

### Benefits of External MCP Servers

- ✅ No need to implement complex logic yourself
- ✅ Maintained by third-party providers
- ✅ Easy to integrate (just add URL)
- ✅ Can be combined with native tools
- ✅ Automatic tool discovery

### Finding MCP Servers

- [MCP Registry](https://github.com/modelcontextprotocol/servers)
- [Anthropic MCP Documentation](https://docs.anthropic.com/en/docs/build-with-claude/mcp)
- Community-built servers

---

## 📚 Further Reading

- [Claude Agent SDK Docs](https://docs.anthropic.com/en/docs/claude-code/sdk)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [MCP Servers Registry](https://github.com/modelcontextprotocol/servers)
- [Zod Schema Validation](https://zod.dev/)
- [Supermemory Architecture](../../CLAUDE.md)
- [DeepWiki MCP](https://deepwiki.com/mcp)

---

## ✅ Checklist for New Tools

### For Native Tools (Built In-House)
- [ ] Service implementation (if complex logic needed)
- [ ] Tool registered in `claude-agent-tools.ts`
- [ ] Zod schema with descriptions
- [ ] MCP return format (`{ content: [{ type: "text", text: "..." }] }`)
- [ ] Error handling with try/catch
- [ ] Cache support (if expensive)
- [ ] Logging (start, cache hit/miss, success, errors)
- [ ] System prompt updated (`.claude/CLAUDE.md`)
- [ ] Environment variables (if needed)
- [ ] Test file created
- [ ] Documentation updated

### For External MCP Servers
- [ ] MCP server URL added to `mcpServers` config in `claude-agent.ts`
- [ ] System prompt updated with tool descriptions
- [ ] Test the integration in chat
- [ ] Document which tools are available
- [ ] No code implementation needed (server handles it)

---

**Last Updated**: 2025-01-XX  
**Maintained By**: Supermemory Team