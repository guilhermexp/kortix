#!/bin/bash
# Test all chat modes with real requests
# Usage: AUTH_TOKEN="your-session-token" ./test-chat-modes.sh

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
VERBOSE="${VERBOSE:-false}"

if [[ -z "$AUTH_TOKEN" ]]; then
  echo "❌ Error: AUTH_TOKEN env var required"
  echo "   Get it from DevTools → Application → Cookies → better-auth.session_token"
  exit 1
fi

echo "🧪 Testing Chat Modes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Helper function to test chat
test_chat() {
  local mode=$1
  local query=$2

  echo ""
  echo "📝 Testing mode: $mode"
  echo "   Query: $query"

  response=$(curl -s -w "\n%{http_code}" \
    -X POST "$BACKEND_URL/chat/v2" \
    -H "Content-Type: application/json" \
    -H "Cookie: better-auth.session_token=$AUTH_TOKEN" \
    -d "{
      \"mode\": \"$mode\",
      \"messages\": [{
        \"role\": \"user\",
        \"content\": \"$query\"
      }]
    }")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" != "200" ]]; then
    echo "   ❌ Failed (HTTP $http_code)"
    [[ "$VERBOSE" == "true" ]] && echo "$body"
    return 1
  fi

  echo "   ✅ Success (HTTP $http_code)"

  # Check for streaming response markers
  if echo "$body" | grep -q "0:"; then
    echo "   📡 Stream detected"
  fi

  # Check for tool calls
  if echo "$body" | grep -q "tool-searchMemories"; then
    echo "   🔧 Tool call: searchMemories"
  fi

  # Check for citations
  if echo "$body" | grep -q "\[1\]"; then
    echo "   📚 Citations found"
  fi

  [[ "$VERBOSE" == "true" ]] && echo "$body" | head -20

  return 0
}

# Test 1: Simple mode
test_chat "simple" "What do I have about AI?"

# Test 2: Agentic mode (should trigger tool calls)
test_chat "agentic" "Find all my notes about machine learning"

# Test 3: Deep mode
test_chat "deep" "Summarize everything I know about neural networks"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All tests completed"
echo ""
echo "💡 Next steps:"
echo "   1. Check the responses above for tool calls and citations"
echo "   2. Open DevTools → Network tab and test manually in UI"
echo "   3. Select different modes and verify payload includes 'mode' field"
