# Testing Guide - Chat Modes

## Quick Start

```bash
# 1. Get your session token from DevTools
# Application → Cookies → better-auth.session_token

# 2. Run automated tests
AUTH_TOKEN="your-token-here" ./test-chat-modes.sh

# 3. Test manually in UI with DevTools open
```

## Architecture Overview

### Backend (chat-v2.ts)

**Endpoint**: `POST /chat/v2`

**Request**:
```json
{
  "mode": "simple" | "agentic" | "deep",
  "messages": [
    { "role": "user", "content": "What do I have about AI?" }
  ],
  "metadata": { "projectId": "..." }
}
```

**Response**: Server-Sent Events stream with AI SDK protocol

### Frontend (chat-messages.tsx)

**UI Controls**:
- Mode selector (dropdown): apps/web/components/views/chat/chat-messages.tsx:445-459
- Endpoint: `${BACKEND_URL}/chat/v2` (line 338)
- Body includes: `{ mode, metadata: { projectId } }` (line 340)

**Tool Detection**:
- UI expects tool name: `tool-searchMemories` (AI SDK adds `tool-` prefix automatically)
- Backend defines: `searchMemories` (chat-v2.ts:145)
- TypeScript types: lines 48-62 in chat-messages.tsx

## Mode Behaviors

### Simple Mode
```typescript
{
  model: "gemini-2.5-flash-preview-09-2025",
  maxTokens: 4096,
  temperature: 0.7,
  tools: {} // No tools
}
```

**Behavior**:
- Single semantic search (top 5 results)
- No iterative refinement
- Fastest response time
- Best for: Direct questions with clear intent

**Expected Output**:
- Citations: `[1]`, `[2]`, etc.
- Sources section at end
- No tool call indicators

### Agentic Mode
```typescript
{
  model: "gemini-2.5-flash-preview-09-2025",
  maxTokens: 8192,
  temperature: 0.6,
  tools: { searchMemories }, // Enabled
  toolChoice: "auto"
}
```

**Behavior**:
- Uses `agenticSearch` service (apps/api/src/services/agentic-search.ts)
- Generates 2-3 queries per iteration
- Max 3 iterations (configurable)
- Parallel searches with deduplication
- Evaluates completeness after each round
- Best for: Vague or exploratory questions

**Expected Output**:
- "Searching memories..." indicator in UI
- Citations: `[1]`, `[2]`, etc.
- Sources section with URLs
- DevTools shows: `tool-searchMemories` in stream

**Agentic Pipeline** (agentic-search.ts):
1. Generate queries via `generateObject` (Gemini 2.5 flash)
2. Execute searches in parallel
3. Deduplicate by documentId (keep highest score)
4. Evaluate if can answer (via `evaluateCompleteness`)
5. Repeat if needed (up to maxEvals=3 or tokenBudget=4096)

### Deep Mode
```typescript
{
  model: "gemini-2.5-flash-preview-09-2025",
  maxTokens: 16384,
  temperature: 0.5,
  tools: { searchMemories }, // Enabled
  toolChoice: undefined // Not forced
}
```

**Behavior**:
- Single search with expanded limits (top 10, longer chunks)
- Larger context window (16k tokens)
- Lower temperature for focused synthesis
- Best for: Analysis, comparisons, long answers

**Expected Output**:
- Longer, more detailed responses
- More citations (up to 10)
- May include tool calls if model decides

## Manual Testing Checklist

### 1. Verify Search Endpoint
```bash
curl -X POST http://localhost:4000/v3/search \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=$TOKEN" \
  -d '{"q": "AI", "limit": 5}'
```

**Expected**: JSON with `{ results: [...], total: N }`

### 2. Test Mode Selector in UI

**Steps**:
1. Open http://localhost:3000/chat
2. Open DevTools → Network tab
3. Select "Agentic" mode from dropdown
4. Type: "What do I have about AI?"
5. Send message

**Verify in Network tab**:
- Request URL: `http://localhost:4000/chat/v2`
- Request payload includes: `"mode": "agentic"`
- Response type: `text/event-stream`
- Response body contains: `0:` (stream markers)

### 3. Check Tool Calls (Agentic/Deep)

**In Network tab response**:
```
0:{"type":"tool-call","toolCallId":"...","toolName":"searchMemories","args":{...}}
0:{"type":"tool-result","toolCallId":"...","result":{...}}
```

**In UI**:
- Shows "Searching memories..." spinner
- Expandable section with results
- Click to see document titles and scores

### 4. Verify Citations

**Expected in response**:
```
Based on your notes [1][2], AI is...

Sources:
[1] Document Title (score: 0.85) - http://example.com
[2] Another Doc (score: 0.78)
```

