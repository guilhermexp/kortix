# Railway Deploy - Setup Completo

> **Data**: 19 de Novembro de 2025
> **Status**: ✅ Configuração Concluída - Pronto para Deploy
> **Projeto Railway**: https://railway.com/project/9a9f0044-76f1-41e9-9c6d-7dfd026896d8

---

## 📋 Resumo Executivo

Este documento detalha **exatamente** o que foi configurado no Railway para o projeto Kortix. Todas as variáveis de ambiente foram migradas do arquivo `.env.local` e os serviços estão prontos para deploy via GitHub.

---

## ✅ O Que Foi Feito

### 1. **Autenticação Railway CLI**

```bash
# Login via CLI
railway login
# ✅ Autenticado como: Guilherme Varela (guilhermehenriquevarela@gmail.com)
```

### 2. **Criação do Projeto**

```bash
# Criar novo projeto
railway init --name kortix

# Resultado:
# - Projeto: kortix
# - ID: 9a9f0044-76f1-41e9-9c6d-7dfd026896d8
# - Environment: production
# - URL: https://railway.com/project/9a9f0044-76f1-41e9-9c6d-7dfd026896d8
```

### 3. **Criação dos Serviços**

Dois serviços foram criados:

#### **Serviço 1: kortix-api**
- **Tipo**: Empty Service (será conectado ao GitHub)
- **ID**: f50ee210-0da0-40d9-ab09-c8ebb1775d7e
- **Função**: Backend API (Bun + Hono)
- **Porta**: Auto-gerenciada pelo Railway
- **Root Directory**: `apps/api` (a ser configurado no GitHub)

#### **Serviço 2: kortix-web**
- **Tipo**: Empty Service (será conectado ao GitHub)
- **ID**: fec7d72d-9e6f-483c-b9ba-ffa340eff625
- **Função**: Frontend Web (Next.js 16)
- **Porta**: Auto-gerenciada pelo Railway
- **Root Directory**: `apps/web` (a ser configurado no GitHub)

---

## 🔧 Variáveis de Ambiente Configuradas

### **Serviço: kortix-api**

Todas as variáveis foram migradas de `/Users/guilhermevarela/Public/kortix/apps/api/.env.local`:

#### **Database & Authentication**
```bash
SUPABASE_URL=https://gxowenznnqiwererpqde.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
AUTH_SECRET=kortix-selfhost-secret-123456789012
```

#### **AI Model APIs (Principais)**
```bash
ANTHROPIC_API_KEY=sk-ant-oat01-9LvWEd2yV0-m2zP_hUxG...
GOOGLE_API_KEY=AIzaSyB7jGB1ja8QNws2M5kagwXLlQF69C3u1cY
OPENROUTER_API_KEY=sk-or-v1-291d041323659d1f1a9fe41b...
ZAI_API_KEY=fabf94f1576e4265b4796559172f6666.ahU...
```

#### **AI Model APIs (Adicionais)**
```bash
MINIMAX_API_KEY=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
KIMI_API_KEY=sk-kimi-qJ2TEiNxX2mSdFnewZJZLzbOnXi...
COHERE_API_KEY=PhUYVER0ki56nrBrKECgZWtamxAEJtreO...
XAI_API_KEY=xai-MGLknE2AamceWmqXsb2M6EWNvLHZ9GM1v...
```

#### **Serviços Externos**
```bash
REPLICATE_API_TOKEN=r8_10AVfLYQiCePkhdXNUbgNLqF1FopK0I3tf0Lg
RESEND_API_KEY=re_cpvsaTTT_2vPR3KFqG9QTJ9Q2j1xjUYb5
RESEND_FROM_EMAIL=noreply@example.com
DEFAULT_ADMIN_EMAIL=admin@local.host
EXA_API_KEY=802600f8-c4ac-42b5-a31c-a4ee3c16cd5a
VOYAGE_API_KEY=pa-g6do78pHh5PKqcP5hAWASaYNFtd3lLeSwvUe6ZwQkKE
```

