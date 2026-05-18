# @desany/llm-server

vLLM-based inference server for DesAny. Serves **Qwen3-30B-A3B** (Mixture-of-Experts, ~3B active parameters per token) behind an **OpenAI-compatible** REST API on port `8000`.

All other DesAny services talk to this server via the `OPENAI_BASE_URL`-style endpoint at `http://llm-server:8000/v1`.

---

## GPU Requirements

Qwen3-30B-A3B is a 30B-total-parameter MoE. In bf16 the raw weights are ~60 GB; with KV cache and activations, plan for:

| Layout                   | Per-GPU VRAM | `TENSOR_PARALLEL_SIZE` | Notes                                        |
| ------------------------ | ------------ | ---------------------- | -------------------------------------------- |
| 1x NVIDIA A100 80GB      | 80 GB        | `1`                    | Recommended single-GPU configuration.        |
| 1x NVIDIA H100 80GB      | 80 GB        | `1`                    | Faster than A100; same config.               |
| 2x NVIDIA A6000 (~48 GB) | 48 GB        | `2`                    | Split weights across both cards.             |
| 2x NVIDIA L40S 48GB      | 48 GB        | `2`                    | Same idea; tune `GPU_MEM_UTIL` if OOM.       |

Anything less than ~48 GB total VRAM is unlikely to fit even after sharding. CUDA 12.x and a matching NVIDIA driver are required (the `vllm/vllm-openai:latest` base image provides the runtime).

---

## Build

From the repo root:

```bash
docker build -t desany-llm apps/llm-server/
```

This bakes the entrypoint and healthcheck on top of `vllm/vllm-openai:latest`.

## Run standalone

Single A100 / H100:

```bash
docker run --gpus all -p 8000:8000 \
  -e TENSOR_PARALLEL_SIZE=1 \
  -e MAX_MODEL_LEN=8192 \
  -e GPU_MEM_UTIL=0.90 \
  desany-llm
```

Two-GPU split (e.g., 2x A6000):

```bash
docker run --gpus all -p 8000:8000 \
  -e TENSOR_PARALLEL_SIZE=2 \
  -e MAX_MODEL_LEN=8192 \
  -e GPU_MEM_UTIL=0.90 \
  desany-llm
```

The container will:

1. Print the resolved config.
2. Download model weights from the Hugging Face hub on first boot (cached in the container; mount a volume to persist).
3. Initialize vLLM and expose `:8000`.
4. Report `200 OK` on `GET /health` once warm.

To persist the HF cache between container restarts, mount a host volume:

```bash
docker run --gpus all -p 8000:8000 \
  -v $HOME/.cache/huggingface:/root/.cache/huggingface \
  desany-llm
```

## Run via docker-compose

From the repo root:

```bash
docker compose -f docker/docker-compose.yml up llm-server
```

The compose block requests all available GPUs and waits up to 5 minutes (`start_period: 300s`) for the first healthcheck while weights download and the model loads.

## Test

Wait for readiness and send a sample chat completion:

```bash
curl -s http://localhost:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "qwen3-moe",
    "messages": [
      {"role": "user", "content": "Write a one-sentence hero headline for a hair salon in Los Angeles. Return only the headline, no quotes."}
    ],
    "max_tokens": 64,
    "temperature": 0.7
  }'
```

Or run the bundled smoke test (polls `/health` for up to 10 minutes, then exercises `/v1/chat/completions`):

```bash
./apps/llm-server/test-llm.sh
# or against a different host
LLM_HOST=http://my-host:8000 ./apps/llm-server/test-llm.sh
```

To warm up the model with a few realistic prompts and measure latency:

```bash
cd apps/llm-server
pnpm install
pnpm run warmup
# or
npx tsx warm-up.ts
```

## Endpoint URL

Other DesAny services (orchestrator, content-gen, etc.) should set:

```
LLM_BASE_URL=http://llm-server:8000/v1
LLM_MODEL_NAME=qwen3-moe
```

And use the `openai` SDK with that base URL and any non-empty API key.

## Configuration (env vars)

| Variable                | Default                  | Purpose                                                                  |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------ |
| `MODEL_NAME`            | `Qwen/Qwen3-30B-A3B`     | HF model id loaded by vLLM.                                              |
| `SERVED_MODEL_NAME`     | `qwen3-moe`              | Alias exposed in the OpenAI API (`"model"` field in requests).           |
| `TENSOR_PARALLEL_SIZE`  | `1`                      | Number of GPUs to shard the model across.                                |
| `MAX_MODEL_LEN`         | `8192`                   | Max context length (prompt + completion). Higher = more KV cache VRAM.   |
| `GPU_MEM_UTIL`          | `0.90`                   | Fraction of GPU VRAM vLLM may use (0, 1]. Lower if you OOM.              |
| `HOST`                  | `0.0.0.0`                | Bind address.                                                            |
| `PORT`                  | `8000`                   | Bind port.                                                               |

See `.env.example` in this folder.

## Troubleshooting

### Out-of-memory (OOM) on startup

vLLM logs something like `CUDA out of memory` or `Failed to allocate KV cache`.

- Lower `GPU_MEM_UTIL` (e.g., `0.85`, `0.80`).
- Lower `MAX_MODEL_LEN` (e.g., `4096`). KV cache scales linearly with context.
- If you have multiple GPUs, raise `TENSOR_PARALLEL_SIZE` to shard weights.
- Make sure no other process is holding VRAM: `nvidia-smi`.

### Model download issues

First boot pulls ~60 GB from Hugging Face. If you see `403 Forbidden`, `401 Unauthorized`, or "gated model" errors:

- The Qwen3 weights are public, but if you've enabled HF login, pass a token:
  `-e HUGGING_FACE_HUB_TOKEN=hf_xxx` (or mount your `~/.cache/huggingface`).
- For slow networks, the first boot can take 20-60 minutes. Mount the HF cache (see above) so subsequent boots reuse the weights.
- If the download is interrupted, partial files remain in the cache; remove the model's `models--Qwen--Qwen3-30B-A3B/` directory and retry.

### Slow first request (cold start)

The first request after boot will be noticeably slower than subsequent ones because vLLM lazily compiles CUDA graphs and warms its KV cache. Expect 5-20s for the first token, then well under 1s for follow-ups.

- Run `pnpm run warmup` after boot to pre-compile graphs.
- Compose sets `start_period: 300s` so Docker won't mark the container unhealthy during this window.

### Healthcheck flapping

The container is `unhealthy` until `/health` returns 200, which only happens after the model is fully loaded. On a cold boot with a fresh download, this can exceed 5 minutes. Increase `start_period` in `docker/docker-compose.yml` if needed.
