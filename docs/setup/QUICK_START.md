# Quick Start Guide

Get Supermemory running in 5 minutes.

## Prerequisites

- **Bun** ≥ 1.2.17 (or Node.js ≥ 20)
- **Supabase** account ([create free account](https://supabase.com))
- **Google Gemini API** key ([get free key](https://ai.google.dev))
- **Anthropic API** key ([get key](https://console.anthropic.com)) - Optional for chat

## Step 1: Clone Repository

```bash
git clone https://github.com/guilhermexp/supermemory.git
cd supermemory
```

## Step 2: Install Dependencies

```bash
bun install
# or: npm install
```

## Step 3: Setup Supabase

1. Create new project at [supabase.com](https://supabase.com)
2. Enable pgvector extension:
   - Go to **Database** → **Extensions**
   - Search for "vector"
   - Enable `vector`
3. Get your credentials:
   - **Project URL**: Settings → API → Project URL
   - **Anon Key**: Settings → API → anon public
   - **Service Role Key**: Settings → API → service_role (keep secret!)
   - **Database URL**: Settings → Database → Connection string → URI

## Step 4: Configure Environment

### API Configuration

```bash
cp apps/api/.env.local.example apps/api/.env.local
```

Edit `apps/api/.env.local`:

```ini
# Server
PORT=4000
NODE_ENV=development

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhb...
SUPABASE_ANON_KEY=eyJhb...
SUPABASE_DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# Authentication (generate random 32+ character string)
AUTH_SECRET=your-secret-key-here-min-32-characters

# AI - Google Gemini (embeddings + chat)
GOOGLE_API_KEY=AIza...
EMBEDDING_MODEL=text-embedding-004
CHAT_MODEL=models/gemini-1.5-flash-latest
SUMMARY_MODEL=models/gemini-1.5-pro-latest

# AI - Anthropic Claude (optional, for advanced chat)
ANTHROPIC_API_KEY=sk-ant-...
AI_PROVIDER=google  # or "anthropic"

# Application URLs
APP_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000

# Optional: External Services
FIRECRAWL_API_KEY=         # Web scraping (optional)
COHERE_API_KEY=            # Search reranking (optional)
USE_MARKITDOWN_FOR_WEB=true
```

### Web Configuration

```bash
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:

```ini
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_TELEMETRY_ENABLED=false
```

## Step 5: Start Development Servers

### Option A: Start All Services

```bash
bun run dev
```

This starts both API (port 4000) and Web (port 3000).

### Option B: Start Individually

```bash
# Terminal 1: API
cd apps/api
bun run dev

# Terminal 2: Web
cd apps/web
bun run dev

# Terminal 3 (Optional): Background Worker
cd apps/api
bun run ingest:worker
```

## Step 6: Create Account

1. Open http://localhost:3000
2. Click "Sign Up"
3. Enter email and password
4. Create your first organization
5. Start adding memories!

## Step 7: Test Features

### Add Your First Memory

1. Click "Add Memory" button
2. Choose input method:
   - **Text** - Direct text entry
   - **URL** - Paste a webpage URL
   - **File** - Upload PDF, image, etc.
3. Add optional description and tags
4. Click "Save"

### Try the Search

1. Click search icon or press `/`
2. Enter search query
3. See semantic search results
4. Click result to view details

### Test the Chat

1. Click chat icon in sidebar
2. Ask a question about your memories
3. Watch AI stream response with sources
4. Continue conversation with follow-ups

### Explore the Canvas

1. Click "Canvas" in top menu
2. Add documents to canvas
3. Drag cards to organize spatially
4. Zoom and pan to explore

## Troubleshooting

### API won't start

**Error: Connection to Supabase failed**
- Check `SUPABASE_URL` is correct
- Verify `SUPABASE_SERVICE_ROLE_KEY` is valid
- Ensure pgvector extension is enabled

**Error: AUTH_SECRET must be at least 32 characters**
- Generate longer secret: `openssl rand -base64 32`

**Error: Port 4000 already in use**
- Change `PORT=4001` in `.env.local`
- Update `NEXT_PUBLIC_BACKEND_URL` in web config

### Web won't start

**Error: Can't connect to API**
- Ensure API is running on port 4000
- Check `NEXT_PUBLIC_BACKEND_URL` matches API port

**Error: Environment variables not found**
- Make sure `.env.local` file exists in `apps/web/`
- Restart Next.js dev server after env changes

### Can't create account

**Error: User already exists**
- Use different email
- Or reset database (Supabase dashboard → Table Editor)

**Error: Organization creation failed**
- Check API logs for details
- Verify RLS policies in Supabase

### Search returns no results

**No results found**
- Ensure documents are fully processed
- Check background worker is running
- Wait a few seconds after adding documents
- Verify embeddings were generated (check database)

### Chat not working

**Error: ANTHROPIC_API_KEY required**
- Add API key to `.env.local`
- Or set `AI_PROVIDER=google` to use Gemini

**Chat streams but no sources**
- Ensure you have documents indexed
- Try adding a memory first
- Check hybrid search is working

## Next Steps

- [Full Installation Guide](./INSTALLATION.md) - Detailed setup
- [Configuration Options](./CONFIGURATION.md) - All env variables
- [Features Overview](../features/OVERVIEW.md) - Learn all features
- [API Documentation](../api/OVERVIEW.md) - API reference

## Getting Help

- **Documentation**: [docs/](../)
- **Issues**: [GitHub Issues](https://github.com/guilhermexp/supermemory/issues)
- **Discussions**: [GitHub Discussions](https://github.com/guilhermexp/supermemory/discussions)

## Production Deployment

Ready to deploy? See:
- [Railway Deployment](../deployment/RAILWAY.md) - Recommended platform
- [Self-Hosting Guide](../deployment/SELF_HOSTING.md) - VPS/Docker setup
