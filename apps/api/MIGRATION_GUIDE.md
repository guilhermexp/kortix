# Migration Guide: Claude Agent SDK Fixes

This guide helps you apply the Claude Agent SDK fixes to your environment.

## Prerequisites

- PostgreSQL database access
- (Optional) Redis instance for caching
- Bun package manager
- Supabase setup with RLS enabled

## Step 1: Install Dependencies

```bash
cd apps/api
bun add redis
```

## Step 2: Update Environment Variables

Add to your `.env.local`:

```bash
# Optional: Redis URL for caching (highly recommended for production)
REDIS_URL=redis://localhost:6379

# If Redis is not available, the system will work without caching
# but repeated searches will be slower
```

## Step 3: Apply Database Migration

### Option A: Using psql directly

```bash
cd apps/api
psql $SUPABASE_URL -f migrations/0002_add_conversation_tables.sql
```

### Option B: Using Supabase CLI

```bash
# Push migration to Supabase
supabase db push

# Or apply manually through Supabase Dashboard
# SQL Editor → Paste contents of migrations/0002_add_conversation_tables.sql
```

### Verify Migration

Check that tables were created:

```sql
-- Check conversations table
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'conversations';

-- Check conversation_events table
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'conversation_events';

-- Check tool_results table
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tool_results';

-- Verify RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('conversations', 'conversation_events', 'tool_results');
```

Expected output:
```
    tablename      | rowsecurity 
-------------------+-------------
 conversations     | t
 conversation_events| t
 tool_results      | t
```

## Step 4: Test the Implementation

### Test 1: Create a Conversation

```bash
curl -X POST http://localhost:4000/v3/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Test Conversation",
    "metadata": {"test": true}
  }'
```

Expected response:
```json
{
  "conversation": {
    "id": "uuid-here",
    "org_id": "org-uuid",
    "user_id": "user-uuid",
    "title": "Test Conversation",
    "metadata": {"test": true},
    "created_at": "2025-10-27T...",
    "updated_at": "2025-10-27T..."
  }
}
```

### Test 2: Chat with Conversation Storage

```bash
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "messages": [
      {"role": "user", "content": "What is machine learning?"}
    ],
    "mode": "simple"
  }'
```

Check response includes `conversationId`:
```json
{
  "message": {
    "role": "assistant",
    "content": "...",
    "parts": [...]
  },
  "conversationId": "uuid-here",
  "events": [...]
}
```

### Test 3: Resume Conversation with History

```bash
# Use conversationId from previous test
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "conversationId": "uuid-from-step-2",
    "useStoredHistory": true,
    "messages": [
      {"role": "user", "content": "Can you elaborate on that?"}
    ],
    "mode": "simple"
  }'
```

The agent should respond with context from previous message.

### Test 4: Retrieve Conversation History

```bash
curl http://localhost:4000/v3/conversations/{conversationId}/history \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected response:
```json
{
  "messages": [
    {
      "role": "user",
      "content": [{"type": "text", "text": "What is machine learning?"}]
    },
    {
      "role": "assistant",
      "content": [{"type": "text", "text": "..."}]
    },
    {
      "role": "user",
      "content": [{"type": "text", "text": "Can you elaborate on that?"}]
    },
    {
      "role": "assistant",
      "content": [{"type": "text", "text": "..."}]
    }
  ],
  "count": 4
}
```

### Test 5: Verify Caching (if Redis is available)

Search for the same query twice and check logs:

```bash
# First request
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "messages": [
      {"role": "user", "content": "Search for information about TypeScript"}
    ],
    "mode": "agentic"
  }'

# Second request with same query
curl -X POST http://localhost:4000/chat/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "messages": [
      {"role": "user", "content": "Search for information about TypeScript"}
    ],
    "mode": "agentic"
  }'
```

Check server logs:
```
First request: [searchDatabase] Cache miss for query "information about TypeScript"
Second request: [searchDatabase] Cache hit for query "information about TypeScript" (8ms)
```

## Step 5: Monitor and Verify

### Check Database Records

```sql
-- Count conversations
SELECT COUNT(*) FROM conversations;

-- Check recent conversations
SELECT id, title, created_at, updated_at 
FROM conversations 
ORDER BY created_at DESC 
LIMIT 10;

-- Count events per conversation
SELECT c.id, c.title, COUNT(e.id) as event_count
FROM conversations c
LEFT JOIN conversation_events e ON c.id = e.conversation_id
GROUP BY c.id, c.title
ORDER BY c.created_at DESC
LIMIT 10;

