# Busca e Ferramentas de Agente (MCP + Interno)

> Status: atual em 22 de Fevereiro de 2026

## Objetivo

Padronizar o comportamento de busca para:

- Agentes externos via MCP (`/mcp/.../search`)
- Agente interno (`searchDatabase`)
- Fluxos diretos de Claude no backend

A implementação usa um serviço único: `apps/api/src/services/search-tool.ts`.

## Serviço Unificado de Busca

Função central:

- `executeStructuredSearch(client, orgId, params)`

Entrada principal:

- `query` (string)
- `limit` (opcional)
- `includeSummary` (opcional)
- `includeFullDocs` (opcional)
- `containerTags` (opcional)
- `scopedDocumentIds` (opcional)
- `chunkThreshold` (opcional)
- `documentThreshold` (opcional)
- `onlyMatchingChunks` (opcional)

Saída padronizada:

```json
{
  "query": "string",
  "total": 12,
  "returned": 8,
  "timing": 47,
  "results": [
    {
      "documentId": "uuid",
      "title": "string",
      "type": "note|link|video|...",
      "score": 0.91,
      "url": "https://...",
      "createdAt": "ISO date",
      "updatedAt": "ISO date",
      "summary": "string",
      "content": "string (quando includeFullDocs=true)",
      "metadata": {},
      "chunks": [
        { "content": "texto do chunk", "score": 0.88 }
      ]
    }
  ]
}
```

## Contrato MCP (`searchKortix`)

Arquivo: `apps/api/src/routes/mcp.ts`

Payload aceito:

```json
{
  "informationToGet": "texto da busca",
  "limit": 8,
  "responseFormat": "json"
}
```

Campos:

- `informationToGet`: obrigatório
- `limit`: opcional, de `1` a `50` (default `8`)
- `responseFormat`: opcional, `json` ou `human` (default `json`)

Comportamento:

- MCP sempre consulta via `executeStructuredSearch`.
- Resultados são filtrados por escopo MCP (`mcpUserId` + `mcpProject`).
- Em `responseFormat=json`, retorna payload estruturado (recomendado para agentes).
- Em `responseFormat=human`, retorna texto resumido para leitura humana.

## Contrato do Agente Interno

Arquivos:

- `apps/api/src/services/claude-agent-tools.ts`
- `apps/api/src/services/claude-direct.ts`
- `apps/api/src/services/claude-agent.ts`

Comportamento:

- `searchDatabase` usa o mesmo `executeStructuredSearch`.
- Resposta agora segue o mesmo formato estruturado (`query`, `total`, `returned`, `timing`, `results`).
- Parser interno foi ajustado para aceitar `total` como fallback de contagem.

## Busca de Documentos na Lista (UI/API)

Arquivo principal: `apps/api/src/routes/documents.ts`

Melhorias aplicadas:

- Busca textual cobre `title`, `summary` e `content`.
- Fallback com normalização sem acentos (diacríticos), via:
  - `apps/api/src/routes/documents-search-utils.ts`
- Quando a busca SQL não retorna itens, o fallback tenta novamente com normalização para melhorar recall de termos como `penetracao` vs `penetração`.

## Estado de Projeto e Limpeza de Busca (Frontend)

Arquivos:

- `apps/web/stores/project-selection.ts`
- `apps/web/stores/index.ts`
- `apps/web/app/home-client.tsx`

Melhorias:

- Migração/normalização de projeto legado:
  - valor `"default"` agora é convertido para `DEFAULT_PROJECT_ID`.
- Limpeza da busca no input:
  - ao apagar o texto, `debouncedSearch` é limpo imediatamente.
  - evita ficar "preso" em filtro antigo até o timeout.

## Testes adicionados

- `apps/api/src/routes/documents-search-utils.test.ts`
- `apps/web/stores/project-selection.test.ts`

Cobertura prática:

- normalização sem acentos
- matching em `title/summary/content`
- normalização de seleção de projeto legado

## Ferramentas de Canvas (Agente Interno)

Arquivos:

- `apps/api/src/services/claude-agent-tools.ts`
- `apps/api/src/services/canvas-agent-service.ts`

Pré-requisito:

- `CANVAS_AGENT_TOOLS_ENABLED=true`

Tools disponíveis (via `kortix-tools`):

- `canvas_read_me`: guia rápido de uso e boas práticas
- `canvas_read_scene`: lê o canvas ativo e retorna estatísticas, bounds, textos e lista de elementos
- `canvas_create_view`: aplica operações Excalidraw/pseudo-elementos (`cameraUpdate`, `restoreCheckpoint`, `delete`)
- `canvas_list_checkpoints`: lista checkpoints recentes do canvas
- `canvas_restore_checkpoint`: restaura um checkpoint por ID
- `canvas_auto_arrange`: organiza elementos elegíveis em grid (preserva filhos ligados por `containerId`)
- `canvas_summarize_scene`: retorna resumo estruturado do canvas (tipo provável, contagens, textos, bounds)
- `canvas_create_flowchart`: cria fluxograma a partir de lista de passos
- `canvas_create_mindmap`: cria mapa mental a partir de tópico central + ramos

Fluxos recomendados para o agente:

- Resumir canvas:
  - `canvas_summarize_scene`
  - ou `canvas_read_scene` -> gerar resumo textual
- Organizar canvas:
  - `canvas_read_scene` -> `canvas_auto_arrange` -> `canvas_read_scene` (validação)
- Criar diagrama:
  - `canvas_create_flowchart` (passos em ordem)
- Criar mindmap:
  - `canvas_create_mindmap` (tópico central + ramos + filhos opcionais)
- Edição segura:
  - `canvas_list_checkpoints` -> `canvas_create_view` -> se necessário `canvas_restore_checkpoint`
