# Tool Visualization Testing Guide

**Date**: 2025-01-XX  
**Status**: ✅ READY FOR TESTING  
**Version**: 1.0.0

---

## 📋 Overview

This guide helps you verify that tool usage is properly visualized in the Supermemory chat UI. The system now displays all tool executions with enhanced visual feedback.

---

## 🎨 What You Should See

When Claude uses a tool, you'll see a **visual card** with:

### 1. **Tool Card Components**

```
┌─────────────────────────────────────────────┐
│ [Icon] Tool Name                    Status │
│        EXECUTING... / COMPLETED / FAILED   │
│                                             │
│ Output (if available):                      │
│ ┌─────────────────────────────────────────┐│
│ │ Tool output text here...                ││
│ │ JSON data, search results, etc.         ││
│ └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### 2. **Visual States**

| State | Color | Icon | Animation |
|-------|-------|------|-----------|
| **Executing** | Blue/Primary | Tool-specific | Pulsing |
| **Completed** | Gray/Muted | Tool-specific | Static |
| **Failed** | Red/Destructive | Tool-specific | Static |

### 3. **Tool Icons**

| Tool Type | Icon | Example Tools |
|-----------|------|---------------|
| Web Search | 🌐 Globe | searchWeb |
| Database Search | 🔍 Search | searchDatabase |
| Code/Repository | </> Code2 | DeepWiki tools (get_file_tree, read_file) |
| Generic | ⚡ Zap | Other tools |

---

## 🧪 Test Cases

### Test 1: searchDatabase (Native Tool)

**Command in chat:**
```
O que temos sobre React?
```

**Expected visualization:**
1. "Thinking..." spinner appears
2. Tool card appears:
   ```
   🔍 searchDatabase
   EXECUTING...
   ```
3. Card updates to:
   ```
   🔍 searchDatabase
   COMPLETED
   
   [Expandable list of found documents]
   ```
4. Claude's text response follows

---

### Test 2: searchWeb (Native Tool)

**Command in chat:**
```
Busca na internet sobre IA em 2025
```

**Expected visualization:**
1. "Thinking..." spinner
2. Tool card appears:
   ```
   🌐 searchWeb
   EXECUTING...
   ```
3. Card updates to:
   ```
   🌐 searchWeb
   COMPLETED
   
   {
     "count": 5,
     "query": "IA em 2025",
     "results": [...]
   }
   ```
4. Claude synthesizes web results into response

---

### Test 3: DeepWiki MCP Tools

**Command in chat:**
```
Analisa esse repositório: https://github.com/anthropics/claude-agent-sdk-typescript
```

**Expected visualization:**

Multiple tool cards should appear in sequence:

1. **get_file_tree**
   ```
   </> get_file_tree
   EXECUTING...
   ```
   →
   ```
   </> get_file_tree
   COMPLETED
   
   [File tree structure output]
   ```

2. **read_file** (possibly multiple times)
   ```
   </> read_file
   EXECUTING...
   ```
   →
   ```
   </> read_file
   COMPLETED
   
   [File contents]
   ```

3. **ask_question** (optional)
   ```
   ⚡ ask_question
   EXECUTING...
   ```
   →
   ```
   ⚡ ask_question
   COMPLETED
   
   [Analysis response]
   ```

---

### Test 4: Multiple Tools in One Response

**Command in chat:**
```
Busca nos meus documentos sobre Python e também pesquisa na internet as últimas novidades
```

**Expected visualization:**

Two tool cards should appear:

1. **searchDatabase**
   ```
   🔍 searchDatabase
   COMPLETED
   
   [Local documents about Python]
   ```

2. **searchWeb**
   ```
   🌐 searchWeb
   COMPLETED
   
   [Web results about Python news]
   ```

Claude then combines both sources in the response.

---

### Test 5: Tool Error Handling

**To simulate (requires invalid input):**
```
Busca informações sobre [something that triggers an error]
```

**Expected visualization:**
```
┌─────────────────────────────────────────────┐
│ 🔍 searchDatabase                   FAILED │
│                                             │
│ Error: [Error message here]                 │
└─────────────────────────────────────────────┘
```

---

## 🔍 Debugging: Not Seeing Tools?

### Check 1: Backend Logs

Look for tool execution in logs:
```bash
# Should see:
[searchWeb] Cache miss for query "..."
[searchWeb] Found 5 results (234ms)

# Or:
[searchDatabase] Found 10 results (156ms)

