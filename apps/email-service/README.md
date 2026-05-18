# @desany/email-service

Cold outreach email worker and open-tracking endpoint.

## What it does

- Consumes BullMQ jobs from the `send-outreach` queue (payload: `{ siteId: number }`).
- Loads the generated site + lead, picks a subject A/B, renders an HTML email from a Handlebars template, appends a 1x1 tracking pixel, and sends via Resend.
- Enforces a strict daily cap (UTC days). If reached, requeues the job for the next UTC midnight.
- Exposes a tiny Fastify HTTP server on port `4000`:
  - `GET /track/open/:id` — records the open (idempotent) and returns a 1x1 transparent GIF.
  - `GET /health` — `{ status: "ok" }`.

## Environment

See `.env.example`. Required variables:

- `RESEND_API_KEY`
- `EMAIL_FROM` (e.g. `DesAny <hola@desany.dev>`)
- `TRACKING_BASE_URL` (public URL of this service — that's what gets baked into the pixel)
- `REDIS_URL`
- `DATABASE_URL`

Optional / defaulted:

- `EMAIL_REPLY_TO`
- `EMAIL_DAILY_CAP` (default `40`)
- `EMAIL_LANGUAGE` (default `en`; can be overridden per lead via `rawData.language`)
- `SENDER_NAME`, `SENDER_TITLE`
- `LOG_LEVEL`
- `HTTP_PORT` (default `4000`), `HTTP_HOST` (default `0.0.0.0`)

## Run

```bash
pnpm --filter @desany/email-service dev      # watch mode
pnpm --filter @desany/email-service build
pnpm --filter @desany/email-service start
pnpm --filter @desany/email-service test
```

Or via docker-compose: `docker compose -f docker/docker-compose.yml up email-service`.

## Templates

Plain-text-style HTML in `src/templates/`:

- `cold-v1-en.hbs` / `cold-v1-es.hbs` — short, personal body copy.
- `subjects.json` — subject lines per language. **Hot-swappable**: read on each job, not cached. Edit and the next send picks up the change.

Available variables: `businessName`, `city`, `category`, `siteUrl`, `senderName`, `senderTitle`.

## Tracking

Each outreach row gets an inserted `id` before sending. The body has an `<img>` tag pointing at `${TRACKING_BASE_URL}/track/open/${id}`. When the recipient's mail client loads the image, this service sets `outreach_messages.opened_at` (only if currently `NULL` — idempotent).

The tracking endpoint **never throws**. DB errors are logged and the GIF is still returned.

## Daily cap

Counts rows in `outreach_messages` with `status='sent'` and `sent_at >= start_of_utc_day(now)`. If `>= EMAIL_DAILY_CAP`, the current job is re-added to the queue with a delay equal to ms until the next UTC midnight.

## ⚠️ BEFORE PRODUCTION USE

Cold email from a fresh domain WILL go to spam. Before turning this on for real volume:

1. Set up SPF, DKIM, DMARC for EMAIL_FROM domain (Resend gives you records)
2. Warm up the domain: send 5/day → 20/day over 2 weeks before scaling
3. Use a dedicated outreach subdomain (e.g., go.desany.dev), not your primary domain
4. Resend is fine for the first 100-500 emails. For real cold outreach scale, move to Smartlead or Instantly which rotate inboxes and handle warmup.
5. Comply with CAN-SPAM (US), GDPR (EU), LSSI (Spain). Always include opt-out. The PS in our template is the opt-out signal.
6. Never send to scraped emails in regulated industries (healthcare, legal, finance) — high complaint risk.
