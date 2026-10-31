# Build context is the repository root: the pnpm workspace and lock file live there.
# Stages: `dev` — Vite dev server (make up, stack-up); `gateway` — the built frontend behind
# nginx on the same port, for e2e (FRONTEND_TARGET in docker-compose.yml).
FROM node:22-alpine AS dev

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
# --ignore-scripts: the root `prepare` script installs git hooks, there is no git here.
RUN pnpm install --frozen-lockfile --filter frontend --ignore-scripts

COPY frontend/ frontend/

WORKDIR /app/frontend
EXPOSE 5173
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]

# Types are checked by `make check`, the image only bundles.
FROM dev AS build
RUN pnpm exec vite build

FROM nginx:1.30.6-alpine AS gateway
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 5173
