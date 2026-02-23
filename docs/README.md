# 📚 Documentação de Arquitetura - Kortix

> Documentação técnica completa do sistema Kortix

## 📋 Documentos Disponíveis

### 1. [ARCHITECTURE.md](./ARCHITECTURE.md)
**Análise Completa de Arquitetura**

Documento principal com visão geral da arquitetura do sistema, incluindo:

- ✅ Visão geral do sistema
- ✅ Estrutura do monorepo
- ✅ Arquitetura de alto nível
- ✅ Frontend (Next.js 16) detalhado
- ✅ Backend (Hono) detalhado
- ✅ Camada de dados (PostgreSQL + pgvector)
- ✅ Integrações e serviços externos
- ✅ Fluxos principais
- ✅ Segurança e autenticação
- ✅ Performance e escalabilidade
- ✅ **Recomendações práticas**

**Pontuação Geral**: 8.5/10

### 2. [ARCHITECTURE_DIAGRAMS.md](./ARCHITECTURE_DIAGRAMS.md)
**Diagramas Técnicos Detalhados**

Diagramas completos usando C4 Model e análise de dependências:

- ✅ **C4 Context Diagram**: Visão de contexto
- ✅ **C4 Container Diagram**: Containers do sistema
- ✅ **C4 Component Diagrams**: Frontend e Backend
- ✅ **Deployment Diagram**: Infraestrutura
- ✅ **Dependency Graph**: Análise de dependências
- ✅ **Data Flow Diagrams**: Fluxos de dados
- ✅ **Risk Analysis**: Mapa de riscos
- ✅ **Quality Metrics**: Métricas de qualidade

### 3. [SEARCH_AND_AGENT_TOOLS.md](./SEARCH_AND_AGENT_TOOLS.md)
**Contrato Atual de Busca e Ferramentas de Agente**

Guia prático do comportamento mais recente de busca:

- ✅ Serviço unificado `executeStructuredSearch`
- ✅ Contrato MCP (`searchKortix`) com `responseFormat` e `limit`
- ✅ Contrato do agente interno (`searchDatabase`)
- ✅ Busca em documentos com `title + summary + content`
- ✅ Fallback sem acentos (diacríticos)
- ✅ Correções de UX: limpeza imediata da busca e normalização de projeto legado

## 🎯 Como Usar Esta Documentação

### Para Desenvolvedores

1. **Onboarding**: Leia primeiro o `ARCHITECTURE.md` seção "Visão Geral"
2. **Entendendo o Código**: Consulte a seção de estrutura do Frontend/Backend
3. **Adicionando Features**: Veja "Fluxos Principais" e "Padrões de Design"
4. **Resolvendo Problemas**: Consulte "Recomendações" e "Riscos"

### Para Arquitetos

1. **Avaliação**: Comece pelo `ARCHITECTURE.md` seção "Resumo Executivo"
2. **Decisões Técnicas**: Veja tabelas de tecnologias e justificativas
3. **Diagramas**: Use `ARCHITECTURE_DIAGRAMS.md` para apresentações
4. **Planning**: Consulte "Próximos Passos" em ambos os documentos

### Para Product Managers

1. **Capabilities**: Veja "Visão Geral" no `ARCHITECTURE.md`
2. **Escalabilidade**: Consulte "Performance e Escalabilidade"
3. **Risks**: Analise "Mapa de Riscos" no `ARCHITECTURE_DIAGRAMS.md`
4. **Roadmap Técnico**: "Recomendações" → "Próximos Passos"

## 🏗️ Resumo da Arquitetura

```
┌─────────────────────────────────────────┐
│         Kortix Platform                  │
│  (Personal Knowledge Management)         │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
   Frontend                Backend
   Next.js 16             Hono + Bun
   React 19               PostgreSQL
   ~327K LOC              ~45K LOC
        │                       │
        └───────────┬───────────┘
                    │
            ┌───────┴────────┐
            │                │
        Database         Workers
        Supabase        BullMQ + Redis
        PostgreSQL      Background Jobs
        pgvector        Document Processing
```

## 📊 Métricas do Projeto

