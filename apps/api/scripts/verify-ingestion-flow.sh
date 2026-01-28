#!/bin/bash

# Manual Verification Script - Document Ingestion Flow
# This script automates the manual verification of document ingestion
# It requires the API to be running and proper environment variables set

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3001}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
ORG_ID="${ORG_ID:-}"
USER_ID="${USER_ID:-}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-}"

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TEST_RESULTS=()

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if API is running
    if ! curl -s "${API_URL}/health" > /dev/null 2>&1; then
        log_error "API is not running at ${API_URL}"
        log_info "Please start the API with: cd apps/api && bun run dev"
        exit 1
    fi
    log_success "API is running at ${API_URL}"

    # Check required environment variables
    if [ -z "$AUTH_TOKEN" ]; then
        log_error "AUTH_TOKEN is not set"
        log_info "Please set AUTH_TOKEN environment variable"
        exit 1
    fi

    if [ -z "$ORG_ID" ]; then
        log_error "ORG_ID is not set"
        log_info "Please set ORG_ID environment variable"
        exit 1
    fi

    if [ -z "$USER_ID" ]; then
        log_error "USER_ID is not set"
        log_info "Please set USER_ID environment variable"
        exit 1
    fi

    log_success "All prerequisites met"
    echo ""
}

record_test_result() {
    local test_name="$1"
    local status="$2"
    local message="$3"

    if [ "$status" = "PASS" ]; then
        TESTS_PASSED=$((TESTS_PASSED + 1))
        TEST_RESULTS+=("${GREEN}✓${NC} ${test_name}: ${message}")
    else
        TESTS_FAILED=$((TESTS_FAILED + 1))
        TEST_RESULTS+=("${RED}✗${NC} ${test_name}: ${message}")
    fi
}

# Test 1: Create and verify text document
test_text_document() {
    log_info "Test 1: Creating text document..."

    local response=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/v3/documents" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${AUTH_TOKEN}" \
        -H "X-Kortix-Organization: ${ORG_ID}" \
        -H "X-Kortix-User: ${USER_ID}" \
        -d '{
            "content": "This is a test document about artificial intelligence. AI is transforming the world by enabling machines to perform tasks that typically require human intelligence. Machine learning algorithms can learn from data and improve over time. Deep learning uses neural networks with multiple layers.",
            "containerTags": ["test-verification"],
            "metadata": {
                "type": "text",
                "source": "automated-verification",
                "testCase": "test-1-text"
            }
        }')

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)

    if [ "$http_code" = "201" ]; then
        local doc_id=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        log_success "Document created with ID: ${doc_id}"
        echo "$doc_id" > /tmp/test_doc_id_1.txt

        # Wait for processing (max 30 seconds)
        log_info "Waiting for document processing (max 30s)..."
        local max_attempts=30
        local attempt=0
        local status=""

        while [ $attempt -lt $max_attempts ]; do
            sleep 1
            local doc_response=$(curl -s -X GET "${API_URL}/v3/documents/${doc_id}" \
                -H "Authorization: Bearer ${AUTH_TOKEN}" \
                -H "X-Kortix-Organization: ${ORG_ID}" \
                -H "X-Kortix-User: ${USER_ID}")

            status=$(echo "$doc_response" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

            if [ "$status" = "done" ] || [ "$status" = "failed" ]; then
                break
            fi

            attempt=$((attempt + 1))
            echo -n "."
        done
        echo ""

        if [ "$status" = "done" ]; then
            log_success "Document processing completed"
            record_test_result "Test 1" "PASS" "Text document created and processed successfully"
            return 0
        else
            log_error "Document processing failed or timed out. Status: ${status}"
            record_test_result "Test 1" "FAIL" "Document status is '${status}', expected 'done'"
            return 1
        fi
    else
        log_error "Failed to create document. HTTP ${http_code}"
        echo "$body"
        record_test_result "Test 1" "FAIL" "Failed to create document (HTTP ${http_code})"
        return 1
    fi
}

# Test 2: Create URL document
test_url_document() {
    log_info "Test 2: Creating URL document..."

    local response=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/v3/documents" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${AUTH_TOKEN}" \
        -H "X-Kortix-Organization: ${ORG_ID}" \
        -H "X-Kortix-User: ${USER_ID}" \
        -d '{
            "url": "https://en.wikipedia.org/wiki/Machine_learning",
            "containerTags": ["test-verification"],
            "metadata": {
                "type": "url",
                "source": "automated-verification",
                "testCase": "test-2-url"
            }
        }')

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)

    if [ "$http_code" = "201" ]; then
        local doc_id=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        log_success "URL document created with ID: ${doc_id}"
        echo "$doc_id" > /tmp/test_doc_id_2.txt

        record_test_result "Test 2" "PASS" "URL document created successfully"
        return 0
    else
        log_error "Failed to create URL document. HTTP ${http_code}"
        record_test_result "Test 2" "FAIL" "Failed to create URL document (HTTP ${http_code})"
        return 1
    fi
}

