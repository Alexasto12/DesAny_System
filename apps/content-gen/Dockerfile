# syntax=docker/dockerfile:1.6
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY packages/db/package.json packages/db/
COPY packages/prompts/package.json packages/prompts/
COPY apps/content-gen/package.json apps/content-gen/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY packages/types packages/types
COPY packages/db packages/db
COPY packages/prompts packages/prompts
COPY apps/content-gen apps/content-gen
COPY tsconfig.json ./
RUN pnpm --filter @desany/types build \
 && pnpm --filter @desany/db build \
 && pnpm --filter @desany/prompts build \
 && pnpm --filter @desany/content-gen build

FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/packages/types ./packages/types
COPY --from=build /repo/packages/db ./packages/db
COPY --from=build /repo/packages/prompts ./packages/prompts
COPY --from=build /repo/apps/content-gen ./apps/content-gen
RUN pnpm install --prod --frozen-lockfile=false
WORKDIR /repo/apps/content-gen
CMD ["node", "dist/index.js"]
