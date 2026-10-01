# The build is a dependency graph. Order it from stable (manifests) to volatile
# (source) so a code change re-runs only the affected compile, never the install
# or the production packaging.

# Dependencies: changes only when a manifest or the lockfile changes. The pnpm
# store lives in this layer, so the later `pnpm deploy` can link the production
# dependencies from it without re-downloading them.
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY shared/package.json shared/tsconfig*.json ./shared/
COPY backend/package.json backend/tsconfig*.json ./backend/
COPY frontend/package.json frontend/tsconfig*.json frontend/vite.config.ts frontend/index.html ./frontend/
RUN pnpm install --frozen-lockfile
COPY scripts/clean-dist.mjs ./scripts/

# Shared library: the only source the rest of the build depends on.
FROM deps AS shared
COPY shared/src ./shared/src
RUN pnpm --filter @kaskama/shared build

# Production packaging of the backend: satisfied by the manifests and the shared
# library, so it is unaffected by backend or frontend source changes.
FROM shared AS package
RUN pnpm deploy --legacy --filter @kaskama/backend --prod /prod/backend

# Backend compile. Independent of the frontend, so the two cache separately.
FROM shared AS backend-build
COPY backend/src ./backend/src
RUN pnpm --filter @kaskama/backend build

# Frontend compile. Independent of the backend.
FROM shared AS frontend-build
COPY frontend/src ./frontend/src
COPY frontend/home-fallback.ts ./frontend/
RUN pnpm --filter @kaskama/frontend build

FROM node:24-alpine AS runtime
ARG GIT_REVISION=unknown
ENV NODE_ENV=production
ENV FFPROBE_PATH=/usr/bin/ffprobe
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV GIT_REVISION=$GIT_REVISION
WORKDIR /app/backend
RUN apk add --no-cache ffmpeg
COPY --from=package /prod/backend ./
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
# The agent guide is a document, not code: it is copied into the image and
# served from /app/docs/agent-guide.md.
COPY docs /app/docs
USER 1000
EXPOSE 3000 9090
CMD ["node", "dist/server.js"]
