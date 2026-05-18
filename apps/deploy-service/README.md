# @desany/deploy-service

A BullMQ worker that consumes `build-site` jobs, builds the generated landing site via the `@desany/templates` `generate-site` script, deploys the static output to Vercel via the REST API, polls until the deployment is READY, persists the resulting `vercel_url` / `vercel_project_id`, and enqueues a `send-outreach` job.

## Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `VERCEL_TOKEN` | yes | — | Personal or team token with `projects:write` and `deployments:write`. |
| `VERCEL_TEAM_ID` | no | — | If set, all Vercel API calls are scoped to this team (`?teamId=...`). |
| `REDIS_URL` | yes | — | BullMQ queue connection. |
| `DATABASE_URL` | yes | — | Postgres connection string used by `@desany/db`. |
| `LOG_LEVEL` | no | `info` | pino log level. |
| `DEPLOY_TIMEOUT_MS` | no | `300000` | Max time (ms) to wait for a deployment to reach `READY`. |
| `DEPLOY_POLL_INTERVAL_MS` | no | `5000` | Poll interval for `getDeployment`. |
| `SITE_WORK_DIR` | no | `/tmp/desany/sites` | Where `content.json` and the build output go. |
| `TEMPLATE_SCRIPT_PATH` | no | `packages/templates/scripts/generate-site.ts` | Path (relative to monorepo root) of the generate-site script. |
| `MONOREPO_ROOT` | no | `process.cwd()` | Working directory for the `pnpm tsx ...` invocation. |

## Local testing with a fake content.json

The worker pulls `content_json` straight from the `generated_sites` row, so for a stand-alone smoke test you can seed a row and put a fake `content.json` directly on disk:

```bash
# 1. Insert a fake generated_sites row (pseudo-SQL — adjust columns as needed)
psql "$DATABASE_URL" <<'SQL'
INSERT INTO leads (source, business_name, category, city)
VALUES ('manual', 'Acme Pizza', 'restaurant', 'Brooklyn')
RETURNING id;
SQL

psql "$DATABASE_URL" <<'SQL'
INSERT INTO generated_sites (lead_id, content_json, template_variant, status)
VALUES (1, '{"hero": {"headline": "Hi", "subheadline": "Test"}}', 'modern', 'content-ready')
RETURNING id;
SQL

# 2. Push a job
node -e "
import('bullmq').then(async ({ Queue }) => {
  const q = new Queue('build-site', { connection: { host: 'localhost', port: 6379 } });
  await q.add('build-site', { siteId: 1 });
  await q.close();
});
"

# 3. Run the worker
pnpm --filter @desany/deploy-service dev
```

If you only want to exercise the generation step without touching Vercel, point `TEMPLATE_SCRIPT_PATH` at a small noop script that writes a file into the output directory.

## Vercel API rate limits

Vercel publishes the current rate limit table at
<https://vercel.com/docs/rest-api/reference/rate-limits>. As of writing:

- **Deployments**: 60 per minute per user/team for `POST /v13/deployments`.
- **Projects**: 200 per minute for general project endpoints.
- **General**: 600 requests per minute per access token across the REST API.

The client respects `Retry-After` on 429 responses. On any 5xx it retries with
exponential backoff (3 attempts, base 2 s). Persistent 429/5xx after three
attempts fail the job and mark the site `deploy-failed`.

Every API call logs `{ method, url, status, latencyMs }` so you can audit rate
usage.

## Failure semantics

| Failure point | Side effect | DB state | Cleanup |
| --- | --- | --- | --- |
| `generate-site` script returns non-zero | nothing on Vercel yet | `generated_sites.status='deploy-failed'`, error → `pipeline_jobs.last_error` | none |
| `createProject` fails after retries | nothing on Vercel | `generated_sites.status='deploy-failed'` | none |
| `createDeployment` fails after retries | **project exists but no deployment** | `generated_sites.status='deploy-failed'`; `vercel_project_id` NOT yet saved | **orphan project** — list with `GET /v10/projects` and delete manually |
| Deployment never reaches READY before `DEPLOY_TIMEOUT_MS` | project + dangling deployment | `generated_sites.status='deploy-failed'` | manual cleanup |
| `getDeployment` returns `ERROR` / `CANCELED` | project + failed deployment | `generated_sites.status='deploy-failed'` | manual cleanup |

We intentionally **never** auto-delete Vercel projects on failure: the cost of
accidentally nuking a real project always outweighs the cost of carrying an
orphan. Operators are expected to reconcile periodically.

## Legal warning

The Vercel **Hobby** plan ToS prohibits commercial use of sites you host on
behalf of clients (see <https://vercel.com/legal/terms> — "Fair Use Policy").
Running DesAny against real leads on a Hobby token violates that agreement and
puts the whole account at risk of suspension. **Production deployments
require a Vercel Pro plan (or higher) with a team token.** Set
`VERCEL_TEAM_ID` to scope deployments to the Pro team.
