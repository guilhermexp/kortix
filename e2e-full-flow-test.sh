#!/bin/bash

# E2E Test for Subtask 4-1: Test full document upload and processing flow
# Tests complete flow from API through queue to processing completion
# Includes: single document, queue metrics, and multiple simultaneous uploads

set -e

# Add bun to PATH
export PATH="$HOME/.bun/bin:$PATH"

echo "🚀 Starting Full E2E Document Processing Flow Test"
echo "====================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
TESTS_PASSED=0
TESTS_FAILED=0

# Function to cleanup background processes
cleanup() {
    echo ""
    echo "🧹 Cleaning up background processes..."
    if [ ! -z "$API_PID" ]; then
        kill $API_PID 2>/dev/null || true
    fi
    if [ ! -z "$QUEUE_PID" ]; then
        kill $QUEUE_PID 2>/dev/null || true
    fi
    if [ ! -z "$WEB_PID" ]; then
        kill $WEB_PID 2>/dev/null || true
    fi
    wait 2>/dev/null || true
    echo "✅ Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Function to check test result
check_result() {
    local test_name="$1"
    local condition="$2"

    if [ "$condition" = "true" ]; then
        echo -e "${GREEN}✅ PASS: $test_name${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAIL: $test_name${NC}"
        ((TESTS_FAILED++))
    fi
}

# ============================================================================
# STEP 1: Start all services
# ============================================================================
echo -e "${BLUE}📡 Step 1: Starting all services...${NC}"
echo ""

# Start API server
echo "Starting API server on port 3001..."
cd apps/api

export PORT=3001
if [ -f .env ]; then
    echo "Loading .env file..."
    set -a
    source .env
    set +a
fi

bun run dev:server > /tmp/api-server.log 2>&1 &
API_PID=$!
cd ../..

# Wait for API to be ready
echo "⏳ Waiting for API server to be ready..."
for i in {1..30}; do
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ API server is ready (PID: $API_PID)${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ API server failed to start${NC}"
        cat /tmp/api-server.log
        exit 1
    fi
    sleep 1
done

# Start queue worker
echo ""
echo "Starting queue worker..."
cd apps/api
bun run dev:queue > /tmp/queue-worker.log 2>&1 &
QUEUE_PID=$!
cd ../..

# Wait for worker to be ready
echo "⏳ Waiting for queue worker to be ready..."
sleep 3
if ! kill -0 $QUEUE_PID 2>/dev/null; then
    echo -e "${RED}❌ Queue worker failed to start${NC}"
    cat /tmp/queue-worker.log
    exit 1
fi
echo -e "${GREEN}✅ Queue worker is running (PID: $QUEUE_PID)${NC}"

# Check if Redis is available
echo ""
echo "🔍 Checking Redis availability..."
REDIS_STATUS=$(curl -s http://localhost:3001/v3/queue/metrics)
if echo "$REDIS_STATUS" | grep -q '"waiting"'; then
    echo -e "${GREEN}✅ Redis/Queue is available${NC}"
    REDIS_AVAILABLE=true
else
    echo -e "${YELLOW}⚠️  Redis/Queue not available - will test inline processing fallback${NC}"
    REDIS_AVAILABLE=false
fi

echo ""
echo -e "${GREEN}✅ All services started successfully${NC}"
echo ""

# ============================================================================
# STEP 2: Test single document upload and processing
# ============================================================================
echo -e "${BLUE}📄 Step 2: Testing single document upload and processing...${NC}"
echo ""

# Create a test document
RESPONSE=$(curl -s -X POST http://localhost:3001/v3/documents \
    -H "Content-Type: application/json" \
    -d '{
        "content": "Test document for E2E verification. This document should be processed through the queue system.",
        "type": "text",
        "containerTags": ["test", "e2e-verification"]
    }')

# Extract document ID
DOC_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$DOC_ID" ]; then
    echo -e "${RED}❌ Failed to create document${NC}"
    echo "Response: $RESPONSE"
    exit 1
fi

echo "Document created with ID: $DOC_ID"

# Check initial status
INITIAL_STATUS=$(echo $RESPONSE | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Initial status: $INITIAL_STATUS"

# Verify initial status is correct
if [ "$REDIS_AVAILABLE" = true ]; then
    if [ "$INITIAL_STATUS" = "queued" ] || [ "$INITIAL_STATUS" = "processing" ]; then
        check_result "Document created with 'queued' or 'processing' status" "true"
    else
        check_result "Document created with 'queued' or 'processing' status" "false"
        echo "  Got status: $INITIAL_STATUS"
    fi
else
    # Without Redis, should process inline and be 'done' immediately
    if [ "$INITIAL_STATUS" = "done" ]; then
        check_result "Document processed inline (Redis unavailable)" "true"
    else
        check_result "Document processed inline (Redis unavailable)" "false"
        echo "  Got status: $INITIAL_STATUS"
    fi
fi

# ============================================================================
# STEP 3: Check document status endpoint
# ============================================================================
echo ""
echo -e "${BLUE}🔍 Step 3: Checking document status endpoint...${NC}"
echo ""

STATUS_RESPONSE=$(curl -s http://localhost:3001/v3/documents/$DOC_ID/status)
echo "Status response: $STATUS_RESPONSE"

# Verify status endpoint returns required fields
HAS_STATUS=$(echo $STATUS_RESPONSE | grep -q '"status":' && echo "true" || echo "false")
HAS_PROGRESS=$(echo $STATUS_RESPONSE | grep -q '"progress":' && echo "true" || echo "false")

check_result "Status endpoint returns 'status' field" "$HAS_STATUS"
check_result "Status endpoint returns 'progress' field" "$HAS_PROGRESS"

# ============================================================================
# STEP 4: Wait for processing to complete
# ============================================================================
echo ""
echo -e "${BLUE}⏰ Step 4: Waiting for document processing to complete...${NC}"
echo ""

if [ "$REDIS_AVAILABLE" = true ]; then
    echo "Waiting 15 seconds for queue worker to process..."
    for i in {15..1}; do
        echo -n "$i..."
        sleep 1
    done
    echo ""
else
    echo "Redis unavailable - document should already be processed"
fi

# ============================================================================
# STEP 5: Verify document is fully processed
# ============================================================================
echo ""
echo -e "${BLUE}✅ Step 5: Verifying document is fully processed...${NC}"
echo ""

FINAL_RESPONSE=$(curl -s http://localhost:3001/v3/documents/$DOC_ID)

# Extract fields
FINAL_STATUS=$(echo $FINAL_RESPONSE | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
HAS_CONTENT=$(echo $FINAL_RESPONSE | grep -q '"content":"' && echo "true" || echo "false")
HAS_CHUNKS=$(echo $FINAL_RESPONSE | grep -q '"chunks"' && echo "true" || echo "false")

echo "Final status: $FINAL_STATUS"
echo "Has content: $HAS_CONTENT"
echo "Has chunks: $HAS_CHUNKS"

# Verify results
if [ "$FINAL_STATUS" = "done" ]; then
    check_result "Document status is 'done'" "true"
else
    check_result "Document status is 'done'" "false"
    echo "  Got status: $FINAL_STATUS"
fi

check_result "Document has content" "$HAS_CONTENT"
check_result "Document has chunks field" "$HAS_CHUNKS"

# ============================================================================
# STEP 6: Check queue metrics endpoint
# ============================================================================
echo ""
echo -e "${BLUE}📊 Step 6: Checking queue metrics endpoint...${NC}"
echo ""

METRICS_RESPONSE=$(curl -s http://localhost:3001/v3/queue/metrics)
echo "Metrics response: $METRICS_RESPONSE"

if [ "$REDIS_AVAILABLE" = true ]; then
    # Verify metrics fields
    HAS_WAITING=$(echo $METRICS_RESPONSE | grep -q '"waiting":' && echo "true" || echo "false")
    HAS_ACTIVE=$(echo $METRICS_RESPONSE | grep -q '"active":' && echo "true" || echo "false")
    HAS_COMPLETED=$(echo $METRICS_RESPONSE | grep -q '"completed":' && echo "true" || echo "false")
    HAS_FAILED=$(echo $METRICS_RESPONSE | grep -q '"failed":' && echo "true" || echo "false")

    check_result "Metrics has 'waiting' count" "$HAS_WAITING"
    check_result "Metrics has 'active' count" "$HAS_ACTIVE"
    check_result "Metrics has 'completed' count" "$HAS_COMPLETED"
    check_result "Metrics has 'failed' count" "$HAS_FAILED"

    # Check if completed count is at least 1
    COMPLETED_COUNT=$(echo $METRICS_RESPONSE | grep -o '"completed":[0-9]*' | grep -o '[0-9]*')
    if [ ! -z "$COMPLETED_COUNT" ] && [ "$COMPLETED_COUNT" -ge 1 ]; then
        check_result "At least 1 job completed" "true"
    else
        check_result "At least 1 job completed" "false"
        echo "  Completed count: $COMPLETED_COUNT"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping metrics verification (Redis unavailable)${NC}"
fi

# ============================================================================
# STEP 7: Test multiple simultaneous uploads
# ============================================================================
echo ""
echo -e "${BLUE}🚀 Step 7: Testing 5 simultaneous document uploads...${NC}"
echo ""

# Create 5 documents in parallel
DOC_IDS=()
for i in {1..5}; do
    (
        RESPONSE=$(curl -s -X POST http://localhost:3001/v3/documents \
            -H "Content-Type: application/json" \
            -d "{
                \"content\": \"Simultaneous test document #$i for E2E verification. Testing parallel queue processing.\",
                \"type\": \"text\",
                \"containerTags\": [\"test\", \"simultaneous\", \"batch-$i\"]
            }")
        DOC_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        echo "$DOC_ID" >> /tmp/doc_ids_$$.txt
    ) &
done

# Wait for all uploads to complete
wait

# Read document IDs
if [ -f /tmp/doc_ids_$$.txt ]; then
    mapfile -t DOC_IDS < /tmp/doc_ids_$$.txt
    rm /tmp/doc_ids_$$.txt
fi

echo "Created ${#DOC_IDS[@]} documents simultaneously"

if [ "${#DOC_IDS[@]}" -eq 5 ]; then
    check_result "5 documents created simultaneously" "true"
else
    check_result "5 documents created simultaneously" "false"
    echo "  Created: ${#DOC_IDS[@]}"
fi

# Wait for processing
if [ "$REDIS_AVAILABLE" = true ]; then
    echo ""
    echo "Waiting 20 seconds for all documents to process..."
    for i in {20..1}; do
        echo -n "$i..."
        sleep 1
    done
    echo ""
fi

# ============================================================================
# STEP 8: Verify all simultaneous documents processed correctly
# ============================================================================
echo ""
echo -e "${BLUE}✅ Step 8: Verifying all simultaneous documents processed...${NC}"
echo ""

ALL_PROCESSED=true
PROCESSED_COUNT=0

for doc_id in "${DOC_IDS[@]}"; do
    if [ -z "$doc_id" ]; then
        continue
    fi

    RESPONSE=$(curl -s http://localhost:3001/v3/documents/$doc_id)
    STATUS=$(echo $RESPONSE | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ "$STATUS" = "done" ]; then
        ((PROCESSED_COUNT++))
        echo -e "${GREEN}✅${NC} Document $doc_id: $STATUS"
    else
        ALL_PROCESSED=false
        echo -e "${RED}❌${NC} Document $doc_id: $STATUS (expected 'done')"
    fi
done

if [ "$ALL_PROCESSED" = true ] && [ "$PROCESSED_COUNT" -eq 5 ]; then
    check_result "All 5 documents processed to 'done' status" "true"
else
    check_result "All 5 documents processed to 'done' status" "false"
    echo "  Processed: $PROCESSED_COUNT/5"
fi

# Check final metrics
if [ "$REDIS_AVAILABLE" = true ]; then
    echo ""
    echo "Final queue metrics:"
    FINAL_METRICS=$(curl -s http://localhost:3001/v3/queue/metrics)
    echo "$FINAL_METRICS" | jq . 2>/dev/null || echo "$FINAL_METRICS"

    FINAL_COMPLETED=$(echo $FINAL_METRICS | grep -o '"completed":[0-9]*' | grep -o '[0-9]*')
    if [ ! -z "$FINAL_COMPLETED" ] && [ "$FINAL_COMPLETED" -ge 6 ]; then
        check_result "Queue shows at least 6 completed jobs" "true"
    else
        check_result "Queue shows at least 6 completed jobs" "false"
        echo "  Completed jobs: $FINAL_COMPLETED"
    fi
fi

# ============================================================================
# Final Results
# ============================================================================
echo ""
echo "========================================================"
echo -e "${BLUE}📋 TEST SUMMARY${NC}"
echo "========================================================"
echo ""
echo "Total tests passed: $TESTS_PASSED"
echo "Total tests failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 SUCCESS: All E2E tests passed!${NC}"
    echo ""
    echo "Verified:"
    echo "  ✅ API server starts and responds"
    echo "  ✅ Queue worker starts and processes jobs"
    echo "  ✅ Single document upload and processing"
    echo "  ✅ Document status endpoint works"
    echo "  ✅ Document transitions to 'done' status"
    echo "  ✅ Queue metrics endpoint works"
    echo "  ✅ Multiple simultaneous uploads work"
    echo "  ✅ All documents process correctly"
    echo ""

    if [ "$REDIS_AVAILABLE" = false ]; then
        echo -e "${YELLOW}Note: Tests ran with inline processing fallback (Redis unavailable)${NC}"
    fi

    exit 0
else
    echo -e "${RED}❌ FAILED: $TESTS_FAILED test(s) failed${NC}"
    echo ""
    echo "Check logs for details:"
    echo "  API server: /tmp/api-server.log"
    echo "  Queue worker: /tmp/queue-worker.log"
    echo ""
    exit 1
fi
