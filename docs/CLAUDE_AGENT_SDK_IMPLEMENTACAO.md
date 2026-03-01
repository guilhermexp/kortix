# Implementação do Claude Code Agent SDK no app

## Objetivo
Documentar como o `@anthropic-ai/claude-agent-sdk` foi integrado no Kortix, com foco nos 3 pontos de uso no frontend:

1. Página de lista (home)
2. Página de notas/memórias (edição de documento)
3. Página de canvas (Excalidraw)

## Visão geral da arquitetura

### Backend (onde o SDK roda)
- Entrada HTTP principal: `POST /chat/v2`
- Handler: `apps/api/src/routes/chat-v2.ts`
- Execução SDK: `apps/api/src/services/claude-agent.ts` (`executeClaudeAgent`)
- Ferramentas MCP expostas ao agente: `apps/api/src/services/claude-agent-tools.ts`

### Frontend (onde o chat é embutido em contextos diferentes)
- Componente base de chat: `ChatRewrite` em `apps/web/components/views/chat/index.tsx`
- Orquestração de streaming e payloads: `ChatMessages` em `apps/web/components/views/chat/chat-messages.tsx`
- Páginas que plugam o chat:
  - Lista/home: `apps/web/app/home-client.tsx`
  - Memória/nota: `apps/web/components/editor/memory-edit-client.tsx`
  - Canvas/Excalidraw: `apps/web/components/canvas-chat-panel.tsx` + `apps/web/app/canvas/[id]/page.tsx`

## Fluxo ponta a ponta (resumo)
1. Frontend monta payload (`message`, `sdkSessionId`, `metadata`, `scopedDocumentIds`, `provider`) em `ChatMessages`.
2. Backend (`chat-v2`) interpreta metadata (projeto, documento, canvas, menções) e monta:
   - `systemPrompt` contextual
   - `toolContext` (tags, docs escopados, `canvasId`, `userId`)
3. `executeClaudeAgent` chama `query()` do Claude Agent SDK com:
   - MCP server `kortix-tools`
   - sessão persistida (`persistSession`) e `resume` por `sdkSessionId`
   - permissões e lista de tools controladas no backend
4. Eventos de stream do SDK são convertidos em eventos simplificados para o frontend:
   - `assistant_delta`, `thinking`, `tool_event`, `final`, etc.
5. Frontend renderiza texto incremental, estado de ferramentas e persistência de conversa/sessão.

## Backend: como o SDK está configurado

## 1) `executeClaudeAgent` (core)
Arquivo: `apps/api/src/services/claude-agent.ts`

Pontos importantes:
- Remove `process.env.CLAUDECODE` no load do módulo para evitar sessão aninhada do SDK.
- Resolve dinamicamente o caminho do `cli.js` do SDK.
- Configura variáveis de provider por request (`ANTHROPIC_*`) com suporte a providers alternativos (ex.: Kimi).
- Sobe MCP servers, sempre incluindo `kortix-tools`.
- Usa `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true`.
- Desabilita ferramentas locais perigosas via `disallowedTools` (`Bash`, `Grep`, etc.).
- Habilita `persistSession: true` para continuidade real de sessão do SDK.
- Usa `settingSources: ["project"]` para carregar `.claude/CLAUDE.md` quando não há prompt custom.
- Faz `resume` quando recebe `sdkSessionId`.
- Fallback para `@anthropic-ai/sdk` direto se o subprocesso do Agent SDK falhar.

## 2) Camada de tools MCP (`kortix-tools`)
Arquivo: `apps/api/src/services/claude-agent-tools.ts`

Ferramentas principais:
- Busca/base de conhecimento:
  - `searchDatabase`
  - `readAttachment`
- Canvas (condicionais por flag `CANVAS_AGENT_TOOLS_ENABLED`):
  - `canvas_create_view`, `canvas_read_scene`, `canvas_summarize_scene`,
  - `canvas_create_flowchart`, `canvas_create_mindmap`, `canvas_auto_arrange`,
  - `canvas_restore_checkpoint`, `canvas_clear`, `canvas_get_preview`, etc.
- Sandbox opcional (Daytona), condicionado por env.

Detalhe crítico para Canvas:
- Se não existir `canvasId` no contexto, o backend pode auto-criar canvas para tools de escrita (`ensureCanvasForWrite`), desde que tenha `userId`.

## 3) `chat-v2`: tradução de contexto de UI para contexto de agente
Arquivo: `apps/api/src/routes/chat-v2.ts`

