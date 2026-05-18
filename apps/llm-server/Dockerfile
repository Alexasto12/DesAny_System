# DesAny LLM Server: vLLM + Qwen3-30B-A3B (MoE)
# Serves an OpenAI-compatible API on port 8000.
FROM vllm/vllm-openai:latest

# Install curl for the healthcheck (vllm/vllm-openai images do not ship with it
# guaranteed; install defensively so HEALTHCHECK never silently fails).
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/llm-server

# Default runtime config (override via docker -e / compose environment).
ENV MODEL_NAME="Qwen/Qwen3-30B-A3B" \
    SERVED_MODEL_NAME="qwen3-moe" \
    TENSOR_PARALLEL_SIZE="1" \
    MAX_MODEL_LEN="8192" \
    GPU_MEM_UTIL="0.90" \
    HOST="0.0.0.0" \
    PORT="8000"

COPY entrypoint.sh /opt/llm-server/entrypoint.sh
RUN chmod +x /opt/llm-server/entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=300s \
    CMD curl -fsS http://localhost:8000/health || exit 1

ENTRYPOINT ["/opt/llm-server/entrypoint.sh"]
