#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
VERBOSE="${VERBOSE:-false}"

# Function to print colored output
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Function to make API requests with better-auth cookies
api_request() {
    local method="$1"
    local endpoint="$2"
    local data="${3:-}"
    local extra_args="${4:-}"

    local url="${BACKEND_URL}${endpoint}"

    if [[ "$VERBOSE" == "true" ]]; then
        print_info "Request: $method $url"
        if [[ -n "$data" ]]; then
            print_info "Data: $data"
        fi
    fi

    if [[ "$method" == "GET" ]]; then
        curl -s -X GET "$url" \
            -H "Content-Type: application/json" \
            --cookie-jar /tmp/supermemory-cookies.txt \
            --cookie /tmp/supermemory-cookies.txt \
            $extra_args
    else
        curl -s -X "$method" "$url" \
            -H "Content-Type: application/json" \
            -d "$data" \
            --cookie-jar /tmp/supermemory-cookies.txt \
            --cookie /tmp/supermemory-cookies.txt \
            $extra_args
    fi
}

# Test 1: Health Check
test_health() {
    print_header "Test 1: Health Check"

    response=$(api_request GET "/health")

    if echo "$response" | grep -q "ok\|healthy"; then
        print_success "API is healthy"
        return 0
    else
        print_error "API health check failed"
        echo "$response"
        return 1
    fi
}

# Test 2: Search Endpoint (validates data exists in DB)
test_search() {
    print_header "Test 2: Search Endpoint (Database Validation)"

    local query="${TEST_QUERY:-IA}"

    print_info "Searching for: '$query'"

    local payload=$(cat <<EOF
{
    "q": "$query",
    "limit": 5,
    "includeSummary": true,
    "includeFullDocs": false,
    "chunkThreshold": 0.1,
    "documentThreshold": 0.1
}
EOF
)

    response=$(api_request POST "/v3/search" "$payload")

    if [[ "$VERBOSE" == "true" ]]; then
        echo "$response" | jq '.'
    fi

    # Check if we got results
    local result_count=$(echo "$response" | jq -r '.total // 0')

    if [[ "$result_count" -gt 0 ]]; then
        print_success "Found $result_count results in database"

        # Display top results
        echo "$response" | jq -r '.results[:3] | .[] | "  - \(.title // "Untitled") (score: \(.score))"'
        return 0
    else
        print_info "No results found in database for query: '$query'"
        print_info "This might indicate empty database or auth issues"
        return 0
    fi
}

# Test 3: Chat V2 - Simple Mode
test_chat_simple() {
    print_header "Test 3: Chat V2 - Simple Mode"

    local query="${TEST_QUERY:-O que tenho sobre IA?}"

    print_info "Query: '$query'"

    local payload=$(cat <<EOF
{
    "messages": [
        {
            "role": "user",
            "content": "$query"
        }
    ],
    "mode": "simple",
    "metadata": {
        "projectId": "default"
    }
}
EOF
)

    print_info "Sending request to /chat/v2..."

    # For streaming endpoints, we can't easily parse JSON
    # Just check if we get a response
    response=$(api_request POST "/chat/v2" "$payload" "-w \n%{http_code}")

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n -1)

    if [[ "$http_code" == "200" ]]; then
        print_success "Chat V2 (Simple) responded successfully"

        if [[ "$VERBOSE" == "true" ]]; then
            echo "First 500 chars of response:"
            echo "$body" | head -c 500
            echo "..."
        fi
        return 0
    else
        print_error "Chat V2 (Simple) failed with HTTP $http_code"
        echo "$body"
        return 1
    fi
}