#### **Configurações de Modelo**
```bash
EMBEDDING_MODEL=text-embedding-004
EMBEDDING_DIMENSION=1536
CHAT_MODEL=GLM-4.6
SUMMARY_MODEL=x-ai/grok-4-fast
```

#### **Configurações de Ingestion**
```bash
MARKITDOWN=true
INGESTION_MODE=sync
INGESTION_BATCH_SIZE=10
INGESTION_MAX_ATTEMPTS=10
INGESTION_POLL_MS=5000
```

#### **Configurações de Ambiente**
```bash
NODE_ENV=production
APP_URL=https://placeholder.railway.app
ALLOWED_ORIGINS=https://placeholder.railway.app
```

**⚠️ IMPORTANTE**: `APP_URL` e `ALLOWED_ORIGINS` precisam ser atualizados após o primeiro deploy com o domínio real do serviço Web.

#### **Variáveis Auto-Gerenciadas pelo Railway**
```bash
RAILWAY_ENVIRONMENT=production
RAILWAY_ENVIRONMENT_ID=feac76a3-5801-46d2-8df0-94ec504c0c60
RAILWAY_ENVIRONMENT_NAME=production
RAILWAY_PRIVATE_DOMAIN=kortix-api.railway.internal
RAILWAY_PROJECT_ID=9a9f0044-76f1-41e9-9c6d-7dfd026896d8
RAILWAY_PROJECT_NAME=kortix
RAILWAY_SERVICE_ID=f50ee210-0da0-40d9-ab09-c8ebb1775d7e
RAILWAY_SERVICE_NAME=kortix-api
```

**Total: 30+ variáveis configuradas no serviço API**

---

### **Serviço: kortix-web**

#### **URLs Públicas**
```bash
NEXT_PUBLIC_BACKEND_URL=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_MCP_SERVER_URL=/mcp
NEXT_PUBLIC_DOCS_URL=/docs
```

**Explicação**:
- `NEXT_PUBLIC_BACKEND_URL` vazio = usa URLs relativas (mesmo domínio)
- `NEXT_PUBLIC_APP_URL` vazio = Railway injeta `RAILWAY_PUBLIC_DOMAIN` automaticamente
- Paths são relativos para funcionar no mesmo domínio

#### **Variáveis Auto-Gerenciadas pelo Railway**
```bash
RAILWAY_ENVIRONMENT=production
RAILWAY_ENVIRONMENT_ID=feac76a3-5801-46d2-8df0-94ec504c0c60
RAILWAY_ENVIRONMENT_NAME=production
RAILWAY_PRIVATE_DOMAIN=kortix-web.railway.internal
RAILWAY_PROJECT_ID=9a9f0044-76f1-41e9-9c6d-7dfd026896d8
RAILWAY_PROJECT_NAME=kortix
RAILWAY_SERVICE_ID=fec7d72d-9e6f-483c-b9ba-ffa340eff625
RAILWAY_SERVICE_NAME=kortix-web
```

**Total: 4 variáveis + auto-gerenciadas no serviço Web**

---

## 📁 Arquivos de Configuração Criados

### 1. **apps/api/railway.toml**

```toml
# Railway Configuration for Kortix API
# This file tells Railway how to build and deploy the API service

[build]
builder = "NIXPACKS"
buildCommand = "bun install"

[deploy]
startCommand = "bun run start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
healthcheckPath = "/health"
healthcheckTimeout = 300

# Railway will automatically set PORT environment variable
# The API will listen on the port provided by Railway
```

**Funcionalidade**:
- Builder NIXPACKS detecta Bun automaticamente
- Comando de start: `bun run start` (usa script do package.json)
- Retry policy: reinicia até 10 vezes em caso de falha
- Healthcheck: endpoint `/health` com timeout de 5 minutos

