# Deployment no Railway - Supermemory

## Resumo

Este documento descreve o deployment completo da aplicação Supermemory no Railway, incluindo todas as correções necessárias e configurações de variáveis de ambiente.

## Serviços Deployados

### Projeto Railway
- **Nome**: faithful-magic
- **ID**: 64907b47-8838-475b-87e4-74376b6d9942
- **Environment**: production (679cce2f-b622-49a7-bf6d-36e3f045bc4b)
- **Deploy Automático**: ✅ Ativado (push to main branch)

### Serviços

#### 1. API Service (@repo/api)
- **Service ID**: e00ceb4a-de7e-4007-841e-efb923bf25b1
- **URL Pública**: https://repoapi-production-d4f7.up.railway.app
- **Porta**: 4000
- **Root Directory**: `/`
- **Build Command**: `bun install`
- **Start Command**: `cd apps/api && bun run start`

#### 2. Web Service (@repo/web)
- **Service ID**: 7a862d4e-e80e-4b05-bc96-e0b3ea35a1ca
- **URL Pública**: https://repoweb-production.up.railway.app
- **Porta**: 8080 (Railway default)
- **Root Directory**: `/`
- **Build Command**: `npm install --legacy-peer-deps && cd apps/web && bun run build`
- **Start Command**: `cd apps/web && next start`

## Variáveis de Ambiente Configuradas

### API Service
```env
PORT=4000
NODE_ENV=production
SUPABASE_URL=https://lrqjdzqyaoiovnzfbnrj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=***
SUPABASE_ANON_KEY=***
SUPABASE_DATABASE_URL=postgresql://***
AUTH_SECRET=supermemory-selfhost-secret-123456789012
GOOGLE_API_KEY=***
CHAT_MODEL=models/gemini-2.5-flash
SUMMARY_MODEL=models/gemini-2.5-pro
EMBEDDING_MODEL=text-embedding-004
FIRECRAWL_API_KEY=***
RESEND_API_KEY=***
RESEND_FROM_EMAIL=onboarding@resend.dev
APP_URL=https://repoweb-production.up.railway.app
ALLOWED_ORIGINS=https://repoweb-production.up.railway.app
DEFAULT_ADMIN_EMAIL=admin@local.host
INGESTION_POLL_MS=5000
INGESTION_BATCH_SIZE=5
INGESTION_MAX_ATTEMPTS=5
```

### Web Service

**IMPORTANTE**: Estas variáveis são necessárias para o funcionamento correto da aplicação:

```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://repoweb-production.up.railway.app
NEXT_PUBLIC_MCP_SERVER_URL=https://repoapi-production-d4f7.up.railway.app/mcp
API_INTERNAL_URL=https://repoapi-production-d4f7.up.railway.app
NEXT_PUBLIC_BACKEND_URL=
```

**⚠️ ATENÇÃO**: A variável `NEXT_PUBLIC_BACKEND_URL` deve ser uma **string vazia** (não `undefined`). Isso força as URLs a serem relativas e funcionarem via proxy do Next.js.

## Correções Feitas Durante o Deploy

### 1. Dependências Faltando
**Arquivo**: `apps/web/package.json`
**Commit**: 6af5e29

```json
"slate-dom": "^0.117.4"
```

### 2. Binding do Servidor API
**Arquivo**: `apps/api/src/index.ts`
**Commit**: 35139ce

```typescript
serve({
  fetch: app.fetch,
  port: env.PORT,
  hostname: "0.0.0.0",  // IMPORTANTE: Railway precisa de 0.0.0.0
})
```

**Nota**: Isso não afeta desenvolvimento local, pois `0.0.0.0` aceita conexões de qualquer interface.

### 3. PostHog Noop Function
**Arquivo**: `packages/lib/posthog.tsx`
**Commit**: 8e1ceb0

```typescript
const noop = (..._args: any[]) => {}  // Aceita argumentos variáveis
```

### 4. Configuração de Cookies e Proxy

#### Next.js Rewrites
**Arquivo**: `apps/web/next.config.ts`
**Commits**: 4fcaacb, b566d26

