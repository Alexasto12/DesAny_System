# @desany/orchestrator

The DesAny control plane: a Fastify HTTP API, a BullMQ safety-net scheduler,
and a `desany` CLI. **It never does pipeline work itself** — it only enqueues
jobs and reads state from Postgres / Redis.

## What it does

```
HTTP API (port 3000)        CLI (talks to API)
       │                          │
       └──────────┬───────────────┘
                  ▼
        ┌────────────────┐
        │ pipeline_jobs  │◄──── safety-net scheduler (every 5 min)
        │ + BullMQ queues│
        └───────┬────────┘
                ▼
   scrape → enrich → generate-content → build-site → send-outreach
   (other worker services consume from these queues)
```

## HTTP API

All responses are JSON.

### `POST /campaigns`

Create a new (category, city) campaign — enqueues a scrape job.

```bash
curl -X POST http://localhost:3000/campaigns \
  -H 'content-type: application/json' \
  -d '{"category":"hair salons","city":"Los Angeles","limit":10}'
```

Response:

```json
{
  "campaignId": "1",
  "jobId": "1",
  "category": "hair salons",
  "city": "Los Angeles",
  "limit": 10
}
```

Errors: `400 invalid_request` (zod), `500 enqueue_failed`.

### `GET /campaigns/:id`

`:id` is the BullMQ scrape job id returned by `POST /campaigns`. Returns
aggregate status: leads scraped (matched by category/city + scrape job time),
plus per-stage counts.

```json
{
  "campaignId": "1",
  "category": "hair salons",
  "city": "Los Angeles",
  "limit": 10,
  "scrape": {
    "jobId": "1",
    "state": "completed",
    "attemptsMade": 1,
    "failedReason": null,
    "finishedOn": 1736000000000,
    "processedOn": 1735999999000
  },
  "totals": {
    "leadsScraped": 10,
    "leadsEnriched": 8,
    "contentReady": 7,
    "deployed": 7,
    "contacted": 5,
    "failed": 1
  },
  "leads": { "byStatus": { "enriched": 8, "failed": 2 } },
  "sites": { "byStatus": { "deployed": 7 } },
  "outreach": { "byStatus": { "sent": 5 } },
  "pipeline": {
    "generate-content": { "completed": 7, "failed": 1 }
  }
}
```

Errors: `404 campaign_not_found`.

### `GET /leads?status=&limit=&offset=`

Paginated list. Each row includes the lead's current pipeline stage
(from the latest `pipeline_jobs` row).

```json
{
  "leads": [
    {
      "id": 17,
      "businessName": "Joe's Barbershop",
      "category": "hair salons",
      "city": "Los Angeles",
      "status": "enriched",
      "currentStage": "generate-content",
      "currentStageStatus": "completed",
      "currentStageUpdatedAt": "2026-05-18T10:32:11.000Z"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 287 }
}
```

### `GET /leads/:id`

Full detail: lead + enrichment + sites + outreach + pipeline history.

```json
{
  "lead": { "id": 17, "...": "..." },
  "enrichment": { "id": 8, "...": "..." },
  "sites": [{ "id": 12, "status": "deployed", "...": "..." }],
  "outreach": [{ "id": 4, "status": "sent", "...": "..." }],
  "pipeline": [{ "id": 99, "stage": "send-outreach", "status": "completed" }]
}
```

Errors: `400 invalid_id`, `404 lead_not_found`.

### `POST /leads/:id/retry`

Re-enqueues a lead from its most recent failed `pipeline_jobs` stage. The
state machine decides the right payload (`{leadId}` for enrich /
generate-content, `{siteId}` for build-site / send-outreach).

```json
{
  "leadId": 17,
  "retriedStage": "generate-content",
  "jobId": "42",
  "pipelineJobId": 88
}
```

Errors: `404 lead_not_found`, `409 no_failed_job`, `409 no_site_for_retry`,
`409 unretryable_stage`.

### `GET /metrics`

Monitoring snapshot:

```json
{
  "timestamp": "2026-05-18T11:00:00.000Z",
  "queueDepths": {
    "scrape":           { "waiting": 0, "active": 0, "delayed": 0, "failed": 0, "completed": 12 },
    "enrich":           { "waiting": 0, "active": 0, "delayed": 0, "failed": 0, "completed": 0 },
    "generate-content": { "waiting": 2, "active": 1, "delayed": 0, "failed": 1, "completed": 9 },
    "build-site":       { "waiting": 0, "active": 0, "delayed": 0, "failed": 0, "completed": 9 },
    "send-outreach":    { "waiting": 0, "active": 1, "delayed": 0, "failed": 0, "completed": 4 }
  },
  "throughput24h": {
    "scrape":           { "completed": 12, "failed": 0, "running": 0, "pending": 0, "total": 12 },
    "generate-content": { "completed": 9,  "failed": 1, "running": 1, "pending": 0, "total": 11 }
  },
  "errorCounts": { "generate-content": 1 },
  "sideMetrics24h": { "emailsSent": 5, "sitesDeployed": 9 }
}
```

