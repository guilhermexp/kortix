# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a **Turbo monorepo** containing multiple applications and shared packages:

### Applications (`apps/`)
- **`web/`** - Next.js web application

## Development Commands

### Root Level (Monorepo)
- `bun run dev` - Start all applications in development mode
- `bun run build` - Build all applications
- `bun run check-types` - Run TypeScript checks across all apps
- `bun run format-lint` - Format and lint code using Biome

### Web Application (`apps/web/`)
- `bun run dev` - Start Next.js development server
- `bun run build` - Build Next.js application
- `bun run lint` - Run Next.js linting

## Architecture Overview

### Core Technology Stack
- **Runtime**: Next.js (web)
- **Framework**: Next.js (web)
- **Language**: TypeScript throughout
- **Package Manager**: Bun
- **Monorepo**: Turbo
- **Authentication**: Better Auth
- **Monitoring**: Sentry

### API Application (Primary Backend)
The API serves as the core backend with these key features:

**Key API Routes**
- `/v3/documents` - CRUD operations for documents/memories
- `/v3/search` - Semantic search across indexed content
- `/v3/connections` - External service integrations (Google Drive, Notion, OneDrive)
- `/v3/settings` - Organization and user settings
- `/v3/analytics` - Usage analytics and reporting
- `/api/auth/*` - Authentication endpoints

### Web Application
Next.js application providing user interface for:

## Key Libraries & Dependencies

### Shared Dependencies
- `better-auth` - Authentication system with organization support
- `drizzle-orm` - Database ORM
- `zod` - Schema validation
- `hono` - Web framework (API & MCP)
- `@sentry/*` - Error monitoring
- `turbo` - Monorepo build system

### Web-Specific
- `next` - React framework
- `@radix-ui/*` - UI components
- `@tanstack/react-query` - Data fetching
- `recharts` - Analytics visualization

## Development Workflow

### Content Processing Pipeline
Todo conteúdo passa pelo serviço de ingestão em `apps/api/src/services/ingestion.ts`, responsável por:
- Detectar tipo de documento e extrair o texto relevante
- Gerar resumo e metadados automáticos (quando habilitado)
- Criar embeddings via provedor configurado (`GOOGLE_API_KEY` → Gemini por padrão)
- Dividir em chunks e indexar no Postgres/pgvector
- Registrar relacionamentos entre memórias quando aplicável

### Environment Configuration
- Utiliza arquivos `.env` (ex.: `apps/api/.env.local`, `apps/web/.env.local`)
- Configuração de Supabase (URL, service role, connection string) e provedor de LLM
- Variáveis compartilhadas via `packages/lib/env.ts`
- Jobs assíncronos executados por worker Bun ou Supabase Queue

### Error Handling & Monitoring
- HTTPException for consistent API error responses
- Sentry integration with user and organization context
- Custom logging that filters analytics noise

## Code Quality & Standards

### Linting & Formatting
- **Biome** used for linting and formatting across the monorepo
- Run `bun run format-lint` to format and lint all code
- Configuration in `biome.json` at repository root

### TypeScript
- Configuração strict usando `@total-typescript/tsconfig`
- Checagem com `bun run check-types`
- Sem tooling específico de Cloudflare; tipos compartilhados vivem em `packages/*`

### Database Management
- Drizzle ORM with schema located in shared packages
- Database migrations handled through Drizzle Kit
- Schema types automatically generated and shared

## Security & Best Practices

### Authentication
- Better Auth handles user authentication and organization management
- API key authentication for external access
- Role-based access control within organizations

### Data Handling
- Content hashing to prevent duplicate processing
- Secure handling of external service credentials
- Automatic content type detection and validation

### Deployment
- Backend Bun rodando em servidor/container próprio (porta 4000 por padrão)
- Frontend Next.js 15 com build `bun run --cwd apps/web build`
- Observabilidade e variáveis por ambiente controladas via `.env` ou secret manager
