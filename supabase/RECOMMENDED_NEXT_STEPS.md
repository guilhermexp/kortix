# Recommended Next Steps - Post Schema Sync
**Date**: 2025-11-16
**Priority**: Action Items for Production Optimization

---

## 🔴 Critical - Do Immediately

### 1. Schedule Materialized View Refresh
**Why**: The `mv_org_document_stats` materialized view needs regular refreshes to stay current.

**Action**: Set up pg_cron job in Supabase Dashboard

**Steps**:
1. Go to Supabase Dashboard → Database → Cron Jobs
2. Click "Create New Cron Job"
3. Add the following:

```sql
-- Name: refresh-org-document-stats
-- Schedule: */5 * * * * (Every 5 minutes)
-- SQL:
SELECT refresh_org_document_stats();
```

**Verification**:
```sql
-- Check cron jobs
SELECT * FROM cron.job;

-- Check last execution
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh-org-document-stats')
ORDER BY runid DESC
LIMIT 5;
```

---

## 🟡 High Priority - Do Within 24 Hours

### 2. Enable pg_stat_statements Extension
**Why**: Track query performance and identify slow queries

**Action**:
```sql
-- Enable extension (run in Supabase SQL Editor)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Grant access
GRANT SELECT ON pg_stat_statements TO authenticated;
```

**Verification**:
```sql
-- View top 10 slowest queries
SELECT
    substring(query, 1, 100) as query_preview,
    calls,
    total_time,
    mean_time,
    max_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_time DESC
LIMIT 10;
```

### 3. Set Up Index Monitoring Alert
**Why**: Detect unused indexes that waste space

**Action**: Create monitoring query to run weekly

```sql
-- Save this query and run weekly
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    idx_scan as times_used
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexrelname NOT LIKE 'pg_toast%'
  AND pg_relation_size(indexrelid) > 100000 -- Only show indexes > 100KB
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

## 🟢 Medium Priority - Do Within 1 Week

### 4. Configure Connection Pooling
**Why**: Prevent connection exhaustion under load

**Action**: Update Supabase connection settings
- Go to Project Settings → Database
- Set:
  - **Pool Mode**: Transaction
  - **Pool Size**: 15-20 (adjust based on traffic)
  - **Statement Timeout**: 30000ms (30 seconds)

### 5. Enable Query Performance Insights
**Why**: Monitor database performance trends

**Action**:
```sql
-- Configure statement logging
ALTER DATABASE postgres SET log_min_duration_statement = '1000'; -- Log queries > 1s
ALTER DATABASE postgres SET log_statement = 'ddl'; -- Log schema changes
```

### 6. Set Up Table Bloat Monitoring
**Why**: Detect when tables need manual vacuum

**Action**: Create monitoring query

```sql
-- Check table bloat (run monthly)
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as size,
    n_live_tup as live_tuples,
    n_dead_tup as dead_tuples,
    CASE
        WHEN n_live_tup > 0
        THEN round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 2)
        ELSE 0
    END as dead_tuple_percent,
    last_autovacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;
```

**Alert if dead_tuple_percent > 20%**

---

## 🔵 Low Priority - Do Within 1 Month

### 7. Implement Automated Statistics Update
**Why**: Keep query planner statistics fresh

**Action**: Set up weekly ANALYZE cron job

```sql
-- Name: update-table-statistics
-- Schedule: 0 3 * * 0 (Sunday 3 AM)
-- SQL:
ANALYZE;
```

### 8. Create Backup Verification Job
**Why**: Ensure backups are working

**Action**: Verify Supabase automatic backups
1. Go to Supabase Dashboard → Settings → Backup
2. Verify backup schedule is enabled
3. Test point-in-time recovery capability

### 9. Document Schema Changes
**Why**: Track evolution of database schema

**Action**: Update schema documentation after each migration
- Location: `supabase/SCHEMA_CHANGELOG.md`
- Include: Migration number, date, purpose, impact

---

## Performance Baseline Metrics

### Before Optimization (Estimated)
- Document list query: 200-500ms
- Memory retrieval: 150-300ms
- Job queue query: 100-250ms
- Org stats query: 500-1000ms

### After Optimization (Expected)
- Document list query: 20-50ms (90% improvement)
- Memory retrieval: 50-100ms (70% improvement)
- Job queue query: 20-40ms (85% improvement)
- Org stats query: 1-5ms (99% improvement via materialized view)

### How to Verify
```sql
-- Test document query performance
EXPLAIN ANALYZE
SELECT * FROM documents
WHERE org_id = 'YOUR_ORG_ID'
  AND status = 'done'
ORDER BY created_at DESC
LIMIT 20;

-- Test materialized view performance
EXPLAIN ANALYZE
SELECT * FROM mv_org_document_stats
WHERE org_id = 'YOUR_ORG_ID';
```

---

## Monitoring Dashboard Queries

### 1. Index Health Check
```sql
SELECT
    schemaname,
    tablename,
    COUNT(*) as index_count,
    SUM(pg_relation_size(indexrelid)) as total_index_size,
    pg_size_pretty(SUM(pg_relation_size(indexrelid))) as size_pretty
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY total_index_size DESC;
```

### 2. Query Performance Summary
```sql
SELECT
    'Total Queries' as metric,
    SUM(calls)::TEXT as value