| Métrica | Valor |
|---------|-------|
| **Total LOC** | ~372K |
| **Apps** | 3 (Web, API, Extension) |
| **Packages** | 4 Shared Packages |
| **Rotas API** | 28 módulos |
| **Serviços** | 36 serviços |
| **Tech Stack** | Next.js 16, Hono, Bun, Supabase |
| **Qualidade** | 8.5/10 |

## 🛠️ Tecnologias Principais

### Frontend
- Next.js 16 (App Router)
- React 19
- TypeScript 5.9
- Tailwind CSS + Radix UI
- TanStack Query + Zustand
- next-intl (i18n: pt/en)

### Backend
- Hono (HTTP framework)
- Bun (Runtime)
- Supabase (PostgreSQL + Auth)
- BullMQ (Background jobs)
- Redis (Cache + Queue)

### AI/ML
- Anthropic Claude
- Google Gemini
- Voyage AI (Embeddings)
- Cohere (Reranking)

## 🚀 Principais Features

1. **Document Management**: Upload, processamento e indexação
2. **Hybrid Search**: Full-text + Vector search
3. **AI Chat**: Conversas contextualizadas com IA
4. **Canvas**: Whiteboard colaborativo (tldraw)
5. **Rich Editor**: Editor de texto rico (Slate)
6. **MCP Integration**: Model Context Protocol
7. **Cloud Sync**: Google Drive, Notion, etc.
8. **I18n**: Português e Inglês

## ⚡ Performance

| Métrica | Target | Atual |
|---------|--------|-------|
| **TTFB** | < 200ms | ~150ms ✅ |
| **FCP** | < 1.5s | ~1.2s ✅ |
| **LCP** | < 2.5s | ~2.0s ✅ |
| **API p95** | < 500ms | ~300ms ✅ |
| **Search** | < 200ms | ~150ms ✅ |

## 🔒 Segurança

- ✅ Supabase Auth (JWT)
- ✅ Row Level Security (RLS)
- ✅ Rate Limiting
- ✅ CORS Policy
- ✅ CSP Headers
- ✅ Encrypted Secrets

## 📈 Escalabilidade

### Horizontal
- Frontend: Vercel Edge (auto-scaling)
- Backend: Railway (multi-instance ready)
- Workers: Containerized

### Vertical
- PostgreSQL: Read replicas ready
- Redis: Cluster mode ready
- Workers: Configurable resources

## 💡 Próximos Passos Recomendados

### Curto Prazo (1-2 semanas)
1. ⚠️ Implementar observabilidade (Sentry + OpenTelemetry)
2. ⚠️ Adicionar testes unitários (coverage: 35% → 70%)
3. ⚠️ Documentar APIs (OpenAPI/Swagger)

### Médio Prazo (1 mês)
4. Migrar para Drizzle ORM (migrations versionadas)
5. Implementar CI/CD completo
6. Migrar rate limiting para Redis

### Longo Prazo (3 meses)
7. Feature flags system
8. Secrets management (Vault)
9. Load testing e otimizações

## 🔗 Links Úteis

- [Repositório GitHub](https://github.com/guilhermexp/kortix) (privado)
- [Deploy Frontend](https://kortix.app) (Vercel)
- [Deploy Backend](https://api.kortix.app) (Railway)
- [Supabase Dashboard](https://supabase.com/dashboard)

## 📝 Notas de Versão

- **v1.0.0** (16/01/2026): Documentação inicial completa
  - Análise de arquitetura end-to-end
  - Diagramas C4 completos
  - Análise de dependências
  - Recomendações práticas

## 🤝 Contribuindo

Para atualizar esta documentação:

1. Edite os arquivos `.md` neste diretório
2. Mantenha os diagramas Mermaid atualizados
3. Atualize as métricas quando houver mudanças significativas
4. Versione as alterações no Git

## 📧 Contato

Para dúvidas sobre a arquitetura, entre em contato com a equipe de engenharia.

---

**Última atualização**: 22 de Fevereiro de 2026
**Mantido por**: Equipe Kortix + Senior Architect (Claude Sonnet 4.5)
