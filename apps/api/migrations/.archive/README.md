# Archived Migrations

This directory contains old/duplicate migration files that have been archived for reference.

## Archived Files

### Duplicate/Superseded Migrations

1. **0013_production_performance_optimization.sql** (Original)
   - Reason: Had invalid references (content_hash, documents_to_spaces, ALTER SYSTEM)
   - Superseded by: 0013_production_performance_optimization_final.sql
   - Date archived: 2025-11-16

2. **0013_production_performance_optimization_v2.sql** (Second attempt)
   - Reason: Used CONCURRENTLY in CREATE INDEX (not compatible with migrations)
   - Superseded by: 0013_production_performance_optimization_final.sql
   - Date archived: 2025-11-16

3. **0012_optimize_document_queries_simple.sql**
   - Reason: Duplicate of 0012_optimize_document_queries.sql
   - Already applied: Yes (main version)
   - Date archived: 2025-11-16

4. **0014_create_ingestion_jobs.sql**
   - Reason: ingestion_jobs table already exists in Supabase
   - Already applied: Yes (table exists via initial schema)
   - Date archived: 2025-11-16

## Migration History Summary

### Applied to Supabase (in order)
1. 0001_add_atomic_document_finalization.sql ✅
2. 0002_add_conversation_tables.sql ✅
3. 0003_add_sdk_session_id.sql ✅
4. 0004_normalize_document_status.sql ✅
5. 0009_add_stuck_document_timeout.sql ✅
6. 0010_add_missing_document_columns.sql ✅
7. 0011_fix_conversations_rls.sql ✅
8. 0012_optimize_document_queries.sql ✅
9. 0013_production_performance_optimization_final.sql ✅

### Current Active Migrations (apps/api/migrations/)
- 0001 through 0013 (final versions only)
- All synchronized with Supabase production

## Important Notes

- **DO NOT** delete these archived files - they're kept for reference
- **DO NOT** apply these migrations again - they're duplicates or superseded
- All active migrations are in `apps/api/migrations/`
- Supabase migration history is in the database table `supabase_migrations.schema_migrations`

## Verification

To verify current migrations in Supabase:
```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC;
```

Expected result: 9 migrations (0001-0004, 0009-0013)

---
Last updated: 2025-11-16