FROM pg_stat_statements
UNION ALL
SELECT
    'Slow Queries (>1s)' as metric,
    COUNT(*)::TEXT as value
FROM pg_stat_statements
WHERE mean_time > 1000
UNION ALL
SELECT
    'Average Query Time' as metric,
    ROUND(AVG(mean_time), 2)::TEXT || 'ms' as value
FROM pg_stat_statements;
```

### 3. Autovacuum Activity
```sql
SELECT
    schemaname,
    tablename,
    last_autovacuum,
    autovacuum_count,
    last_autoanalyze,
    autoanalyze_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY last_autovacuum DESC NULLS LAST;
```

### 4. Connection Pool Usage
```sql
SELECT
    COUNT(*) as total_connections,
    COUNT(*) FILTER (WHERE state = 'active') as active_connections,
    COUNT(*) FILTER (WHERE state = 'idle') as idle_connections,
    COUNT(*) FILTER (WHERE wait_event IS NOT NULL) as waiting_connections
FROM pg_stat_activity
WHERE datname = current_database();
```

---

## Cron Jobs Summary

Recommended cron jobs to set up:

| Job Name | Schedule | Purpose | SQL |
|----------|----------|---------|-----|
| refresh-org-document-stats | Every 5 min | Refresh materialized view | `SELECT refresh_org_document_stats();` |
| update-table-statistics | Weekly (Sun 3AM) | Update query planner stats | `ANALYZE;` |
| cleanup-old-events | Daily (2AM) | Remove events >90 days | `DELETE FROM events WHERE created_at < NOW() - INTERVAL '90 days';` |
| vacuum-analyze | Weekly (Sun 4AM) | Manual maintenance | `VACUUM ANALYZE;` |

---

## Production Deployment Checklist

Before deploying to production:

### Database
- [x] All migrations applied successfully
- [ ] Materialized view refresh cron job configured
- [ ] pg_stat_statements extension enabled
- [ ] Connection pooling configured
- [ ] Backup schedule verified
- [ ] Performance baseline established

### Application
- [ ] API connection pool settings updated
- [ ] Query timeout settings configured
- [ ] Error logging enabled
- [ ] Performance monitoring active

### Monitoring
- [ ] Slow query alerts configured
- [ ] Index usage monitoring active
- [ ] Table bloat monitoring scheduled
- [ ] Connection pool monitoring enabled

---

## Rollback Plan

If performance degrades after deployment:

### Step 1: Identify Issue
```sql
-- Check for blocking queries
SELECT pid, query, state, wait_event, wait_event_type
FROM pg_stat_activity
WHERE state = 'active' AND wait_event IS NOT NULL;

-- Check for long-running queries
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC;
```

### Step 2: Quick Fixes
```sql
-- Kill problematic query
SELECT pg_terminate_backend(PID);

-- Refresh materialized view if stale
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_org_document_stats;

-- Update statistics
ANALYZE;
```

### Step 3: Rollback Migration (if needed)
```sql
-- Drop new indexes
DROP INDEX IF EXISTS idx_documents_org_status_created;
DROP INDEX IF EXISTS idx_documents_org_status_updated;
DROP INDEX IF EXISTS idx_memories_document_created;
DROP INDEX IF EXISTS idx_spaces_container_tag_id;
DROP INDEX IF EXISTS idx_ingestion_jobs_status_created;
DROP INDEX IF EXISTS idx_conversations_org_user;
DROP INDEX IF EXISTS idx_events_conversation_created;

-- Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS mv_org_document_stats CASCADE;

-- Reset autovacuum settings
ALTER TABLE documents RESET (autovacuum_vacuum_scale_factor);
ALTER TABLE memories RESET (autovacuum_vacuum_scale_factor);
ALTER TABLE ingestion_jobs RESET (autovacuum_vacuum_scale_factor);
ALTER TABLE events RESET (autovacuum_vacuum_scale_factor);

-- Remove from migrations
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20251116220935';
```

---

## Support & Resources

### Internal Documentation
- Schema Sync Report: `supabase/SCHEMA_SYNC_REPORT_2025-11-16.md`
- Management Guide: `supabase/SCHEMA_MANAGEMENT_GUIDE.md`
- Migration Files: `apps/api/migrations/`

### External Resources
- [Supabase Performance Guide](https://supabase.com/docs/guides/database/postgres-performance)
- [PostgreSQL Index Documentation](https://www.postgresql.org/docs/current/indexes.html)
- [Materialized Views Best Practices](https://www.postgresql.org/docs/current/rules-materializedviews.html)

### Getting Help
1. Check Supabase Dashboard logs
2. Review PostgreSQL documentation
3. Check `pg_stat_statements` for slow queries
4. Review internal documentation
5. Contact support if needed

---

**Status**: Ready for Production ✅
**Next Review**: 2025-11-23 (1 week)
**Owner**: Development Team