# Or for DeepWiki:
[executeClaudeAgent] mcpServers: { supermemory-tools, deepwiki }
```

### Check 2: Network Tab

In browser DevTools → Network:
1. Find the `/api/chat/v2` request
2. Look for NDJSON streaming response
3. You should see events like:
   ```json
   {"type":"tool_event","toolName":"mcp__supermemory-tools__searchWeb","state":"input-streaming"}
   {"type":"tool_event","toolName":"mcp__supermemory-tools__searchWeb","state":"output-available","outputText":"..."}
   ```

### Check 3: Console Logs

In browser console, look for:
```
[Chat] Processing tool event: {...}
```

### Check 4: Verify Tools Are Registered

Check backend logs for:
```
[executeClaudeAgent] Query options: { hasTools: true, ... }
```

---

## 🎯 Expected Tool Names

Tools appear in the UI with these names:

| Backend Tool Name | Displayed As |
|-------------------|--------------|
| `mcp__supermemory-tools__searchDatabase` | searchDatabase |
| `mcp__supermemory-tools__searchWeb` | searchWeb |
| `mcp__deepwiki__get_file_tree` | get_file_tree |
| `mcp__deepwiki__read_file` | read_file |
| `mcp__deepwiki__search_code` | search_code |
| `mcp__deepwiki__ask_question` | ask_question |
| `mcp__deepwiki__get_folder_structure` | get_folder_structure |

The `formatToolLabel()` function strips the `mcp__` prefix for cleaner display.

---

## 📊 Visual Examples

### Successful Tool Execution

```
┌─────────────────────────────────────────────┐
│ 🌐 searchWeb                     COMPLETED │
│                                             │
│ {                                           │
│   "count": 3,                               │
│   "query": "Claude AI 2025",                │
│   "results": [                              │
│     {                                       │
│       "title": "Claude AI Updates",         │
│       "url": "https://...",                 │
│       "score": 0.92                         │
│     }                                       │
│   ]                                         │
│ }                                           │
└─────────────────────────────────────────────┘
```

### Tool Execution in Progress

```
┌─────────────────────────────────────────────┐
│ 🔍 searchDatabase               EXECUTING...│
│                                             │
│ [Pulsing animation]                         │
└─────────────────────────────────────────────┘
```

### Tool Error

```
┌─────────────────────────────────────────────┐
│ 🌐 searchWeb                        FAILED │
│                                             │
│ searchWeb failed: The web search service   │
│ may be unavailable or the EXA_API_KEY may  │
│ not be configured.                          │
└─────────────────────────────────────────────┘
```

---

## ✅ Success Criteria

### Minimal Success
- ✅ Tool cards appear in chat
- ✅ Tool names are displayed correctly
- ✅ Status changes from "EXECUTING" to "COMPLETED"
- ✅ Output text is shown (if available)

### Full Success
- ✅ Correct icons for each tool type
- ✅ Smooth animations during execution
- ✅ Color-coded states (blue=executing, gray=success, red=error)
- ✅ Output is formatted and scrollable
- ✅ Multiple tools appear in sequence
- ✅ Tools integrate with Claude's text responses

---

## 🔧 Troubleshooting

### Problem: No tool cards appear

**Solution:**
1. Verify backend is sending tool events:
   ```bash
   # In backend logs, look for:
   [executeClaudeAgent] Using CLI at: ...
   [searchWeb] Cache miss for query "..."
   ```

2. Check if frontend is receiving events:
   ```javascript
   // In browser console:
   localStorage.debug = '*'
   // Reload and check for tool_event logs
   ```

3. Verify tool registration:
   ```bash
   cd apps/api
   bun run test-tools.ts
   # Should show: searchDatabase, searchWeb
   ```

### Problem: Tool cards show but no output

**Possible causes:**
- Tool executed but returned empty result
- Output is being sent but not parsed correctly
- Check `outputText` field in network response

### Problem: Wrong tool name displayed

**Check:**
- `formatToolLabel()` function in `chat-messages.tsx`
- Backend is sending correct `toolName` in events
- Tool name matches expected format: `mcp__server__toolname`

---

## 📝 Test Checklist

Before considering the feature complete:

- [ ] searchDatabase shows visual card
- [ ] searchWeb shows visual card with Globe icon
- [ ] DeepWiki tools show Code2 icon
- [ ] Tool status changes during execution
- [ ] Output text is displayed and scrollable
- [ ] Errors are shown in red
- [ ] Multiple tools can appear in one response
- [ ] Tool cards don't interfere with text responses
- [ ] Mobile view displays cards correctly
- [ ] Long outputs are truncated/scrollable

---

## 🚀 Quick Test Script

Run this sequence to test all tools:

```bash
# 1. Start the app
bun dev

# 2. In chat, run these commands one by one:

# Test searchDatabase
"O que temos sobre React?"

# Test searchWeb
"Busca na internet sobre IA em 2025"

# Test DeepWiki
"Analisa o repositório https://github.com/anthropics/claude-agent-sdk-typescript"

# Test multiple tools
"Busca nos meus docs sobre Python e também pesquisa na web as novidades"

# Test error handling (if EXA_API_KEY not configured)
"Pesquisa na web sobre [anything]"
```

After each command, verify the tool visualization appears correctly.

---

## 📚 Related Files

- **Frontend**: `apps/web/components/views/chat/chat-messages.tsx`
- **Backend**: `apps/api/src/routes/chat-v2.ts`
- **Tool Registration**: `apps/api/src/services/claude-agent-tools.ts`
- **MCP Config**: `apps/api/src/services/claude-agent.ts`

---

## ✅ Current Status

**Implementation**: ✅ COMPLETE

All tool visualization code is implemented and ready. The UI will automatically display any tool that Claude uses, whether it's:
- Native tools (searchDatabase, searchWeb)
- External MCP tools (DeepWiki)
- Future tools you add

**Next Step**: Test in the actual UI to verify everything works as expected!

---

**Last Updated**: 2025-01-XX  
**Testing By**: Supermemory Team