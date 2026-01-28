# Quick Guide: Test Retry Mechanism

## Prerequisites
1. API server running: `cd apps/api && bun run dev`
2. Queue worker running: `cd apps/api && bun run dev:queue`
3. Redis running (check with: `echo "PING" | nc localhost 6379`)

## Run Test

```bash
./test-retry-mechanism.sh
```

## Watch Worker Logs

In the terminal running the queue worker, you should see:

```
[queue-worker] Processing job { attempt: 1 }
[queue-worker] Job failed { attempts: 1 }

[~2s delay]

[queue-worker] Processing job { attempt: 2 }
[queue-worker] Job failed { attempts: 2 }

[~4s delay]

[queue-worker] Processing job { attempt: 3 }
[queue-worker] Job failed { attempts: 3 }
[queue-worker] Document marked as failed
```

## Verify Results

Check document status:
```bash
# Replace {id} with document ID from test script output
curl http://localhost:3001/v3/documents/{id}/status | jq
```

Expected:
```json
{
  "status": "failed",
  "job": {
    "state": "failed",
    "attemptsMade": 3,
    "failedReason": "..."
  }
}
```

## Success Criteria
- ✅ 3 attempts visible in logs (attempt: 1, 2, 3)
- ✅ Delays of ~2s and ~4s between attempts
- ✅ Final status is "failed"
- ✅ Error stored in processing_metadata

## For More Details
See: `VERIFICATION-RETRY-MECHANISM.md`
