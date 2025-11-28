# Guia Completo de Deploy no Railway via GitHub

> **Última Atualização**: 19 de Novembro de 2025
> **Repositório**: https://github.com/guilhermexp/supermemory
> **Status**: Configuração pronta para deploy automático

---

## 📋 Visão Geral

Este guia detalha o processo completo de deploy do Supermemory no Railway usando integração com GitHub para **deploys automáticos** a cada push.

### Arquitetura de Deploy

```
GitHub (guilhermexp/supermemory)
    ↓ [Auto-deploy on push]
Railway Project
    ├─ Service 1: supermemory-api (apps/api/)
    │   ├─ Runtime: Bun 1.2.17
    │   ├─ Port: Auto (Railway managed)
    │   └─ Healthcheck: /health
    │
    └─ Service 2: supermemory-web (apps/web/)
        ├─ Runtime: Bun + Next.js 16
        ├─ Port: Auto (Railway managed)
        └─ Build: next build --webpack
```

---

## 🚀 Passo a Passo do Deploy

### **Fase 1: Preparação do Supabase**

#### 1.1. Criar/Verificar Projeto Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Crie novo projeto ou use existente
3. Anote as credenciais:
   - Project URL: `https://[seu-projeto].supabase.co`
   - Service Role Key: `eyJ...` (Settings → API)
   - Anon Key: `eyJ...` (Settings → API)

#### 1.2. Habilitar pgvector

```sql
-- No SQL Editor do Supabase
CREATE EXTENSION IF NOT EXISTS vector;
```

Ou via Dashboard:
- Database → Extensions → Procurar "vector" → Enable

#### 1.3. Aplicar Migrações

Você tem 2 opções:

**Opção A: Via Supabase MCP (Recomendado)**
```bash
# Usar o MCP tool do Supabase para aplicar cada migração
# Verificar arquivos em: supabase/migrations/
```

**Opção B: Via SQL Editor Manual**
```bash
# Copiar e executar cada arquivo .sql em ordem:
# 0001_initial_schema.sql
# 0002_add_conversation_tables.sql
# ...
# 0016_create_connections_table.sql
```

#### 1.4. Verificar Database URL

```
postgresql://postgres:[PASSWORD]@db.[SEU-PROJETO].supabase.co:5432/postgres
```

Substitua `[PASSWORD]` pela senha do projeto (Settings → Database → Connection string)

---

### **Fase 2: Preparar Chaves de API**

#### 2.1. APIs Obrigatórias

