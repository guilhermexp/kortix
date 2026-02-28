# Canvas MCP Externo (Kortix)

## Objetivo

Permitir que clientes MCP externos (Cursor, Claude Desktop, Cline, etc.) criem e manipulem canvases da Kortix de fora da aplicação web.

## Base técnica

Este projeto já expõe um servidor MCP em:

- `GET /mcp/:userId/sse`
- `POST /mcp/:userId/messages`

As ferramentas de Canvas foram adicionadas nesse servidor em `apps/api/src/routes/mcp.ts`.

## Ferramentas disponíveis

- `canvasReadMe`
- `canvasList`
- `canvasGet`
- `canvasCreate`
- `canvasReadScene`
- `canvasCreateView`
- `canvasListCheckpoints`
- `canvasRestoreCheckpoint`
- `canvasAutoArrange`
- `canvasSummarizeScene`
- `canvasCreateFlowchart`
- `canvasCreateMindmap`
- `canvasClear`

## Como conectar (cliente MCP externo)

1. Gere uma API key na Kortix (`/v3/auth/api-keys` na API ou tela de integração).
2. Escolha um `userId` lógico para a sessão MCP (ex: `guilherme`).
3. Conecte no endpoint SSE:

```text
https://SEU_BACKEND/mcp/guilherme/sse
```

Com headers:

- `Authorization: Bearer <SUA_API_KEY>`
- `x-sm-project: default` (ou outro slug de projeto)

## Exemplo de uso: criar elementos no canvas

1. Crie ou escolha um canvas (`canvasCreate` ou `canvasList`).
2. Aplique operações Excalidraw com `canvasCreateView`.

Payload exemplo:

```json
{
  "canvasId": "UUID_DO_CANVAS",
  "mode": "append",
  "input": "[{\"type\":\"rectangle\",\"id\":\"box-1\",\"x\":120,\"y\":120,\"width\":260,\"height\":100},{\"type\":\"text\",\"id\":\"txt-1\",\"x\":150,\"y\":150,\"text\":\"Hello Canvas\"}]"
}
```

## Sequência recomendada para automações

1. `canvasReadScene`
2. `canvasListCheckpoints`
3. `canvasCreateView`
4. `canvasSummarizeScene`

## Relação com `excalidraw-mcp`

O `excalidraw/excalidraw-mcp` mostra a arquitetura de servidor MCP para automação de canvas (transporte MCP + tools de desenho).  
Aqui seguimos o mesmo conceito, mas conectado ao canvas persistido da Kortix (Supabase + versionamento + checkpoints), em vez de um canvas local temporário.