### `GET /health`

Returns `{ "status": "ok", "service": "orchestrator" }`.

## Safety-net scheduler

Every `SCHEDULER_INTERVAL_MS` (default 5 minutes) the orchestrator runs:

1. **Resurrect stuck jobs.** `pipeline_jobs WHERE status='running'
   AND updated_at < now - STUCK_JOB_TIMEOUT_MS` (default 30 min) → mark
   failed and re-enqueue.
1b. **Kick scraped leads.** `leads WHERE status='scraped'` with no
   `generate-content` pipeline row → insert one + enqueue.
2. **Kick enriched leads.** `leads WHERE status='enriched'` with no
   `generate-content` pipeline row → insert one + enqueue.
3. **Kick content-ready sites.** `generated_sites WHERE status='content-ready'`
   with no `build-site` pipeline row → insert one + enqueue.
4. **Kick deployed sites.** `generated_sites WHERE status='deployed'` with
   no `send-outreach` pipeline row → insert one + enqueue.

The state machine (`src/stateMachine.ts`) is the single source of truth for
legal transitions:

| From               | To                                                |
| ------------------ | ------------------------------------------------- |
| `scrape`           | `enrich` (if lead has reviews) else `generate-content` |
| `enrich`           | `generate-content`                                |
| `generate-content` | `build-site`                                      |
| `build-site`       | `send-outreach`                                   |
| `send-outreach`    | (terminal)                                        |
| any                | `failed` (terminal until manual retry)            |

## CLI

The `desany` CLI talks to the HTTP API, so it works against a remote
orchestrator just as well as a local one. Override the base URL with
`--api <url>` or `DESANY_API_URL`.

```bash
# Install globally inside the workspace
pnpm -F @desany/orchestrator build
pnpm link --global --filter @desany/orchestrator
# Now `desany` is on $PATH.
```

Commands:

```bash
desany campaign create --category "hair salons" --city "Los Angeles" --limit 10
desany campaign status <id>

desany leads list [--status <s>] [--limit <n>] [--offset <n>]
desany leads show <leadId>

desany retry <leadId>

desany queues       # short form: just the queue depths
desany metrics      # full /metrics JSON
```

All commands print JSON to stdout. Non-zero exit on HTTP / connection errors.

## End-to-end smoke test

```bash
# 1. Bring everything up
docker compose -f docker/docker-compose.yml up -d
pnpm db:migrate

# 2. Build the orchestrator and link the CLI
pnpm -F @desany/orchestrator build
pnpm link --global --filter @desany/orchestrator

# 3. Kick off a campaign
desany campaign create --category "hair salons" --city "Los Angeles" --limit 10
# → { "campaignId": "1", "jobId": "1", ... }

# 4. Watch progress
watch -n 5 desany campaign status 1

# 5. Drill into a specific lead
desany leads list --status enriched
desany leads show 17

# 6. If a lead's pipeline died, retry from its failed stage
desany retry 17

# 7. Observability
desany queues
desany metrics
```

## Environment

| Variable               | Required | Default                                            | Notes |
| ---------------------- | -------- | -------------------------------------------------- | ----- |
| `PORT`                 | no       | `3000`                                             | HTTP port |
| `HOST`                 | no       | `0.0.0.0`                                          | Bind host |
| `REDIS_URL`            | yes      | —                                                  | BullMQ |
| `DATABASE_URL`         | yes      | —                                                  | Postgres |
| `LOG_LEVEL`            | no       | `info`                                             | pino level |
| `SCHEDULER_INTERVAL_MS`| no       | `300000` (5 min)                                   | Safety-net tick interval |
| `STUCK_JOB_TIMEOUT_MS` | no       | `1800000` (30 min)                                 | When a `running` pipeline row is considered stuck |
| `DESANY_API_URL`       | no       | `http://localhost:3000`                            | CLI default |

See [`.env.example`](./.env.example).

## Running

```bash
# Local dev (watch mode)
pnpm -F @desany/orchestrator dev

# Production
pnpm -F @desany/orchestrator build
pnpm -F @desany/orchestrator start

# Tests
pnpm -F @desany/orchestrator test

# Docker
docker compose -f docker/docker-compose.yml up -d orchestrator
```

## Design notes

- **No `campaigns` table.** A campaign is a single scrape job; its id is the
  BullMQ job id. `GET /campaigns/:id` joins leads by `(category, city,
  scraped_at >= scrapeJob.timestamp)`. If you re-run the same (category, city)
  later, the new campaign sees its own leads but old leads stay attached to
  the old campaign — exactly the desired behaviour.
- **CLI talks HTTP, never DB.** Lets you point `desany` at a remote
  orchestrator over the network.
- **Scheduler is idempotent.** Each tick re-checks the world. Skipping a tick
  or running an extra one is safe.
- **Retry resets the failed row.** We don't insert a new pipeline_jobs row;
  we flip the existing one back to `pending` so the lead/site only ever has
  one canonical row per stage.
