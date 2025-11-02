# T3 — DeepWiki MCP Validation

## Contexto
- **Configuração** verificada em `apps/api/src/services/claude-agent.ts:346` (entrada `deepwiki` apontando para `https://mcp.deepwiki.com/mcp`).
- Endpoint SSE utilizado: `https://mcp.deepwiki.com/sse`.
- Script de teste: `bun run apps/api/test-deepwiki-mcp.ts`.

## Resultados do Script
- HTTP `OPTIONS https://mcp.deepwiki.com/mcp` → `200 OK` (verifica conectividade e CORS).
- Conexão MCP via SSE estabelecida (`protocolo 2024-11-05`) em ~1.6–2.0s.
- **Ferramentas retornadas** (`tools/list`):
  - `read_wiki_structure`
  - `read_wiki_contents`
  - `ask_question`
- **Ferramentas esperadas ausentes**:
  - `get_file_tree`
  - `read_file`
  - `search_code`
  - `get_folder_structure`
- **Schema `read_wiki_structure`**:
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
- **Execução real** (`repoName: "anthropics/anthropic-sdk-typescript"`):
  ```json
  {
    "content": [
      {
        "type": "text",
        "text": "Available pages for anthropics/anthropic-sdk-typescript:\n\n- 1 Overview\n  - 1.1 Installation & Setup\n  - 1.2 Package Structure\n- 2 Core Client Architecture\n  - 2.1 Client Configuration\n  - 2.2 Authentication\n  - 2.3 Request Lifecycle\n  - 2.4 Error Handling\n- 3 API Resources\n  - 3.1 Models API\n  - 3.2 Messages API\n    - 3.2.1 Creating Messages\n    - 3.2.2 Content Blocks & Tools\n    - 3.2.3 Streaming Responses\n    - 3.2.4 Message Batches\n  - 3.3 Completions API (Legacy)\n- 4 Beta Features\n  - 4.1 Beta Messages API\n  - 4.2 Beta Tools\n  - 4.3 Files API\n  - 4.4 Context Management\n- 5 Cloud Provider SDKs\n  - 5.1 Vertex AI SDK\n  - 5.2 Bedrock SDK\n- 6 Development Guide\n  - 6.1 Environment Setup\n  - 6.2 Build System\n  - 6.3 Testing\n  - 6.4 CI/CD Pipeline\n  - 6.5 Release Process"
      }
    ]
  }
  ```

## Observações & Pendências
- O servidor oficial atualmente expõe apenas três ferramentas (`read_wiki_*`, `ask_question`). Os nomes documentados (`get_file_tree`, `read_file`, `search_code`, `get_folder_structure`) não são anunciados.
- Sem as ferramentas antigas, a validação “esperada” falha; scripts ajustados para detectar a discrepância e registrar o problema.
- `read_wiki_structure` já fornece panorama da árvore de documentação; `read_wiki_contents` provavelmente substitui `read_file` (requer validação adicional).

## Recomendações
1. **Atualizar documentação interna** (`ai_docs/DEEPWIKI_INTEGRATION.md`, `.claude/CLAUDE.md`) com os nomes reais (`read_wiki_structure`, `read_wiki_contents`).
2. **Rever expectativas** da suite de validação (tasks T2/T3) ou alinhar com o roadmap do provedor DeepWiki.
3. (Opcional) Criar camada de compatibilidade na aplicação para mapear chamadas antigas para as novas ferramentas, evitando regressões em fluxos que referenciem `get_file_tree`.
