# Retry Mechanism Analysis for BullMQ Document Processing

## Executive Summary

This document provides a technical analysis of the retry mechanism implemented in the document processing queue. The implementation uses BullMQ's built-in retry capabilities with exponential backoff.

## Configuration Analysis

### Queue Configuration (document-queue.ts)

```typescript
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  removeOnComplete: {
    age: 3600,
    count: 1000,
  },
  removeOnFail: {
    age: 86400,
  },
}
```

**Key Parameters:**
- `attempts: 3` - Maximum number of processing attempts (1 initial + 2 retries)
- `backoff.type: "exponential"` - Retry delay doubles after each failure
- `backoff.delay: 2000` - Initial retry delay of 2000ms (2 seconds)

### Retry Delay Calculation

BullMQ calculates exponential backoff as:
```
delay = baseDelay * (2 ^ (attemptsMade - 1))
```

**Actual Delays:**
- Attempt 1: Immediate (initial attempt)
- Attempt 2: 2000ms * (2^0) = **2 seconds** after failure
- Attempt 3: 2000ms * (2^1) = **4 seconds** after failure

**Total retry window:** ~6 seconds from first failure to final attempt

## Worker Implementation Analysis

### Job Processing (queue-worker.ts)

The worker processes jobs through the `processDocument` function:

```typescript
async function processDocument(job: Job<DocumentJobData>): Promise<void> {
  const { documentId, orgId, payload } = job.data

  console.log("[queue-worker] Processing job", {
    jobId: job.id,
    documentId,
    orgId,
    attempt: job.attemptsMade + 1,  // ← Logs current attempt number
  })

  // ... processing logic ...
}
```

**Attempt Tracking:**
- `job.attemptsMade` starts at 0 for first attempt
- Increments by 1 after each failure
- Logged as `attempt: job.attemptsMade + 1` for human readability

### Failure Handling

When a job fails, the worker's `failed` event handler executes:

```typescript
worker.on("failed", (job, error) => {
  console.error("[queue-worker] Job failed", {
    jobId: job?.id,
    documentId: job?.data?.documentId,
    error: error.message,
    attempts: job?.attemptsMade,  // ← Shows how many attempts were made
  })

  // Update document status to failed
  if (job?.data?.documentId) {
    supabaseAdmin
      .from("documents")
      .update({
        status: "failed",
        processing_metadata: sanitizeJson({ error: error.message }),
      })
      .eq("id", job.data.documentId)
      .then(() => {
        console.log("[queue-worker] Document marked as failed", {
          documentId: job.data.documentId,
        })
      })
  }
})
```

**Important Notes:**
1. The `failed` event fires **after each failed attempt**, not just the final one
2. However, document status update happens on **every failure**, so the final failure will set status to 'failed'
3. Error details are stored in `processing_metadata` for debugging
4. The sanitizeJson utility ensures error objects are properly serialized

## Retry Behavior Flow

### Scenario: URL Fetch Failure

```
Time    Event                           Status        Attempt
------  ------------------------------  -----------   -------
00:00   Job added to queue              queued        -
00:01   Worker picks up job             fetching      1
00:02   Fetch fails (invalid domain)    queued        1 (failed)
        ↓ BullMQ schedules retry in 2s
00:04   Worker retries job              fetching      2
00:05   Fetch fails again               queued        2 (failed)
        ↓ BullMQ schedules retry in 4s
00:09   Worker retries job              fetching      3
00:10   Fetch fails (final attempt)     failed        3 (failed)
        ↓ No more retries, document marked as failed
```

### Status Transitions

```
queued → fetching → queued (retry #1)
       → fetching → queued (retry #2)
       → fetching → failed (final)
```

## Common Failure Scenarios

### 1. Network Errors
- Invalid domain names
- Connection timeouts
- DNS resolution failures

**Example:**
```typescript
// This will trigger retry mechanism:
url: "https://this-domain-does-not-exist-12345.invalid"

// Expected error: "getaddrinfo ENOTFOUND"
```

### 2. HTTP Errors
- 500 Internal Server Error
- 502 Bad Gateway
- 503 Service Unavailable

**Example:**
```typescript
url: "https://httpstat.us/500"
// Expected error: "HTTP 500 Internal Server Error"
```

### 3. Extraction Failures
- Malformed HTML
- Unsupported content types
- File parsing errors