-- Check tool usage
SELECT tool_name, COUNT(*) as usage_count, AVG(duration_ms) as avg_duration
FROM tool_results
GROUP BY tool_name
ORDER BY usage_count DESC;
```

### Monitor Cache Performance

If Redis is available:
```bash
# Connect to Redis
redis-cli

# Check keys
KEYS search:*

# Check a cached value
GET search:org-id:hash-here

# Monitor cache operations in real-time
MONITOR
```

### Check Error Logs

Review application logs for any errors:
```bash
# Check for error patterns
grep -i "ERROR" /path/to/logs | tail -20

# Check for conversation creation errors
grep "Failed to create conversation" /path/to/logs

# Check for cache errors (should gracefully degrade)
grep "CacheService" /path/to/logs
```

## Rollback Procedure

If you need to rollback the changes:

### Step 1: Revert API Code
```bash
git revert HEAD  # or specific commit
```

### Step 2: Drop Tables
```sql
-- Drop in correct order due to foreign keys
DROP TABLE IF EXISTS tool_results CASCADE;
DROP TABLE IF EXISTS conversation_events CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
```

### Step 3: Remove Redis Dependency (optional)
```bash
cd apps/api
bun remove redis
```

### Step 4: Restart Services
```bash
# Restart API server
bun run dev
```

## Common Issues and Solutions

### Issue: Migration fails with "relation already exists"

**Solution**: Tables already exist. Either:
1. Drop existing tables and re-run migration
2. Skip migration if tables are correct

```sql
-- Check existing tables
\d conversations
\d conversation_events
\d tool_results
```

### Issue: RLS policies blocking inserts

**Symptoms**: Errors like "new row violates row-level security policy"

**Solution**: Verify organization headers are being passed:
```bash
# Test with explicit headers
curl -X POST http://localhost:4000/v3/conversations \
  -H "X-Supermemory-Organization: your-org-id" \
  -H "X-Supermemory-User: your-user-id" \
  ...
```

### Issue: Redis connection fails

**Symptoms**: Logs show "Redis client error" or "Failed to connect to Redis"

**Solution**: This is expected if Redis is not available. The system works without Redis, just without caching:
```
[CacheService] Failed to connect to Redis (attempt 1): ...
```

To enable caching, ensure Redis is running:
```bash
# Start Redis
redis-server

# Or use Docker
docker run -d -p 6379:6379 redis:alpine
```

### Issue: History not loading in resumed conversations

**Symptoms**: Agent doesn't remember previous context

**Checklist**:
1. ✅ `conversationId` provided in request
2. ✅ `useStoredHistory: true` in request body
3. ✅ Previous messages stored in `conversation_events`
4. ✅ No errors in EventStorageService logs

**Debug**:
```sql
-- Check events for conversation
SELECT type, role, created_at, content
FROM conversation_events
WHERE conversation_id = 'your-conversation-id'
ORDER BY created_at;
```

## Performance Tuning

### Database Indexes

The migration creates indexes automatically, but you can add more if needed:

```sql
-- Add composite index for common queries
CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation_type 
ON conversation_events(conversation_id, type, created_at);

-- Add index for tool performance queries
CREATE INDEX IF NOT EXISTS idx_tool_results_tool_executed 
ON tool_results(tool_name, executed_at DESC);
```

### Redis Configuration

For production, tune Redis:

```bash
# In redis.conf or via docker
maxmemory 256mb
maxmemory-policy allkeys-lru  # Evict least recently used keys
```

### Connection Pooling

Ensure Supabase client uses connection pooling:
```typescript
// Already configured in createClient
{
  auth: { persistSession: false },
  db: {
    poolSize: 10  // Adjust based on load
  }
}
```

## Next Steps

After successful migration:

1. ✅ Monitor cache hit rates in production
2. ✅ Set up alerts for conversation creation failures
3. ✅ Review error logs daily for first week
4. ⏳ Write integration tests (see IMPLEMENTATION_STATUS.md)
5. ⏳ Document any custom usage patterns
6. ⏳ Train team on new endpoints

## Support

For issues or questions:
- Check `IMPLEMENTATION_STATUS.md` for detailed implementation details
- Review server logs for specific error messages
- Verify database schema matches migration file
- Test Redis connectivity if caching issues occur

## Checklist

- [ ] Dependencies installed (`bun add redis`)
- [ ] Environment variables configured
- [ ] Database migration applied
- [ ] Tables created with RLS enabled
- [ ] Test conversation creation works
- [ ] Test chat with conversation storage works
- [ ] Test conversation history retrieval works
- [ ] Redis caching verified (if applicable)
- [ ] No errors in application logs
- [ ] Rollback procedure documented and tested
