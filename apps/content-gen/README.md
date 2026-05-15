# @desany/content-gen

BullMQ worker that turns an enriched lead into a validated `LandingContent`
JSON document and queues a build job.

## What it does

For each `generate-content` queue job (`{ leadId }`):

1. Loads the lead from Postgres.
2. If no `lead_enrichments` row exists, runs the review-summary prompt on up
   to 10 reviews from `lead.rawData` and inserts an enrichment row.
3. Builds the landing-content prompt from the lead + enrichment.
4. Calls the LLM via the OpenAI-compatible endpoint (vLLM by default).
5. Validates the response with a strict zod schema; retries the prompt up to
   `LLM_MAX_RETRIES` times with a corrective follow-up message on failure.
6. Inserts a `generated_sites` row with `status='content-ready'`.
7. Enqueues `{ siteId }` onto the `build-site` queue.
8. Updates `pipeline_jobs` to `completed` (or `failed` with the error).

## Environment variables

| Var               | Default                                       | Notes                                     |
|-------------------|-----------------------------------------------|-------------------------------------------|
| `LLM_BASE_URL`    | `http://llm-server:8000/v1`                   | OpenAI-compatible endpoint                |
| `LLM_MODEL_NAME`  | `qwen3-moe`                                   | Model id served by vLLM                   |
| `LLM_API_KEY`     | `EMPTY`                                       | vLLM ignores this but the SDK needs a val |
| `LLM_TIMEOUT_MS`  | `60000`                                       | Per-call timeout in ms                    |
| `LLM_MAX_RETRIES` | `2`                                           | Times to retry on invalid JSON / schema   |
| `REDIS_URL`       | `redis://redis:6379`                          | BullMQ connection                         |
| `DATABASE_URL`    | `postgresql://desany:desany@postgres:5432/desany` | Drizzle / pg connection             |
| `LOG_LEVEL`       | `info`                                        | pino level                                |

See `.env.example` for a copy/pasteable template.

## Running locally

Prereqs: a running `llm-server` (or any OpenAI-compatible endpoint),
Postgres with migrations applied, and Redis.

```bash
# From the repo root
pnpm install
pnpm --filter @desany/types build
pnpm --filter @desany/db build
pnpm --filter @desany/prompts build

# Start the worker in watch mode
cd apps/content-gen
cp .env.example .env  # then tweak as needed
pnpm dev
```

Enqueue a test job from another shell:

```bash
# In a node REPL or a small script
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
const q = new Queue('generate-content', { connection: new IORedis(process.env.REDIS_URL) });
await q.add('generate-content', { leadId: 1 });
```

## Testing

```bash
pnpm --filter @desany/content-gen test
```

`schema.test.ts` covers the zod schema (strictness, required fields,
wrong types). `llm.test.ts` mocks the OpenAI client and covers the happy
path, JSON-retry loop, schema-retry loop, network retries, and total
exhaustion.

## Sample `LandingContent` output

```json
{
  "hero": {
    "headline": "Classic cuts and clean fades on South Congress.",
    "subheadline": "Walk-ins welcome. Joe's has been the neighborhood barbershop for two decades."
  },
  "services": [
    { "name": "Signature Fade", "description": "Skin, low, mid, or high — taper of your choice.", "icon": "Scissors" },
    { "name": "Beard Trim", "description": "Shape, line up, and condition.", "icon": "Scissors" },
    { "name": "Hot Towel Shave", "description": "Old-school straight-razor shave with steamed towels.", "icon": "Sparkles" },
    { "name": "Kids Cuts", "description": "Patient cuts for first-timers.", "icon": "Smile" }
  ],
  "testimonials": [
    { "text": "Best fade in town. Joe is a master.", "author": "Marcus T.", "rating": 5 },
    { "text": "Super friendly, great vibe.", "author": "Diego R.", "rating": 5 }
  ],
  "about": "Joe's Barbershop has been cutting hair on South Congress since 2003. We are a family-run shop that takes pride in classic technique and good conversation.",
  "cta": { "text": "Call to book", "action": "phone", "target": "+1-512-555-0142" },
  "contact": {
    "phone": "+1-512-555-0142",
    "email": "hello@joesbarber.com",
    "address": "212 South Congress Ave, Austin, TX"
  },
  "colors": { "primary": "#1a1a1a", "secondary": "#c9a96e", "accent": "#f5f1ea" },
  "styleVariant": "bold"
}
```

## Prompt versioning policy

Prompts live in `@desany/prompts`. The package exports `PROMPT_VERSION`
(a date-tagged string like `2026-05-15.1`). Every prompt change should:

1. Bump `PROMPT_VERSION` in `packages/prompts/src/index.ts` (date + suffix).
2. Ship together with any downstream schema changes — the version is logged
   on every LLM call alongside the prompt hash, so back-fills and A/B
   comparisons can be reconstructed from logs.
3. Keep the field-by-field semantic description in sync with the zod schema
   in `apps/content-gen/src/schema.ts`. Mismatch = retry loop = wasted tokens.

Every LLM call logs `{ promptName, promptHash, latencyMs, promptTokens,
completionTokens, totalTokens, jsonAttempt, netAttempt }` at `info` level.
