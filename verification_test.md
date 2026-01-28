# Manual Verification for search_by_metadata RPC Function

## Function Overview
The `search_by_metadata` function provides fast metadata-based search with hybrid ranking capabilities.

## Key Features
1. **JSONB Containment Queries**: Uses GIN index on `metadata` column for fast containment queries (@>)
2. **Full-Text Search**: Uses FTS index on `metadata_search_terms` generated column
3. **Hybrid Scoring**: Combines both scoring methods when both filters are applied
4. **Flexible Parameters**: All parameters have defaults, allowing various search patterns

## Function Signature
```sql
search_by_metadata(
    metadata_filter jsonb DEFAULT NULL,
    org_id_param uuid DEFAULT NULL,
    text_query text DEFAULT NULL,
    limit_param int DEFAULT 50
)
```

## Test Cases

### 1. Search by Tags (JSONB Containment)
```sql
SELECT * FROM search_by_metadata(
    '{"tags": ["important", "review"]}'::jsonb,
    'your-org-uuid'::uuid,
    NULL,
    50
);
```
**Expected**: Returns documents with metadata containing the specified tags, ranked by match.

### 2. Search by Properties (JSONB Containment)
```sql
SELECT * FROM search_by_metadata(
    '{"properties": {"status": "approved"}}'::jsonb,
    'your-org-uuid'::uuid,
    NULL,
    50
);
```
**Expected**: Returns documents with the specified property in metadata.

### 3. Full-Text Search in Metadata
```sql
SELECT * FROM search_by_metadata(
    NULL,
    'your-org-uuid'::uuid,
    'urgent priority',
    50
);
```
**Expected**: Returns documents where metadata_search_terms match the text query, ranked by ts_rank.

### 4. Hybrid Search (JSONB + Full-Text)
```sql
SELECT * FROM search_by_metadata(
    '{"tags": ["project"]}'::jsonb,
    'your-org-uuid'::uuid,
    'frontend development',
    50
);
```
**Expected**: Returns documents matching both filters, with combined rank score (JSONB match + FTS rank).

### 5. Organization-Wide Search
```sql
SELECT * FROM search_by_metadata(
    NULL,
    NULL,
    'deployment',
    100
);
```
**Expected**: Returns documents across all organizations matching the text query.

## Verification Checklist

- [x] Function uses GIN indexes for JSONB containment queries
- [x] Function uses FTS index on metadata_search_terms
- [x] Hybrid scoring implemented correctly
- [x] Follows pattern from reference file (supabase-functions.sql)
- [x] Returns TABLE with appropriate columns including rank_score
- [x] Uses LANGUAGE plpgsql STABLE
- [x] Includes proper WHERE clause filtering
- [x] Orders by rank_score DESC
- [x] Applies LIMIT correctly
- [x] Grants proper permissions (service_role, authenticated)
- [x] Includes documentation comments
- [x] Error handling for missing parameters
- [x] No debugging statements or console.log

## Ranking Logic

1. **Metadata-only**: Binary score (1.0 for match, 0.0 for no match)
2. **Text-only**: ts_rank score from full-text search
3. **Hybrid**: Sum of JSONB match (1.0/0.0) + ts_rank score

Results are ordered by rank_score DESC, then created_at DESC for tie-breaking.

## Performance Considerations

- Uses GIN index `idx_documents_metadata_gin` for JSONB queries
- Uses FTS index `idx_documents_metadata_search_terms` for text queries
- Composite index `idx_documents_org_metadata` optimizes org_id filtering with metadata
- All queries are index-backed for fast performance
