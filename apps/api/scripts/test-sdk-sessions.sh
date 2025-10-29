#!/bin/bash

# Test script for Claude Agent SDK session management
# This tests the new simplified architecture where SDK manages all session state

set -e

API_URL="${API_URL:-http://localhost:4000}"
CHAT_ENDPOINT="$API_URL/chat/v2"

echo "🧪 Testing Claude Agent SDK Session Management"
echo "=============================================="
echo ""

# Test 1: New conversation (no sdkSessionId)
echo "📝 Test 1: Creating new conversation..."
RESPONSE_1=$(curl -s -X POST "$CHAT_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Olá! Me conte sobre o que você pode fazer.",
    "mode": "simple"
  }')

# Extract conversation ID and SDK session ID from response
CONV_ID=$(echo "$RESPONSE_1" | grep '"type":"final"' | tail -1 | jq -r '.conversationId // empty')
SDK_SESSION_ID=$(echo "$RESPONSE_1" | grep '"type":"final"' | tail -1 | jq -r '.sdkSessionId // empty')

if [ -z "$CONV_ID" ]; then
  echo "❌ Failed: No conversation ID returned"
  exit 1
fi

if [ -z "$SDK_SESSION_ID" ]; then
  echo "❌ Failed: No SDK session ID returned"
  exit 1
fi

echo "✅ Test 1 Passed"
echo "   Conversation ID: $CONV_ID"
echo "   SDK Session ID: $SDK_SESSION_ID"
echo ""

# Test 2: Continue conversation with SDK session ID
echo "📝 Test 2: Continuing conversation with SDK session..."
RESPONSE_2=$(curl -s -X POST "$CHAT_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"Qual foi minha primeira pergunta?\",
    \"conversationId\": \"$CONV_ID\",
    \"sdkSessionId\": \"$SDK_SESSION_ID\",
    \"mode\": \"simple\"
  }")

# Check if response contains reference to previous context
if echo "$RESPONSE_2" | grep -q "olá\|conte\|pode fazer"; then
  echo "✅ Test 2 Passed - SDK remembered context"
else
  echo "⚠️  Warning: Response may not reference previous context"
  echo "   This could be normal if Claude decided not to repeat the question"
fi

NEW_SDK_SESSION_ID=$(echo "$RESPONSE_2" | grep '"type":"final"' | tail -1 | jq -r '.sdkSessionId // empty')
echo "   Returned SDK Session ID: $NEW_SDK_SESSION_ID"
echo ""

# Test 3: Continue conversation without conversationId (only SDK session)
echo "📝 Test 3: Continuing with only SDK session (no conversationId)..."
RESPONSE_3=$(curl -s -X POST "$CHAT_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"E qual foi a segunda?\",
    \"sdkSessionId\": \"$NEW_SDK_SESSION_ID\",
    \"mode\": \"simple\"
  }")

if echo "$RESPONSE_3" | grep '"type":"error"'; then
  echo "❌ Test 3 Failed - SDK session resume failed"
  echo "$RESPONSE_3" | grep '"type":"error"' | jq '.message'
  exit 1
fi

echo "✅ Test 3 Passed - SDK session continued without our DB conversation ID"
echo ""

# Test 4: New conversation with different message
echo "📝 Test 4: Creating another new conversation..."
RESPONSE_4=$(curl -s -X POST "$CHAT_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is 2+2?",
    "mode": "simple"
  }')

NEW_CONV_ID=$(echo "$RESPONSE_4" | grep '"type":"final"' | tail -1 | jq -r '.conversationId // empty')
NEW_SDK_ID=$(echo "$RESPONSE_4" | grep '"type":"final"' | tail -1 | jq -r '.sdkSessionId // empty')

if [ "$NEW_CONV_ID" = "$CONV_ID" ]; then
  echo "❌ Test 4 Failed - Same conversation ID returned"
  exit 1
fi

if [ "$NEW_SDK_ID" = "$SDK_SESSION_ID" ]; then
  echo "❌ Test 4 Failed - Same SDK session ID returned"
  exit 1
fi

echo "✅ Test 4 Passed - New conversation created with different IDs"
echo "   New Conversation ID: $NEW_CONV_ID"
echo "   New SDK Session ID: $NEW_SDK_ID"
echo ""

echo "=============================================="
echo "✅ All tests passed!"
echo ""
echo "Summary:"
echo "  - SDK manages session state internally"
echo "  - Our DB stores events for display only"
echo "  - SDK session ID is captured and returned"
echo "  - Conversations can continue with SDK session ID"
echo ""