### 2. **apps/web/railway.toml**

```toml
# Railway Configuration for Kortix Web
# This file tells Railway how to build and deploy the Next.js web service

[build]
builder = "NIXPACKS"
buildCommand = "bun install && bun run build"

[deploy]
startCommand = "bun run start"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

# Next.js will automatically use PORT environment variable provided by Railway
```

**Funcionalidade**:
- Build: instala dependências e faz build do Next.js
- Start: inicia servidor Next.js em modo produção
- Porta auto-gerenciada pelo Railway

### 3. **RAILWAY_DEPLOY_GUIDE.md**

Guia completo de 500+ linhas com:
- Instruções passo a passo
- Todas variáveis explicadas
- Troubleshooting comum
- Estimativas de custo
- Comandos úteis

---

## 🚀 Comandos Executados

### **Sequência Completa de Configuração**

```bash
# 1. Autenticação
railway login

# 2. Criar projeto
railway init --name kortix

# 3. Criar serviço API (interativo)
railway add --service kortix-api

# 4. Criar serviço Web (interativo)
railway add --service kortix-web

# 5. Selecionar serviço API
railway service kortix-api

# 6. Configurar variáveis API - Batch 1 (Database & Auth)
railway variables --set "SUPABASE_URL=https://gxowenznnqiwererpqde.supabase.co" \
  --set "SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  --set "SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  --set "AUTH_SECRET=kortix-selfhost-secret-123456789012" \
  --skip-deploys

# 7. Configurar variáveis API - Batch 2 (AI APIs principais)
railway variables --set "ANTHROPIC_API_KEY=sk-ant-oat01-9LvWEd2yV0..." \
  --set "GOOGLE_API_KEY=AIzaSyB7jGB1ja8QNws2M5kagwXLlQF69C3u1cY" \
  --set "OPENROUTER_API_KEY=sk-or-v1-291d041323659d1f1a9fe41b..." \
  --set "ZAI_API_KEY=fabf94f1576e4265b4796559172f6666.ahU..." \
  --skip-deploys

# 8. Configurar variáveis API - Batch 3 (AI APIs adicionais)
railway variables --set "MINIMAX_API_KEY=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." \
  --set "KIMI_API_KEY=sk-kimi-qJ2TEiNxX2mSdFnewZJZLzbOnXi..." \
  --set "COHERE_API_KEY=PhUYVER0ki56nrBrKECgZWtamxAEJtreO..." \
  --set "XAI_API_KEY=xai-MGLknE2AamceWmqXsb2M6EWNvLHZ9GM1v..." \
  --skip-deploys

# 9. Configurar variáveis API - Batch 4 (Serviços externos)
railway variables --set "REPLICATE_API_TOKEN=r8_10AVfLYQiCePkhdXNUbgNLqF1FopK0I3tf0Lg" \
  --set "RESEND_API_KEY=re_cpvsaTTT_2vPR3KFqG9QTJ9Q2j1xjUYb5" \
  --set "RESEND_FROM_EMAIL=noreply@example.com" \
  --set "DEFAULT_ADMIN_EMAIL=admin@local.host" \
  --set "EXA_API_KEY=802600f8-c4ac-42b5-a31c-a4ee3c16cd5a" \
  --set "VOYAGE_API_KEY=pa-g6do78pHh5PKqcP5hAWASaYNFtd3lLeSwvUe6ZwQkKE" \
  --skip-deploys

# 10. Configurar variáveis API - Batch 5 (Modelos e Ingestion)
railway variables --set "EMBEDDING_MODEL=text-embedding-004" \
  --set "EMBEDDING_DIMENSION=1536" \
  --set "CHAT_MODEL=GLM-4.6" \
  --set "SUMMARY_MODEL=x-ai/grok-4-fast" \
  --set "MARKITDOWN=true" \
  --set "INGESTION_MODE=sync" \
  --set "INGESTION_BATCH_SIZE=10" \
  --set "INGESTION_MAX_ATTEMPTS=10" \
  --set "INGESTION_POLL_MS=5000" \
  --skip-deploys

# 11. Configurar variáveis API - Batch 6 (URLs e ambiente)
railway variables --set "APP_URL=https://placeholder.railway.app" \
  --set "ALLOWED_ORIGINS=https://placeholder.railway.app" \
  --set "NODE_ENV=production" \
  --skip-deploys

# 12. Verificar variáveis API
railway variables --kv

# 13. Selecionar serviço Web
railway service kortix-web

# 14. Configurar variáveis Web
railway variables --set "NEXT_PUBLIC_BACKEND_URL=" \
  --set "NEXT_PUBLIC_APP_URL=" \
  --set "NEXT_PUBLIC_MCP_SERVER_URL=/mcp" \
  --set "NEXT_PUBLIC_DOCS_URL=/docs" \
  --skip-deploys

# 15. Verificar variáveis Web
railway variables --kv

# 16. Verificar status final
railway status
```