```typescript
async rewrites() {
  // Proxy para API evitar problemas de CORS/cookies
  const backendUrl = process.env.API_INTERNAL_URL || "http://localhost:4000"
  return [
    {
      source: "/api/:path*",
      destination: `${backendUrl}/api/:path*`,
    },
    {
      source: "/chat/:path*",
      destination: `${backendUrl}/chat/:path*`,
    },
  ]
},
```

**⚠️ IMPORTANTE**: Os rewrites `/v3/*` foram **removidos** porque não funcionam para rotas que não existem no Next.js. Em vez disso, usamos um route handler.

#### Environment Variables
**Arquivo**: `packages/lib/env.ts`
**Commits**: f6bdb75, a8cd333

```typescript
// Em produção, usa string vazia para forçar URLs relativas (via proxy)
const backendEnv = process.env.NEXT_PUBLIC_BACKEND_URL?.trim()
const isProduction = process.env.NODE_ENV === "production"
export const BACKEND_URL = backendEnv !== undefined
  ? (backendEnv === "" ? "" : backendEnv)
  : (isProduction ? "" : DEFAULT_BACKEND_URL)
```

**Como funciona**:
- **Local**: `BACKEND_URL = "http://localhost:4000"` (fallback automático)
- **Produção**: `BACKEND_URL = ""` (URLs relativas, via proxy)

### 5. Cookies com sameSite: "lax"
**Arquivo**: `apps/api/src/routes/auth.ts`
**Commits**: e07788c (revertido), 1e05b04

```typescript
function setSessionCookie(c: Context, token: string) {
  const cookie = serializeCookie(SESSION_COOKIE, token, {
    maxAge: SESSION_TTL_SECONDS,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",  // Funciona com proxy same-domain
  })
  c.header("Set-Cookie", cookie)
}
```

**Por que `sameSite: "lax"`?**: Com o proxy do Next.js, todas as requisições vêm do mesmo domínio (repoweb-production.up.railway.app), então não precisamos de `sameSite: "none"`.

### 6. Route Handler para `/v3/*`
**Arquivo**: `apps/web/app/v3/[...path]/route.ts`
**Commit**: b912a44, 1d40484, 510ff5b

```typescript
import { NextRequest } from "next/server"

const API_URL = process.env.API_INTERNAL_URL || "http://localhost:4000"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path)
}

// ... outros métodos HTTP (POST, PUT, DELETE, PATCH)

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
  const path = pathSegments.join("/")
  const searchParams = request.nextUrl.searchParams.toString()
  const queryString = searchParams ? `?${searchParams}` : ""
  const url = `${API_URL}/v3/${path}${queryString}`

  console.log(`[V3 PROXY] ${request.method} /v3/${path} -> ${url}`)

  // Forward headers
  const headers = new Headers()
  const headersToForward = [
    "content-type",
    "authorization",
    "cookie",
    "x-supermemory-organization",
    "x-supermemory-user",
  ]

  for (const header of headersToForward) {
    const value = request.headers.get(header)
    if (value) {
      headers.set(header, value)
    }
  }

  const options: RequestInit = {
    method: request.method,
    headers,
    credentials: "include",
  }

  // Add body for methods that support it
  if (["POST", "PUT", "PATCH"].includes(request.method)) {
    try {
      const body = await request.text()
      if (body) {
        options.body = body
      }
    } catch (e) {
      // No body
    }
  }

  try {
    const response = await fetch(url, options)

    const responseHeaders = new Headers()
    const headersToReturn = [
      "content-type",
      "set-cookie",
      "cache-control",
    ]

    for (const header of headersToReturn) {
      const value = response.headers.get(header)
      if (value) {
        responseHeaders.set(header, value)
      }
    }

    const data = await response.text()

    return new Response(data, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error(`Proxy error for /v3/${path}:`, error)
    return new Response(
      JSON.stringify({ error: { message: "Proxy request failed" } }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    )
  }
}
```

**Por que um route handler?**: Next.js rewrites não funcionam para rotas que não existem. O route handler captura todas as requisições `/v3/*` e faz proxy manualmente.

