# Supabase Schema Management Guide
**Project**: Supermemory
**Last Updated**: 2025-11-16

---

## Quick Reference

### Sync Schema from Local to Supabase
```bash
# 1. Check current Supabase migrations
bun run supabase:list-migrations

# 2. Create new migration locally
bun run supabase:new-migration <migration_name>

# 3. Apply migration to Supabase
bun run supabase:apply-migration <migration_file>

# 4. Verify migration applied
bun run supabase:list-migrations
```

### Using MCP Tools (Preferred Method)

```typescript
// List remote migrations
mcp__supabase__list_migrations()

// List tables in schema
mcp__supabase__list_tables({ schemas: ["public"] })

// Execute SQL directly
mcp__supabase__execute_sql({ query: "SELECT * FROM migrations" })

// Apply migration
mcp__supabase__apply_migration({
  name: "migration_name",
  query: "SQL content here"
})
```

---

## Migration Best Practices

### 1. Migration File Naming Convention
```
<number>_<descriptive_name>.sql

Examples:
0013_production_performance_optimization.sql
0014_create_ingestion_jobs.sql
0015_add_user_preferences.sql
```

### 2. Migration Structure Template
```sql
-- Migration: <Title>
-- Date: YYYY-MM-DD
-- Purpose: <Brief description>
-- Expected impact: <Performance/feature impact>

-- ============================================================================
-- PART 1: Schema Changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS table_name (...);
ALTER TABLE existing_table ADD COLUMN IF NOT EXISTS new_column TYPE;

-- ============================================================================
-- PART 2: Indexes
-- ============================================================================

-- Use IF NOT EXISTS for idempotency
CREATE INDEX IF NOT EXISTS idx_name ON table(column);

-- ============================================================================
-- PART 3: Data Migration (if needed)
-- ============================================================================

UPDATE table SET column = value WHERE condition;

-- ============================================================================
-- PART 4: Cleanup
-- ============================================================================

DROP INDEX IF EXISTS old_index;
```

### 3. Index Creation Rules

**DO**:
```sql
-- In migrations (transaction-safe)
CREATE INDEX IF NOT EXISTS idx_name ON table(column);
```

**DON'T**:
```sql
-- In migrations (will fail in transaction)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON table(column);
```

**For Production (outside migrations)**:
```sql
-- Run directly via Supabase SQL editor
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_name ON table(column);
```

### 4. Validation Checklist

Before applying migration:
- [ ] Test on local Supabase instance
- [ ] Check for syntax errors
- [ ] Verify no `CREATE INDEX CONCURRENTLY` in migration files
- [ ] Avoid `ALTER SYSTEM` commands (use Supabase dashboard)
- [ ] Include rollback instructions in comments
- [ ] Test with production-like data volume

---

## Common Operations

### Add New Table
```sql
CREATE TABLE IF NOT EXISTS table_name (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Always add indexes
CREATE INDEX IF NOT EXISTS idx_table_org_id ON table_name(org_id);
```

### Add New Column
```sql
-- Add column
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS new_column TEXT;

-- Add index if needed
CREATE INDEX IF NOT EXISTS idx_documents_new_column
ON documents(new_column)
WHERE new_column IS NOT NULL;

-- Update statistics
ANALYZE documents;
```

### Create Materialized View
```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_view_name AS
SELECT
    column1,
    COUNT(*) as count_total
FROM source_table
GROUP BY column1;

-- Add unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_view_name_column1
ON mv_view_name(column1);

-- Create refresh function
CREATE OR REPLACE FUNCTION refresh_view_name()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_view_name;
END;
$$;
```

### Optimize Table Performance
```sql
-- Add autovacuum tuning
ALTER TABLE high_traffic_table
SET (autovacuum_vacuum_scale_factor = 0.1);

-- Update statistics
ANALYZE high_traffic_table;

-- Check bloat
SELECT
    schemaname,
    tablename,
    n_dead_tup,
    last_autovacuum
FROM pg_stat_user_tables
WHERE tablename = 'high_traffic_table';
```

---

## Monitoring & Maintenance

### Check Migration Status
```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC;
```

### Monitor Index Usage
```sql
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan > 0
ORDER BY idx_scan DESC
LIMIT 20;
```

### Find Unused Indexes
```sql
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexrelname NOT LIKE 'pg_toast%'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Check Table Sizes
```sql
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Refresh Materialized Views
```sql
-- Check last refresh time
SELECT
    matviewname,
    ispopulated,
    last_refresh
FROM pg_matviews
WHERE schemaname = 'public';

-- Manual refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_org_document_stats;

-- Or use function
SELECT refresh_org_document_stats();
```

