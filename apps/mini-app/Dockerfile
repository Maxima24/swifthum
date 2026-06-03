# syntax=docker/dockerfile:1.7
# Mini App: build with Vite, serve the static dist/ from a tiny nginx.
# Build context is the repo root.

# ─── Builder ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/mini-app/package.json apps/mini-app/

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter mini-app...

COPY apps/mini-app ./apps/mini-app
RUN pnpm --filter mini-app build


# ─── Runtime (static nginx) ──────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Drop default content + config; replace with our SPA-friendly config.
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

COPY apps/mini-app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/mini-app/dist /usr/share/nginx/html

EXPOSE 80
# Default nginx CMD is fine.
