# syntax=docker/dockerfile:1.6

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /repo

# ---------- deps stage ----------
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.json ./
COPY packages/types/package.json packages/types/
COPY packages/db/package.json packages/db/
COPY apps/email-service/package.json apps/email-service/
RUN pnpm install --frozen-lockfile=false

# ---------- build stage ----------
FROM deps AS build
COPY packages/types ./packages/types
COPY packages/db ./packages/db
COPY apps/email-service ./apps/email-service
RUN pnpm --filter @desany/types build \
 && pnpm --filter @desany/db build \
 && pnpm --filter @desany/email-service build

# ---------- runtime stage ----------
FROM node:22-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9 --activate \
 && apk add --no-cache wget
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/packages/types ./packages/types
COPY --from=build /repo/packages/db ./packages/db
COPY --from=build /repo/apps/email-service ./apps/email-service
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/email-service/node_modules ./apps/email-service/node_modules

WORKDIR /app/apps/email-service

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