**Nota**: Flag `--skip-deploys` foi usada para evitar deploys desnecessários durante a configuração.

---

## 🎯 Próximos Passos OBRIGATÓRIOS

### **Passo 1: Conectar GitHub (CRÍTICO)**

Sem isso, o deploy não acontecerá automaticamente.

#### **No Dashboard Railway**

1. Acesse: https://railway.com/project/9a9f0044-76f1-41e9-9c6d-7dfd026896d8

2. **Configurar kortix-api**:
   - Click no card `kortix-api`
   - Settings → Source → "Connect Repo"
   - Repositório: `guilhermexp/kortix`
   - Branch: `main`
   - Root Directory: `apps/api`
   - Watch Paths: `apps/api/**` (opcional, para trigger apenas em mudanças na API)

3. **Configurar kortix-web**:
   - Click no card `kortix-web`
   - Settings → Source → "Connect Repo"
   - Repositório: `guilhermexp/kortix`
   - Branch: `main`
   - Root Directory: `apps/web`
   - Watch Paths: `apps/web/**` (opcional)

### **Passo 2: Primeiro Deploy**

Após conectar GitHub, faça commit e push dos arquivos de configuração:

```bash
# Adicionar arquivos Railway
git add apps/api/railway.toml apps/web/railway.toml RAILWAY_DEPLOY_GUIDE.md RAILWAY_SETUP_COMPLETED.md

# Commit
git commit -m "feat: add railway deployment configuration and documentation"

# Push para trigger auto-deploy
git push origin main
```

Railway detectará automaticamente e iniciará o deploy de ambos os serviços.

### **Passo 3: Monitorar Deploy**

#### **Via CLI**
```bash
# Ver logs API em tempo real
railway logs --service kortix-api --tail

# Ver logs Web em tempo real
railway logs --service kortix-web --tail
```

#### **Via Dashboard**
- Acesse: https://railway.com/project/9a9f0044-76f1-41e9-9c6d-7dfd026896d8
- Click no serviço → Deployments tab
- Veja build logs e runtime logs

### **Passo 4: Obter Domínios Públicos**

Após deploy bem-sucedido:

1. **Obter domínio Web**:
   - Dashboard → `kortix-web` → Settings → Networking
   - Copie o domínio gerado (ex: `kortix-web-production-abc123.up.railway.app`)

2. **Obter domínio API**:
   - Dashboard → `kortix-api` → Settings → Networking
   - Copie o domínio gerado (ex: `kortix-api-production-xyz.up.railway.app`)

### **Passo 5: Atualizar URLs do Serviço API**

**CRÍTICO**: O serviço API precisa saber o domínio do Web para CORS.