### 5. Test All 3 Modes

| Mode | Query | Expected |
|------|-------|----------|
| Simple | "What is AI?" | Quick answer, 1-5 citations, no tools |
| Agentic | "Find all my AI notes" | Tool calls, multiple queries, 1-5 citations |
| Deep | "Summarize my AI research" | Long answer, up to 10 citations, deep context |

## Environment Variables

**Required for Agentic**:
```bash
ENABLE_AGENTIC_MODE=true  # Default: true (apps/api/src/env.ts:82)
GOOGLE_API_KEY=...        # Gemini API key
```

**Check env**:
```bash
cd apps/api
bun run dev
# Should NOT show validation errors
```

## Common Issues

### Issue: Mode selector not visible
**Fix**: Refresh page, check chat-messages.tsx:445-459

### Issue: "tool-searchMemories not found"
**Cause**: Backend tool name mismatch
**Fix**: Verify chat-v2.ts:145 defines `searchMemories` (AI SDK auto-adds `tool-` prefix)

### Issue: No citations in response
**Cause**: No matching documents in database
**Fix**: 
1. Seed data: `bun run --cwd apps/api seed` (if seed script exists)
2. Or add documents via UI/API first

### Issue: Agentic mode doesn't iterate
**Cause**: `ENABLE_AGENTIC_MODE=false` or evaluation returns `canAnswer=true` on first try
**Fix**: Check env.ts, try vaguer query

### Issue: Stream doesn't complete
**Cause**: Model timeout or token limit exceeded
**Fix**: Check API logs, reduce maxTokens or tokenBudget

## DevTools Inspection

### Network Tab - Request
```json
{
  "mode": "agentic",
  "messages": [
    { "role": "user", "content": "What do I know about AI?" }
  ],
  "metadata": { "projectId": "proj_xxx" }
}
```

### Network Tab - Response (stream)
```
0:{"type":"text-delta","textDelta":"Based"}
0:{"type":"text-delta","textDelta":" on"}
0:{"type":"tool-call","toolCallId":"call_1","toolName":"searchMemories","args":{"query":"AI","limit":10}}
0:{"type":"tool-result","toolCallId":"call_1","result":{"count":5,"results":[...]}}
0:{"type":"text-delta","textDelta":" your"}
...
```

### Console Tab
```javascript
// Check useChat state
const { messages, status } = useChat(...)
console.log(messages)
// Each message has .parts array
// parts[i].type === "tool-searchMemories" → tool call detected
```

## Performance Benchmarks

| Mode | Avg Time | Tokens | Iterations |
|------|----------|--------|------------|
| Simple | ~2s | 1k-2k | 1 |
| Agentic | ~6s | 3k-5k | 1-3 |
| Deep | ~8s | 8k-12k | 1 |

*Times assume warm cache and ~5 documents in DB*

## Playwright E2E Test (Optional)

```typescript
// tests/chat-modes.spec.ts
test('agentic mode triggers tool calls', async ({ page, context }) => {
  // 1. Set auth cookie
  await context.addCookies([{
    name: 'better-auth.session_token',
    value: process.env.AUTH_TOKEN,
    domain: 'localhost',
    path: '/'
  }])
  
  // 2. Navigate to chat
  await page.goto('http://localhost:3000/chat')
  
  // 3. Select agentic mode
  await page.selectOption('#chat-mode', 'agentic')
  
  // 4. Send message
  await page.fill('[data-testid="chat-input"]', 'What do I have about AI?')
  await page.click('[data-testid="send-button"]')
  
  // 5. Wait for response
  await page.waitForSelector('text=/Searching memories/')
  await page.waitForSelector('text=/Sources:/')
  
  // 6. Verify citations
  const response = await page.textContent('[data-testid="assistant-message"]')
  expect(response).toContain('[1]')
})
```

Run: `bun test tests/chat-modes.spec.ts`

## API Logs to Watch

**Successful Agentic Flow**:
```
[INFO] Chat V2 request: mode=agentic
[INFO] Agentic search: iteration 1/3
[INFO] Generated queries: ["AI research", "machine learning notes"]
[INFO] Parallel search: 2 queries
[INFO] Deduped results: 8 documents
[INFO] Evaluation: canAnswer=true
[INFO] Chat stream completed: tokensUsed=4521
```

**Simple Flow**:
```
[INFO] Chat V2 request: mode=simple
[INFO] Initial context: 5 results
[INFO] Chat stream completed: tokensUsed=1823
```

## Next Steps

1. Run `./test-chat-modes.sh` to validate backend
2. Test mode selector in UI with DevTools open
3. Verify tool calls appear in Network tab for agentic mode
4. Check citations format in UI
5. Optional: Write Playwright tests for regression coverage
