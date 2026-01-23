# Manual Verification Guide - Document Ingestion Flow

This guide provides step-by-step instructions for manually verifying the document ingestion flow after implementing the database storage orchestration.

## Prerequisites

1. API service running locally
2. Supabase instance accessible
3. Valid authentication token
4. Database access (for direct verification)

## Setup

### 1. Start the API Service

```bash
cd apps/api
bun run dev
```

Expected output: API should start on port 3001 (or configured PORT)

### 2. Set Environment Variables

```bash
# Your authentication token (from sign-in response)
export AUTH_TOKEN="your_auth_token_here"

# Your organization ID
export ORG_ID="your_org_id_here"

# Your user ID
export USER_ID="your_user_id_here"

# API base URL
export API_URL="http://localhost:3001"
```

## Test Cases

### Test 1: Successful Text Document Creation

#### 1.1 Create Document via API

```bash
curl -X POST "${API_URL}/v3/documents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "X-Kortix-Organization: ${ORG_ID}" \
  -H "X-Kortix-User: ${USER_ID}" \
  -d '{
    "content": "This is a test document about artificial intelligence. AI is transforming the world by enabling machines to perform tasks that typically require human intelligence. Machine learning algorithms can learn from data and improve over time.",
    "containerTags": ["test-verification"],
    "metadata": {
      "type": "text",
      "source": "manual-verification",
      "testCase": "test-1-success"
    }
  }'
```

**Expected Response:**
- Status: 201 Created
- Body contains: `id`, `status: "queued"`, `title`, `url`, `created_at`

**Save the document ID:**
```bash
export DOC_ID="document_id_from_response"
```

#### 1.2 Verify Document Record Created

**Query Database:**
```sql
SELECT
  id,
  org_id,
  user_id,
  status,
  title,
  url,
  content,
  summary,
  tags,
  preview_image_url,
  created_at,
  updated_at,
  metadata
FROM documents
WHERE id = 'YOUR_DOCUMENT_ID';
```

**Expected Results:**
- ✓ Document row exists
- ✓ `status` = 'done' (after processing)
- ✓ `content` contains the text
- ✓ `summary` is populated
- ✓ `tags` array contains relevant keywords
- ✓ `metadata` includes processing info

#### 1.3 Verify Chunks Inserted with Embeddings

**Query Database:**
```sql
SELECT
  id,
  document_id,
  content,
  chunk_index,
  char_start,
  char_end,
  embedding,
  embedding_model,
  created_at
FROM document_chunks
WHERE document_id = 'YOUR_DOCUMENT_ID'
ORDER BY chunk_index;
```

**Expected Results:**
- ✓ Multiple chunk rows exist (at least 1)
- ✓ Each chunk has `embedding` (should be a vector, not null)
- ✓ Each chunk has `embedding_model` (e.g., 'text-embedding-3-small')
- ✓ `chunk_index` increments correctly (0, 1, 2, ...)
- ✓ `content` contains text from document
- ✓ `char_start` and `char_end` are set correctly

#### 1.4 Verify Status Progression

**Check Ingestion Job:**
```sql
SELECT
  id,
  document_id,
  status,
  error_message,
  completed_at,
  created_at,
  updated_at
FROM ingestion_jobs
WHERE document_id = 'YOUR_DOCUMENT_ID';
```

**Expected Results:**
- ✓ Job exists
- ✓ `status` = 'completed'
- ✓ `completed_at` is set
- ✓ `error_message` is null

#### 1.5 Verify Memory Created

**Query Database:**
```sql
SELECT
  id,
  org_id,
  user_id,
  content,
  type,
  source_document_id,
  tags,
  created_at
FROM memories
WHERE source_document_id = 'YOUR_DOCUMENT_ID'
AND type = 'auto-summary';
```

**Expected Results:**
- ✓ Memory row exists
- ✓ `type` = 'auto-summary'
- ✓ `content` contains document summary
- ✓ `source_document_id` matches document ID

---

### Test 2: Successful URL Document Creation

#### 2.1 Create URL Document

