# Supermemory – Self-Hosted Edition

This repository packages the open-source Supermemory web app together with a brand‑new backend (`apps/api`) that runs entirely on your own infrastructure. The default stack is:

- **Frontend**: Next.js 15 (Turbopack) in `apps/web`
- **Backend API**: Bun + Hono server in `apps/api`
- **Database & Storage**: Supabase Postgres (pgvector enabled) and Supabase Storage
- **Auth**: better-auth (email/pass, magic links, organizations)
- **Embeddings & Chat**: Gemini models (configurable)

Everything is wired to talk to _your_ backend – no calls to `api.supermemory.ai` remain.

## What’s Included

- ✅ Memory ingestion pipeline (text, links, future uploads) with background processing
- ✅ Vector search + chat that surfaces your stored memories
- ✅ Connectors/MCP scaffolding ready for local credentials
- ✅ Documentation & specs inside `spec/` describing the new architecture
- ✅ Browser extension + docs site that point to the self-hosted API

## Prerequisites

1. Supabase project with pgvector enabled
2. Bun ≥ 1.2, Node ≥ 20, and pnpm/bun for package scripts
3. Gemini API key (or adjust the embedding/chat providers in `apps/api/src/services/*`)

## Quick Start

```bash
# Install dependencies
bun install

# Copy example environment files
cp apps/api/.env.local.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/api/.env.local` and fill in your Supabase credentials:

```ini
PORT=4000
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
SUPABASE_DATABASE_URL=postgresql://...
AUTH_SECRET=use_a_32_char_secret
GOOGLE_API_KEY=your_gemini_key
APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
```

Then launch both services:

```bash
# Terminal 1 – API
bun run --cwd apps/api dev

# Terminal 2 – Frontend
bun run --cwd apps/web dev
```

Open <http://localhost:3000> and sign up. All network traffic stays between the Next.js app and your local API.

## Repository Structure

```
apps/
  api/        → Bun/Hono backend
  web/        → Next.js frontend
  docs/       → Mintlify documentation, now pointing at your backend
packages/
  lib/        → Shared utilities (auth, API clients, env helpers)
  ui/         → Component library
spec/         → PRD, technical specs, schema status
```

## Configuration Cheatsheet

| Variable | Location | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_BACKEND_URL` | `apps/web/.env.local` | Base URL for the API (`http://localhost:4000`) |
| `NEXT_PUBLIC_APP_URL` | `apps/web/.env.local` | Public URL for the web app |
| `NEXT_PUBLIC_MCP_SERVER_URL` | `apps/web/.env.local` | MCP endpoint (defaults to `<BACKEND_URL>/mcp`) |
| `SUPABASE_*` | `apps/api/.env.local` | Supabase Postgres/Storage credentials |
| `GOOGLE_API_KEY` | `apps/api/.env.local` | Gemini API key for embeddings/chat |

## Documentation

- Architecture & requirements: [`spec/TECH_SPEC.md`](spec/TECH_SPEC.md)
- Product scope & milestones: [`spec/PRD.md`](spec/PRD.md)
- Developer docs site (Mintlify): `apps/docs/` — run with `bunx mintlify dev` (uses ` NEXT_PUBLIC_BACKEND_URL`).

## Contributing

1. Fork the repo and create a branch
2. Run `bun install`
3. Keep backend and frontend running with `bun dev`
4. Submit a PR summarizing your changes

## Support

- Issues: open a ticket on this repository
- Discussion: use the repo discussions tab

Self-hosted Supermemory is under active development—check the `Outstanding TODOs` in `spec/TECH_SPEC.md` to see what’s next.
