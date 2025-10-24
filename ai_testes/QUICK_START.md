# 🚀 Quick Start - Testes do Supermemory

## ⚡ Execução Rápida

### 1. Configure as credenciais

Edite `config.ts` e adicione suas credenciais de teste:

```typescript
export const config = {
  apiUrl: "http://localhost:4000",
  auth: {
    email: "seu-email@example.com",     // ← MUDE AQUI
    password: "sua-senha",               // ← MUDE AQUI
  },
}
```

**Ou** use variáveis de ambiente:

```bash
export TEST_USER_EMAIL="seu-email@example.com"
export TEST_USER_PASSWORD="sua-senha"
export API_URL="http://localhost:4000"
```

### 2. Certifique-se que o backend está rodando

```bash
# Em outro terminal
cd /Users/guilhermevarela/Public/supermemory
bun run --cwd apps/api dev
```

### 3. Execute os testes

```bash
cd /Users/guilhermevarela/Public/supermemory/ai_testes
bun run run-all-tests.ts
```

## 📊 Testes Incluídos

1. **Criação de Documento** - Valida criação via API
2. **Listagem com Memórias** - Valida campo `memory` e `documentId`
3. **Transformações** - Valida helpers `memoryDBtoAPI` e `memoryAPItoInsert`
4. **Função Atômica** - Valida `finalize_document_atomic`
5. **Busca** - Valida endpoint de busca

## ✅ Resultado Esperado

```
🧪 Executando Testes do Supermemory
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 1. Criação de Documento - PASSOU (1234ms)
✅ 2. Listagem com Memórias - PASSOU (567ms)
✅ 3. Transformações de Schema - PASSOU (12ms)
✅ 4. Função Atômica - PASSOU (89ms)
✅ 5. Busca - PASSOU (456ms)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Todos os testes passaram! (5/5)
```

## 🐛 Se algo falhar

### Erro de autenticação
```bash
# Verifique suas credenciais em config.ts
# Ou crie um usuário de teste no banco
```

### Erro de conexão
```bash
# Verifique se o backend está rodando
curl http://localhost:4000/health
```

### Teste específico falhando
```bash
# Execute apenas o teste que falhou
bun run 02-test-document-list.ts
```

## 📝 Logs Detalhados

Para ver logs mais detalhados, edite `config.ts`:

```typescript
export const config = {
  // ...
  test: {
    verbose: true,  // ← Já está ativado por padrão
  },
}
```

## 🎯 Foco nas Correções

Os testes validam especificamente:

- ✅ Campo `documentId` presente (correção aplicada)
- ✅ Campo `memory` (não `content`) na API
- ✅ Transformações funcionando
- ✅ Sem campos fantasma (`parentMemoryId`, etc)

## 📚 Mais Informações

Veja `README.md` para documentação completa.
