# DesAny Project Conventions

This is a multi-service backend for autonomous landing page generation and cold email outreach.

## Tech Stack (Frozen)
- **Node.js**: 22.x
- **pnpm**: 9.x
- **TypeScript**: 5.6.0 (strict mode, ESM only)
- **Database**: PostgreSQL 16 + Drizzle ORM
- **Queue**: Redis 7 + BullMQ
- **Framework**: Fastify (HTTP), vanilla Node (workers)
- **Package Manager**: pnpm workspaces

## Project Structure

- `apps/`: Services (orchestrator, llm-server, scraper, content-gen, deploy-service, email-service)
- `packages/types`: Shared TypeScript interfaces
- `packages/db`: Drizzle schema, migrations, DB client
- `packages/templates`: Next.js landing template
- `packages/prompts`: LLM prompt strings
- `docker/`: docker-compose.yml

## Coding Standards

1. **All apps must**:
   - Have their own `package.json` with `"type": "module"`
   - Have a `tsconfig.json` extending root
   - Import types from `@desany/types`
   - Import DB from `@desany/db`
   - Read config from env vars, validate with `zod`
   - Have a Dockerfile (node:22-alpine for workers, vllm/vllm-openai for llm-server)
   - Have a healthcheck endpoint if HTTP service
   - Use structured logging (pino JSON)

2. **No direct service-to-service calls**. Communication happens via:
   - Postgres `pipeline_jobs` table (state machine)
   - Redis + BullMQ queues (async work)

3. **Queue names** (frozen):
   - `scrape` → BullMQ job queue
   - `enrich` → (if async)
   - `generate-content` → LLM-based content
   - `build-site` → Next.js build
   - `send-outreach` → Email dispatch

4. **Naming**:
   - Files: camelCase.ts
   - Exports: PascalCase (types) or camelCase (functions)
   - Branches: workstream/{component-name}
   - Commits: conventional commits (feat/fix/chore)

5. **Testing**: vitest for unit tests, keep mocks minimal, no E2E in individual services (orchestrator does E2E).

## Database Access Pattern

All services use a shared `@desany/db` client:

```typescript
import { db } from '@desany/db';
const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
```

Never instantiate postgres connections directly.

## Secrets & Config

Use `.env` at root. Never commit `.env`. Each service reads what it needs via `process.env` + zod validation.

Example in a service:

```typescript
const config = z.object({
  REDIS_URL: z.string().url(),
  LLM_BASE_URL: z.string().url(),
}).parse(process.env);
```

## Adding a New Workstream

1. Create `apps/{name}/` or `packages/{name}/`
2. Add `package.json` with proper exports
3. Import `@desany/types` and `@desany/db`
4. Add Dockerfile
5. Create a `workstream/{name}` branch
6. Open PR to main when done

## Merge Policy

- All branches must have a PR
- PRs must pass `pnpm build` in the root
- Squash + merge to keep history clean
- Resolve conflicts by reading CLAUDE.md, not guessing
