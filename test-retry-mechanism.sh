#!/bin/bash
# Test Script: Verify Retry Mechanism for Failed Jobs
# This script tests that BullMQ properly retries failed jobs 3 times with exponential backoff

set -e

echo "=================================================="
echo "Testing Retry Mechanism for Failed Jobs"
echo "=================================================="
echo ""

# Configuration
API_URL="http://localhost:3001/v3"
INVALID_URL="https://this-domain-absolutely-does-not-exist-12345.invalid"

echo "Step 1: Creating document with invalid URL that will fail..."
echo "URL: $INVALID_URL"
echo ""

# Create document with invalid URL
RESPONSE=$(curl -s -X POST "$API_URL/documents" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"$INVALID_URL\",
    \"type\": \"url\",
    \"containerTags\": [\"test-retry\"]
  }")

echo "Response: $RESPONSE"
echo ""

# Extract document ID
DOCUMENT_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$DOCUMENT_ID" ]; then
  echo "❌ ERROR: Failed to create document or extract document ID"
  echo "Response was: $RESPONSE"
  exit 1
fi

echo "✓ Document created with ID: $DOCUMENT_ID"
echo ""

echo "Step 2: Monitor document status and job retries..."
echo "Expected behavior:"
echo "  - Job will attempt processing 3 times (initial + 2 retries)"
echo "  - Retry delays: 2s, 4s (exponential backoff)"
echo "  - Final status should be 'failed' with error details"
echo ""
echo "Checking status every 3 seconds for 30 seconds..."
echo ""

for i in {1..10}; do
  echo "Check $i/10 ($(date +%H:%M:%S)):"

  # Get document status
  DOC_STATUS=$(curl -s "$API_URL/documents/$DOCUMENT_ID/status")
  echo "  Document status: $DOC_STATUS"

  # Extract status field
  STATUS=$(echo "$DOC_STATUS" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

  if [ "$STATUS" = "failed" ]; then
    echo ""
    echo "✓ Document reached 'failed' status"
    break
  fi

  sleep 3
done

echo ""
echo "Step 3: Verifying final document state..."
echo ""

# Get final document details
FINAL_DOC=$(curl -s "$API_URL/documents/$DOCUMENT_ID")
echo "Final document data:"
echo "$FINAL_DOC" | jq '.' 2>/dev/null || echo "$FINAL_DOC"
echo ""

# Check if status is 'failed'
FINAL_STATUS=$(echo "$FINAL_DOC" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
if [ "$FINAL_STATUS" = "failed" ]; then
  echo "✓ Final status is 'failed'"
else
  echo "❌ Expected status 'failed', got '$FINAL_STATUS'"
fi

# Check if error details are present
if echo "$FINAL_DOC" | grep -q "processing_metadata"; then
  echo "✓ Processing metadata with error details is present"
else
  echo "⚠ Warning: No processing_metadata found"
fi

echo ""
echo "=================================================="
echo "Test Complete"
echo "=================================================="
echo ""
echo "MANUAL VERIFICATION REQUIRED:"
echo "1. Check worker logs for 3 processing attempts"
echo "2. Verify exponential backoff delays (2s, 4s)"
echo "3. Confirm error message in worker logs"
echo ""
echo "Expected log pattern:"
echo "  [queue-worker] Processing job ... attempt: 1"
echo "  [queue-worker] Job failed ... attempts: 1"
echo "  [queue-worker] Processing job ... attempt: 2"
echo "  [queue-worker] Job failed ... attempts: 2"
echo "  [queue-worker] Processing job ... attempt: 3"
echo "  [queue-worker] Job failed ... attempts: 3"
echo "  [queue-worker] Document marked as failed"
echo ""
