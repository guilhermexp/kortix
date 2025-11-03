#!/usr/bin/env bash
set -euo pipefail

# Simple E2E script to test repository ingestion locally.
# Usage:
#   BACKEND_URL=http://localhost:4000 SM_SESSION="<cookie>" scripts/test-repo-ingest.sh https://github.com/apple/pico-banana-400k
#
# Notes:
# - SM_SESSION is optional, but most endpoints require auth; pass your sm_session cookie value if needed.
# - Prints key checkpoints and exits non‑zero on failure.

BACKEND_URL=${BACKEND_URL:-http://localhost:4000}
REPO_URL=${1:-}

if [[ -z "${REPO_URL}" ]]; then
  echo "[ERR] Provide a GitHub repository URL as first argument" >&2
  exit 2
fi

echo "[INFO] Health check: ${BACKEND_URL}/health"
curl -fsS "${BACKEND_URL}/health" >/dev/null || {
  echo "[ERR] API health check failed at ${BACKEND_URL}/health" >&2
  exit 1
}

COOKIE_HEADER=()
if [[ -n "${SM_SESSION:-}" ]]; then
  COOKIE_HEADER=(-H "Cookie: sm_session=${SM_SESSION}")
  echo "[INFO] Using provided SM_SESSION cookie"
else
  echo "[WARN] No SM_SESSION cookie provided; request may fail if auth is required"
fi

echo "[INFO] Creating repository document for: ${REPO_URL}"
CREATE_RESP=$(curl -fsS -X POST "${BACKEND_URL}/v3/documents/repository" \
  -H 'Content-Type: application/json' \
  "${COOKIE_HEADER[@]}" \
  -d "{\"url\":\"${REPO_URL}\",\"containerTags\":[\"sm_project_default\"]}") || {
  echo "[ERR] Repository creation failed" >&2
  exit 1
}

DOC_ID=$(echo "${CREATE_RESP}" | sed -n 's/.*"id"\s*:\s*"\([^"]\+\)".*/\1/p' | head -n1)
if [[ -z "${DOC_ID}" ]]; then
  echo "[ERR] Could not extract document id from response" >&2
  echo "Response: ${CREATE_RESP}" >&2
  exit 1
fi
echo "[INFO] Document created: ${DOC_ID}"

echo "[INFO] Polling document status until done..."
ATTEMPTS=0
MAX_ATTEMPTS=60
while (( ATTEMPTS < MAX_ATTEMPTS )); do
  ((ATTEMPTS++))
  RESP=$(curl -fsS "${BACKEND_URL}/v3/documents/${DOC_ID}" "${COOKIE_HEADER[@]}") || true
  STATUS=$(echo "${RESP}" | sed -n 's/.*"status"\s*:\s*"\([^"]\+\)".*/\1/p' | head -n1 | tr '[:upper:]' '[:lower:]')
  SUMMARY_LEN=$(echo "${RESP}" | sed -n 's/.*"summary"\s*:\s*"\(.*\)".*/\1/p' | wc -c | tr -d ' ')
  echo "  - attempt ${ATTEMPTS}: status=${STATUS:-unknown}, summary_len=${SUMMARY_LEN:-0}"
  if [[ "${STATUS}" == "done" ]]; then
    break
  fi
  sleep 2
done

if [[ "${STATUS}" != "done" ]]; then
  echo "[ERR] Document did not reach status=done (last status=${STATUS:-unknown})" >&2
  exit 1
fi

echo "[OK] Repository ingestion test passed for ${REPO_URL} (doc ${DOC_ID})"