### 7. Middleware Exclusion para `/v3`
**Arquivo**: `apps/web/middleware.ts`
**Commit**: 3854108

```typescript
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|images|icon.png|monitoring|opengraph-image.png|ingest|api|v3|login|api/emails).*)",
  ],
}
```

**Mudança**: Adicionado `v3` à lista de exclusões para permitir que o route handler processe as requisições sem interferência do middleware de autenticação.

### 8. Chat Endpoints usando BACKEND_URL
**Arquivo**: `apps/web/components/views/chat/chat-messages.tsx`
**Commit**: 89ca21b

```typescript
import { BACKEND_URL } from "@lib/env";

// Antes (causava /undefined/chat):
api: `${process.env.NEXT_PUBLIC_BACKEND_URL}/chat`

// Depois (usa constante correta):
api: `${BACKEND_URL}/chat`
```

**Por que?**: O componente estava usando `process.env.NEXT_PUBLIC_BACKEND_URL` diretamente, que é `undefined` no build. Usar `BACKEND_URL` de `@lib/env` garante que a lógica de produção vs desenvolvimento funcione corretamente.

## Problema: Railway Private Networking

Railway oferece private networking via `servicename.railway.internal`, mas **não funcionou** neste deployment:

### Tentativas que NÃO funcionaram:
1. `http://repoapi.railway.internal:4000` - ECONNREFUSED
2. `http://repoapi.railway.internal` - ECONNREFUSED port 80
3. `http://repoapi:4000` - ECONNREFUSED (IPv6)
4. `http://${RAILWAY_SERVICE__REPO_API_URL}` - Usa URL pública (problema de variável)

### Solução Final:
Usar a **URL pública** da API no proxy do Next.js:
```env
API_INTERNAL_URL=https://repoapi-production-d4f7.up.railway.app
```

**Nota**: Isso funciona porque o Next.js server-side faz proxy das requisições `/api/*`, `/chat/*` e `/v3/*` para a API, mantendo os cookies no mesmo domínio (repoweb-production.up.railway.app).

## Commits Realizados (Ordem Cronológica)

1. **6af5e29** - `fix: add slate-dom dependency to web package.json`
2. **35139ce** - `fix: bind API server to 0.0.0.0 for Railway deployment`
3. **8e1ceb0** - `fix: update posthog noop function to accept arguments`
4. **e07788c** - `fix: set sameSite to none for production cookies` (revertido depois)
5. **4fcaacb** - `feat: add API proxy rewrites to next.config`
6. **f6bdb75, a8cd333** - `fix: use empty string for BACKEND_URL in production`
7. **b566d26** - `fix: use API_INTERNAL_URL from env in next.config rewrites`
8. **1e05b04** - `fix: revert cookies to sameSite lax`
9. **b912a44, 1d40484, 510ff5b** - `feat: add v3 API route handler with proxy logic`
10. **3854108** - `fix: exclude /v3 routes from middleware matcher`
11. **89ca21b** - `fix: use BACKEND_URL constant for chat API endpoints`

## URLs Finais

- **Web App**: https://repoweb-production.up.railway.app
- **API**: https://repoapi-production-d4f7.up.railway.app
- **API Health**: https://repoapi-production-d4f7.up.railway.app/health

## Arquitetura de Rede

```
User Browser
    ↓
repoweb-production.up.railway.app (Next.js)
    ↓ (server-side proxy /api/*, /chat/*, /v3/*)
repoapi-production-d4f7.up.railway.app (Hono API)
    ↓
Supabase (PostgreSQL + Auth + Storage)
```

### Fluxo de Requisições

1. **Browser → Next.js Web**:
   - `/api/*` → rewrite para `API_INTERNAL_URL/api/*`
   - `/chat/*` → rewrite para `API_INTERNAL_URL/chat/*`
   - `/v3/*` → route handler faz proxy para `API_INTERNAL_URL/v3/*`

2. **Next.js → API**:
   - Todas as requisições são feitas server-side
   - Cookies são mantidos no mesmo domínio (repoweb-production.up.railway.app)
   - Headers são corretamente forwardados

3. **API → Supabase**:
   - Autenticação
   - Database queries
   - File storage

