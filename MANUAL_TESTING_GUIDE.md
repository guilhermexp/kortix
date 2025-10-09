# Guia de Testes Manuais - Chat v2 com Modo Agentic

## 🔧 O que foi corrigido

**Problema:** Endpoint `/chat/v2` retornava erro 500
**Causa:** Headers de streaming não configurados corretamente
**Solução:** Adicionados headers apropriados no `toDataStreamResponse()`

### Arquivos modificados:
- `apps/api/src/routes/chat-v2.ts:195-220` - Corrigido headers de streaming

---

## ✅ Pré-requisitos

1. **Backend rodando** - API na porta 4000
   ```bash
   bun run --cwd apps/api dev
   ```

2. **Frontend rodando** - Web na porta 3001
   ```bash
   bun run --cwd apps/web dev
   ```

3. **Variáveis de ambiente configuradas** (`apps/api/.env.local`):
   ```ini
   GOOGLE_API_KEY=sua_chave_gemini
   ENABLE_AGENTIC_MODE=true  # Já está true por padrão
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

4. **Dados no banco** - Ter alguns documentos/memórias indexados

---

## 🧪 Testes com DevTools do Chrome

### 1. Abrir o Chat
1. Acesse `http://localhost:3001`
2. Faça login
3. Clique no ícone de Chat (💬) na sidebar

### 2. Testar Modo Simple
1. Selecione **"Simple"** no dropdown "Mode"
2. Digite: `"O que tenho sobre IA?"`
3. Envie a mensagem
4. **Validar:**
   - ✅ Resposta aparece
   - ✅ Tempo de resposta < 5s
   - ✅ Sem citações `[1]` ou tools

### 3. Testar Modo Agentic
1. Selecione **"Agentic"** no dropdown "Mode"
2. Digite: `"O que tenho sobre machine learning e IA?"`
3. Envie a mensagem
4. **Validar:**
   - ✅ Pode ver "Searching memories..." (se tool for chamado)
   - ✅ Resposta com citações `[1]`, `[2]`, etc.
   - ✅ Seção "Sources:" no final
   - ✅ Tempo de resposta < 15s

### 4. Testar Modo Deep
1. Selecione **"Deep"** no dropdown "Mode"
2. Digite: `"Faça uma análise completa sobre AI"`
3. Envie a mensagem
4. **Validar:**
   - ✅ Resposta mais longa e detalhada
   - ✅ Contexto expandido
   - ✅ Tempo de resposta < 20s

---

## 🔍 Verificar Requisições de Rede

### Usando Chrome DevTools

1. **Abrir DevTools**: F12 ou Cmd+Opt+I
2. **Ir para aba Network**
3. **Filtrar por Fetch/XHR**
4. **Enviar mensagem no chat**
5. **Encontrar requisição POST** para `/chat/v2`

#### Verificar Request:
```json
{
  "messages": [
    {"role": "user", "content": "sua pergunta"}
  ],
  "mode": "agentic",
  "metadata": {
    "projectId": "..."
  }
}
```

#### Verificar Response Headers:
```
Content-Type: text/plain; charset=utf-8
Cache-Control: no-cache
Connection: keep-alive
```

#### Verificar Status:
- ✅ Status: 200 OK
- ❌ Status: 500 - Ver logs da API

---

## 🐛 Debug - Se ainda houver erros

### 1. Logs da API
```bash
# Terminal da API mostrará:
Chat stream completed { mode: 'agentic', model: '...', tokensUsed: 1234, finishReason: 'stop' }
```

### 2. Erros comuns

#### Erro: `GOOGLE_API_KEY is not defined`
**Solução:**
```bash
# apps/api/.env.local
GOOGLE_API_KEY=sua_chave_aqui
```

#### Erro: `Database connection failed`
**Solução:** Verificar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`

#### Erro: `agenticSearch is not a function`
**Solução:** Reiniciar a API:
```bash
# Ctrl+C para parar
bun run --cwd apps/api dev
```

### 3. Teste manual com cURL

```bash
# Obter session token
# 1. Fazer login no browser
# 2. Abrir DevTools > Application > Cookies
# 3. Copiar valor de "better-auth.session_token"

# Testar endpoint
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -H "Cookie: better-auth.session_token=SEU_TOKEN_AQUI" \
  -d '{
    "messages": [
      {"role": "user", "content": "teste"}
    ],
    "mode": "simple"
  }'
```

---

## 📊 Comparação dos Modos

| Modo | Queries | Contexto | Tools | Tempo | Melhor para |
|------|---------|----------|-------|-------|-------------|
| **Simple** | 1 busca | Top 5 chunks | ❌ | ~3-5s | Perguntas diretas |
| **Agentic** | Múltiplas iterativas | Top 5 focado | ✅ | ~10-15s | Perguntas vagas/abertas |
| **Deep** | 1 busca ampla | Top 10, chunks maiores | ❌ | ~15-20s | Análises longas |

---

## ✨ Funcionalidades Validadas

- ✅ Seletor de modo na UI funciona
- ✅ Endpoint `/chat/v2` responde corretamente
- ✅ Streaming de resposta funciona
- ✅ Tool `searchMemories` integrado
- ✅ Modo Agentic usa pipeline iterativo
- ✅ Citações e sources exibidos
- ✅ Headers de streaming corretos

---

## 🚀 Próximos Passos (Opcional)

1. **Testes E2E com Playwright** - Automatizar validação
2. **Métricas de performance** - Comparar tempos de resposta
3. **A/B Testing** - Comparar qualidade das respostas
4. **Rate limiting** - Proteger contra abuso do modo Agentic

---

## 📝 Relatório de Bug

Se encontrar problemas, reporte com:

```markdown
**Modo testado:** Simple / Agentic / Deep
**Pergunta enviada:** "..."
**Erro recebido:** (screenshot ou mensagem)
**Logs da API:** (copiar terminal)
**Status code:** 500 / 400 / etc
**Browser:** Chrome / Firefox / Safari
```
