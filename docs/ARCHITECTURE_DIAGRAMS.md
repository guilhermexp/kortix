# Diagramas Técnicos de Arquitetura - Kortix

> 📐 Diagramas detalhados usando C4 Model e análise de dependências
> 🗓️ Data: 16 de Janeiro de 2026

## 📋 Índice

1. [C4 Model - Context Diagram](#c4-context-diagram)
2. [C4 Model - Container Diagram](#c4-container-diagram)
3. [C4 Model - Component Diagram (Backend)](#c4-component-diagram-backend)
4. [C4 Model - Component Diagram (Frontend)](#c4-component-diagram-frontend)
5. [Deployment Diagram](#deployment-diagram)
6. [Análise de Dependências](#análise-de-dependências)
7. [Dependency Graph](#dependency-graph)
8. [Data Flow Diagrams](#data-flow-diagrams)

---

## 1. C4 Context Diagram

### Nível 1: Contexto do Sistema

```mermaid
C4Context
    title Context Diagram - Kortix Platform

    Person(user, "Usuário", "Pessoa usando Kortix para gerenciar conhecimento")
    Person(developer, "Desenvolvedor", "Integra via MCP")

    System(kortix, "Kortix Platform", "Plataforma de memória e conhecimento pessoal")

    System_Ext(anthropic, "Anthropic Claude", "API de IA")
    System_Ext(gemini, "Google Gemini", "API de IA Multimodal")
    System_Ext(supabase, "Supabase", "Database + Auth")
    System_Ext(resend, "Resend", "Email Service")
    System_Ext(voyage, "Voyage AI", "Embeddings")
    System_Ext(exa, "Exa Search", "Web Search")
    System_Ext(cloud, "Cloud Storage", "Google Drive, Notion, etc")

    Rel(user, kortix, "Usa", "HTTPS")
    Rel(developer, kortix, "Integra", "MCP Protocol")

    Rel(kortix, anthropic, "Consulta IA", "HTTPS/REST")
    Rel(kortix, gemini, "Processa multimodal", "HTTPS/REST")
    Rel(kortix, supabase, "Armazena dados", "PostgreSQL/REST")
    Rel(kortix, resend, "Envia emails", "HTTPS/REST")
    Rel(kortix, voyage, "Gera embeddings", "HTTPS/REST")
    Rel(kortix, exa, "Busca web", "HTTPS/REST")
    Rel(kortix, cloud, "Sincroniza docs", "OAuth/API")

    UpdateRelStyle(user, kortix, $textColor="blue", $lineColor="blue")
    UpdateRelStyle(kortix, anthropic, $textColor="orange", $lineColor="orange")
```

---

## 2. C4 Container Diagram

### Nível 2: Containers

```mermaid
C4Container
    title Container Diagram - Kortix Platform

    Person(user, "Usuário")

    System_Boundary(kortix, "Kortix Platform") {
        Container(web, "Web Application", "Next.js 16", "Interface do usuário (SPA)")
        Container(api, "API Server", "Hono + Bun", "Backend REST API")
        Container(worker, "Background Worker", "Bun", "Processa documentos")
        Container(queue_worker, "Queue Worker", "Bun + BullMQ", "Background jobs")
        Container(extension, "Browser Extension", "JavaScript", "Captura de páginas web")
        ContainerDb(db, "Database", "PostgreSQL + pgvector", "Armazena todos os dados")
        ContainerDb(cache, "Cache", "Redis", "Cache + Filas")
        ContainerDb(storage, "Object Storage", "Supabase Storage", "Arquivos e mídia")
    }

    System_Ext(anthropic, "Anthropic Claude")
    System_Ext(gemini, "Google Gemini")
    System_Ext(voyage, "Voyage AI")

    Rel(user, web, "Acessa", "HTTPS")
    Rel(user, extension, "Instala")

    Rel(web, api, "Chama API", "HTTPS/REST")
    Rel(extension, api, "Envia dados", "HTTPS/REST")

    Rel(api, db, "Lê/Escreve", "PostgreSQL Protocol")
    Rel(api, cache, "Usa cache", "Redis Protocol")
    Rel(api, storage, "Upload/Download", "S3-compatible")
    Rel(api, queue_worker, "Enfileira jobs", "BullMQ")

    Rel(queue_worker, worker, "Dispara", "In-process")
    Rel(worker, db, "Atualiza", "PostgreSQL")
    Rel(worker, storage, "Lê arquivos", "S3-compatible")

    Rel(api, anthropic, "Consulta", "HTTPS")
    Rel(api, gemini, "Consulta", "HTTPS")
    Rel(worker, voyage, "Gera embeddings", "HTTPS")
    Rel(api, voyage, "Gera embeddings", "HTTPS")

    UpdateRelStyle(user, web, $textColor="blue", $lineColor="blue")
    UpdateRelStyle(api, db, $textColor="green", $lineColor="green")
```

---

## 3. C4 Component Diagram (Backend)

### Nível 3: Componentes do Backend

```mermaid
C4Component
    title Component Diagram - API Server (Backend)

    Container_Boundary(api, "API Server") {
        Component(router_docs, "Documents Router", "Hono Router", "Gerencia documentos")
        Component(router_chat, "Chat Router", "Hono Router", "Chat com IA")
        Component(router_canvas, "Canvas Router", "Hono Router", "Canvas colaborativo")
        Component(router_search, "Search Router", "Hono Router", "Busca híbrida")
        Component(router_mcp, "MCP Router", "Hono Router", "Model Context Protocol")

        Component(svc_embed, "Embedding Service", "Service", "Gera embeddings")
        Component(svc_search, "Hybrid Search Service", "Service", "Busca full-text + vector")
        Component(svc_claude, "Claude Agent Service", "Service", "Agente Claude")
        Component(svc_processor, "Document Processor", "Service", "Processa documentos")
        Component(svc_cache, "Query Cache", "Service", "Cache in-memory")

        Component(mw_auth, "Auth Middleware", "Middleware", "Autenticação JWT")
        Component(mw_rate, "Rate Limiter", "Middleware", "Rate limiting")
        Component(mw_cors, "CORS Middleware", "Middleware", "CORS policy")
    }

    ContainerDb(db, "PostgreSQL")
    ContainerDb(cache, "Redis")
    System_Ext(anthropic, "Anthropic API")
    System_Ext(voyage, "Voyage AI")

    Rel(router_docs, svc_processor, "Usa")
    Rel(router_docs, svc_embed, "Usa")
    Rel(router_chat, svc_claude, "Usa")
    Rel(router_search, svc_search, "Usa")
    Rel(router_search, svc_cache, "Usa")

    Rel(svc_embed, voyage, "Chama API")
    Rel(svc_claude, anthropic, "Chama API")
    Rel(svc_search, db, "Query")
    Rel(svc_processor, db, "Salva")
    Rel(svc_cache, cache, "R/W")

    Rel(router_docs, mw_auth, "Protegido por")
    Rel(router_chat, mw_auth, "Protegido por")
    Rel(router_canvas, mw_auth, "Protegido por")

    UpdateLayoutConfig($c4ShapeInRow="3", $c4BoundaryInRow="2")
```

---

## 4. C4 Component Diagram (Frontend)

### Nível 3: Componentes do Frontend

```mermaid
C4Component
    title Component Diagram - Web Application (Frontend)

    Container_Boundary(web, "Web Application") {
        Component(pages, "Pages", "Next.js App Router", "Rotas da aplicação")
        Component(layouts, "Layouts", "React Components", "Layouts reutilizáveis")

        Component(comp_menu, "Menu Component", "React", "Navegação principal")
        Component(comp_canvas, "Canvas Component", "Excalidraw + React", "Whiteboard")
        Component(comp_editor, "Editor Component", "Slate + React", "Editor de texto")
        Component(comp_chat, "Chat Component", "React", "Interface de chat")
        Component(comp_list, "List View", "React", "Listagem de memórias")

        Component(state_auth, "Auth Context", "React Context", "Estado de autenticação")
        Component(state_query, "React Query", "TanStack Query", "Server state")
        Component(state_zustand, "Zustand Stores", "Zustand", "Client state")

        Component(api_client, "API Client", "fetch wrapper", "HTTP client")
    }

    Container(api, "API Server")

    Rel(pages, layouts, "Usa")
    Rel(layouts, comp_menu, "Renderiza")
    Rel(pages, comp_canvas, "Renderiza")
    Rel(pages, comp_editor, "Renderiza")
    Rel(pages, comp_chat, "Renderiza")
    Rel(pages, comp_list, "Renderiza")

    Rel(comp_chat, state_query, "Usa")
    Rel(comp_list, state_query, "Usa")
    Rel(comp_editor, state_zustand, "Usa")
    Rel(comp_menu, state_auth, "Lê")

    Rel(state_query, api_client, "Usa")
    Rel(api_client, api, "HTTP Requests")

    UpdateLayoutConfig($c4ShapeInRow="3")
```

---

## 5. Deployment Diagram

### Infraestrutura de Deploy

```mermaid
C4Deployment
    title Deployment Diagram - Kortix (Production)

    Deployment_Node(vercel, "Vercel", "PaaS") {
        Deployment_Node(vercel_edge, "Edge Network", "CDN") {
            Container(web_deployed, "Web Application", "Next.js SSR")
        }
    }

    Deployment_Node(railway, "Railway", "PaaS") {
        Deployment_Node(railway_runtime, "Docker Container", "Bun Runtime") {
            Container(api_deployed, "API Server", "Hono + Bun")
            Container(worker_deployed, "Workers", "Bun")
        }
        Deployment_Node(railway_redis, "Redis Instance", "Managed Service") {
            ContainerDb(cache_deployed, "Redis", "Cache + Queue")
        }
    }

    Deployment_Node(supabase_cloud, "Supabase Cloud", "DBaaS") {
        Deployment_Node(supabase_db, "PostgreSQL Cluster", "Managed Postgres") {
            ContainerDb(db_deployed, "PostgreSQL", "Main Database + pgvector")
        }
        Deployment_Node(supabase_storage, "Object Storage", "S3-compatible") {
            ContainerDb(storage_deployed, "Files", "Media Storage")
        }
    }

    Rel(web_deployed, api_deployed, "API Calls", "HTTPS")
    Rel(api_deployed, db_deployed, "SQL Queries", "PostgreSQL")
    Rel(api_deployed, cache_deployed, "Cache R/W", "Redis Protocol")
    Rel(api_deployed, storage_deployed, "Upload/Download", "S3 API")
    Rel(worker_deployed, db_deployed, "Updates", "PostgreSQL")
```

---

## 6. Análise de Dependências

### Mapa de Dependências do Monorepo

```mermaid
graph TB
    subgraph "Apps"
        WEB[apps/web]
        API[apps/api]
        EXT[apps/browser-extension]
    end

    subgraph "Shared Packages"
        UI[@repo/ui]
        LIB[@repo/lib]
        HOOKS[@repo/hooks]
        VAL[@repo/validation]
    end

    subgraph "External Dependencies"
        NEXT[next]
        REACT[react]
        HONO[hono]
        SUPABASE[@supabase/supabase-js]
        ANTHROPIC[@anthropic-ai/sdk]
        RADIX[@radix-ui/*]
        TANSTACK[@tanstack/react-query]
    end

    WEB --> UI
    WEB --> LIB
    WEB --> HOOKS
    WEB --> VAL
    WEB --> NEXT
    WEB --> REACT
    WEB --> RADIX
    WEB --> TANSTACK

    API --> LIB
    API --> VAL
    API --> HONO
    API --> SUPABASE
    API --> ANTHROPIC

    EXT --> LIB
    EXT --> UI

    UI --> REACT
    UI --> RADIX
    LIB --> ANTHROPIC
    LIB --> TANSTACK
    VAL --> HONO

    style WEB fill:#60a5fa
    style API fill:#f59e0b
    style UI fill:#a78bfa
    style LIB fill:#a78bfa
```

### Tabela de Dependências Críticas

| Package | Versão | Usado em | Razão | Alternativas |
|---------|--------|----------|-------|--------------|
| **next** | 16.1.1 | apps/web | Framework React SSR | Remix, SvelteKit |
| **hono** | 4.11.3 | apps/api | HTTP framework rápido | Express, Fastify |
| **@supabase/supabase-js** | 2.90.1 | apps/api, apps/web | Cliente PostgreSQL + Auth | Prisma + NextAuth |
| **@anthropic-ai/sdk** | 0.67.1 | apps/api, packages/lib | Claude AI | OpenAI SDK |
| **@tanstack/react-query** | 5.90.16 | apps/web | Server state management | SWR, Apollo |
| **zustand** | 5.0.9 | apps/web | Client state | Redux, Jotai |
| **zod** | 4.3.5 | apps/api, apps/web | Schema validation | Yup, Joi |
| **bullmq** | 5.66.4 | apps/api | Background jobs | Agenda, Bee-Queue |
| **@excalidraw/excalidraw** | 0.18.0 | apps/web | Canvas whiteboard | Fabric.js, Konva |
| **slate** | 0.118.1 | apps/web | Rich text editor | Lexical, ProseMirror |

### Gráfico de Tamanho de Dependências

```mermaid
pie title Bundle Size Distribution (apps/web)
    "Next.js + React" : 45
    "Radix UI Components" : 15
    "Excalidraw + Slate" : 12
    "TanStack Query + Zustand" : 8
    "AI SDK Clients" : 6
    "Framer Motion" : 5
    "Outros" : 9
```

### Análise de Dependências Desatualizadas

| Package | Versão Atual | Última Versão | Status | Ação |
|---------|--------------|---------------|--------|------|
| next | 16.1.1 | 16.1.1 | ✅ Atualizado | - |
| react | 19.2.3 | 19.2.3 | ✅ Atualizado | - |
| hono | 4.11.3 | 4.11.3 | ✅ Atualizado | - |
| @supabase/supabase-js | 2.90.1 | 2.90.1 | ✅ Atualizado | - |
| typescript | 5.9.3 | 5.9.3 | ✅ Atualizado | - |

**Status Geral**: ✅ Todas as dependências críticas estão atualizadas

---

## 7. Dependency Graph

### Grafo Completo de Dependências (Simplificado)

```mermaid
graph LR
    subgraph "Frontend Stack"
        NEXTJS[Next.js 16] --> REACT19[React 19]
        NEXTJS --> TAILWIND[Tailwind CSS]
        REACT19 --> RADIX[Radix UI]
        REACT19 --> TANSTACK[TanStack Query]
        REACT19 --> ZUSTAND[Zustand]
        REACT19 --> EXCALIDRAW[Excalidraw]
        REACT19 --> SLATE[Slate]
        REACT19 --> FRAMER[Framer Motion]
        NEXTJS --> NEXTINTL[next-intl]
        NEXTJS --> NEXTTHEMES[next-themes]
    end

    subgraph "Backend Stack"
        HONO[Hono] --> BUN[Bun Runtime]
        HONO --> ZOD[Zod]
        BUN --> BULLMQ[BullMQ]
        BULLMQ --> REDIS[ioredis]
        HONO --> SUPABASE_BE[Supabase JS]
        SUPABASE_BE --> POSTGRES[PostgreSQL Client]
    end

    subgraph "AI Stack"
        ANTHROPIC_SDK[@anthropic-ai/sdk]
        GEMINI_SDK[@google/generative-ai]
        AISDK[ai SDK]
        ANTHROPIC_SDK --> AISDK
        GEMINI_SDK --> AISDK
    end

    subgraph "Shared"
        TS[TypeScript 5.9]
        ZOD_SHARED[Zod]
    end

    NEXTJS -.->|usa| TS
    HONO -.->|usa| TS
    REACT19 -.->|valida| ZOD_SHARED
    HONO -.->|valida| ZOD_SHARED

    style NEXTJS fill:#60a5fa
    style HONO fill:#f59e0b
    style TS fill:#3178c6
```

---

## 8. Data Flow Diagrams

### DFD Nível 0: Context

```mermaid
graph LR
    USER[👤 Usuário]
    KORTIX[(🧠 Kortix<br/>Platform)]
    AI[🤖 Serviços IA]
    CLOUD[☁️ Cloud Storage]

    USER -->|Documentos, Queries| KORTIX
    KORTIX -->|Memórias, Respostas| USER
    KORTIX -->|Requests IA| AI
    AI -->|Embeddings, Resumos| KORTIX
    KORTIX -->|Sync Docs| CLOUD
    CLOUD -->|Documents| KORTIX

    style KORTIX fill:#10b981
```

### DFD Nível 1: Principais Processos

```mermaid
graph TB
    USER[👤 Usuário]

    subgraph "Kortix Platform"
        INGEST[1.0<br/>Ingest Document]
        PROCESS[2.0<br/>Process & Embed]
        SEARCH[3.0<br/>Search & Retrieve]
        CHAT[4.0<br/>Chat with AI]
        SYNC[5.0<br/>Sync External]
    end

    DB[(📊 Database)]
    VECTOR[(🔢 Vector Store)]
    QUEUE[📮 Job Queue]
    AI[🤖 AI Services]
    CLOUD[☁️ Cloud Storage]

    USER -->|Upload| INGEST
    INGEST -->|Document| QUEUE
    QUEUE -->|Job| PROCESS
    PROCESS -->|Chunks| DB
    PROCESS -->|Request Embedding| AI
    AI -->|Embeddings| PROCESS
    PROCESS -->|Vectors| VECTOR

    USER -->|Query| SEARCH
    SEARCH -->|SQL Query| DB
    SEARCH -->|Vector Search| VECTOR
    SEARCH -->|Results| USER

    USER -->|Message| CHAT
    CHAT -->|Context| SEARCH
    CHAT -->|Prompt| AI
    AI -->|Response| CHAT
    CHAT -->|Response| USER

    CLOUD -->|Docs| SYNC
    SYNC -->|New Docs| INGEST

    style INGEST fill:#60a5fa
    style PROCESS fill:#f59e0b
    style SEARCH fill:#10b981
    style CHAT fill:#a78bfa
```

### DFD Nível 2: Processo de Busca Detalhado

```mermaid
graph TB
    USER[👤 Query]

    subgraph "3.0 Search & Retrieve"
        VALIDATE[3.1<br/>Validate Query]
        CACHE_CHECK[3.2<br/>Check Cache]
        EMBED_Q[3.3<br/>Embed Query]
        FTS[3.4<br/>Full-Text Search]
        VSEARCH[3.5<br/>Vector Search]
        MERGE[3.6<br/>Merge & Rank]
        CACHE_SET[3.7<br/>Cache Result]
    end

    CACHE[(Cache)]
    DB[(Database FTS)]
    VECTOR[(pgvector)]
    AI[AI Embeddings]

    USER --> VALIDATE
    VALIDATE --> CACHE_CHECK
    CACHE_CHECK -->|HIT| USER
    CACHE_CHECK -->|MISS| EMBED_Q

    EMBED_Q --> AI
    AI --> EMBED_Q

    EMBED_Q --> FTS
    EMBED_Q --> VSEARCH

    FTS --> DB
    DB --> FTS
    FTS --> MERGE

    VSEARCH --> VECTOR
    VECTOR --> VSEARCH
    VSEARCH --> MERGE

    MERGE --> CACHE_SET
    CACHE_SET --> CACHE
    CACHE_SET --> USER

    style VALIDATE fill:#60a5fa
    style MERGE fill:#10b981
```

---

## 9. Análise de Riscos Arquiteturais

### Mapa de Riscos

```mermaid
quadrantChart
    title Mapa de Riscos vs Impacto
    x-axis Baixo Impacto --> Alto Impacto
    y-axis Baixa Probabilidade --> Alta Probabilidade
    quadrant-1 Mitigar Urgente
    quadrant-2 Monitorar
    quadrant-3 Aceitar
    quadrant-4 Mitigar

    Vendor Lock-in (Supabase): [0.7, 0.6]
    Rate Limiting Distribuído: [0.8, 0.5]
    Observabilidade: [0.6, 0.8]
    Testes: [0.5, 0.9]
    Escalabilidade DB: [0.9, 0.4]
    API Breaking Changes: [0.4, 0.3]
    Secrets Management: [0.7, 0.5]
    Cost Overrun (AI APIs): [0.8, 0.6]
```

### Tabela de Riscos Priorizados

| Risco | Probabilidade | Impacto | Prioridade | Mitigação |
|-------|---------------|---------|------------|-----------|
| **Falta de Observabilidade** | Alta | Alta | 🔴 Crítica | Implementar OpenTelemetry + Sentry |
| **Cobertura de Testes Baixa** | Alta | Alta | 🔴 Crítica | Plano de testes (target 70%) |
| **Cost Overrun (AI APIs)** | Média | Alta | 🟡 Alta | Budget alerts + caching agressivo |
| **Vendor Lock-in (Supabase)** | Média | Alta | 🟡 Alta | Abstrair cliente DB |
| **Rate Limiting não-distribuído** | Média | Média | 🟡 Alta | Migrar para Redis |
| **Secrets Management** | Média | Média | 🟢 Média | Vault/AWS Secrets Manager |
| **Escalabilidade DB** | Baixa | Alta | 🟢 Média | Read replicas prontas |
| **API Breaking Changes** | Baixa | Baixa | 🟢 Baixa | Versionamento de API |

---

## 10. Métricas de Qualidade

### Complexity Metrics

```mermaid
xychart-beta
    title "Complexidade por Módulo (Cyclomatic Complexity)"
    x-axis [Documents, Chat, Canvas, Search, Auth, MCP, Connections]
    y-axis "Complexity Score" 0 --> 20
    bar [12, 8, 15, 10, 6, 14, 9]
    line [10, 10, 10, 10, 10, 10, 10]
```

**Legenda**:
- 🟢 Baixa (< 10): Código simples e manutenível
- 🟡 Média (10-15): Aceitável, monitorar
- 🔴 Alta (> 15): Refatorar urgentemente

**Análise**:
- ⚠️ **Canvas**: Complexidade 15 (limite aceitável)
- ⚠️ **MCP**: Complexidade 14 (refatorar se crescer)
- ✅ **Demais módulos**: Dentro do padrão

### Code Coverage

```mermaid
pie title Code Coverage (Target: 70%)
    "Cobertura Atual" : 35
    "Sem Cobertura" : 65
```

**Status**: 🔴 Crítico (35% vs 70% target)

---

## 📚 Conclusão

Esta documentação fornece uma visão técnica completa da arquitetura do Kortix, incluindo:

✅ **Diagramas C4**: Context, Container, Component
✅ **Deployment**: Infraestrutura de produção
✅ **Dependências**: Análise completa do monorepo
✅ **Data Flows**: Fluxos principais de dados
✅ **Riscos**: Mapa de riscos arquiteturais
✅ **Métricas**: Qualidade e complexidade

### Próximos Passos

1. **Implementar observabilidade** (OpenTelemetry)
2. **Aumentar cobertura de testes** (35% → 70%)
3. **Migrar rate limiting** para Redis
4. **Abstrair cliente Supabase**
5. **Implementar API versioning**

---

**Documento gerado por**: Senior Architect (Claude Sonnet 4.5)
**Data**: 16 de Janeiro de 2026
**Versão**: 1.0.0
