Exemplo de uma implementaçao de tool.

# DeepWiki MCP Integration - Repository Analysis

**Date**: 2025-01-XX
**Status**: ✅ INTEGRATED
**Version**: 1.0.0

---

## 📋 Overview

DeepWiki MCP server has been integrated into Supermemory to provide deep GitHub repository analysis capabilities. This allows Claude to explore codebases, understand architecture, and answer technical questions about repositories.

---

## 🎯 What Was Added

### 1. External MCP Server Registration

**File**: `apps/api/src/services/claude-agent.ts`

```typescript
const queryOptions: Record<string, unknown> = {
  model: resolvedModel,
  mcpServers: {
    "supermemory-tools": toolsServer,  // Native tools
    deepwiki: {                         // ✅ NEW - DeepWiki MCP
      type: "http",
      url: "https://mcp.deepwiki.com/mcp",
    },
  },
  // ...
};
```

### 2. System Prompt Instructions

**File**: `apps/api/.claude/CLAUDE.md`

Added comprehensive instructions for using DeepWiki tools:
- Tool descriptions (read_wiki_structure, read_wiki_contents, ask_question)
- When to use each tool
- Best practices for repository analysis
- Example workflows
- Integration with other tools (searchDatabase, searchWeb)

### 3. Documentation Updates

**File**: `ai_specs/claude-agent-sdk-fixes/ADDING_NATIVE_TOOLS.md`

Added section on "Adding External MCP Servers" with:
- How to integrate third-party MCP servers
- DeepWiki as a real-world example
- Benefits of external servers
- Where to find more MCP servers

---

## 🔧 Available DeepWiki Tools

Claude now has access to these DeepWiki MCP tools:

### 1. `read_wiki_structure`
**Purpose**: Retrieve the curated documentation outline that DeepWiki generated for a GitHub repository.
**Use case**: Build a high-level mental model of the project, discover major sections, and decide where to dive deeper.
**Input schema**:
```json
{
  "type": "object",
  "properties": {
    "repoName": {
      "type": "string",
      "description": "GitHub repository: owner/repo (e.g. \"facebook/react\")"
    }
  },
  "required": ["repoName"],
  "additionalProperties": false
}
```
**Example**: `read_wiki_structure({ "repoName": "anthropics/anthropic-sdk-typescript" })`

### 2. `read_wiki_contents`
**Purpose**: Fetch the generated documentation content for a repository (entire outline or specific sections, depending on the server response).
**Use case**: Read detailed explanations, copy-ready summaries, and guidance extracted by DeepWiki.
**Input schema**:
```json
{
  "type": "object",
  "properties": {
    "repoName": {
      "type": "string",
      "description": "GitHub repository: owner/repo (e.g. \"facebook/react\")"
    }
  },
  "required": ["repoName"],
  "additionalProperties": false
}
```
**Example**: `read_wiki_contents({ "repoName": "vercel/next.js" })`

### 3. `ask_question`
**Purpose**: Ask targeted questions about the repository using DeepWiki’s synthesized knowledge base.
**Use case**: Clarify implementation details, design decisions, or best practices captured in the generated docs.
**Input schema**:
```json
{
  "type": "object",
  "properties": {
    "repoName": {
      "type": "string",
      "description": "GitHub repository: owner/repo (e.g. \"facebook/react\")"
    },
    "question": {
      "type": "string",
      "description": "The question to ask about the repository"
    }
  },
  "required": ["repoName", "question"],
  "additionalProperties": false
}
```
**Example**: `ask_question({ "repoName": "supabase/supabase", "question": "How is authentication implemented?" })`

---

## 💡 How Claude Uses DeepWiki

### Example 1: Simple Repository Exploration

**User**: "Analyze the repository https://github.com/user/project"

**Claude workflow**:
1. Usa `read_wiki_structure` para visualizar as seções principais
2. Usa `read_wiki_contents` para ler as partes relevantes do guia
3. Sintetiza descobertas com um resumo do projeto

### Example 2: Deep Technical Analysis

**User**: "How does authentication work in repository X?"

**Claude workflow**:
1. Usa `read_wiki_structure` para identificar onde a autenticação é documentada
2. Usa `read_wiki_contents` para ler a seção específica
3. Usa `ask_question` com prompts direcionados ("How is auth implemented?")
4. Gera resposta detalhada citando seções e insights relevantes

### Example 3: Repository Comparison

**User**: "Compare React vs Vue implementations in my saved repos"

**Claude workflow**:
1. Usa `searchDatabase` para localizar os repositórios React e Vue salvos
2. Usa `read_wiki_structure` para comparar a arquitetura geral
3. Usa `read_wiki_contents` para extrair detalhes sobre componentes críticos
4. Usa `ask_question` para esclarecer diferenças ("How does routing differ between them?")
5. Consolida a comparação com recomendações acionáveis

---

## 🎨 Best Practices

### For Users

**Ask specific questions**:
- ✅ "How does authentication work in this repo?"
- ✅ "Show me the folder structure of the backend"
- ✅ "Find all uses of the User model"
- ❌ "Tell me about the code" (too vague)

**Provide repository URLs**:
- ✅ "Analyze https://github.com/user/repo"
- ✅ "Compare this repo with the one I saved earlier"
- ❌ "Look at the code" (which code?)

**Combine with other capabilities**:
- "Search my notes about React, then analyze this React repo"
- "Find best practices on the web, then check if this repo follows them"

### For Claude

**Start broad, then zoom in**:
1. Use `read_wiki_structure` to map the documentação gerada
2. Use `read_wiki_contents` para mergulhar em tópicos relevantes
3. Use `ask_question` para esclarecer dúvidas específicas ou confirmar entendimentos

