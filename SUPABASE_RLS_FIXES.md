# Supabase RLS Security Fixes

## Overview

This document describes the RLS (Row Level Security) improvements made to address multi-tenant data isolation gaps.

## Changes Made

### 1. New Migration: `0006_rls_missing_tables.sql`

Adds comprehensive RLS policies to 6 previously unprotected tables:

#### Tables Protected:
1. **users** - Restrict to organization members or self
2. **sessions** - Restrict by organization_id
3. **organization_settings** - Restrict by org_id
4. **memory_relationships** - Restrict by org_id
5. **api_requests** - Restrict by org_id
6. **processing_logs** - Restrict via ingestion_jobs JOIN (temporary)

**Policies Added:**
- SELECT: Users can only see data from their organization
- INSERT: Can only insert data for their organization
- UPDATE: Can only update data from their organization
- DELETE: Can only delete data from their organization

### 2. New Migration: `0007_add_org_id_to_processing_logs.sql`

Improves `processing_logs` table by adding direct `org_id` column:

**Changes:**
- Adds `org_id uuid NOT NULL` column (backfilled from ingestion_jobs)
- Creates foreign key constraint to organizations
- Updates RLS policies to use direct org_id (more efficient than JOIN)
- Creates indexes on org_id and job_id for better performance

**Benefits:**
- ✅ Simpler RLS policies (direct column vs JOIN)
- ✅ Better query performance (index on org_id)
- ✅ Consistent with other tables

## How to Apply

### Option 1: Using Supabase CLI

```bash
# Navigate to project directory
cd /Users/guilhermevarela/Public/supermemory

# Apply migrations
supabase migration up

# Verify migrations applied
supabase migration list
```

### Option 2: Using psql directly

```bash
# Connect to your Supabase database
psql postgresql://user:password@db.supabase.co:5432/postgres

# Execute migrations in order
\i ai_specs/infra/migrations/0006_rls_missing_tables.sql
\i ai_specs/infra/migrations/0007_add_org_id_to_processing_logs.sql

# Verify RLS policies
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Option 3: Using Supabase UI

1. Go to SQL Editor in Supabase Dashboard
2. Copy content from `0006_rls_missing_tables.sql`
3. Execute the SQL
4. Copy content from `0007_add_org_id_to_processing_logs.sql`
5. Execute the SQL

## Verification

### 1. Verify RLS is Enabled

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'sessions', 'organization_settings',
                    'memory_relationships', 'api_requests', 'processing_logs')
ORDER BY tablename;

-- Expected: all should have rowsecurity = true
```

### 2. Verify Policies Exist

```sql
SELECT tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('users', 'sessions', 'organization_settings',
                    'memory_relationships', 'api_requests', 'processing_logs')
ORDER BY tablename, policyname;

-- Expected: SELECT, INSERT, UPDATE, DELETE policies for each table
```

### 3. Verify org_id Column in processing_logs

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'processing_logs'
  AND column_name = 'org_id';

-- Expected: org_id uuid NOT NULL
```

### 4. Test RLS in Action

```sql
-- Set organization context (simulate authenticated request)
SET request.headers.x-supermemory-organization = 'org-id-here';

-- This should return 0 rows for different org (blocked by RLS)
SELECT * FROM users
WHERE id != current_request_user()
  AND NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = users.id
      AND organization_id = current_request_org()
  );

-- Clear context
RESET request.headers.x-supermemory-organization;
```

## Impact on Application

### No Breaking Changes

The RLS policies are **additive only** - they restrict access but don't change:
- Query syntax
- API contracts
- Data structures (except processing_logs gets org_id column)
- Performance characteristics (only adds one column + index)

### Performance Notes

- ✅ org_id indexes created for faster RLS filtering
- ✅ No SELECT queries are slower (indexes help)
- ✅ INSERT/UPDATE/DELETE: Minimal overhead from policy checks

### Application Changes Needed

None required, but **recommended improvements** for defense-in-depth:

1. **Backend Verification** - Validate user belongs to organization before creating scoped client:

```typescript
// In requireAuth middleware or route handler
const isMember = await supabaseAdmin
  .from('organization_members')
  .select('id')
  .eq('organization_id', organizationId)
  .eq('user_id', userId)
  .single();