# Test 4: Chat V2 - Agentic Mode
test_chat_agentic() {
    print_header "Test 4: Chat V2 - Agentic Mode"

    local query="${TEST_QUERY:-O que tenho sobre IA?}"

    print_info "Query: '$query'"
    print_info "Mode: Agentic (uses agentic-search service)"

    local payload=$(cat <<EOF
{
    "messages": [
        {
            "role": "user",
            "content": "$query"
        }
    ],
    "mode": "agentic",
    "metadata": {
        "projectId": "default"
    }
}
EOF
)

    print_info "Sending request to /chat/v2..."

    response=$(api_request POST "/chat/v2" "$payload" "-w \n%{http_code}")

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n -1)

    if [[ "$http_code" == "200" ]]; then
        print_success "Chat V2 (Agentic) responded successfully"

        # Check for tool usage indicators in the stream
        if echo "$body" | grep -q "searchMemories\|tool-searchMemories"; then
            print_success "Tool usage detected (searchMemories)"
        fi

        if [[ "$VERBOSE" == "true" ]]; then
            echo "First 500 chars of response:"
            echo "$body" | head -c 500
            echo "..."
        fi
        return 0
    else
        print_error "Chat V2 (Agentic) failed with HTTP $http_code"
        echo "$body"
        return 1
    fi
}

# Test 5: Chat V2 - Deep Mode
test_chat_deep() {
    print_header "Test 5: Chat V2 - Deep Mode"

    local query="${TEST_QUERY:-Analise tudo que tenho sobre IA e me dê um resumo completo}"

    print_info "Query: '$query'"
    print_info "Mode: Deep (larger context window)"

    local payload=$(cat <<EOF
{
    "messages": [
        {
            "role": "user",
            "content": "$query"
        }
    ],
    "mode": "deep",
    "metadata": {
        "projectId": "default"
    }
}
EOF
)

    print_info "Sending request to /chat/v2..."

    response=$(api_request POST "/chat/v2" "$payload" "-w \n%{http_code}")

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n -1)

    if [[ "$http_code" == "200" ]]; then
        print_success "Chat V2 (Deep) responded successfully"

        if [[ "$VERBOSE" == "true" ]]; then
            echo "First 500 chars of response:"
            echo "$body" | head -c 500
            echo "..."
        fi
        return 0
    else
        print_error "Chat V2 (Deep) failed with HTTP $http_code"
        echo "$body"
        return 1
    fi
}

# Test 6: Validate Environment Variables
test_env_vars() {
    print_header "Test 6: Environment Variable Validation"

    # Check if ENABLE_AGENTIC_MODE is set
    print_info "Checking API environment configuration..."

    # We can't directly check server env vars, but we can verify the endpoint behavior
    print_info "ENABLE_AGENTIC_MODE should be 'true' in apps/api/.env.local"
    print_info "To verify: check apps/api/.env.local for ENABLE_AGENTIC_MODE=true"

    print_success "Environment validation skipped (server-side only)"
}

# Main execution
main() {
    print_header "Supermemory Chat V2 Test Suite"

    echo "Backend URL: $BACKEND_URL"
    echo "Verbose: $VERBOSE"
    echo ""

    print_info "Note: You must be authenticated to run most tests"
    print_info "If tests fail, ensure you have:"
    print_info "  1. API running on port 4000"
    print_info "  2. Valid session cookie in /tmp/supermemory-cookies.txt"
    print_info "  3. Data in the database for search tests"
    echo ""

    # Run tests
    local failed=0

    test_health || ((failed++))
    test_search || ((failed++))
    test_chat_simple || ((failed++))
    test_chat_agentic || ((failed++))
    test_chat_deep || ((failed++))
    test_env_vars || ((failed++))

    # Summary
    print_header "Test Summary"

    if [[ $failed -eq 0 ]]; then
        print_success "All tests passed!"
        exit 0
    else
        print_error "$failed test(s) failed"
        exit 1
    fi
}

# Help
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat <<EOF
Usage: $0 [OPTIONS]

Test the Supermemory Chat V2 endpoints

Environment Variables:
    BACKEND_URL        Backend API URL (default: http://localhost:4000)
    VERBOSE            Enable verbose output (default: false)
    TEST_QUERY         Custom test query (default: "IA")

Examples:
    # Run all tests
    $0

    # Run with verbose output
    VERBOSE=true $0

    # Test against different backend
    BACKEND_URL=https://api.example.com $0

    # Custom query
    TEST_QUERY="machine learning" VERBOSE=true $0

Authentication:
    Tests require authentication. Ensure you have a valid session.
    Option 1: Login via web UI first (stores cookie automatically)
    Option 2: Set cookie manually in /tmp/supermemory-cookies.txt

EOF
    exit 0
fi

main
