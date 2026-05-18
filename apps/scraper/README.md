# @desany/scraper

BullMQ worker that consumes `scrape` jobs, hits Google Maps via one of two
pluggable strategies, enriches results with public contact emails, and upserts
into the `leads` table.

## Job flow

```
ScrapeJobPayload { category, city, limit }
        │
        ▼
  pick strategy ──► RawBusiness[]
        │
        ▼
  for each business:
    - fetch homepage/contact pages, parse emails
    - upsert into `leads` (by businessName + city)
        │
        ▼
  update pipeline_jobs.status
```

## Environment

Variables are validated with `zod` at startup; missing/invalid vars exit
non-zero.

| Variable             | Required | Default                          | Notes                                              |
| -------------------- | -------- | -------------------------------- | -------------------------------------------------- |
| `SCRAPER_STRATEGY`   | yes      | `apify`                          | `apify` or `playwright`                            |
| `APIFY_TOKEN`        | apify    | —                                | Required when strategy is `apify`                  |
| `APIFY_ACTOR_ID`     | no       | `compass/google-maps-extractor`  | Alt: `drobnikj/google-maps-extractor`              |
| `REDIS_URL`          | yes      | —                                | `redis://redis:6379` in compose                    |
| `DATABASE_URL`       | yes      | —                                | Postgres connection string                         |
| `LOG_LEVEL`          | no       | `info`                           | `fatal\|error\|warn\|info\|debug\|trace`           |
| `NODE_ENV`           | no       | `production`                     | `development` runs Playwright with `headless:false`|
| `WORKER_CONCURRENCY` | no       | `1`                              | Concurrent BullMQ jobs per worker                  |

A copy lives at [`.env.example`](./.env.example).

## Strategies

### `apify`

Uses `apify-client` against an actor that scrapes Google Maps (default:
`compass/google-maps-extractor`, but you can swap to
`drobnikj/google-maps-extractor` via `APIFY_ACTOR_ID`). The actor handles
pagination, geolocation, and review extraction; we just normalize its dataset
output into `RawBusiness[]`.

Pros: reliable, handles blocking, returns rich review data.
Cons: costs Apify credits; quota-bound.

### `playwright`

Headless Chromium + `playwright-extra` with the puppeteer stealth plugin.
Navigates to
`https://www.google.com/maps/search/{category}+in+{city}`, dismisses the EU
consent banner and login modals, scrolls the results panel until `limit` cards
load (with a stability detector for the end of the list), then opens each place
page and extracts name, phone, website, address, and the top reviews.

Pros: free, no third-party dependency.
Cons: Google may CAPTCHA / rate-limit; selectors drift; slower.

Set `NODE_ENV=development` locally to launch a visible browser for debugging.

## Enqueueing a job

From the repo root:

```bash
# With env loaded via .env (Node 22 supports --env-file natively)
node --env-file=.env --experimental-strip-types apps/scraper/scripts/enqueue.ts \
  --category "hair salons" --city "Los Angeles" --limit 50

# Or via pnpm
pnpm --filter @desany/scraper enqueue -- \
  --category "hair salons" --city "Los Angeles" --limit 50
```

The script prints the BullMQ job ID as a single JSON line.

## Running locally

```bash
pnpm install
pnpm --filter @desany/types build
pnpm --filter @desany/db build
pnpm --filter @desany/scraper dev    # tsx watch
```

## Running via Docker

The Docker image is multi-stage: a `node:22-alpine` builder for compilation,
and `mcr.microsoft.com/playwright:v1.50.0-noble` for runtime (Chromium and all
system libs preinstalled). The worker touches `/tmp/healthy` on startup, which
Docker's `HEALTHCHECK` watches.

```bash
docker compose -f docker/docker-compose.yml up scraper
```

## Tests

```bash
pnpm --filter @desany/scraper test
```

Currently covers the email extractor: regex matches, denylist (image
extensions, `noreply@`, sentry/wixpress/etc.), and obfuscated fallbacks like
`contact at example dot com` and HTML-entity-encoded `@`/`.`.

## Troubleshooting

**Google Maps CAPTCHA / soft-block with the Playwright strategy.**
Switch `SCRAPER_STRATEGY=apify` for the affected job, or rotate the egress IP.
Symptoms: zero results, redirect to `/sorry/index`, or no `div[role="feed"]`
within the timeout.

**`APIFY_TOKEN is required when SCRAPER_STRATEGY=apify`.**
The worker refuses to start. Set the token in `.env` or unset
`SCRAPER_STRATEGY` to fall back to `playwright`.

**Apify quota exhausted.**
Actor runs return zero items and the actor's status page shows quota errors.
Either top up the Apify account or temporarily switch strategy.

**Redis connection bouncing.**
BullMQ + ioredis auto-reconnect; you'll see `redis connection error
(auto-reconnecting)` warnings. The worker stays subscribed and resumes once
Redis is reachable.

**`leads` duplicate on (businessName, city).**
Upsert is done in two steps (SELECT + UPDATE / INSERT) because the table has no
unique index in the current schema. A future migration should add one; until
then, races between two parallel workers on identical search terms can produce
duplicates. Run `WORKER_CONCURRENCY=1` per (category, city) to avoid this.

**Worker won't shut down.**
Send `SIGTERM` (or `SIGINT`). `worker.close()` waits for in-flight jobs to
finish; raise `BULL_FORCE_KILL_TIMEOUT` if you need a hard limit.

## Legal note

Google Maps' Terms of Service generally restrict automated scraping. Use the
Apify strategy with a licensed actor for production. The Playwright strategy is
provided for development against your own infrastructure and for jurisdictions
where the activity is permitted. This service does not currently fetch or
parse `robots.txt` — verify compliance with target sites' policies before use.
