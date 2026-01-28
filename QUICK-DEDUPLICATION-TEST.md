# Quick Deduplication Test Guide

## 1-Minute Verification

### Prerequisites
```bash
# Ensure API is running
cd apps/api && bun run dev
```

### Test: Upload Same URL Twice

**Step 1: First upload**
```bash
curl -X POST http://localhost:3001/v3/documents \
  -H "Content-Type: application/json" \
  -d '{
    "content": "https://example.com/dedup-test",
    "type": "url",
    "containerTags": ["test"]
  }'
```

**Expected:** ✅ Status 201, document created
```json
{"id": "abc-123", "status": "processing"}
```

**Step 2: Duplicate upload (immediately)**
```bash
curl -X POST http://localhost:3001/v3/documents \
  -H "Content-Type: application/json" \
  -d '{
    "content": "https://example.com/dedup-test",
    "type": "url",
    "containerTags": ["test"]
  }'
```

**Expected:** ✅ Status 409, duplicate rejected
```json
{
  "code": "DUPLICATE_DOCUMENT",
  "message": "Este documento já existe na sua biblioteca. URL duplicada.",
  "existingDocumentId": "abc-123"
}
```

### Verify Queue (if Redis enabled)

```bash
curl http://localhost:3001/v3/queue/metrics
```

**Expected:** Only ONE job in queue
```json
{
  "waiting": 0,
  "active": 1,
  "completed": 0,
  "total": 1
}
```

---

## Automated Test

```bash
# Run full test suite
./test-job-deduplication.sh
```

**Expected output:**
```
✓ PASS: First document created successfully
✓ PASS: Duplicate detected and rejected
✓ PASS: BullMQ uses documentId as jobId
✓ PASS: Database-level duplicate detection implemented
✓ PASS: Race condition protection implemented

✓ All tests passed!
```

---

## What's Being Tested

1. **Database deduplication** - Same URL can't be added twice
2. **HTTP 409 response** - Proper error code returned
3. **Queue deduplication** - BullMQ uses `doc-{id}` as jobId
4. **Race condition handling** - Parallel requests handled correctly

---

## Implementation Details

### BullMQ Level
```typescript
// apps/api/src/services/queue/document-queue.ts
jobId: `doc-${documentId}`  // Ensures unique jobs
```

### Database Level
```typescript
// apps/api/src/routes/documents.ts
// Check for existing URL
const { data: urlDoc } = await client
  .from("documents")
  .select("id, status")
  .eq("url", url)
  .maybeSingle()

if (urlDoc && urlDoc.status === "done") {
  throw new Error("DUPLICATE_DOCUMENT")  // HTTP 409
}
```

---

## Troubleshooting

### Not getting HTTP 409?

**Check:**
1. Are you using the exact same URL?
2. Is the first document still processing?
3. Check API logs for errors

**Debug:**
```bash
# Check database for duplicates
psql -d kortix -c "SELECT id, url, status FROM documents WHERE url LIKE '%dedup-test%';"
```

### Multiple jobs in queue?

**This shouldn't happen!** BullMQ deduplication should prevent it.

**Verify:**
```bash
# Check code implementation
grep "jobId:" apps/api/src/services/queue/document-queue.ts
```

Should show:
```typescript
jobId: `doc-${documentId}`,
```

---

## Success Criteria

✅ First upload succeeds (201)
✅ Duplicate upload rejected (409)
✅ Only one job in queue
✅ Error message indicates duplicate
✅ Same document ID referenced in error

---

**Quick verification complete!** ✅