**Always cite sources**:
- Mention file paths: "In `src/auth/index.ts`..."
- Reference line numbers when possible
- Link to repository when discussing code

**Integrate with other tools**:
- Combine DeepWiki with `searchDatabase` for saved knowledge
- Use `searchWeb` for related documentation
- Cross-reference with user's other saved repositories

---

## 📊 Integration Points

### With Existing Tools

| Tool | How They Work Together |
|------|----------------------|
| `searchDatabase` | Find saved repos → analyze with DeepWiki |
| `searchWeb` | Find best practices → compare with repo implementation |
| User's knowledge | Connect repo patterns with saved documentation |

### Example Integrated Workflow

```
User: "How do modern apps handle authentication, and how does my project compare?"

Claude:
1. searchWeb("modern authentication best practices 2025")
2. searchDatabase(user's saved auth docs)
3. DeepWiki read_wiki_structure("owner/repo")
4. DeepWiki read_wiki_contents("owner/repo")
5. DeepWiki ask_question("What auth strategy is used?")
6. Synthesize: Best practices + User's docs + Actual implementation
```

---

## 🚀 Benefits

### For Users
- ✅ **Deep code understanding** without leaving chat
- ✅ **Quick repository exploration** via natural language
- ✅ **Technical Q&A** about implementation details
- ✅ **Pattern discovery** across codebases
- ✅ **Learning from examples** in saved repositories

### For Developers
- ✅ **No custom implementation** needed - just add URL
- ✅ **Maintained externally** by DeepWiki team
- ✅ **Easy to add** more MCP servers
- ✅ **Combines with native tools** seamlessly

---

## 🧪 Testing

### Test the Integration

1. **Start the server**:
```bash
cd supermemory
bun dev
```

2. **Test in chat**:
```
"Analyze the repository https://github.com/anthropics/claude-agent-sdk-typescript"
```

3. **Expected behavior**:
- Claude uses DeepWiki tools automatically
- Provides a documentation outline, focused summaries, and technical insights
- References DeepWiki sections or headings when citing information
- Combines with other knowledge sources

### Verify Tools Are Available

Check logs for:
```
[executeClaudeAgent] Query options: { hasTools: true, ... }
[executeClaudeAgent] mcpServers: { supermemory-tools, deepwiki }
```

---

## 🔍 How It Works Under the Hood

### MCP Server Flow

```
User asks about repository
         ↓
Claude decides to use DeepWiki tool
         ↓
SDK sends request to https://mcp.deepwiki.com/mcp
         ↓
DeepWiki server:
  - Clones/fetches repository
  - Analyzes code structure
  - Executes requested operation
  - Returns structured data
         ↓
Claude receives results as JSON
         ↓
Claude synthesizes answer with code examples
         ↓
User gets detailed technical analysis
```

### Security & Privacy

- **Repository access**: DeepWiki only accesses **public** GitHub repositories
- **No credentials needed**: Works with public repos out-of-the-box
- **Temporary analysis**: DeepWiki doesn't permanently store repository data
- **Private repos**: Not supported by default (would need authentication setup)

---

## 📝 Configuration Summary

### Files Modified

1. ✅ `apps/api/src/services/claude-agent.ts`
   - Added DeepWiki to `mcpServers` config

2. ✅ `apps/api/.claude/CLAUDE.md`
   - Added DeepWiki tool descriptions
   - Added usage guidelines
   - Added example workflows

3. ✅ `ai_specs/claude-agent-sdk-fixes/ADDING_NATIVE_TOOLS.md`
   - Added "External MCP Servers" section
   - Documented integration pattern

4. ✅ `ai_docs/DEEPWIKI_INTEGRATION.md` (this file)
   - Complete integration documentation

### No Code Changes Required

Unlike native tools, external MCP servers don't require:
- ❌ Writing TypeScript implementations
- ❌ Schema definitions in our codebase
- ❌ Error handling logic
- ❌ Caching implementation
- ❌ Testing harness

Just configuration + system prompt instructions!

---

## 🔮 Future Enhancements

### Potential Additions

1. **More MCP Servers**:
   - Documentation generator MCP
   - Code quality analyzer MCP
   - Security scanner MCP

2. **Enhanced Integration**:
   - Save DeepWiki analyses to knowledge base
   - Compare multiple repositories automatically
   - Track repository changes over time

3. **Custom MCP Server**:
   - Build Supermemory-specific MCP server
   - Expose our data via MCP protocol
   - Allow other tools to access Supermemory

---

## 📚 Resources

- **DeepWiki MCP**: https://deepwiki.com/mcp
- **MCP Protocol**: https://modelcontextprotocol.io/
- **MCP Server Registry**: https://github.com/modelcontextprotocol/servers
- **Claude Agent SDK**: https://docs.anthropic.com/en/docs/claude-code/sdk
- **Adding Tools Guide**: `ai_specs/claude-agent-sdk-fixes/ADDING_NATIVE_TOOLS.md`

---

## ✅ Status

**Current State**: ✅ **FULLY INTEGRATED AND WORKING**

- ✅ DeepWiki MCP server added to config
- ✅ System prompt updated with instructions
- ✅ Documentation complete
- ✅ Ready for production use
- ✅ No additional configuration needed

**To use**: Simply ask Claude about any public GitHub repository!

---

**Last Updated**: 2025-01-XX
**Integration By**: Supermemory Team
**Maintained By**: DeepWiki (external) + Supermemory (integration)