## Desenvolvimento Local

Todas as mudanças feitas são **compatíveis com desenvolvimento local**:

```bash
# Terminal 1: API
cd apps/api
bun run dev  # Roda em localhost:4000

# Terminal 2: Web
cd apps/web
bun run dev  # Roda em localhost:3000
```

**O que muda?**:
- `BACKEND_URL` automaticamente usa `http://localhost:4000`
- Rewrites apontam para `localhost:4000`
- Route handler `/v3/*` também aponta para `localhost:4000`
- Cookies funcionam com `sameSite: "lax"` sem problemas

## Deploy Automático

Railway está configurado para **deploy automático** quando você faz push:

1. `git add .`
2. `git commit -m "sua mensagem"`
3. `git push`
4. Railway detecta o push e faz deploy automático
5. **Variáveis de ambiente são persistentes** - não precisam ser reconfiguradas

## Troubleshooting

### Problema: `/undefined/chat` ou `/undefined/v3/*`

**Causa**: Componente usando `process.env.NEXT_PUBLIC_BACKEND_URL` diretamente ao invés de `BACKEND_URL` de `@lib/env`.

**Solução**:
```typescript
// ❌ ERRADO
import { useChat } from "@ai-sdk/react";
api: `${process.env.NEXT_PUBLIC_BACKEND_URL}/chat`

// ✅ CORRETO
import { BACKEND_URL } from "@lib/env";
api: `${BACKEND_URL}/chat`
```

### Problema: 404 em rotas `/v3/*`

**Causa**: Middleware interceptando a requisição ou route handler não sendo chamado.

**Solução**:
1. Verificar que `/v3` está na lista de exclusões do middleware
2. Verificar que o route handler existe em `apps/web/app/v3/[...path]/route.ts`
3. Verificar logs para `[V3 PROXY]`

### Problema: Cookies não estão sendo salvos

**Causa**: `sameSite` ou `secure` configurados incorretamente.

**Solução**:
- Produção: `sameSite: "lax"`, `secure: true`
- Local: `sameSite: "lax"`, `secure: false` (NODE_ENV !== "production")

## Notas Importantes

1. **Private Networking**: Não conseguimos usar o private networking do Railway. Pode ser uma limitação do plano gratuito ou configuração adicional necessária.

2. **Legacy Peer Deps**: Necessário `--legacy-peer-deps` devido a conflitos entre React 19 e algumas dependências (Slate, Radix UI).

3. **Sentry**: Configurado mas sem auth token (source maps não são enviados). Para produção, adicionar `SENTRY_AUTH_TOKEN`.

4. **Portas**:
   - API: 4000 (definida via env PORT)
   - Web: 8080 (padrão Railway para Next.js)

5. **Monorepo**: O deployment funciona corretamente com Turborepo, instalando todas as dependências na raiz.

6. **Build Cache**: Railway usa cache agressivo. Se houver problemas, pode ser necessário fazer rebuild sem cache.

7. **Environment Variables**: São persistentes no Railway - só precisam ser configuradas uma vez.

## Checklist para Novo Deployment

Se você precisar fazer deploy em um novo ambiente Railway:

- [ ] Criar projeto no Railway
- [ ] Criar serviço API do repositório GitHub
- [ ] Criar serviço Web do repositório GitHub
- [ ] Configurar variáveis de ambiente da API (ver seção acima)
- [ ] Configurar variáveis de ambiente do Web (ver seção acima)
- [ ] **IMPORTANTE**: Setar `NEXT_PUBLIC_BACKEND_URL=""` (string vazia)
- [ ] Aguardar primeiro deploy
- [ ] Testar endpoints: `/api/auth/session`, `/v3/projects`, `/chat`
- [ ] Verificar se cookies estão funcionando (login/logout)
- [ ] Configurar deploy automático (já vem ativo por padrão)

## Referências

- Railway Docs: https://docs.railway.app/
- Next.js Rewrites: https://nextjs.org/docs/app/api-reference/next-config-js/rewrites
- Next.js Route Handlers: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- Railway MCP: https://github.com/railwayapp/mcp
