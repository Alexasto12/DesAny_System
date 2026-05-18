# Build context MUST be the monorepo root (../..).
# This image embeds packages/templates so the deploy-service worker can invoke
# `pnpm tsx packages/templates/scripts/generate-site.ts` at runtime.

# -------- builder --------
FROM node:22-alpine AS builder

RUN apk add --no-cache git \
 && corepack enable \
 && corepack prepare pnpm@9.12.0 --activate

WORKDIR /workspace

COPY pnpm-workspace.yaml package.json tsconfig.json ./
COPY pnpm-lock.yaml* ./

COPY packages/types/package.json packages/types/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/templates/package.json packages/templates/package.json
COPY apps/deploy-service/package.json apps/deploy-service/package.json

RUN pnpm install --filter @desany/types... \
                 --filter @desany/db... \
                 --filter @desany/templates... \
                 --filter @desany/deploy-service... \
                 --no-frozen-lockfile

COPY packages/types packages/types
COPY packages/db packages/db
COPY packages/templates packages/templates
COPY apps/deploy-service apps/deploy-service

RUN pnpm --filter @desany/types build \
 && pnpm --filter @desany/db build \
 && pnpm --filter @desany/deploy-service build

# -------- runtime --------
FROM node:22-alpine AS runtime

RUN apk add --no-cache git \
 && corepack enable \
 && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

ENV NODE_ENV=production
ENV MONOREPO_ROOT=/app

COPY --from=builder /workspace/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /workspace/package.json ./package.json
COPY --from=builder /workspace/tsconfig.json ./tsconfig.json
COPY --from=builder /workspace/node_modules ./node_modules

COPY --from=builder /workspace/packages/types ./packages/types
COPY --from=builder /workspace/packages/db ./packages/db
COPY --from=builder /workspace/packages/templates ./packages/templates
COPY --from=builder /workspace/apps/deploy-service ./apps/deploy-service

RUN mkdir -p /tmp/desany/sites

CMD ["node", "apps/deploy-service/dist/index.js"]