O handler:
- Parseia `metadata` (`projectId`, `canvasId`, `documentId`, `mentionedDocIds`, `contextDocument`).
- Constrói instruções extras no `systemPrompt`:
  - escopo de projeto,
  - comportamento para documento aberto,
  - modo canvas (`CANVAS_CONTEXT_PROMPT`).
- Injeta conteúdo integral do documento atual em `messageForAgent` quando `contextDocument.content` existe.
- Injeta lista de anexos e instrui uso de `readAttachment`.
- Monta `toolContext` enviado para `executeClaudeAgent`:
  - `containerTags`, `scopedDocumentIds`, `canvasId`, `userId`.

## Sessão e streaming

### Sessão do SDK
- `sdkSessionId` é guardado no frontend e reenviado para `resume`.
- Backend também persiste `sdkSessionId` na conversa.
- Manager local de sessões ativas/cancelamento: `apps/api/src/services/chat-session-manager.ts`.

### Protocolo de stream para UI
No `chat-v2`, eventos internos do SDK são transformados em linhas JSON:
- `session_started` / `session_finished`
- `assistant_delta` (texto incremental)
- `thinking`, `thinking_delta`, `thinking_done`
- `tool_event` (início, sucesso, erro)
- `final` (mensagem final consolidada + `parts` + `sdkSessionId`)

Isso permite a UI mostrar:
- typing/stream token a token,
- steps de ferramentas,
- preview de resultados do canvas,
- persistência de sessão entre mensagens.

## Como aparece em cada área do app

## A) Página de lista (Home)
Arquivos:
- `apps/web/app/home-client.tsx`
- `apps/web/components/views/chat/index.tsx`
- `apps/web/components/views/chat/chat-messages.tsx`

Comportamento:
- Home renderiza `ChatRewrite` sem `documentId` e sem `canvasId`.
- O `chatScopeKey` vira `"home"`.
- O agente trabalha de forma geral, podendo buscar memórias/projetos via tools.
- Metadata inclui projeto selecionado quando aplicável.

## B) Página de notas/memórias (edição)
Arquivos:
- `apps/web/components/editor/memory-edit-client.tsx`
- `apps/web/components/views/chat/index.tsx`
- `apps/web/components/views/chat/chat-messages.tsx`
- `apps/api/src/routes/chat-v2.ts`

Comportamento:
- `ChatRewrite` recebe:
  - `documentId`
  - `contextDocumentData` (id/título/conteúdo completo)
- Frontend envia esse contexto no payload (`metadata.contextDocument` + `metadata.documentId`).
- Backend injeta o conteúdo integral no prompt e orienta o agente a responder direto desse documento (sem busca desnecessária).
- Anexos desse documento também entram como contexto (metadados), habilitando `readAttachment`.

## C) Página de Canvas (Excalidraw)
Arquivos:
- `apps/web/app/canvas/[id]/page.tsx`
- `apps/web/components/canvas-chat-panel.tsx`
- `apps/web/components/views/chat/index.tsx`
- `apps/web/components/views/chat/chat-messages.tsx`
- `apps/api/src/routes/chat-v2.ts`
- `apps/api/src/services/claude-agent-tools.ts`

Comportamento:
- `CanvasEditorPage` carrega o Excalidraw e renderiza `CanvasChatPanel`.
- `CanvasChatPanel` renderiza `ChatRewrite` com `canvasId`.
- Frontend inclui `metadata.canvasId`.
- Backend adiciona instruções de contexto canvas no `systemPrompt`.
- Tool context recebe `canvasId`, então o agente consegue ler/alterar o canvas atual.
- UI mostra preview específico para tools de canvas (ex.: criação de flowchart/mindmap).

## Decisões de implementação relevantes
- Um único pipeline de agente para todo o app (`/chat/v2` + `executeClaudeAgent`), com contexto por tela via metadata.
- Reuso do mesmo componente de chat (`ChatRewrite`) em todos os contextos.
- `sdkSessionId` garante continuidade real de raciocínio/ferramentas entre mensagens.
- Tools do canvas ficam no mesmo MCP server do domínio (`kortix-tools`), sem criar endpoint separado de agente para Excalidraw.

## Observações práticas
- Existe rota legada `/chat` (`apps/api/src/routes/chat.ts`) também usando `executeClaudeAgent`, mas o fluxo moderno e com sessão/streaming completo está em `/chat/v2`.
- A UI de tools no frontend trata explicitamente tools de canvas para renderização diferenciada (preview e CTA para abrir canvas).

