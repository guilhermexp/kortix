# Database Migrations

This directory contains SQL migration files for the Supermemory API.

## Applying Migrations

### Migration 0001: Atomic Document Finalization

**File**: `0001_add_atomic_document_finalization.sql`

**Purpose**: Adds a PostgreSQL stored procedure to ensure atomic document finalization operations.

**What it fixes**: Prevents race conditions where:
- Document status is marked as "done" but memory creation fails
- Chunks are inserted but document update fails
- Partial data is written leaving inconsistent state

**To apply this migration**:

```bash
# Using psql directly
psql $SUPABASE_DATABASE_URL -f migrations/0001_add_atomic_document_finalization.sql

# Or using Supabase CLI
supabase db push migrations/0001_add_atomic_document_finalization.sql
```

**Verification**:

```sql
-- Check if function exists
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'finalize_document_atomic';

-- Test the function (replace UUIDs with actual values from your database)
SELECT finalize_document_atomic(
  'document-id-here'::uuid,
  '{"status": "done", "title": "Test"}'::jsonb,
  '{"space_id": "space-id-here", "org_id": "org-id-here", "user_id": "user-id-here", "content": "Test content"}'::jsonb
);
```

## Migration Dependencies

- **PostgreSQL**: 12+
- **Extensions**: `pgvector` (for vector embedding support)
- **Permissions**: `service_role` or database owner

## Rollback

If you need to rollback the migration:

```sql
DROP FUNCTION IF EXISTS finalize_document_atomic(UUID, JSONB, JSONB);
```

Note: This will cause the ingestion service to fail until you revert the code changes in `src/services/ingestion.ts`.

## Development Notes

### Transaction Safety

The stored procedure uses PostgreSQL's implicit transaction handling. Each function call runs in its own transaction and will automatically rollback if any operation fails.

### Error Handling

- If document update fails: entire transaction rolls back
- If memory insertion fails: entire transaction rolls back
- No partial state is persisted

### Performance Considerations

- The function executes in ~10-50ms for typical documents
- Uses single roundtrip instead of 2 separate queries
- Reduces network latency and improves consistency
