#!/bin/bash

# Verification script for subtask-2-1: Test worker processes queued documents successfully
# This script performs an end-to-end test of the queue processing system

set -e

# Add bun to PATH
export PATH="$HOME/.bun/bin:$PATH"

echo "🚀 Starting Queue Processing Verification"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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
    wait 2>/dev/null || true
    echo "✅ Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Step 1: Start API server
echo "📡 Step 1: Starting API server on port 3001..."
cd apps/api

# Export environment variables explicitly
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
        echo -e "${GREEN}✅ API server is ready${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ API server failed to start${NC}"
        cat /tmp/api-server.log
        exit 1
    fi
    sleep 1
done

# Step 2: Start queue worker
echo ""
echo "⚙️  Step 2: Starting queue worker..."
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
echo -e "${GREEN}✅ Queue worker is running${NC}"

# Step 3: POST a test document
echo ""
echo "📄 Step 3: Creating test document via API..."

# Create a test document with text content
RESPONSE=$(curl -s -X POST http://localhost:3001/v3/documents \
    -H "Content-Type: application/json" \
    -d '{
        "content": "This is a test document for queue processing verification. It should be processed by the queue worker.",
        "type": "text",
        "containerTags": ["test", "queue-verification"]
    }')

# Extract document ID from response
DOC_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$DOC_ID" ]; then
    echo -e "${RED}❌ Failed to create document${NC}"
    echo "Response: $RESPONSE"
    exit 1
fi

echo -e "${GREEN}✅ Document created with ID: $DOC_ID${NC}"

# Check initial status
INITIAL_STATUS=$(echo $RESPONSE | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "📊 Initial status: $INITIAL_STATUS"

if [ "$INITIAL_STATUS" != "queued" ] && [ "$INITIAL_STATUS" != "processing" ] && [ "$INITIAL_STATUS" != "done" ]; then
    echo -e "${YELLOW}⚠️  Warning: Expected status 'queued', 'processing', or 'done', got '$INITIAL_STATUS'${NC}"
fi

# Step 4: Wait for processing
echo ""
echo "⏰ Step 4: Waiting 10 seconds for document to be processed..."
for i in {10..1}; do
    echo -n "$i..."
    sleep 1
done
echo ""

# Step 5: GET document and verify status
echo ""
echo "🔍 Step 5: Fetching document to verify processing..."

FINAL_RESPONSE=$(curl -s http://localhost:3001/v3/documents/$DOC_ID)

# Extract fields
FINAL_STATUS=$(echo $FINAL_RESPONSE | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
HAS_CONTENT=$(echo $FINAL_RESPONSE | grep -q '"content"' && echo "yes" || echo "no")
HAS_CHUNKS=$(echo $FINAL_RESPONSE | grep -q '"chunks"' && echo "yes" || echo "no")

echo "📊 Final status: $FINAL_STATUS"
echo "📝 Has content: $HAS_CONTENT"
echo "🧩 Has chunks: $HAS_CHUNKS"

# Step 6: Verify results
echo ""
echo "✅ Step 6: Verifying results..."
echo "=========================================="

SUCCESS=true

# Verify status is 'done'
if [ "$FINAL_STATUS" = "done" ]; then
    echo -e "${GREEN}✅ Status is 'done'${NC}"
else
    echo -e "${RED}❌ Status is '$FINAL_STATUS', expected 'done'${NC}"
    SUCCESS=false
fi

# Verify has content
if [ "$HAS_CONTENT" = "yes" ]; then
    echo -e "${GREEN}✅ Document has content${NC}"
else
    echo -e "${RED}❌ Document is missing content${NC}"
    SUCCESS=false
fi

# Verify has chunks (chunks might be empty array for small documents)
if [ "$HAS_CHUNKS" = "yes" ]; then
    echo -e "${GREEN}✅ Document has chunks field${NC}"
else
    echo -e "${YELLOW}⚠️  Document is missing chunks field${NC}"
    # Not failing on this as chunks might be optional
fi

echo ""
echo "=========================================="
if [ "$SUCCESS" = true ]; then
    echo -e "${GREEN}🎉 SUCCESS: Queue processing verification passed!${NC}"
    echo ""
    echo "Summary:"
    echo "- API server started successfully"
    echo "- Queue worker started successfully"
    echo "- Document created and queued"
    echo "- Worker processed document"
    echo "- Document status changed to 'done'"
    echo "- Document has all required fields"
    exit 0
else
    echo -e "${RED}❌ FAILED: Queue processing verification failed${NC}"
    echo ""
    echo "API server logs:"
    tail -20 /tmp/api-server.log
    echo ""
    echo "Queue worker logs:"
    tail -20 /tmp/queue-worker.log
    echo ""
    echo "Final response:"
    echo "$FINAL_RESPONSE" | jq . 2>/dev/null || echo "$FINAL_RESPONSE"
    exit 1
fi
