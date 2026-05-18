#!/usr/bin/env bash
# Smoke test for the DesAny LLM server.
# Polls /health until the server is ready (max 10 min), then sends a chat
# completion request and prints the response. Exits 0 on success, 1 on failure.
set -euo pipefail

LLM_HOST="${LLM_HOST:-http://localhost:8000}"
MODEL_ALIAS="${SERVED_MODEL_NAME:-qwen3-moe}"
MAX_WAIT_SECONDS="${MAX_WAIT_SECONDS:-600}" # 10 minutes
POLL_INTERVAL="${POLL_INTERVAL:-5}"

log() { printf '[test-llm] %s\n' "$*"; }
fail() { printf '[test-llm] FAIL: %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fail "curl is required"

log "Waiting for ${LLM_HOST}/health (up to ${MAX_WAIT_SECONDS}s, polling every ${POLL_INTERVAL}s)..."
deadline=$(( $(date +%s) + MAX_WAIT_SECONDS ))
attempt=0
until curl -fsS -o /dev/null "${LLM_HOST}/health"; do
  attempt=$((attempt + 1))
  now=$(date +%s)
  if (( now >= deadline )); then
    fail "Server did not become healthy within ${MAX_WAIT_SECONDS}s (${attempt} attempts)"
  fi
  log "  not ready yet (attempt ${attempt}); sleeping ${POLL_INTERVAL}s..."
  sleep "${POLL_INTERVAL}"
done
log "Server is healthy."

PROMPT='Write a one-sentence hero headline for a hair salon in Los Angeles. Return only the headline, no quotes.'

REQUEST_BODY=$(cat <<EOF
{
  "model": "${MODEL_ALIAS}",
  "messages": [
    {"role": "user", "content": "${PROMPT}"}
  ],
  "max_tokens": 128,
  "temperature": 0.7
}
EOF
)

log "Sending chat completion request..."
RESPONSE=$(curl -fsS -X POST "${LLM_HOST}/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -d "${REQUEST_BODY}") || fail "Request to /v1/chat/completions failed"

log "Raw response:"
printf '%s\n' "${RESPONSE}"

# Extract the assistant message. Prefer jq; fall back to grep if jq is missing.
if command -v jq >/dev/null 2>&1; then
  CONTENT=$(printf '%s' "${RESPONSE}" | jq -r '.choices[0].message.content // empty')
else
  CONTENT=$(printf '%s' "${RESPONSE}" | grep -o '"content"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed 's/^"content"[[:space:]]*:[[:space:]]*"//; s/"$//')
fi

if [[ -z "${CONTENT}" ]]; then
  fail "Response did not contain choices[0].message.content"
fi

log "Headline:"
printf '%s\n' "${CONTENT}"
log "OK"
exit 0