| Provider | Como Obter | Variável de Ambiente |
|----------|-----------|---------------------|
| **Anthropic (Claude)** | [console.anthropic.com](https://console.anthropic.com) | `ANTHROPIC_API_KEY` |
| **Google Gemini** | [ai.google.dev](https://ai.google.dev) | `GOOGLE_API_KEY` |

#### 2.2. APIs Opcionais (Multi-Provider)

| Provider | Como Obter | Variável |
|----------|-----------|----------|
| OpenRouter | [openrouter.ai](https://openrouter.ai) | `OPENROUTER_API_KEY` |
| Replicate (Deepseek OCR) | [replicate.com](https://replicate.com) | `REPLICATE_API_KEY` |
| Z.AI (GLM) | [bigmodel.cn](https://bigmodel.cn) | `GLM_API_KEY` |
| MiniMax | [minimax.chat](https://minimax.chat) | `MINIMAX_API_KEY` |
| Kimi | [kimi.ai](https://kimi.ai) | `KIMI_API_KEY` |

#### 2.3. Gerar AUTH_SECRET

```bash
# macOS/Linux
openssl rand -base64 32

# Ou use um gerador online (32+ caracteres)
```

---

### **Fase 3: Configurar Railway**

#### 3.1. Fazer Login no Railway

```bash
railway login
```

Isso abrirá o navegador para autenticação.

#### 3.2. Criar Novo Projeto

**Via Dashboard (Recomendado):**
1. Acesse [railway.app](https://railway.app)
2. Clique em **"New Project"**
3. Selecione **"Deploy from GitHub repo"**
4. Autorize Railway a acessar seu GitHub
5. Selecione o repositório: `guilhermexp/supermemory`
6. Railway detectará automaticamente o monorepo

**Via CLI:**
```bash
cd /Users/guilhermevarela/Public/supermemory
railway init
```

#### 3.3. Configurar Serviço API

**No Railway Dashboard:**

1. **Criar Service "supermemory-api"**
   - Click em "New Service"
   - Nome: `supermemory-api`
   - Root Directory: `apps/api`

2. **Configurar Build**
   - Build Command: `bun install`
   - Start Command: `bun run start`
   - Nixpacks detectará automaticamente Bun

3. **Adicionar Variáveis de Ambiente**

```bash
# === DATABASE ===
SUPABASE_URL=https://[seu-projeto].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[sua-service-role-key]
SUPABASE_ANON_KEY=[sua-anon-key]
SUPABASE_DATABASE_URL=postgresql://postgres:[password]@db.[seu-projeto].supabase.co:5432/postgres

# === AUTHENTICATION ===
AUTH_SECRET=[gerar-com-openssl-rand]

# === AI MODELS (Obrigatórios) ===
GOOGLE_API_KEY=[sua-gemini-key]
ANTHROPIC_API_KEY=[sua-claude-key]

# === AI MODELS (Opcionais) ===
OPENROUTER_API_KEY=[sua-openrouter-key]
REPLICATE_API_KEY=[sua-replicate-key]
GLM_API_KEY=[sua-glm-key]
MINIMAX_API_KEY=[sua-minimax-key]
KIMI_API_KEY=[sua-kimi-key]

# === MODEL CONFIGURATION ===
EMBEDDING_MODEL=text-embedding-004
CHAT_MODEL=models/gemini-2.5-pro

# === APPLICATION URLS ===
# IMPORTANTE: Será atualizado após Web deploy
APP_URL=https://[SEU-WEB-DOMAIN].railway.app
ALLOWED_ORIGINS=https://[SEU-WEB-DOMAIN].railway.app

# === EMAIL (Opcional) ===
RESEND_API_KEY=[sua-resend-key]
RESEND_FROM_EMAIL=noreply@seudominio.com
DEFAULT_ADMIN_EMAIL=admin@seudominio.com

# === FIRECRAWL (Opcional) ===
FIRECRAWL_API_KEY=[sua-firecrawl-key]

# === PORT ===
# Railway gerencia automaticamente, não precisa definir
# PORT=[auto]
```

4. **Configurar GitHub Deploy**
   - Settings → Deploy → GitHub
   - Branch: `main`
   - Auto-Deploy: **✅ Enabled**
   - Root Directory: `apps/api`

5. **Configurar Health Check**
   - Settings → Health Check
   - Path: `/health`
   - Timeout: 300s

#### 3.4. Configurar Serviço Web

1. **Criar Service "supermemory-web"**
   - Click em "New Service"
   - Nome: `supermemory-web`
   - Root Directory: `apps/web`

2. **Configurar Build**
   - Build Command: `bun install && bun run build`
   - Start Command: `bun run start`

3. **Adicionar Variáveis de Ambiente**

```bash
# === BACKEND CONNECTION ===
# IMPORTANTE: Deixe vazio para usar URLs relativas (mesmo domínio)
NEXT_PUBLIC_BACKEND_URL=

# === PUBLIC URLS ===
# Será preenchido automaticamente pelo Railway
NEXT_PUBLIC_APP_URL=${{RAILWAY_PUBLIC_DOMAIN}}
NEXT_PUBLIC_MCP_SERVER_URL=${{RAILWAY_PUBLIC_DOMAIN}}/mcp
NEXT_PUBLIC_DOCS_URL=${{RAILWAY_PUBLIC_DOMAIN}}/docs
```

4. **Configurar GitHub Deploy**
   - Settings → Deploy → GitHub
   - Branch: `main`
   - Auto-Deploy: **✅ Enabled**
   - Root Directory: `apps/web`

---

### **Fase 4: Deploy Inicial**

#### 4.1. Trigger Deploy

**Opção A: Via Push ao GitHub**
```bash
git add .
git commit -m "chore: railway deployment configuration"
git push origin main
```

**Opção B: Via Railway CLI**
```bash
# No diretório do projeto
railway up
```

**Opção C: Via Dashboard**
- No serviço, click em "Deploy" → "Deploy Now"

#### 4.2. Monitorar Deploy

```bash
# Via CLI
railway logs --service supermemory-api
railway logs --service supermemory-web

# Via Dashboard
# Acesse o serviço e veja a aba "Deployments"
```

#### 4.3. Verificar Domínios Gerados

Railway gera automaticamente:
- API: `supermemory-api-production-xxxx.up.railway.app`
- Web: `supermemory-web-production-xxxx.up.railway.app`

---

### **Fase 5: Sincronização de URLs**

⚠️ **IMPORTANTE**: Após o primeiro deploy, você precisa atualizar as URLs.

#### 5.1. Copiar Domínio do Web Service

No Railway Dashboard:
1. Abra o serviço `supermemory-web`
2. Vá em "Settings" → "Domains"
3. Copie o domínio gerado (ex: `supermemory-web-production-abc123.up.railway.app`)

#### 5.2. Atualizar Variáveis do API Service

No serviço `supermemory-api`, atualize:

```bash
APP_URL=https://supermemory-web-production-abc123.up.railway.app
ALLOWED_ORIGINS=https://supermemory-web-production-abc123.up.railway.app
```

#### 5.3. Redeploy

O serviço API será automaticamente redeployado com as novas variáveis.

---

### **Fase 6: Configurar Domínio Customizado (Opcional)**

#### 6.1. Adicionar Domínio

No Railway Dashboard:
1. Serviço `supermemory-web`
2. Settings → Domains → "+ Add Domain"
3. Digite seu domínio (ex: `app.seudominio.com`)

#### 6.2. Configurar DNS

No seu provedor de DNS (Cloudflare, Namecheap, etc.):

```
Type: CNAME
Name: app
Value: [dominio-railway].up.railway.app
Proxy: Desabilitado (DNS Only)
```

#### 6.3. Atualizar Variáveis

Atualize todas as referências ao domínio:

**API Service:**
```bash
APP_URL=https://app.seudominio.com
ALLOWED_ORIGINS=https://app.seudominio.com
```

**Web Service:**
```bash
NEXT_PUBLIC_APP_URL=https://app.seudominio.com
NEXT_PUBLIC_MCP_SERVER_URL=https://app.seudominio.com/mcp
NEXT_PUBLIC_DOCS_URL=https://app.seudominio.com/docs
```

---

## 🔄 Workflow de Deploy Automático

### Como Funciona

```
1. Developer push code → GitHub (main branch)
2. GitHub webhook → Railway
3. Railway detecta mudança → Inicia build
4. Build completa → Deploy automático
5. Health check passa → Traffic switchover
6. Deploy completo → Notificação
```

### Configuração de Branches

**Para usar branch diferente de `main`:**

1. Railway Dashboard → Service → Settings → Deploy
2. Altere "Source Branch" para branch desejada
3. Salve configuração

**Para deploy de múltiplas branches (staging/production):**

1. Crie environments separados no Railway:
   - `production` → branch `main`
   - `staging` → branch `develop`

2. Configure variáveis por environment

---

## ✅ Verificação Pós-Deploy

### 1. Testar API

```bash
# Health check
curl https://[seu-api-domain].railway.app/health

# Auth endpoint
curl https://[seu-api-domain].railway.app/api/v1/auth/health

# Deve retornar status 200 OK
```

### 2. Testar Web

```bash
# Acessar no navegador
open https://[seu-web-domain].railway.app

# Verificar console do navegador (F12)
# Não deve ter erros de CORS ou conexão
```

### 3. Testar Fluxo Completo

1. **Criar Conta**
   - Acesse a aplicação web
   - Click em "Sign Up"
   - Preencha email e senha
   - Verificar criação no Supabase (Database → Table Editor → users)

2. **Login**
   - Faça login com credenciais criadas
   - Deve redirecionar para dashboard

3. **Upload de Documento**
   - Arraste um PDF ou documento
   - Verificar processamento
   - Checar tabela `documents` no Supabase

4. **Chat**
   - Abra o chat
   - Faça uma pergunta sobre documentos
   - Verificar resposta do Claude

### 4. Verificar Logs

```bash
# Via CLI
railway logs --tail --service supermemory-api
railway logs --tail --service supermemory-web

# Via Dashboard
# Service → Deployments → [Latest] → Logs
```

### 5. Monitorar Recursos

**Railway Dashboard → Service → Metrics:**
- CPU Usage
- Memory Usage
- Network (Ingress/Egress)
- Response Times

---

## 🐛 Troubleshooting

### Problema: Build Failing

**Sintomas:** Deploy falha na fase de build

**Soluções:**
```bash
# 1. Verificar logs de build
railway logs --deployment [deployment-id]

# 2. Verificar package.json
# Certifique-se que "bun@1.2.17" está em packageManager

# 3. Limpar cache
# Railway Dashboard → Service → Settings → Clear Build Cache

# 4. Rebuild
railway up --service supermemory-api
```

### Problema: API não conecta ao Supabase

**Sintomas:** Errors sobre database connection

**Soluções:**
1. Verificar credenciais Supabase nas variáveis de ambiente
2. Confirmar que `pgvector` está habilitado
3. Testar connection string manualmente:
```bash
psql "postgresql://postgres:[password]@db.[projeto].supabase.co:5432/postgres"
```
4. Verificar se migrações foram aplicadas

### Problema: CORS Errors no Frontend

**Sintomas:** Console do navegador mostra "CORS policy blocked"

**Soluções:**
1. Verificar `ALLOWED_ORIGINS` no API service
2. Confirmar que o domínio web está correto
3. Verificar que `NEXT_PUBLIC_BACKEND_URL` está vazio (para URLs relativas)
4. Redeploy do API após mudanças

### Problema: Chat não funciona

**Sintomas:** Chat não responde ou retorna errors

**Soluções:**
1. Verificar `ANTHROPIC_API_KEY` está configurada
2. Verificar `GOOGLE_API_KEY` está configurada
3. Testar endpoints:
```bash
curl -X POST https://[api-domain]/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"test","chatMode":"simple"}'
```
4. Verificar logs para API errors

### Problema: MarkItDown não funciona

**Sintomas:** Errors ao processar PDFs/URLs

**Soluções:**
1. Verificar se postinstall rodou:
```bash
railway logs | grep "install-markitdown"
```
2. Verificar serviço MarkItDown separado está rodando
3. Check dependencies instaladas

### Problema: High Egress Usage

**Sintomas:** Custos altos de egress no Supabase

**Soluções:**
1. Verificar queries não retornam embeddings:
```sql
-- Evite SELECT *
-- Use SELECT id, content, title (sem embeddings)
```
2. Aplicar LIMITs em queries
3. Revisar `ai_docs/EGRESS_OPTIMIZATION_NOV_2025.md`

---

## 📊 Monitoramento & Custos

### Estimativa de Custos (Railway)

**Plano Hobby ($5/mês):**
- ❌ Limitado a 1 service
- ❌ Sleep após 30min inatividade
- ✅ $5 de crédito incluído

**Plano Pro ($20/mês):**
- ✅ Unlimited services
- ✅ $20 de crédito incluído
- ✅ No sleep
- ✅ Custom domains
- ✅ Priority support

**Uso Estimado:**
- API: ~$5-7/mês (512MB RAM, low CPU)
- Web: ~$3-5/mês (512MB RAM, low CPU)
- **Total: ~$8-12/mês** ✅ Dentro do Plano Pro

### Estimativa de Custos (Supabase)

**Free Tier:**
- ✅ 500MB Database
- ✅ 1GB Storage
- ✅ 2GB Egress/mês
- ⚠️ Pausa após 7 dias inatividade

**Pro Tier ($25/mês):**
- ✅ 8GB Database
- ✅ 100GB Storage
- ✅ 250GB Egress/mês
- ✅ No pausa
- ✅ Daily backups

**Uso Estimado (com otimizações):**
- Database: ~200MB (10,000 docs)
- Storage: ~500MB (PDFs, images)
- Egress: ~0.5GB/mês (após otimizações)
- **Total: ✅ Free Tier suficiente**

### Alertas Recomendados

Configure alertas no Railway:
1. CPU > 80% por 5min
2. Memory > 90% por 5min
3. Error rate > 5% por 1min
4. Response time > 2s por 5min

---

## 🔐 Segurança

### Checklist de Segurança

- [ ] `AUTH_SECRET` com 32+ caracteres aleatórios
- [ ] API keys em variáveis de ambiente (nunca no código)
- [ ] CORS configurado corretamente (`ALLOWED_ORIGINS`)
- [ ] RLS habilitado em todas tabelas Supabase
- [ ] HTTPS forçado (Railway faz automaticamente)
- [ ] Rate limiting configurado (TODO: verificar implementação)
- [ ] Input validation com Zod schemas
- [ ] SQL injection protection (prepared statements)

### Rotação de Chaves

**Recomendação:** Rodar chaves a cada 90 dias

**Processo:**
1. Gerar nova chave no provider
2. Adicionar como variável temporária (ex: `ANTHROPIC_API_KEY_NEW`)
3. Atualizar código para usar nova chave
4. Deploy
5. Verificar funcionamento
6. Remover chave antiga

---

## 📚 Recursos Adicionais

### Documentação Official

- [Railway Docs](https://docs.railway.app)
- [Supabase Docs](https://supabase.com/docs)
- [Bun Docs](https://bun.sh/docs)
- [Next.js Docs](https://nextjs.org/docs)

### Arquivos de Referência

- `CLAUDE.md` - Guia completo do projeto
- `ai_docs/RAILWAY_DEPLOYMENT.md` - Documentação técnica anterior
- `ai_docs/EGRESS_OPTIMIZATION_NOV_2025.md` - Otimização de custos
- `ai_changelog/CHANGELOG.md` - Histórico de mudanças

### Comandos Úteis

```bash
# Verificar status
railway status

# Ver logs em tempo real
railway logs --tail

# Abrir dashboard
railway open

# Executar comando no container
railway run [command]

# Listar services
railway service

# Conectar ao database
railway connect postgres
```

---

## 🎯 Próximos Passos

Após deploy bem-sucedido:

1. [ ] Configurar domínio customizado
2. [ ] Setup monitoring (Sentry, LogRocket, etc.)
3. [ ] Configurar backups automáticos Supabase
4. [ ] Implementar CI/CD testing antes de deploy
5. [ ] Setup staging environment
6. [ ] Documentar runbook de incidentes
7. [ ] Configurar status page (statuspage.io)

---

## 🆘 Suporte

**Problemas com Railway:**
- Docs: https://docs.railway.app
- Discord: https://discord.gg/railway
- GitHub: https://github.com/railwayapp/railway

**Problemas com Supermemory:**
- Issues: https://github.com/guilhermexp/supermemory/issues
- Discussions: https://github.com/guilhermexp/supermemory/discussions

---

**Última Verificação**: 19 de Novembro de 2025
**Testado com**: Railway CLI 3.x, Bun 1.2.17, Next.js 16
**Status**: ✅ Pronto para produção
