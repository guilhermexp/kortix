#!/usr/bin/env bash
set -euo pipefail

# Unset CLAUDECODE so the claude-agent-sdk CLI doesn't think it's nested
# inside another Claude Code session (happens when dev server runs from CC terminal)
unset CLAUDECODE

PORT="${PORT:-4000}"
EXISTING_PID="$(lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"

if [ -n "${EXISTING_PID}" ]; then
  CMD="$(ps -p "${EXISTING_PID}" -o command= 2>/dev/null || true)"
  if echo "${CMD}" | grep -Eq "(kortix/.*/apps/api|bun run --hot src/index.ts|apps/api/src/index.ts)"; then
    echo "[dev:server] Port ${PORT} already in use by stale API process (${EXISTING_PID}). Restarting it..."
    kill "${EXISTING_PID}" || true
    sleep 0.4
  else
    echo "[dev:server] Port ${PORT} is already in use by another process (${EXISTING_PID})."
    echo "[dev:server] Stop that process or run with a different PORT."
    exit 1
  fi
fi

# Start API server + ingestion worker together
bun run --hot src/index.ts &
API_PID=$!

bun run src/worker/ingestion-worker.ts &
WORKER_PID=$!

# Handle cleanup on exit
cleanup() {
  kill "$API_PID" "$WORKER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[dev:server] API (PID $API_PID) + ingestion-worker (PID $WORKER_PID) started"
wait $API_PID $WORKER_PID
