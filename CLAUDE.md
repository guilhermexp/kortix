# Kortix Development Guide

## CRITICAL: Package Manager

**USE `bun` EXCLUSIVELY. NEVER use `npm`, `yarn`, or `pnpm`.**

- Install dependencies: `bun install`
- Add a package: `bun add <package>` (or `bun add -d <package>` for dev)
- Run scripts: `bun run <script>` or `bun <script>`
- Start dev: `bun dev` (from root — runs turbo)
- The lockfile is `bun.lock` — never create or use `package-lock.json` or `yarn.lock`
- `packageManager` is pinned to `bun@1.2.17` in root `package.json`

**Why this matters:** Using `npm install` in a bun monorepo can silently remove hundreds of packages (including `react-dom`) and break the entire app.

## Project Structure

```
kortix/                         # Monorepo root (bun workspaces + turborepo)
├── apps/
│   ├── api/                    # Backend — Hono + Bun (port 4000)
│   ├── web/                    # Frontend — Next.js 16 + React 19 (port 3001)
│   ├── browser-extension/      # Chrome extension
│   └── markitdown/             # Document conversion utility
├── packages/
│   ├── hooks/                  # Shared React hooks
│   ├── lib/                    # Shared utilities
│   ├── ui/                     # Shared UI components
│   └── validation/             # Shared Zod schemas
├── turbo.json                  # Turborepo task config
├── biome.json                  # Linter + formatter config
├── bun.lock                    # Lockfile (NEVER delete/replace)
└── package.json                # Root workspace config
```

## Development Commands

```bash
bun dev              # Start all apps (API + Web) via turbo
bun run build        # Build all packages
bun run test         # Run all tests
bun run format-lint  # Format + lint with Biome
bun run check-types  # TypeScript type checking
```

### App-specific

```bash
# API (apps/api)
bun run dev:server      # API only (port 4000)
bun run dev:worker      # Ingestion worker only
bun run dev:all         # API + worker + queue
bun test                # Run API tests (bun:test)

# Web (apps/web)
bun run dev             # Next.js dev (port 3001)
bun run build           # Production build
bun run test            # Run web tests (vitest)
bun run typecheck       # Type check web
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Bun |
| **Monorepo** | Turborepo + bun workspaces |
| **API** | Hono (apps/api) |
| **Frontend** | Next.js 16 + React 19 (apps/web) |
| **Database** | Supabase (PostgreSQL) |
| **AI SDK** | Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) |
| **Styling** | Tailwind CSS v3 + shadcn/ui (Radix) |
| **Linter/Formatter** | Biome |
| **Testing** | `bun:test` (API), Vitest (Web) |
| **Deployment** | Dokploy (self-hosted) |

## Code Style (Biome)

- **Indent**: tabs
- **Quotes**: double quotes
- **Semicolons**: omit (ASI — no semicolons)
- **Imports**: auto-organized by Biome
- Format before committing: `bun run format-lint`

## Environment Files

Each app has its own `.env`:
- `apps/api/.env` — API keys, Supabase credentials, LLM providers
- `apps/web/.env` — `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_APP_URL`
- Root has no `.env` — all env vars are app-specific

**NEVER commit `.env` files.** They are in `.gitignore`.

## Key Conventions

### Adding Dependencies
- Root `package.json`: only shared build/dev tools (turbo, biome, typescript)
- App-specific deps go in `apps/api/package.json` or `apps/web/package.json`
- Shared code goes in `packages/*`

### API Architecture (apps/api)
- Framework: Hono
- Routes: `src/routes/*.ts`
- Services: `src/services/*.ts`
- AI agent: `src/services/claude-agent.ts` (Claude Agent SDK)
- Agent tools: `src/services/claude-agent-tools.ts`
- Agent system prompt: `apps/api/.claude/CLAUDE.md` (loaded by SDK)
- Dev script kills stale processes on port 4000 automatically

### Web Architecture (apps/web)
- Framework: Next.js 16 with Turbopack
- App Router (app directory)
- State: Zustand + TanStack Query
- UI: shadcn/ui (Radix primitives)
- Backend proxy: `NEXT_PUBLIC_BACKEND_URL=http://localhost:4000`

### Git
- Main branch: `main`
- GitHub user: `guilhermexp`

## Troubleshooting

### "Cannot find package X"
Run `bun install` from root. Never use `npm install`.

### Port already in use
The dev script auto-kills stale API processes on port 4000. For port 3001:
```bash
lsof -ti:3001 | xargs kill
```

### Redis warnings
`REDIS_URL not set` is expected in local dev — queue features are disabled.
