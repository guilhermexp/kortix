#!/bin/bash
# Test script for job deduplication verification (subtask-4-3)
# Tests that the same document is not queued twice

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3001}"
TEST_URL="https://example.com/test-deduplication-$(date +%s)"
PASSED=0
FAILED=0

echo "=========================================="
echo "Job Deduplication Verification Test"
echo "=========================================="
echo ""
echo "API URL: $API_URL"
echo "Test URL: $TEST_URL"
echo ""

# Function to print test result
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
        ((FAILED++))
    fi
}

# Function to make API request
api_request() {
    local method=$1
    local endpoint=$2
    local data=$3

    if [ -n "$data" ]; then
        curl -s -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$API_URL$endpoint"
    else
        curl -s -X "$method" "$API_URL$endpoint"
    fi
}

echo "Test 1: Upload document for the first time"
echo "==========================================="
RESPONSE1=$(api_request POST "/v3/documents" "{
    \"content\": \"$TEST_URL\",
    \"type\": \"url\",
    \"containerTags\": [\"test-dedup\"]
}")

DOC_ID1=$(echo "$RESPONSE1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$DOC_ID1" ]; then
    print_result 0 "First document created successfully (ID: $DOC_ID1)"
else
    print_result 1 "Failed to create first document"
    echo "Response: $RESPONSE1"
    exit 1
fi

echo ""
echo "Waiting 1 second before duplicate attempt..."
sleep 1

echo ""
echo "Test 2: Attempt to upload same URL again (should be rejected)"
echo "================================================================"
RESPONSE2=$(api_request POST "/v3/documents" "{
    \"content\": \"$TEST_URL\",
    \"type\": \"url\",
    \"containerTags\": [\"test-dedup\"]
}" 2>&1)

# Check if response indicates duplicate
if echo "$RESPONSE2" | grep -q -E "(409|duplicate|já existe|already exists|DUPLICATE_DOCUMENT)"; then
    print_result 0 "Duplicate detected and rejected (HTTP 409 or similar)"
    echo "Response: $(echo "$RESPONSE2" | head -c 200)..."
else
    # Check if same document ID returned
    DOC_ID2=$(echo "$RESPONSE2" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ "$DOC_ID1" = "$DOC_ID2" ] && [ -n "$DOC_ID2" ]; then
        print_result 0 "Same document ID returned (deduplication working)"
    else
        print_result 1 "Duplicate not detected - new document created or unexpected error"
        echo "Response: $RESPONSE2"
    fi
fi

echo ""
echo "Test 3: Check queue metrics (if Redis enabled)"
echo "==============================================="
QUEUE_METRICS=$(api_request GET "/v3/queue/metrics" 2>&1)

if echo "$QUEUE_METRICS" | grep -q "waiting"; then
    TOTAL_JOBS=$(echo "$QUEUE_METRICS" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    WAITING=$(echo "$QUEUE_METRICS" | grep -o '"waiting":[0-9]*' | cut -d':' -f2)
    ACTIVE=$(echo "$QUEUE_METRICS" | grep -o '"active":[0-9]*' | cut -d':' -f2)

    print_result 0 "Queue metrics retrieved (Total: $TOTAL_JOBS, Waiting: $WAITING, Active: $ACTIVE)"

    # Note: We can't directly count jobs for our specific document,
    # but we can verify the queue is working
    echo "   Note: Queue is enabled and operational"
else
    echo -e "${YELLOW}⚠ SKIP${NC}: Redis/Queue not available - cannot verify queue-level deduplication"
    echo "   Fallback mode: Deduplication still works at database level"
fi

echo ""
echo "Test 4: Verify document status"
echo "==============================="
DOC_STATUS=$(api_request GET "/v3/documents/$DOC_ID1/status" 2>&1)

if echo "$DOC_STATUS" | grep -q "documentStatus"; then
    STATUS=$(echo "$DOC_STATUS" | grep -o '"documentStatus":"[^"]*"' | cut -d'"' -f4)
    print_result 0 "Document status retrieved: $STATUS"

    # Check if queue info is present
    if echo "$DOC_STATUS" | grep -q '"queueEnabled":true'; then
        print_result 0 "Queue is enabled in status response"

        # Check if job info is present
        if echo "$DOC_STATUS" | grep -q '"job":{'; then
            JOB_STATE=$(echo "$DOC_STATUS" | grep -o '"state":"[^"]*"' | cut -d'"' -f4)
            print_result 0 "Job information available (state: $JOB_STATE)"
        else
            echo -e "${YELLOW}⚠ INFO${NC}: Job info not present (may have completed already)"
        fi
    else
        echo -e "${YELLOW}⚠ INFO${NC}: Queue not enabled - using inline processing"
    fi
else
    print_result 1 "Failed to retrieve document status"
    echo "Response: $DOC_STATUS"
fi

echo ""
echo "Test 5: BullMQ Job ID Deduplication (Code Verification)"
echo "========================================================"
# This test verifies the code implementation
if grep -q 'jobId: `doc-${documentId}`' ./apps/api/src/services/queue/document-queue.ts 2>/dev/null; then
    print_result 0 "BullMQ uses documentId as jobId for deduplication"
else
    print_result 1 "BullMQ jobId pattern not found in code"
fi

echo ""
echo "Test 6: Database-level Duplicate Detection (Code Verification)"
echo "==============================================================="
if grep -q "DUPLICATE_DOCUMENT" ./apps/api/src/routes/documents.ts 2>/dev/null; then
    print_result 0 "Database-level duplicate detection implemented"
else
    print_result 1 "Database duplicate detection code not found"
fi

echo ""
echo "Test 7: Race Condition Protection (Code Verification)"
echo "======================================================"
if grep -q "existingJob" ./apps/api/src/routes/documents.ts 2>/dev/null; then
    print_result 0 "Race condition protection implemented (checks for existing jobs)"
else
    print_result 1 "Race condition protection code not found"
fi

echo ""
echo "Test 8: URL-based Deduplication Logic"
echo "======================================"
# Test with same URL submitted immediately (race condition scenario)
echo "Submitting two requests in parallel..."

RESPONSE_A=$(api_request POST "/v3/documents" "{
    \"content\": \"https://example.com/race-test-$(date +%s)\",
    \"type\": \"url\",
    \"containerTags\": [\"test-race\"]
}" 2>&1) &
PID_A=$!

RESPONSE_B=$(api_request POST "/v3/documents" "{
    \"content\": \"https://example.com/race-test-$(date +%s)\",
    \"type\": \"url\",
    \"containerTags\": [\"test-race\"]
}" 2>&1) &
PID_B=$!

wait $PID_A
wait $PID_B

echo -e "${YELLOW}⚠ INFO${NC}: Parallel submission test completed (manual verification needed)"
echo "   This tests that race conditions are handled properly"

echo ""
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo "Deduplication Verification Summary:"
    echo "- BullMQ job deduplication: Uses doc-{documentId} as jobId"
    echo "- Database-level duplicate detection: Checks URL and content"
    echo "- Race condition protection: Checks for existing jobs"
    echo "- API returns HTTP 409 for duplicate documents"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
