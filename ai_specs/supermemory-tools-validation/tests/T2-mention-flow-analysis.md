# T2 — Mention Flow → analyzeVideo

## Resumo rápido
- Menções via `@` chegam ao backend em `metadata.mentionedDocIds`, são filtradas e usadas como `scopedDocumentIds`, garantindo que as ferramentas consultem apenas os documentos citados.
- O texto enviado ao agente inclui blocos de contexto com título/resumo do documento, mas não replica a URL; o agente precisa chamar `searchDatabase` para obter metadados.
- O documento ingerido mantém a URL original em `metadata.originalUrl` e na coluna `url`, permitindo que o agente invoque `analyzeVideo` com o link correto.
- Nenhuma transformação adicional é feita para vídeos do YouTube: a detecção depende do agente ler `metadata.source === "youtube"` ou o próprio link.

## Rastreamento de fluxo

### 1. Captura das menções no cliente
- O compositor de mensagens adiciona `metadata.mentionedDocIds` ao payload quando existem menções e reaproveita esses IDs como `scopedDocumentIds` p/ a requisição (`apps/web/components/views/chat/chat-messages.tsx:1330`–`apps/web/components/views/chat/chat-messages.tsx:1365`).

### 2. Preparação da requisição no Chat V2
- O backend sanitiza `metadata.mentionedDocIds` e deriva `effectiveScopedIds`, priorizando o array de menções quando presente (`apps/api/src/routes/chat-v2.ts:497`–`apps/api/src/routes/chat-v2.ts:513`).
- As menções alimentam tanto o prompt do sistema (instrui Claude a priorizar esses documentos) quanto o `toolContext.scopedDocumentIds` (`apps/api/src/routes/chat-v2.ts:530`–`apps/api/src/routes/chat-v2.ts:552`).
- Antes de chamar o agente, a rota busca cada documento mencionado para montar um bloco `[Documentos mencionados]` com ID, título, resumo e trecho (`apps/api/src/routes/chat-v2.ts:554`–`apps/api/src/routes/chat-v2.ts:591`). A URL não é incluída aqui.

### 3. Contexto das ferramentas e busca de metadados
- `executeClaudeAgent` injeta o contexto (incluindo `scopedDocumentIds`) na fábrica de ferramentas MCP (`apps/api/src/services/claude-agent.ts:314`).
- `createSupermemoryTools` fixa `baseScopedIds` a partir desse contexto e os aplica automaticamente quando `searchDatabase` é invocada sem `scopedDocumentIds` explícitos (`apps/api/src/services/claude-agent-tools.ts:24`–`apps/api/src/services/claude-agent-tools.ts:134`).
- `searchDatabase` retorna objetos contendo `metadata` completo do documento; é aí que aparecem `source: "youtube"` e `originalUrl` para vídeos ingeridos (`apps/api/src/routes/search.ts:280`–`apps/api/src/routes/search.ts:303`).
- A URL que o agente vê vem de `metadata.originalUrl`, pois a ingestão a grava tanto nos metadados quanto na coluna `url` do documento (`apps/api/src/services/ingestion.ts:165`–`apps/api/src/services/ingestion.ts:178` e `apps/api/src/services/ingestion.ts:265`–`apps/api/src/services/ingestion.ts:274`).

### 4. Uso da ferramenta analyzeVideo
- A ferramenta `analyzeVideo` expõe apenas parâmetros diretos (`url`, `title`, `mode`, `useExa`) e não aplica nenhuma transformação específica para menções ou YouTube; ela delega ao `AnalysisService` (`apps/api/src/services/claude-agent-tools.ts:352`–`apps/api/src/services/claude-agent-tools.ts:458`).
- `AnalysisService.analyzeYouTubeUrl` valida a chave do Google, extrai o ID do vídeo e envia a URL recebida para o modelo Gemini com instruções multimodais (`apps/api/src/services/analysis-service.ts:101`–`apps/api/src/services/analysis-service.ts:167`).
- Em modo `auto`, o serviço detecta URLs de YouTube pelo regex e redireciona para `analyzeYouTubeUrl` (`apps/api/src/services/analysis-service.ts:356`–`apps/api/src/services/analysis-service.ts:362`).

## Confirmação da integração
- Quando o usuário menciona um documento, a busca subsequente limita o escopo àquele ID, garantindo que o JSON retornado contenha os metadados relevantes do vídeo.
- Esses metadados incluem `originalUrl` (e `source: "youtube"`), permitindo que o agente monte uma chamada `analyzeVideo` com o link correto; nenhum outro intermediário altera a URL antes de chegar à ferramenta.
- Portanto, a integração funciona desde que o agente faça a sequência: ler `metadata.originalUrl` → invocar `analyzeVideo` com esse valor.

## Pontos de atenção & recomendações
- O bloco `[Documentos mencionados]` não exibe a URL; adicionar a linha com `metadata.originalUrl` ajudaria o agente a identificar o link sem depender de uma chamada prévia ao `searchDatabase`.
- `searchDatabase` atualmente popula `result.url` apenas se `metadata.url` existir. Documentos ingeridos (YouTube inclusos) salvam o endereço em `metadata.originalUrl` ou na coluna `url`. Ajustar o mapeamento para considerar `item.metadata?.originalUrl ?? doc.url` facilitaria o consumo pela LLM (`apps/api/src/services/claude-agent-tools.ts:142`–`apps/api/src/services/claude-agent-tools.ts:170`).
- O cliente define `metadata.forceRawDocs`, mas o backend não utiliza esse sinalizador (`apps/web/components/views/chat/chat-messages.tsx:1350` vs. ausência de leitura em `chat-v2.ts`). Se não houver plano de uso, pode ser removido para evitar confusão.
