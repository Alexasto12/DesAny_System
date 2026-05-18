# syntax=docker/dockerfile:1.7

# ---- Stage 1: build TypeScript with full toolchain ----
FROM node:22-alpine AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy workspace manifests first to maximize layer cache
COPY pnpm-workspace.yaml package.json ./
COPY pnpm-lock.yaml* ./
COPY tsconfig.json ./
COPY packages/types/package.json packages/types/
COPY packages/db/package.json packages/db/
COPY apps/scraper/package.json apps/scraper/

RUN pnpm install --frozen-lockfile --filter @desany/scraper... || \
    pnpm install --filter @desany/scraper...

# Copy sources and build
COPY packages/types packages/types
COPY packages/db packages/db
COPY apps/scraper apps/scraper

RUN pnpm --filter @desany/types build \
 && pnpm --filter @desany/db build \
 && pnpm --filter @desany/scraper build

# Trim to production deps so we can copy node_modules into runtime
RUN pnpm install --prod --frozen-lockfile --filter @desany/scraper... || \
    pnpm install --prod --filter @desany/scraper...

# ---- Stage 2: runtime on official Playwright image (browsers preinstalled) ----
FROM mcr.microsoft.com/playwright:v1.50.0-noble AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps

# Copy workspace tree (only what the worker needs)
COPY --from=builder /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages/types/package.json packages/types/package.json
COPY --from=builder /repo/packages/types/dist packages/types/dist
COPY --from=builder /repo/packages/db/package.json packages/db/package.json
COPY --from=builder /repo/packages/db/dist packages/db/dist
COPY --from=builder /repo/apps/scraper/package.json apps/scraper/package.json
COPY --from=builder /repo/apps/scraper/dist apps/scraper/dist
COPY --from=builder /repo/apps/scraper/node_modules apps/scraper/node_modules

WORKDIR /app/apps/scraper

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD test -f /tmp/healthy || exit 1

CMD ["node", "dist/index.js"]