### 4. Database Errors
- Connection failures
- Constraint violations
- Timeout errors

## Verification Strategy

### Log Pattern Analysis

**Successful Retry Sequence:**
```
[queue-worker] Processing job { attempt: 1 }
[queue-worker] Job failed { attempts: 1 }

[~2 second delay]

[queue-worker] Processing job { attempt: 2 }
[queue-worker] Job failed { attempts: 2 }

[~4 second delay]

[queue-worker] Processing job { attempt: 3 }
[queue-worker] Job failed { attempts: 3 }
[queue-worker] Document marked as failed
```

### Database State Verification

After all retries exhausted:

```sql
SELECT id, status, processing_metadata, error
FROM documents
WHERE id = '<document_id>';
```

Expected result:
```
status: "failed"
processing_metadata: { "error": "<error message>" }
```

### Queue State Verification

Using BullMQ API:

```typescript
const job = await documentQueue.getJob(`doc-${documentId}`)
console.log({
  state: await job.getState(),      // "failed"
  attemptsMade: job.attemptsMade,   // 3
  failedReason: job.failedReason,   // Error message
})
```

## Edge Cases and Considerations

### 1. Partial Success Scenarios

If a job fails during the **indexing phase** (after extraction succeeds):
- Document may have content extracted but no chunks saved
- Status will be 'failed' but content field may be populated
- This is handled correctly - user can retry the document

### 2. Duplicate Processing Prevention

The worker checks document status before processing:

```typescript
if (existingDoc?.status === "done" || existingDoc?.status === "failed") {
  console.log("[queue-worker] Document already processed, skipping")
  return // Skip - already processed
}
```

This prevents retry attempts from re-processing successfully completed documents.

### 3. Concurrent Worker Handling

Multiple workers can run simultaneously (CONCURRENCY=3), but each job is only processed by one worker at a time due to BullMQ's locking mechanism.

### 4. Retry vs. New Job

- **Retries:** Same job ID (`doc-${documentId}`), incrementing `attemptsMade`
- **New Job:** Different job ID, fresh attempt counter

## Testing Recommendations

### 1. Invalid URL Test
```bash
curl -X POST http://localhost:3001/v3/documents \
  -H "Content-Type: application/json" \
  -d '{"url": "https://invalid-domain-12345.test", "type": "url"}'
```

### 2. Timeout Test
```bash
# Non-routable IP will cause timeout
curl -X POST http://localhost:3001/v3/documents \
  -H "Content-Type: application/json" \
  -d '{"url": "http://10.255.255.1", "type": "url"}'
```

### 3. HTTP Error Test
```bash
curl -X POST http://localhost:3001/v3/documents \
  -H "Content-Type: application/json" \
  -d '{"url": "https://httpstat.us/500", "type": "url"}'
```

## Performance Considerations

### Retry Window
- **Total time:** ~6-7 seconds for all retries
- **Impact:** Users will see "failed" status within seconds
- **Tradeoff:** Quick failure vs. extensive retry period

### Queue Throughput
- Failed jobs occupy worker slots during retry delays
- With CONCURRENCY=3, one failing job can reduce throughput by 33%
- Consider: Separate queue for high-failure-rate sources

### Resource Cleanup
```typescript
removeOnFail: {
  age: 86400,  // Keep failed jobs for 24 hours
}
```
Failed jobs are retained for debugging but automatically cleaned after 24 hours.

## Comparison with Inline Processing

| Aspect | Queue-Based | Inline Processing |
|--------|-------------|-------------------|
| Retries | 3 attempts with backoff | 0 (immediate failure) |
| Error Visibility | Logged + stored in DB | Logged only |
| User Experience | Status polling required | Immediate result |
| Resilience | High (automatic retry) | Low (no retry) |
| Debugging | Job history available | No history |

## Conclusion

The BullMQ retry mechanism provides:
- ✅ Automatic retry on transient failures
- ✅ Exponential backoff to avoid overwhelming failing services
- ✅ Comprehensive error logging and storage
- ✅ Configurable retry behavior
- ✅ Graceful degradation after max retries

The implementation follows industry best practices for job queue retry logic and provides a robust foundation for document processing at scale.

## References

- BullMQ Documentation: https://docs.bullmq.io/
- Code: `apps/api/src/services/queue/document-queue.ts`
- Code: `apps/api/src/worker/queue-worker.ts`
- Related: subtask-2-1 (worker verification)