```bash
# Selecionar serviço API
railway service kortix-api

# Atualizar com domínio real do Web
railway variables --set "APP_URL=https://[SEU-DOMINIO-WEB].up.railway.app" \
  --set "ALLOWED_ORIGINS=https://[SEU-DOMINIO-WEB].up.railway.app"

# Isso vai trigger um redeploy automático
```

**Exemplo**:
```bash
railway variables --set "APP_URL=https://kortix-web-production-abc123.up.railway.app" \
  --set "ALLOWED_ORIGINS=https://kortix-web-production-abc123.up.railway.app"
```

---

## ✅ Verificação Pós-Deploy

### **1. Health Checks**

```bash
# API Health
curl https://[dominio-api].up.railway.app/health
# Esperado: {"status":"ok"} ou similar

# API Auth Health
curl https://[dominio-api].up.railway.app/api/v1/auth/health
# Esperado: 200 OK
```

### **2. Testar Frontend**

```bash
# Abrir no navegador
open https://[dominio-web].up.railway.app

# Verificar console (F12)
# - Não deve ter erros de CORS
# - Não deve ter erros de conexão
# - Não deve ter erros 404 ou 500
```

### **3. Fluxo Completo de Teste**

1. **Criar Conta**:
   - Acesse a aplicação web
   - Click "Sign Up"
   - Preencha email e senha
   - Verificar criação no Supabase: Database → users table

2. **Login**:
   - Fazer login com credenciais
   - Deve redirecionar para dashboard
   - Verificar token no localStorage

3. **Upload de Documento**:
   - Arraste um PDF ou documento
   - Verificar processamento
   - Checar tabela `documents` no Supabase

4. **Chat**:
   - Abrir interface de chat
   - Fazer pergunta sobre documentos
   - Verificar resposta do Claude

### **4. Verificar Logs**

```bash
# Ver logs recentes API
railway logs --service kortix-api --lines 100

# Ver logs recentes Web
railway logs --service kortix-web --lines 100

# Procurar por erros
railway logs --service kortix-api | grep -i error
railway logs --service kortix-web | grep -i error
```

### **5. Monitorar Recursos**

No Railway Dashboard → Service → Metrics:
- CPU Usage (deve estar < 50% em idle)
- Memory Usage (deve estar < 300MB em idle)
- Network Ingress/Egress
- Response Times (< 500ms para API)

---

## 🐛 Troubleshooting Comum

### **Problema: Build Failing**

**Sintomas**: Deploy falha na fase de build

**Soluções**:
1. Verificar logs de build no Dashboard
2. Confirmar que `railway.toml` está no diretório correto
3. Verificar que `bun` está especificado no package.json:
   ```json
   "packageManager": "bun@1.2.17"
   ```
4. Limpar cache: Dashboard → Service → Settings → Clear Build Cache
5. Retry deploy

**Logs típicos de erro**:
```
Error: Cannot find module 'X'
→ Solução: Adicionar dependência no package.json

Error: Build command failed
→ Solução: Verificar comando de build no railway.toml
```

### **Problema: API não conecta ao Supabase**

**Sintomas**: Errors "Connection refused" ou "Authentication failed"

**Soluções**:
1. Verificar credenciais Supabase nas variáveis:
   ```bash
   railway service kortix-api
   railway variables | grep SUPABASE
   ```
2. Testar connection string manualmente:
   ```bash
   psql "postgresql://postgres:[password]@db.gxowenznnqiwererpqde.supabase.co:5432/postgres"
   ```
3. Confirmar que `pgvector` está habilitado no Supabase
4. Verificar se migrações foram aplicadas

### **Problema: CORS Errors**

**Sintomas**: Console mostra "CORS policy blocked"

**Soluções**:
1. Verificar `ALLOWED_ORIGINS` no API service:
   ```bash
   railway service kortix-api
   railway variables | grep ALLOWED_ORIGINS
   ```
2. Confirmar que domínio Web está correto
3. Verificar que `NEXT_PUBLIC_BACKEND_URL` está vazio (Web service)
4. Redeploy API após mudanças:
   ```bash
   railway service kortix-api
   railway up
   ```