---

## Troubleshooting

### Migration Failed to Apply
1. Check error message for specific issue
2. Verify SQL syntax
3. Check for missing dependencies (tables, columns)
4. Ensure idempotency (IF NOT EXISTS)
5. Test locally first

### Index Not Being Used
```sql
-- Check query plan
EXPLAIN ANALYZE
SELECT * FROM table
WHERE column = 'value';

-- If index not used, check:
-- 1. Index exists
SELECT * FROM pg_indexes WHERE indexname = 'idx_name';

-- 2. Statistics are updated
ANALYZE table;

-- 3. Index selectivity
SELECT
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats
WHERE tablename = 'table' AND attname = 'column';
```

### Slow Queries After Migration
```sql
-- Find slow queries
SELECT
    query,
    calls,
    total_time,
    mean_time,
    max_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_time DESC
LIMIT 10;

-- Update statistics
ANALYZE;

-- Consider adding indexes for frequently filtered columns
```

### Materialized View Out of Date
```sql
-- Check staleness
SELECT
    matviewname,
    last_refresh,
    NOW() - last_refresh as age
FROM pg_matviews
WHERE schemaname = 'public';

-- Refresh manually
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_view_name;

-- Set up cron job (Supabase Dashboard > Database > Cron Jobs)
```

---

## Rollback Procedures

### Rollback Migration
```sql
-- If migration added table
DROP TABLE IF EXISTS table_name CASCADE;

-- If migration added column
ALTER TABLE table_name DROP COLUMN IF EXISTS column_name;

-- If migration added index
DROP INDEX IF EXISTS idx_name;

-- If migration added materialized view
DROP MATERIALIZED VIEW IF EXISTS mv_view_name CASCADE;
```

### Emergency Rollback
```bash
# 1. Identify bad migration version
SELECT version FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 5;

# 2. Manually remove from migrations table
DELETE FROM supabase_migrations.schema_migrations
WHERE version = 'BAD_VERSION';

# 3. Run rollback SQL
-- Execute rollback commands
```

---

## Performance Optimization Checklist

### Before Optimization
- [ ] Identify slow queries via `pg_stat_statements`
- [ ] Check current index usage
- [ ] Measure baseline performance
- [ ] Review query patterns

### Optimization Steps
- [ ] Add appropriate indexes
- [ ] Create materialized views for expensive aggregations
- [ ] Tune autovacuum settings
- [ ] Update table statistics
- [ ] Consider partitioning for large tables

### After Optimization
- [ ] Verify indexes are being used
- [ ] Measure performance improvement
- [ ] Monitor index overhead
- [ ] Schedule materialized view refreshes
- [ ] Document changes

---

## Cron Job Setup (Supabase Dashboard)

### Refresh Materialized Views
```sql
-- Every 5 minutes
SELECT cron.schedule(
    'refresh-org-stats',
    '*/5 * * * *',
    'SELECT refresh_org_document_stats();'
);
```

### Cleanup Old Records
```sql
-- Daily at 2 AM
SELECT cron.schedule(
    'cleanup-old-events',
    '0 2 * * *',
    'DELETE FROM events WHERE created_at < NOW() - INTERVAL ''90 days'';'
);
```

### Update Statistics
```sql
-- Weekly on Sunday at 3 AM
SELECT cron.schedule(
    'update-statistics',
    '0 3 * * 0',
    'ANALYZE;'
);
```

---

## Resources

### Supabase Documentation
- [Database Migrations](https://supabase.com/docs/guides/database/migrations)
- [PostgreSQL Performance](https://supabase.com/docs/guides/database/postgres-performance)
- [Indexes](https://supabase.com/docs/guides/database/indexes)

### Internal Documentation
- Schema sync report: `supabase/SCHEMA_SYNC_REPORT_2025-11-16.md`
- Migration files: `apps/api/migrations/`
- Initial schema: `supabase/migrations/00000000000000_initial_schema.sql`

### Useful PostgreSQL Commands
```sql
-- Connection info
SELECT * FROM pg_stat_activity;

-- Database size
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Active queries
SELECT pid, query, state, wait_event
FROM pg_stat_activity
WHERE state = 'active';

-- Lock information
SELECT * FROM pg_locks
WHERE NOT granted;
```

---

**Last Updated**: 2025-11-16
**Maintained By**: Development Team
**Next Review**: 2025-12-16