# Test 3: Test invalid content (error handling)
test_invalid_content() {
    log_info "Test 3: Testing error handling with invalid content..."

    local response=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/v3/documents" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${AUTH_TOKEN}" \
        -H "X-Kortix-Organization: ${ORG_ID}" \
        -H "X-Kortix-User: ${USER_ID}" \
        -d '{
            "content": "",
            "containerTags": ["test-verification"],
            "metadata": {
                "type": "text",
                "testCase": "test-3-invalid"
            }
        }')

    local http_code=$(echo "$response" | tail -n1)

    if [ "$http_code" = "400" ] || [ "$http_code" = "422" ]; then
        log_success "API correctly rejected invalid content"
        record_test_result "Test 3" "PASS" "Error handling works correctly"
        return 0
    else
        log_error "API should reject empty content but returned HTTP ${http_code}"
        record_test_result "Test 3" "FAIL" "Expected 400/422, got ${http_code}"
        return 1
    fi
}

# Test 4: Test large document (multiple chunks)
test_large_document() {
    log_info "Test 4: Creating large document (multiple chunks)..."

    # Generate large text
    local large_text=$(python3 -c "print('This is a test sentence about machine learning, artificial intelligence, neural networks, and deep learning. ' * 200)")

    local response=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/v3/documents" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${AUTH_TOKEN}" \
        -H "X-Kortix-Organization: ${ORG_ID}" \
        -H "X-Kortix-User: ${USER_ID}" \
        -d "{
            \"content\": \"${large_text}\",
            \"containerTags\": [\"test-verification\"],
            \"metadata\": {
                \"type\": \"text\",
                \"source\": \"automated-verification\",
                \"testCase\": \"test-4-large\"
            }
        }")

    local http_code=$(echo "$response" | tail -n1)
    local body=$(echo "$response" | head -n-1)

    if [ "$http_code" = "201" ]; then
        local doc_id=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        log_success "Large document created with ID: ${doc_id}"
        echo "$doc_id" > /tmp/test_doc_id_4.txt

        record_test_result "Test 4" "PASS" "Large document created successfully"
        return 0
    else
        log_error "Failed to create large document. HTTP ${http_code}"
        record_test_result "Test 4" "FAIL" "Failed to create large document (HTTP ${http_code})"
        return 1
    fi
}

# Test 5: Concurrent document creation
test_concurrent_creation() {
    log_info "Test 5: Testing concurrent document creation..."

    local pids=()
    local success_count=0

    # Create 5 documents concurrently
    for i in {1..5}; do
        (
            response=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/v3/documents" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer ${AUTH_TOKEN}" \
                -H "X-Kortix-Organization: ${ORG_ID}" \
                -H "X-Kortix-User: ${USER_ID}" \
                -d "{
                    \"content\": \"Concurrent test document ${i} with content about machine learning and AI.\",
                    \"containerTags\": [\"test-concurrent\"],
                    \"metadata\": {
                        \"type\": \"text\",
                        \"source\": \"automated-verification\",
                        \"testCase\": \"test-5-concurrent\",
                        \"index\": ${i}
                    }
                }")

            http_code=$(echo "$response" | tail -n1)
            if [ "$http_code" = "201" ]; then
                echo "SUCCESS"
            else
                echo "FAILED"
            fi
        ) > "/tmp/concurrent_${i}.txt" &
        pids+=($!)
    done

    # Wait for all background jobs
    for pid in "${pids[@]}"; do
        wait "$pid"
    done

    # Count successes
    for i in {1..5}; do
        if grep -q "SUCCESS" "/tmp/concurrent_${i}.txt" 2>/dev/null; then
            success_count=$((success_count + 1))
        fi
    done

    if [ $success_count -eq 5 ]; then
        log_success "All 5 concurrent documents created successfully"
        record_test_result "Test 5" "PASS" "Concurrent creation handled correctly (5/5)"
        return 0
    else
        log_warning "${success_count}/5 concurrent documents created"
        record_test_result "Test 5" "FAIL" "Only ${success_count}/5 documents created"
        return 1
    fi
}

# Print summary
print_summary() {
    echo ""
    echo "========================================"
    echo "          VERIFICATION SUMMARY"
    echo "========================================"
    echo ""

    for result in "${TEST_RESULTS[@]}"; do
        echo -e "$result"
    done

    echo ""
    echo "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
    echo "Tests Failed: ${RED}${TESTS_FAILED}${NC}"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ All tests passed!${NC}"
        echo ""
        log_info "Database verification steps:"
        echo "1. Check document records in Supabase dashboard"
        echo "2. Verify chunks have embeddings"
        echo "3. Confirm status progression: queued → processing → done"
        echo "4. Check memories table for auto-summaries"
        echo ""
        log_info "See MANUAL_VERIFICATION_GUIDE.md for database queries"
        echo ""
        return 0
    else
        echo -e "${RED}❌ Some tests failed${NC}"
        echo ""
        return 1
    fi
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f /tmp/test_doc_id_*.txt
    rm -f /tmp/concurrent_*.txt
    log_success "Cleanup complete"
}

# Main execution
main() {
    echo ""
    echo "========================================"
    echo "   Document Ingestion Flow Verification"
    echo "========================================"
    echo ""

    check_prerequisites

    # Run tests
    test_text_document
    echo ""

    test_url_document
    echo ""

    test_invalid_content
    echo ""

    test_large_document
    echo ""

    test_concurrent_creation
    echo ""

    # Print summary
    print_summary

    # Cleanup
    cleanup

    # Exit with appropriate code
    if [ $TESTS_FAILED -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# Trap to ensure cleanup on exit
trap cleanup EXIT

# Run main
main