### **Problema: Chat não funciona**

**Sintomas**: Chat não responde ou retorna 500 errors

**Soluções**:
1. Verificar API keys:
   ```bash
   railway service kortix-api
   railway variables | grep -E "(ANTHROPIC|GOOGLE)_API_KEY"
   ```
2. Testar endpoint manualmente:
   ```bash
   curl -X POST https://[api-domain]/api/v1/chat \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer [token]" \
     -d '{"message":"test","chatMode":"simple"}'
   ```
3. Verificar logs para stack traces:
   ```bash
   railway logs --service kortix-api --tail | grep -A 10 error
   ```

### **Problema: MarkItDown não funciona**

**Sintomas**: PDF/URL processing falha

**Soluções**:
1. Verificar se postinstall script rodou:
   ```bash
   railway logs --service kortix-api | grep "install-markitdown"
   ```
2. Confirmar que `MARKITDOWN=true` está setado
3. Verificar que Python está disponível no container (NIXPACKS instala automaticamente)

### **Problema: Deploy muito lento**

**Sintomas**: Build/Deploy leva > 10 minutos

**Soluções**:
1. Verificar se está fazendo `bun install` toda vez (normal)
2. Considerar usar build cache
3. Otimizar dependências (remover não usadas)
4. Railway free tier tem recursos limitados - considerar upgrade

### **Problema: Altos custos de Egress (Supabase)**

**Sintomas**: Egress > 2GB/mês no free tier

**Soluções**:
1. Verificar que queries não retornam embeddings:
   ```sql
   -- ❌ Evite
   SELECT * FROM documents;

   -- ✅ Use
   SELECT id, title, content, created_at FROM documents;
   ```
2. Adicionar LIMIT em queries:
   ```sql
   SELECT ... FROM documents LIMIT 100;
   ```
3. Revisar `ai_docs/EGRESS_OPTIMIZATION_NOV_2025.md`

---

## 📊 Estimativas de Custo

### **Railway**

**Plano Hobby ($5/mês)**:
- ❌ Limitado a 1 service apenas
- ❌ Sleep após inatividade
- ✅ $5 de crédito incluído

**Plano Pro ($20/mês)** ⭐ Recomendado:
- ✅ Unlimited services
- ✅ $20 de crédito incluído
- ✅ No sleep
- ✅ Custom domains
- ✅ Priority support

**Uso Estimado** (2 services):
- API: ~$5-7/mês (512MB RAM, low CPU)
- Web: ~$3-5/mês (512MB RAM, low CPU)
- **Total: ~$8-12/mês** ✅ Dentro dos $20 de crédito

### **Supabase**

**Free Tier**:
- ✅ 500MB Database
- ✅ 1GB Storage
- ✅ 2GB Egress/mês
- ⚠️ Pausa após 7 dias inatividade

**Pro Tier ($25/mês)**:
- ✅ 8GB Database
- ✅ 100GB Storage
- ✅ 250GB Egress/mês
- ✅ No pausa
- ✅ Daily backups

**Uso Estimado** (com otimizações de Egress):
- Database: ~200MB (10,000 docs)
- Storage: ~500MB (PDFs, images)
- Egress: ~0.5GB/mês (após otimizações)
- **Total: ✅ Free Tier suficiente inicialmente**

### **Total Estimado Mensal**

- **Desenvolvimento**: $20/mês (Railway Pro + Supabase Free)
- **Produção**: $45/mês (Railway Pro + Supabase Pro)

---

## 🔐 Checklist de Segurança

Antes de ir para produção:

