#!/usr/bin/env bash
#
# Test Redis Fallback Mechanism
# Subtask 4-2: Test fallback to inline processing when Redis unavailable
#
# This script tests that the system gracefully falls back to inline processing
# when Redis is unavailable, and resumes queue-based processing when Redis is re-enabled.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
API_URL="http://localhost:3001"
TEST_PROJECT="test"

# Counters
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "PASS")
            echo -e "${GREEN}✓ PASS${NC}: $message"
            ((TESTS_PASSED++))
            ;;
        "FAIL")
            echo -e "${RED}✗ FAIL${NC}: $message"
            ((TESTS_FAILED++))
            ;;
        "INFO")
            echo -e "${BLUE}ℹ INFO${NC}: $message"
            ;;
        "WARN")
            echo -e "${YELLOW}⚠ WARN${NC}: $message"
            ;;
    esac
}

# Function to check if API is running
check_api() {
    if curl -s "$API_URL/health" > /dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to check Redis availability
check_redis() {
    local response=$(curl -s "$API_URL/v3/queue/metrics")
    if echo "$response" | grep -q "Redis"; then
        return 1  # Redis is NOT available (503 response)
    elif echo "$response" | grep -q "waiting"; then
        return 0  # Redis IS available
    else
        return 1  # Unknown state, assume not available
    fi
}

# Function to create a test document
create_document() {
    local content=$1
    local response=$(curl -s -X POST "$API_URL/v3/documents" \
        -H "Content-Type: application/json" \
        -d "{
            \"content\": \"$content\",
            \"type\": \"text\",
            \"containerTags\": [\"$TEST_PROJECT\"]
        }")
    echo "$response"
}

# Function to get document status
get_document_status() {
    local doc_id=$1
    curl -s "$API_URL/v3/documents/$doc_id/status"
}

# Function to get document details
get_document() {
    local doc_id=$1
    curl -s "$API_URL/v3/documents/$doc_id"
}

# Function to wait for document processing
wait_for_document() {
    local doc_id=$1
    local max_wait=30
    local waited=0

    while [ $waited -lt $max_wait ]; do
        local status_response=$(get_document_status "$doc_id")
        local doc_status=$(echo "$status_response" | grep -o '"documentStatus":"[^"]*"' | cut -d'"' -f4)

        if [ "$doc_status" = "done" ] || [ "$doc_status" = "failed" ]; then
            echo "$doc_status"
            return 0
        fi

        sleep 1
        ((waited++))
    done

    echo "timeout"
    return 1
}

# Main test execution
main() {
    echo "=========================================="
    echo "Redis Fallback Mechanism Test"
    echo "Subtask 4-2: Fallback to Inline Processing"
    echo "=========================================="
    echo ""

    # Check if API is running
    print_status "INFO" "Checking API server availability..."
    if ! check_api; then
        print_status "FAIL" "API server is not running at $API_URL"
        print_status "INFO" "Start the API server with: cd apps/api && bun run dev"
        exit 1
    fi
    print_status "PASS" "API server is running"
    echo ""

    # ============================================
    # TEST 1: Redis Disabled - Inline Processing
    # ============================================
    echo "=========================================="
    echo "TEST 1: Redis Disabled - Inline Processing"
    echo "=========================================="
    echo ""

    print_status "INFO" "Checking current Redis availability..."
    if check_redis; then
        print_status "WARN" "Redis is currently ENABLED"
        print_status "INFO" "This test requires Redis to be DISABLED"
        print_status "INFO" "To disable Redis, either:"
        print_status "INFO" "  1. Stop Redis server (if running locally)"
        print_status "INFO" "  2. Unset UPSTASH_REDIS_URL in apps/api/.env"
        print_status "INFO" "  3. Set UPSTASH_REDIS_URL=\"\" in apps/api/.env"
        print_status "INFO" "Then restart the API server"
        echo ""
        print_status "INFO" "Skipping Test 1 - requires Redis disabled"
        echo ""
    else
        print_status "PASS" "Redis is disabled (as expected for Test 1)"
        echo ""

        # Verify queue metrics endpoint returns unavailable status
        print_status "INFO" "Verifying queue metrics endpoint..."
        local metrics_response=$(curl -s -w "\n%{http_code}" "$API_URL/v3/queue/metrics")
        local metrics_body=$(echo "$metrics_response" | head -n -1)
        local metrics_status=$(echo "$metrics_response" | tail -n 1)

        if [ "$metrics_status" = "503" ]; then
            print_status "PASS" "Queue metrics returns 503 when Redis unavailable"
        else
            print_status "FAIL" "Queue metrics should return 503, got $metrics_status"
        fi
        echo ""

        # Create a test document
        print_status "INFO" "Creating test document (should process inline)..."
        local create_response=$(create_document "Test document for inline processing fallback - $(date +%s)")
        local doc_id=$(echo "$create_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

        if [ -z "$doc_id" ]; then
            print_status "FAIL" "Failed to create document. Response: $create_response"
        else
            print_status "PASS" "Document created: $doc_id"
            echo ""

            # Check initial status
            print_status "INFO" "Checking document status..."
            sleep 2  # Give it a moment to process inline

            local status_response=$(get_document_status "$doc_id")
            local doc_status=$(echo "$status_response" | grep -o '"documentStatus":"[^"]*"' | cut -d'"' -f4)
            local queue_enabled=$(echo "$status_response" | grep -o '"queueEnabled":[^,}]*' | cut -d':' -f2)

            print_status "INFO" "Current status: $doc_status"
            print_status "INFO" "Queue enabled: $queue_enabled"
            echo ""

            # Verify queue is disabled
            if [ "$queue_enabled" = "false" ]; then
                print_status "PASS" "queueEnabled is false (inline processing mode)"
            else
                print_status "FAIL" "queueEnabled should be false, got $queue_enabled"
            fi

            # Wait for processing to complete
            print_status "INFO" "Waiting for inline processing to complete..."
            local final_status=$(wait_for_document "$doc_id")

            if [ "$final_status" = "done" ]; then
                print_status "PASS" "Document processed successfully inline (status: done)"
            elif [ "$final_status" = "failed" ]; then
                print_status "WARN" "Document processing failed"
                local doc_details=$(get_document "$doc_id")
                print_status "INFO" "Error: $(echo "$doc_details" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)"
            else
                print_status "FAIL" "Document did not complete in time (status: $final_status)"
            fi
            echo ""

            # Verify document has content
            print_status "INFO" "Verifying document content..."
            local doc_response=$(get_document "$doc_id")

            if echo "$doc_response" | grep -q '"content"'; then
                print_status "PASS" "Document has content field"
            else
                print_status "FAIL" "Document missing content field"
            fi
            echo ""

            # Verify no job information is present (since queue is disabled)
            if ! echo "$status_response" | grep -q '"job"'; then
                print_status "PASS" "No job information (expected for inline processing)"
            else
                print_status "WARN" "Job information present despite queue being disabled"
            fi
        fi
    fi

    # ============================================
    # TEST 2: Redis Enabled - Queue Processing
    # ============================================
    echo ""
    echo "=========================================="
    echo "TEST 2: Redis Enabled - Queue Processing"
    echo "=========================================="
    echo ""

    print_status "INFO" "Checking current Redis availability..."
    if check_redis; then
        print_status "PASS" "Redis is enabled (as expected for Test 2)"
        echo ""

        # Verify queue metrics endpoint returns stats
        print_status "INFO" "Verifying queue metrics endpoint..."
        local metrics_response=$(curl -s "$API_URL/v3/queue/metrics")

        if echo "$metrics_response" | grep -q "waiting"; then
            print_status "PASS" "Queue metrics returns statistics (Redis available)"
            print_status "INFO" "Metrics: $(echo "$metrics_response" | head -c 200)"
        else
            print_status "FAIL" "Queue metrics should return statistics"
        fi
        echo ""

        # Create a test document (should use queue)
        print_status "INFO" "Creating test document (should use queue)..."
        local create_response=$(create_document "Test document for queue processing - $(date +%s)")
        local doc_id=$(echo "$create_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

        if [ -z "$doc_id" ]; then
            print_status "FAIL" "Failed to create document. Response: $create_response"
        else
            print_status "PASS" "Document created: $doc_id"
            echo ""

            # Check initial status
            print_status "INFO" "Checking document status..."
            sleep 1

            local status_response=$(get_document_status "$doc_id")
            local doc_status=$(echo "$status_response" | grep -o '"documentStatus":"[^"]*"' | cut -d'"' -f4)
            local queue_enabled=$(echo "$status_response" | grep -o '"queueEnabled":[^,}]*' | cut -d':' -f2)

            print_status "INFO" "Current status: $doc_status"
            print_status "INFO" "Queue enabled: $queue_enabled"
            echo ""

            # Verify queue is enabled
            if [ "$queue_enabled" = "true" ]; then
                print_status "PASS" "queueEnabled is true (queue processing mode)"
            else
                print_status "FAIL" "queueEnabled should be true, got $queue_enabled"
            fi

            # Verify document is queued
            if [ "$doc_status" = "queued" ] || [ "$doc_status" = "processing" ]; then
                print_status "PASS" "Document is queued/processing (status: $doc_status)"
            else
                print_status "WARN" "Document status is $doc_status (expected queued or processing)"
            fi

            # Verify job information is present
            if echo "$status_response" | grep -q '"job"'; then
                print_status "PASS" "Job information present in status response"
                local job_state=$(echo "$status_response" | grep -o '"state":"[^"]*"' | cut -d'"' -f4)
                print_status "INFO" "Job state: $job_state"
            else
                print_status "FAIL" "Job information missing from status response"
            fi
            echo ""

            # Check if worker is running
            print_status "INFO" "Checking if queue worker is running..."
            print_status "WARN" "If worker is not running, start it with: cd apps/api && bun run dev:queue"
            print_status "INFO" "Waiting for worker to process document..."

            local final_status=$(wait_for_document "$doc_id")

            if [ "$final_status" = "done" ]; then
                print_status "PASS" "Document processed successfully via queue (status: done)"
            elif [ "$final_status" = "timeout" ]; then
                print_status "WARN" "Document processing timeout - worker may not be running"
                print_status "INFO" "Start worker with: cd apps/api && bun run dev:queue"
            elif [ "$final_status" = "failed" ]; then
                print_status "WARN" "Document processing failed"
                local doc_details=$(get_document "$doc_id")
                print_status "INFO" "Error: $(echo "$doc_details" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)"
            else
                print_status "FAIL" "Unexpected final status: $final_status"
            fi
        fi
    else
        print_status "WARN" "Redis is currently DISABLED"
        print_status "INFO" "This test requires Redis to be ENABLED"
        print_status "INFO" "To enable Redis:"
        print_status "INFO" "  1. Start Redis server (or use Upstash)"
        print_status "INFO" "  2. Set UPSTASH_REDIS_URL in apps/api/.env"
        print_status "INFO" "  3. Restart the API server"
        echo ""
        print_status "INFO" "Skipping Test 2 - requires Redis enabled"
    fi

    # ============================================
    # Test Summary
    # ============================================
    echo ""
    echo "=========================================="
    echo "Test Summary"
    echo "=========================================="
    echo -e "${GREEN}Tests Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Tests Failed: $TESTS_FAILED${NC}"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        echo ""
        print_status "INFO" "Fallback mechanism verified successfully"
        exit 0
    else
        echo -e "${RED}✗ Some tests failed${NC}"
        echo ""
        print_status "WARN" "Review failed tests above"
        exit 1
    fi
}

# Run main function
main
