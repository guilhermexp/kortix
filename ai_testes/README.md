# 🧪 AI Testes - Test Suite para Supermemory

Scripts de teste automatizados para validar as funcionalidades críticas do Supermemory após mudanças nos schemas.

## 📋 Estrutura

```
ai_testes/
├── README.md                    # Este arquivo
├── run-all-tests.ts            # Runner principal
├── config.ts                   # Configuração (URLs, credenciais)
├── 01-test-document-creation.ts    # Teste: Criar documento
├── 02-test-document-list.ts        # Teste: Listar documentos com memórias
├── 03-test-schema-transformations.ts # Teste: Validar transformações
├── 04-test-atomic-function.ts      # Teste: Função finalize_document_atomic
└── 05-test-search.ts               # Teste: Busca de documentos
```

## 🚀 Como Usar

### Pré-requisitos

1. Backend rodando:
   ```bash
   bun run --cwd apps/api dev
   ```

2. Variáveis de ambiente configuradas em `apps/api/.env.local`

### Rodar Todos os Testes

```bash
cd ai_testes
bun run run-all-tests.ts
```

### Rodar Teste Individual

```bash
cd ai_testes
bun run 01-test-document-creation.ts
```

## 🎯 Testes Implementados

### 1. **Criação de Documento** (`01-test-document-creation.ts`)
- ✅ Cria documento via API
- ✅ Verifica resposta
- ✅ Valida estrutura de dados

### 2. **Listagem com Memórias** (`02-test-document-list.ts`)
- ✅ Lista documentos
- ✅ Verifica presença de `memoryEntries`
- ✅ Valida campo `memory` (não `content`)
- ✅ Valida campo `documentId` (adicionado nas correções)

### 3. **Transformações de Schema** (`03-test-schema-transformations.ts`)
- ✅ Testa `memoryDBtoAPI()`
- ✅ Testa `memoryAPItoInsert()`
- ✅ Valida transformação `content` ↔ `memory`

### 4. **Função Atômica** (`04-test-atomic-function.ts`)
- ✅ Testa `finalize_document_atomic` via Supabase
- ✅ Verifica atomicidade
- ✅ Valida criação de memória

### 5. **Busca** (`05-test-search.ts`)
- ✅ Busca documentos
- ✅ Verifica resultados
- ✅ Valida formato de resposta

## 📊 Checklist de Validação

Após executar os testes, verifique:

- [ ] Todos os testes passaram (sem erros)
- [ ] Campo `documentId` presente nas memórias
- [ ] Campo `memory` (não `content`) presente na API
- [ ] Transformações funcionando corretamente
- [ ] Função atômica criando memórias
- [ ] Web app continua funcionando

## 🔧 Configuração

Edite `config.ts` para ajustar:
- URL da API
- Credenciais de teste
- Timeout dos testes

## 📝 Notas

- Os testes criam dados reais no banco (use ambiente de desenvolvimento)
- Alguns testes podem levar alguns segundos (processamento de documentos)
- Logs detalhados são exibidos no console

## 🐛 Troubleshooting

**Erro de conexão:**
- Verifique se o backend está rodando em `http://localhost:4000`

**Erro de autenticação:**
- Configure credenciais válidas em `config.ts`

**Teste falhando:**
- Verifique logs do backend
- Verifique banco de dados (Supabase)
- Execute teste individual para debug

## ✅ Resultado Esperado

```
🧪 Executando Testes do Supermemory
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 1. Criação de Documento - PASSOU
✅ 2. Listagem com Memórias - PASSOU
✅ 3. Transformações de Schema - PASSOU
✅ 4. Função Atômica - PASSOU
✅ 5. Busca - PASSOU

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Todos os testes passaram! (5/5)
```