if (!isMember.data) {
  throw new Error('User is not a member of this organization');
}
```

2. **Error Handling** - RLS denials will return empty result sets, add logging:

```typescript
const { data, error } = await client
  .from('table_name')
  .select('*');

if (error?.code === 'PGRST116') {
  // RLS policy violation
  console.error('RLS policy denied access', { error });
}
```

## Security Architecture

### Defense Layers

1. **Backend Authentication** - Session-based auth with organization context
2. **Header Injection** - X-Supermemory-Organization header added by backend
3. **RLS Policies** - Database-level enforcement via PostgreSQL
4. **Foreign Keys** - Referential integrity constraints

### Data Flow

```
User Request
    ↓
[Backend Auth Middleware]
  ├─ Validate session
  ├─ Resolve organization
  └─ Inject X-Supermemory-Organization header
    ↓
[Supabase Client]
  └─ Create scoped client with header
    ↓
[PostgreSQL RLS]
  ├─ current_request_org() reads header
  ├─ Policies filter by org_id
  └─ Return only org's data
    ↓
Response to Client
```

## Rollback Plan

If needed to rollback:

```sql
-- Drop RLS policies (but keep RLS enabled for safety)
DROP POLICY IF EXISTS users_select_authenticated ON public.users;
DROP POLICY IF EXISTS sessions_select_authenticated ON public.sessions;
DROP POLICY IF EXISTS organization_settings_select_authenticated ON public.organization_settings;
DROP POLICY IF EXISTS memory_relationships_select_authenticated ON public.memory_relationships;
DROP POLICY IF EXISTS api_requests_select_authenticated ON public.api_requests;
DROP POLICY IF EXISTS processing_logs_select_authenticated ON public.processing_logs;
-- ... (and all UPDATE, DELETE, INSERT policies)

-- Remove org_id from processing_logs
ALTER TABLE public.processing_logs DROP COLUMN IF EXISTS org_id;
```

## Testing Recommendations

### Unit Tests

```typescript
// Test: User from Org A cannot read data from Org B
describe('Multi-tenant isolation', () => {
  it('blocks access to other org data via RLS', async () => {
    const client = createScopedSupabase('org-b-uuid', 'user-b-uuid');

    // Try to read data from org A
    const { data, error } = await client
      .from('documents')
      .select('*')
      .eq('org_id', 'org-a-uuid');

    expect(data).toEqual([]);
    expect(error).toBeFalsy(); // RLS returns empty, not error
  });
});
```

### Manual Testing

1. Create two organizations
2. Create users in each
3. Login as User A
4. Try to manually craft request with User B's organization ID
5. Verify RLS blocks access

## Monitoring

### Track RLS Violations

```sql
-- Query to detect RLS denials (empty results for valid queries)
-- Add to monitoring dashboard if possible

-- Example: Monitor processing_logs access
SELECT
  COUNT(*) as total_attempts,
  org_id,
  DATE_TRUNC('hour', created_at) as hour
FROM public.processing_logs
GROUP BY org_id, DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

## Documentation References

- **RLS Functions:** Defined in `0002_rls_policies.sql`
  - `current_request_org()` - Reads X-Supermemory-Organization header
  - `current_request_user()` - Reads X-Supermemory-User header

- **Header Injection:** `apps/api/src/supabase.ts`
  - createScopedSupabase() adds headers to all requests

- **Session Management:** `apps/api/src/session.ts`
  - Validates organization membership

## Support

If you encounter issues:

1. Verify RLS is enabled: `SELECT rowsecurity FROM pg_tables WHERE tablename = 'table_name'`
2. Check policies exist: `SELECT policyname FROM pg_policies WHERE tablename = 'table_name'`
3. Test header injection: Temporarily log headers in client creation
4. Check service role key: Verify SUPABASE_SERVICE_ROLE_KEY is correct for admin operations

## Timeline

- ✅ Code Review: Bug analysis and RLS gap identification
- ✅ Migration Creation: SQL migrations written and tested
- 🔄 **Next: Database Deployment** - Apply migrations to production
- 🔄 **Next: Verification** - Run tests and monitoring
- 🔄 **Next: Documentation** - Update deployment guides

---

**Status:** Ready for deployment
**Last Updated:** 2025-10-25
**Created By:** Claude Code
