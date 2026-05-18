#!/usr/bin/env bash
# DesAny LLM Server entrypoint.
# Validates env vars, logs the resolved config, then execs vLLM's OpenAI
# server. We `exec` so vLLM becomes PID 1 and receives signals from Docker.
set -euo pipefail

: "${MODEL_NAME:=Qwen/Qwen3-30B-A3B}"
: "${SERVED_MODEL_NAME:=qwen3-moe}"
: "${TENSOR_PARALLEL_SIZE:=1}"
: "${MAX_MODEL_LEN:=8192}"
: "${GPU_MEM_UTIL:=0.90}"
: "${HOST:=0.0.0.0}"
: "${PORT:=8000}"

is_positive_int() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

is_unit_float() {
  # Accepts 0 < x <= 1 (e.g. 0.9, 0.85, 1.0). Rejects negatives, >1, junk.
  [[ "$1" =~ ^(0(\.[0-9]+)?|1(\.0+)?)$ ]] && [[ "$1" != "0" && "$1" != "0.0" ]]
}

if ! is_positive_int "${TENSOR_PARALLEL_SIZE}"; then
  echo "[llm-server] FATAL: TENSOR_PARALLEL_SIZE must be a positive integer, got '${TENSOR_PARALLEL_SIZE}'" >&2
  exit 1
fi

if ! is_positive_int "${MAX_MODEL_LEN}"; then
  echo "[llm-server] FATAL: MAX_MODEL_LEN must be a positive integer, got '${MAX_MODEL_LEN}'" >&2
  exit 1
fi

if ! is_unit_float "${GPU_MEM_UTIL}"; then
  echo "[llm-server] FATAL: GPU_MEM_UTIL must be in (0, 1], got '${GPU_MEM_UTIL}'" >&2
  exit 1
fi

if ! is_positive_int "${PORT}"; then
  echo "[llm-server] FATAL: PORT must be a positive integer, got '${PORT}'" >&2
  exit 1
fi

cat <<EOF
[llm-server] Starting vLLM with config:
  MODEL_NAME            = ${MODEL_NAME}
  SERVED_MODEL_NAME     = ${SERVED_MODEL_NAME}
  TENSOR_PARALLEL_SIZE  = ${TENSOR_PARALLEL_SIZE}
  MAX_MODEL_LEN         = ${MAX_MODEL_LEN}
  GPU_MEM_UTIL          = ${GPU_MEM_UTIL}
  HOST                  = ${HOST}
  PORT                  = ${PORT}
EOF

exec python3 -m vllm.entrypoints.openai.api_server \
  --model "${MODEL_NAME}" \
  --served-model-name "${SERVED_MODEL_NAME}" \
  --tensor-parallel-size "${TENSOR_PARALLEL_SIZE}" \
  --max-model-len "${MAX_MODEL_LEN}" \
  --gpu-memory-utilization "${GPU_MEM_UTIL}" \
  --host "${HOST}" \
  --port "${PORT}" \
  "$@"