```bash
curl -X POST "${API_URL}/v3/documents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "X-Kortix-Organization: ${ORG_ID}" \
  -H "X-Kortix-User: ${USER_ID}" \
  -d '{
    "url": "https://en.wikipedia.org/wiki/Artificial_intelligence",
    "containerTags": ["test-verification"],
    "metadata": {
      "type": "url",
      "source": "manual-verification",
      "testCase": "test-2-url"
    }
  }'
```

**Expected Response:**
- Status: 201 Created
- Document with URL field populated

#### 2.2 Verify URL-Specific Fields

**Query Database:**
```sql
SELECT
  id,
  url,
  title,
  preview_image_url,
  status,
  metadata
FROM documents
WHERE url = 'https://en.wikipedia.org/wiki/Artificial_intelligence';
```

**Expected Results:**
- ✓ `url` field matches
- ✓ `title` extracted from page
- ✓ `preview_image_url` populated (if available)
- ✓ Status eventually becomes 'done'

---

### Test 3: Large Document (Many Chunks)

#### 3.1 Create Large Document

```bash
# Generate large text (repeat several times to create multiple chunks)
LARGE_TEXT=$(python3 -c "print('This is a test sentence about machine learning and artificial intelligence. ' * 500)")

curl -X POST "${API_URL}/v3/documents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "X-Kortix-Organization: ${ORG_ID}" \
  -H "X-Kortix-User: ${USER_ID}" \
  -d "{
    \"content\": \"${LARGE_TEXT}\",
    \"containerTags\": [\"test-verification\"],
    \"metadata\": {
      \"type\": \"text\",
      \"source\": \"manual-verification\",
      \"testCase\": \"test-3-large-doc\"
    }
  }"
```

#### 3.2 Verify Chunk Count

**Query Database:**
```sql
SELECT
  COUNT(*) as chunk_count,
  document_id
FROM document_chunks
WHERE document_id = 'YOUR_DOCUMENT_ID'
GROUP BY document_id;
```

**Expected Results:**
- ✓ Multiple chunks created (10+)
- ✓ All chunks have embeddings
- ✓ Document status is 'done'

---

### Test 4: Error Case - Invalid Content

#### 4.1 Attempt to Create Document with Invalid Content

```bash
curl -X POST "${API_URL}/v3/documents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTH_TOKEN}" \
  -H "X-Kortix-Organization: ${ORG_ID}" \
  -H "X-Kortix-User: ${USER_ID}" \
  -d '{
    "content": "",
    "containerTags": ["test-verification"],
    "metadata": {
      "type": "text",
      "testCase": "test-4-error"
    }
  }'
```

**Expected Response:**
- Status: 400 Bad Request
- Error message about invalid/empty content

#### 4.2 Verify No Partial Data

**Query Database:**
```sql
-- Should return 0 rows
SELECT COUNT(*)
FROM documents
WHERE metadata->>'testCase' = 'test-4-error';
```

**Expected Results:**
- ✓ No document created
- ✓ No chunks in database

---

### Test 5: Error Case - Processing Failure (Rollback Verification)

This test requires simulating a failure during processing. You can:

1. Temporarily modify code to throw error after chunk insertion
2. Monitor database to verify rollback behavior

#### 5.1 Check Rollback Behavior

**Simulate by directly calling storage helper with invalid data:**

```typescript
// In a test script or via API debug endpoint
import { storeCompleteDocument } from './services/orchestration/database-storage'
import { Logger } from './services/base/logger'

const logger = new Logger('test')

try {
  await storeCompleteDocument({
    documentId: 'test-rollback-123',
    organizationId: ORG_ID,
    userId: USER_ID,
    url: null,
    title: 'Test Rollback',
    content: 'Test content',
    processed: {
      content: 'Test content',
      chunks: [
        {
          content: 'Chunk 1',
          embedding: [/* valid embedding */],
          char_start: 0,
          char_end: 10
        }
      ],
      summary: 'Test summary',
      tags: ['test'],
      metadata: {}
    },
    preview: null,
    metadata: {},
    raw: null
  }, logger)
} catch (error) {
  console.log('Error caught:', error)
}
```

**Verify Rollback:**
```sql
-- Should return 0 rows (chunks deleted on rollback)
SELECT COUNT(*)
FROM document_chunks
WHERE document_id = 'test-rollback-123';

-- Document should not exist or have failed status
SELECT status
FROM documents
WHERE id = 'test-rollback-123';
```

