# Claude Agent SDK Configuration

This directory contains configuration files for the Claude Agent SDK used by Supermemory.

## Directory Structure

```
.claude/
├── CLAUDE.md              # System prompt (main configuration)
├── settings.json          # General settings (optional)
├── settings.local.json    # Local overrides (gitignored)
├── agents/                # Subagents (future use)
├── skills/                # Custom skills (future use)
└── commands/              # Slash commands (future use)
```

## CLAUDE.md

This is the **main system prompt** that defines the agent's behavior. The SDK automatically loads this file when `settingSources: ["project"]` is configured.

**Benefits over inline prompts:**
- ✅ Version controlled and easy to edit
- ✅ No code changes needed to update prompt
- ✅ Cleaner logs (not exposed in CLI output)
- ✅ Loaded once and cached by SDK
- ✅ Hot-reloadable in development

## How It Works

The SDK loads configuration in this order:
1. **CLAUDE.md** (this file) - Primary system prompt
2. **settings.json** - General configuration
3. **settings.local.json** - Local development overrides

## Editing the System Prompt

To change the agent's behavior:

1. Edit `.claude/CLAUDE.md`
2. Restart the API server
3. SDK automatically picks up changes on next session

**No code changes required!**

## Fallback Behavior

If CLAUDE.md is not found or cannot be loaded, the SDK falls back to the inline system prompt defined in `src/prompts/chat.ts`.

## References

- [Claude Agent SDK Documentation](https://docs.claude.com/en/api/agent-sdk/overview)
- [Migration Guide](https://docs.claude.com/en/docs/claude-code/sdk/migration-guide)
- [Supermemory System Prompt Source](../src/prompts/chat.ts)
