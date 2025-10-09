# Guia de Testes - Chat V2 (Agentic, Simple, Deep)

Este guia explica como testar todas as funcionalidades do Chat V2 implementadas.

## 📋 O que foi implementado

### Backend

1. **Serviço Agentic** (`apps/api/src/services/agentic-search.ts`)
   - Pipeline iterativo com AI SDK
   - Geração de múltiplas queries
   - Deduplica e avalia completude dos resultados
   - Limites: maxEvals, tokenBudget, limit

2. **Chat V2** (`apps/api/src/routes/chat-v2.ts`)
   - Endpoint: `POST /chat/v2`
   - 3 modos: `simple`, `agentic`, `deep`
   - Tool `searchMemories` integrada
   - Modelo unificado: `gemini-2.5-flash-preview-09-2025`

3. **Chat V1 Atualizado** (`apps/api/src/routes/chat.ts`)
   - Agora usa AI SDK `streamText`
   - Prompt endurecido (ENHANCED_SYSTEM_PROMPT)
   - Mantém compatibilidade

4. **Gate de Modo Agentic** (`apps/api/src/env.ts:14-17`)
   - Variável: `ENABLE_AGENTIC_MODE`
   - Default: `true`
   - Controla se o modo agentic está ativo

### Frontend

1. **Seletor de Modo** (`apps/web/components/views/chat/chat-messages.tsx:445-459`)
   - Dropdown com 3 opções: Simple, Agentic, Deep
   - Envia `mode` no body da requisição

2. **Endpoint Atualizado** (`apps/web/components/views/chat/chat-messages.tsx:338`)
   - De: `/chat` → Para: `/chat/v2`
   - Body inclui: `{ mode, metadata }`

3. **Tool Highlighting**
   - UI procura por `tool-searchMemories` (correto!)
   - Backend exporta `searchMemories` (AI SDK adiciona prefixo `tool-` automaticamente)

## 🔧 Configuração

### Variáveis de Ambiente (API)

Crie ou atualize `apps/api/.env.local`:

```ini
# Modo Agentic (default: true)
ENABLE_AGENTIC_MODE=true

# Reranking (default: true)
ENABLE_RERANKING=true

# Modelo de chat (default: gemini-2.5-pro)
CHAT_MODEL=models/gemini-2.5-flash-preview-09-2025

# Modelo de embedding (default: text-embedding-004)
EMBEDDING_MODEL=text-embedding-004

# API Keys obrigatórias
GOOGLE_API_KEY=your_gemini_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Opcional para reranking
COHERE_API_KEY=your_cohere_key
```

### Variáveis de Ambiente (Web)

Crie ou atualize `apps/web/.env.local`:

```ini
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 🚀 Como Rodar

### 1. Iniciar Serviços

```bash
# Terminal 1: API
bun run --cwd apps/api dev

# Terminal 2: Web
bun run --cwd apps/web dev
```

### 2. Validação Básica

Acesse: http://localhost:3000

1. Faça login na aplicação
2. Navegue para a página de chat
3. Verifique se o seletor "Mode" aparece no topo direito

## 🧪 Testes

### Opção 1: Testes Automatizados (Playwright)

#### Instalação

```bash
# Instalar Playwright
bun add -D @playwright/test

# Instalar navegadores
bunx playwright install
```

#### Executar Testes

```bash
# Rodar todos os testes E2E
bunx playwright test

# Rodar em modo UI (recomendado)
bunx playwright test --ui

# Rodar com DevTools aberto
bunx playwright test --debug

# Rodar teste específico
bunx playwright test e2e/chat-modes.spec.ts

# Gerar relatório
bunx playwright show-report
```

#### Configurar Sessão de Autenticação

O Playwright precisa de uma sessão válida. Duas opções:

**Opção A: Usar cookie existente**

1. Faça login na aplicação via navegador normal
2. Abra DevTools → Application → Cookies
3. Copie o valor de `better-auth.session_token`
4. Execute:

```bash
E2E_SESSION_COOKIE="better-auth.session_token=SEU_TOKEN_AQUI" bunx playwright test
```

**Opção B: Login automático no teste**

Adicione um setup de autenticação em `e2e/auth.setup.ts` (não implementado ainda).

### Opção 2: Testes Manuais (curl)

```bash
# Script completo de testes
./test-chat-v2.sh

# Com verbose
VERBOSE=true ./test-chat-v2.sh