**Expected Results:**
- ✓ If chunks stored but document update fails, chunks are deleted
- ✓ No partial data left in database
- ✓ Error logged with context

---

### Test 6: Concurrent Document Creation

#### 6.1 Create Multiple Documents Simultaneously

```bash
# Launch 5 document creations in parallel
for i in {1..5}; do
  curl -X POST "${API_URL}/v3/documents" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "X-Kortix-Organization: ${ORG_ID}" \
    -H "X-Kortix-User: ${USER_ID}" \
    -d "{
      \"content\": \"Concurrent test document ${i} with content about machine learning and AI.\",
      \"containerTags\": [\"test-concurrent\"],
      \"metadata\": {
        \"type\": \"text\",
        \"testCase\": \"test-6-concurrent\",
        \"index\": ${i}
      }
    }" &
done

wait
```

#### 6.2 Verify All Documents Processed

**Query Database:**
```sql
SELECT
  id,
  status,
  title,
  metadata->>'index' as test_index
FROM documents
WHERE metadata->>'testCase' = 'test-6-concurrent'
ORDER BY (metadata->>'index')::int;
```

**Expected Results:**
- ✓ All 5 documents created
- ✓ All reach 'done' status
- ✓ No documents in 'failed' status
- ✓ Each has chunks with embeddings

---

## Verification Checklist

After running all tests, confirm:

- [ ] **Test 1 (Success):** Text document created, chunks stored, status 'done'
- [ ] **Test 2 (URL):** URL document processed with metadata extracted
- [ ] **Test 3 (Large):** Multiple chunks created and embedded correctly
- [ ] **Test 4 (Invalid):** API rejects invalid input, no partial data
- [ ] **Test 5 (Rollback):** Failed processing rolls back chunks correctly
- [ ] **Test 6 (Concurrent):** Multiple documents process without conflicts

### Database Integrity Checks

```sql
-- 1. All documents have matching chunks
SELECT
  d.id,
  d.status,
  COUNT(dc.id) as chunk_count
FROM documents d
LEFT JOIN document_chunks dc ON d.id = dc.document_id
WHERE d.metadata->>'source' = 'manual-verification'
GROUP BY d.id, d.status
HAVING COUNT(dc.id) = 0 AND d.status = 'done';
-- Should return 0 rows (no done documents without chunks)

-- 2. All chunks have embeddings
SELECT COUNT(*)
FROM document_chunks dc
JOIN documents d ON dc.document_id = d.id
WHERE d.metadata->>'source' = 'manual-verification'
AND (dc.embedding IS NULL OR dc.embedding_model IS NULL);
-- Should return 0 (all chunks have embeddings)

-- 3. All completed jobs have documents in 'done' status
SELECT
  ij.id,
  ij.document_id,
  ij.status as job_status,
  d.status as doc_status
FROM ingestion_jobs ij
JOIN documents d ON ij.document_id = d.id
WHERE d.metadata->>'source' = 'manual-verification'
AND ij.status = 'completed'
AND d.status != 'done';
-- Should return 0 rows (completed jobs = done documents)
```

---

## Cleanup

After verification, clean up test data:

```sql
-- Delete test documents and related data
DELETE FROM document_chunks
WHERE document_id IN (
  SELECT id FROM documents
  WHERE metadata->>'source' = 'manual-verification'
);

DELETE FROM memories
WHERE source_document_id IN (
  SELECT id FROM documents
  WHERE metadata->>'source' = 'manual-verification'
);

DELETE FROM ingestion_jobs
WHERE document_id IN (
  SELECT id FROM documents
  WHERE metadata->>'source' = 'manual-verification'
);

DELETE FROM documents
WHERE metadata->>'source' = 'manual-verification';
```

---

## Success Criteria

All tests pass when:

1. ✅ Documents are created successfully via API
2. ✅ Document records stored with correct status progression
3. ✅ Chunks inserted with valid embeddings
4. ✅ Status transitions: queued → processing → done
5. ✅ Memories created for completed documents
6. ✅ Error cases handled gracefully without partial data
7. ✅ Rollback behavior works correctly on failures
8. ✅ Concurrent requests process without conflicts
9. ✅ No orphaned chunks or incomplete records in database

If all criteria are met, the database storage orchestration is working correctly! ✅
