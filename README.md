# DesAny

An autonomous infrastructure that scrapes local businesses, generates modern Next.js landing pages using LLMs, deploys them to Vercel, and sends targeted cold outreach emails.

## Quick Start

Prerequisites: Node 22+, pnpm 9+, Docker + Docker Compose, a VPS with GPU for LLM serving (optional, can point to remote).

```bash
git clone <repo> desany
cd desany

# Copy env
cp .env.example .env
# Edit .env with your tokens

# Install deps
pnpm install

# Start services (postgres, redis, etc.)
docker compose -f docker/docker-compose.yml up -d

# Run migrations
pnpm db:migrate

# Start dev servers (if services are implemented)
pnpm dev
```

## Architecture

See CLAUDE.md for conventions. Services communicate via:
- **State**: Postgres `pipeline_jobs` table
- **Async work**: BullMQ queues on Redis

## Workstreams

- `workstream/llm` — vLLM serving Qwen3 MoE
- `workstream/scrape` — Google Maps + email enrichment
- `workstream/gen` — LLM content generation
- `workstream/template` — Next.js landing page
- `workstream/deploy` — Vercel API integration
- `workstream/email` — Resend + open tracking
- `workstream/orchestrator` — API + state machine

See PRs and CLAUDE.md for details on each.

## Monitoring

```bash
# Database
pnpm db:studio

# Logs (from docker compose)
docker compose logs -f
```
