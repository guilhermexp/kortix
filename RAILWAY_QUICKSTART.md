# Railway Deploy - Quick Start

> **TL;DR**: Setup completo. Só falta conectar GitHub e fazer push.

---

## ✅ O Que Já Está Pronto

- ✅ Projeto criado: https://railway.com/project/9a9f0044-76f1-41e9-9c6d-7dfd026896d8
- ✅ 2 serviços criados: `supermemory-api` + `supermemory-web`
- ✅ 30+ variáveis configuradas no API
- ✅ 4 variáveis configuradas no Web
- ✅ Arquivos `railway.toml` nos lugares certos

---

## 🚀 Próximos 3 Passos

### **1. Conectar GitHub (5 minutos)**

Acesse: https://railway.com/project/9a9f0044-76f1-41e9-9c6d-7dfd026896d8

**Para supermemory-api**:
- Settings → Source → "Connect Repo"
- Repo: `guilhermexp/supermemory`
- Branch: `main`
- Root: `apps/api`

**Para supermemory-web**:
- Settings → Source → "Connect Repo"
- Repo: `guilhermexp/supermemory`
- Branch: `main`
- Root: `apps/web`

### **2. Deploy (1 comando)**

```bash
git add apps/api/railway.toml apps/web/railway.toml RAILWAY_*.md
git commit -m "feat: railway deployment configuration"
git push origin main
```

Railway vai fazer deploy automaticamente! 🚀

### **3. Atualizar URLs (após deploy)**

Obtenha os domínios no Railway Dashboard, depois:

```bash
railway service supermemory-api
railway variables --set "APP_URL=https://[SEU-WEB-DOMAIN].up.railway.app" \
  --set "ALLOWED_ORIGINS=https://[SEU-WEB-DOMAIN].up.railway.app"
```

---

## 📊 Status

| Item | Status |
|------|--------|
| Projeto Railway | ✅ Criado |
| Serviços | ✅ Criados (2) |
| Variáveis API | ✅ Configuradas (30+) |
| Variáveis Web | ✅ Configuradas (4) |
| GitHub Connection | ⏳ Pendente |
| Primeiro Deploy | ⏳ Pendente |
| URLs atualizadas | ⏳ Pendente |

---

## 📖 Documentação Completa

- `RAILWAY_SETUP_COMPLETED.md` - Documento técnico completo
- `RAILWAY_DEPLOY_GUIDE.md` - Guia detalhado de deploy
- `apps/api/railway.toml` - Config API
- `apps/web/railway.toml` - Config Web

---

## 🆘 Precisa de Ajuda?

1. Erro no build? → Ver logs no Railway Dashboard
2. CORS error? → Verificar `ALLOWED_ORIGINS`
3. Chat não funciona? → Verificar API keys (Anthropic + Google)

**Documento completo**: `RAILWAY_SETUP_COMPLETED.md`