- [x] `AUTH_SECRET` com 32+ caracteres aleatórios
- [x] API keys em variáveis de ambiente (nunca no código)
- [x] CORS configurado (`ALLOWED_ORIGINS`)
- [ ] RLS habilitado em todas tabelas Supabase (verificar)
- [x] HTTPS forçado (Railway faz automaticamente)
- [ ] Rate limiting configurado (TODO: verificar implementação)
- [x] Input validation com Zod schemas
- [x] SQL injection protection (prepared statements)
- [ ] Backups automáticos configurados (Supabase)
- [ ] Monitoring/Alerting setup (Sentry, etc.)

---

## 📝 Comandos Úteis de Manutenção

### **Gerenciamento de Serviços**

```bash
# Ver status de todos os serviços
railway status

# Listar variáveis de um serviço
railway service kortix-api
railway variables --kv

# Atualizar uma variável
railway variables --set "KEY=value"

# Remover uma variável
railway variables --unset KEY

# Ver logs em tempo real
railway logs --tail

# Ver logs de um deployment específico
railway logs --deployment <deployment-id>

# Redeploy (forçar rebuild)
railway up
```

### **Debugging**

```bash
# Ver últimas 100 linhas de log
railway logs --lines 100

# Filtrar logs por texto
railway logs | grep -i error

# Executar comando no container (quando disponível)
railway run bash

# Ver métricas
railway metrics
```

### **Git & Deploy**

```bash
# Fazer mudanças e deploy
git add .
git commit -m "feat: nova funcionalidade"
git push origin main
# Railway faz deploy automático

# Ver deploys recentes
railway deployments

# Rollback para deploy anterior
railway rollback <deployment-id>
```

---

## 📚 Referências

### **Documentação Criada**

1. `RAILWAY_DEPLOY_GUIDE.md` - Guia completo de deploy (500+ linhas)
2. `RAILWAY_SETUP_COMPLETED.md` - Este documento
3. `apps/api/railway.toml` - Config API
4. `apps/web/railway.toml` - Config Web

### **Documentação do Projeto**

- `CLAUDE.md` - Guia do desenvolvedor
- `ai_docs/EGRESS_OPTIMIZATION_NOV_2025.md` - Otimização de custos
- `ai_changelog/CHANGELOG.md` - Histórico de mudanças
- `docs/` - Documentação completa do usuário

### **Documentação Externa**

- Railway Docs: https://docs.railway.app
- Supabase Docs: https://supabase.com/docs
- Bun Docs: https://bun.sh/docs
- Next.js Docs: https://nextjs.org/docs

---

## 🎯 Status Atual

### ✅ **Completado**

- [x] Projeto Railway criado
- [x] Serviços API e Web criados
- [x] 30+ variáveis de ambiente configuradas (API)
- [x] 4 variáveis de ambiente configuradas (Web)
- [x] Arquivos `railway.toml` criados
- [x] Documentação completa gerada

### 🔄 **Pendente (Próximos Passos)**

- [ ] Conectar GitHub ao Railway (CRÍTICO)
- [ ] Fazer primeiro deploy via push
- [ ] Obter domínios públicos dos serviços
- [ ] Atualizar `APP_URL` e `ALLOWED_ORIGINS` com domínio real
- [ ] Testar fluxo completo (signup → login → upload → chat)
- [ ] Configurar domínio customizado (opcional)
- [ ] Setup monitoring/alerting (opcional)
- [ ] Configurar backups automáticos Supabase

---

## 🆘 Suporte

### **Problemas com Railway**
- Docs: https://docs.railway.app
- Discord: https://discord.gg/railway
- Status: https://status.railway.app

### **Problemas com Kortix**
- Issues: https://github.com/guilhermexp/kortix/issues
- Este documento: Referência de setup

### **Contatos**
- Desenvolvedor: Guilherme Varela
- Email: guilhermehenriquevarela@gmail.com

---

**Última Atualização**: 19 de Novembro de 2025, 04:00 UTC
**Próxima Ação**: Conectar GitHub no Railway Dashboard
**Documentado por**: Claude Code (Anthropic)
