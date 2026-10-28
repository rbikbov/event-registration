# Build context is the repository root: the pnpm workspace and lock file live there.
FROM node:22-alpine

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