# Com query customizada
TEST_QUERY="machine learning" ./test-chat-v2.sh
```

**O que o script testa:**
1. ✓ Health check da API
2. ✓ Busca no banco de dados (`/v3/search`)
3. ✓ Chat V2 - modo Simple
4. ✓ Chat V2 - modo Agentic (valida uso da tool)
5. ✓ Chat V2 - modo Deep
6. ✓ Validação de environment variables

### Opção 3: Testes Manuais (UI + DevTools)

#### Passo a passo completo:

1. **Abra a aplicação** em http://localhost:3000
2. **Faça login** com suas credenciais
3. **Navegue para o chat**
4. **Abra DevTools** (F12 ou Cmd+Option+I)

#### Teste 1: Modo Simple

1. Selecione "Simple" no dropdown
2. Envie: "O que tenho sobre IA?"
3. **DevTools → Network:**
   - Procure requisição para `/chat/v2`
   - Clique nela → Payload
   - Verifique: `{ "mode": "simple", "messages": [...] }`
4. **Console:**
   - Não deve mostrar erros
5. **Resposta esperada:**
   - Texto direto baseado em busca única
   - Citações no formato `[1]`, `[2]`, etc.
   - Seção "Sources:" se houver resultados

#### Teste 2: Modo Agentic

1. Selecione "Agentic" no dropdown
2. Envie: "Resuma tudo sobre machine learning"
3. **DevTools → Network:**
   - Procure requisição para `/chat/v2`
   - Verifique: `{ "mode": "agentic", "messages": [...] }`
4. **UI:**
   - Deve mostrar "Searching memories..." (tool em ação)
   - Depois "Found X memories" ou "No memories found"
   - Se houver resultados, pode expandir para ver detalhes
5. **Resposta esperada:**
   - Múltiplas buscas (iterativo)
   - Citações mais completas
   - Resposta focada nos documentos encontrados

#### Teste 3: Modo Deep

1. Selecione "Deep" no dropdown
2. Envie: "Analise profundamente meus documentos sobre IA"
3. **DevTools → Network:**
   - Verifique: `{ "mode": "deep", "messages": [...] }`
4. **Resposta esperada:**
   - Resposta mais longa e detalhada
   - Mais contexto (top 10 chunks vs top 5)
   - Janela de tokens maior (16K vs 4K/8K)

#### Teste 4: Validar Tool Usage (Agentic/Deep)

1. Selecione "Agentic"
2. Envie uma mensagem
3. **DevTools → Network → Response:**
   - Procure no stream por strings contendo:
     - `tool-searchMemories`
     - `state: "input-streaming"`
     - `state: "output-available"`
     - `results: [...]`
4. **UI:**
   - Expandir "Found X memories"
   - Verificar cards com:
     - Título do documento
     - URL (se disponível)
     - Score de relevância
     - Conteúdo preview

#### Teste 5: Validar Persistência da Conversa

1. Envie mensagem em modo "Simple"
2. Mude para modo "Agentic"
3. Envie outra mensagem
4. **Verificar:**
   - Ambas as mensagens ainda visíveis
   - Histórico preservado
   - Modo aplicado apenas para próximas mensagens

#### Teste 6: Validar Citações

1. Envie qualquer mensagem
2. **Na resposta, procure:**
   - Citações inline: `[1]`, `[2]`, `[3]`
   - Seção "Sources:" no final
   - Links clicáveis (se documento tem URL)
3. **Clique em "Found X memories"** para expandir:
   - Deve listar documentos com scores
   - URLs devem abrir em nova aba

## 🐛 Troubleshooting

### Erro: "ENABLE_AGENTIC_MODE is not defined"

**Solução:** Adicione em `apps/api/.env.local`:
```ini
ENABLE_AGENTIC_MODE=true
```

### Erro: "No memories found" sempre

**Possíveis causas:**
1. Banco de dados vazio
   - **Solução:** Adicione documentos via `/v3/documents`
2. Sessão inválida
   - **Solução:** Faça login novamente
3. `projectId` errado no metadata
   - **Solução:** Use o projectId correto da org

### Erro: "Tool searchMemories not found"

**Verificar:**
1. Backend exporta `searchMemories` (não `searchMemory`)
   - Arquivo: `apps/api/src/routes/chat-v2.ts:134`
2. UI procura por `tool-searchMemories` (com prefixo `tool-`)
   - Arquivo: `apps/web/components/views/chat/chat-messages.tsx:52,97`

### Stream não completa / timeout

**Verificar:**
1. Modelo correto no `.env.local`
   ```ini
   CHAT_MODEL=models/gemini-2.5-flash-preview-09-2025
   ```
2. GOOGLE_API_KEY válida
3. Limite de tokens não excedido
   - Simple: 4K
   - Agentic: 8K
   - Deep: 16K

### Playwright não encontra elementos

**Soluções:**
1. Aumentar timeout:
   ```typescript
   await expect(element).toBeVisible({ timeout: 10000 })
   ```
2. Verificar se API/Web estão rodando:
   ```bash
   curl http://localhost:4000/health
   curl http://localhost:3000
   ```
3. Verificar cookie de sessão:
   ```bash
   E2E_SESSION_COOKIE="better-auth.session_token=..." bunx playwright test
   ```

## 📊 Diferenças entre Modos

| Característica       | Simple     | Agentic           | Deep        |
|---------------------|------------|-------------------|-------------|
| **Rodadas de busca** | 1          | Até 3 (iterativo) | 1           |
| **Top chunks**       | 5          | 5 (deduplica)     | 10          |
| **Max tokens**       | 4K         | 8K                | 16K         |
| **Tool automático**  | ❌         | ✅ searchMemories  | ✅ searchMemories |
| **Chunk length**     | 300 chars  | 300 chars         | 500 chars   |
| **Temperatura**      | 0.7        | 0.6               | 0.5         |
| **Velocidade**       | ⚡ Rápido  | 🔄 Médio          | 🐢 Lento    |
| **Uso**              | Perguntas diretas | Perguntas abertas | Análises profundas |

## 🎯 Cenários de Teste Recomendados

### Cenário 1: Busca Simples
- **Modo:** Simple
- **Query:** "Qual é o email do João?"
- **Esperado:** Resposta direta com citação `[1]`

### Cenário 2: Busca Exploratória
- **Modo:** Agentic
- **Query:** "O que tenho sobre machine learning?"
- **Esperado:**
  - Tool usage: "Searching memories..."
  - Múltiplas queries geradas internamente
  - Lista de memórias encontradas
  - Resposta sintetizada

### Cenário 3: Análise Profunda
- **Modo:** Deep
- **Query:** "Compare todos os artigos sobre IA que salvei"
- **Esperado:**
  - Resposta longa e detalhada
  - Citações de múltiplos documentos
  - Análise comparativa

### Cenário 4: Sem Resultados
- **Modo:** Qualquer
- **Query:** "xyzabc123noexiste"
- **Esperado:**
  - "No memories found" (Agentic)
  - Resposta: "Não encontrei informações relevantes..."

## ✅ Checklist Final

Antes de considerar os testes completos, verifique:

- [ ] API rodando em http://localhost:4000
- [ ] Web rodando em http://localhost:3000
- [ ] `ENABLE_AGENTIC_MODE=true` em `.env.local`
- [ ] `GOOGLE_API_KEY` configurada
- [ ] Banco de dados com pelo menos 3-5 documentos
- [ ] Login funcionando (sessão válida)
- [ ] Seletor de modo visível na UI
- [ ] Endpoint `/chat/v2` respondendo
- [ ] Tool `searchMemories` sendo chamada em modo Agentic
- [ ] Citações `[N]` aparecendo nas respostas
- [ ] Expandir memórias mostra cards com detalhes
- [ ] Trocar de modo não perde histórico
- [ ] Playwright testes passando (se rodou)

## 📝 Arquivos Criados/Modificados

### Criados
- `playwright.config.ts` - Configuração Playwright
- `e2e/chat-modes.spec.ts` - Suite de testes E2E
- `test-chat-v2.sh` - Script de testes manuais
- `TESTING_CHAT_V2.md` - Este guia

### Modificados
- `apps/api/src/routes/chat-v2.ts` - Chat V2 endpoint
- `apps/api/src/routes/chat.ts` - Chat V1 com AI SDK
- `apps/api/src/services/agentic-search.ts` - Serviço agentic
- `apps/api/src/env.ts` - Adicionado ENABLE_AGENTIC_MODE
- `apps/web/components/views/chat/chat-messages.tsx` - Seletor de modo + endpoint v2

## 🔗 Referências

- Implementation Guide: `IMPLEMENTATION_GUIDE.md`
- Implementation Status: `IMPLEMENTATION_STATUS.md`
- Search Improvements: `SEARCH_IMPROVEMENTS.md`
- Playwright Docs: https://playwright.dev
- AI SDK Docs: https://sdk.vercel.ai/docs

---

**Dúvidas ou problemas?** Abra uma issue ou consulte os logs da API/Web.
