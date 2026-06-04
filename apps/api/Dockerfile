# syntax=docker/dockerfile:1.7
# Multi-stage build for the SwiftHum API + Worker + Migrations.
# The same image runs three different `command:`s in compose (see infrastructure/docker-compose.prod.yml):
#   - migrate: ./node_modules/.bin/prisma migrate deploy
#   - api:     node dist/main.js
#   - worker:  node dist/worker/main.js
#
# Build context is the repo root (so the builder can see pnpm-workspace.yaml + the root lockfile).

# ─── Builder ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# openssl + libc6-compat so Prisma's engine binary loads correctly on Alpine/musl.
RUN apk add --no-cache openssl libc6-compat

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Copy lockfile-relevant files first so source changes don't bust the deps layer.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/

# pnpm store mount caches downloaded tarballs across rebuilds (BuildKit).
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter api...

# Source + Prisma schema (changes here re-trigger only the build, not deps install).
COPY apps/api ./apps/api
RUN pnpm --filter api prisma:generate \
 && pnpm --filter api build

# pnpm deploy produces a self-contained, non-symlinked /deploy tree (just the
# api package + its real transitive node_modules, no workspace mess).
# --prod=false keeps the `prisma` CLI in devDeps so the migrate container can run it.
RUN pnpm deploy --filter api --prod=false /deploy

# ─── Runtime ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# tini for proper PID 1 signal handling (clean SIGTERM → SIGINT to Node).
# openssl + libc6-compat so Prisma's engine loads at `migrate deploy` time.
RUN apk add --no-cache tini wget openssl libc6-compat \
 && addgroup -S app && adduser -S app -G app

WORKDIR /app
COPY --from=builder --chown=app:app /deploy /app
USER app
EXPOSE 3000
ENTRYPOINT ["/sbin/tini","--"]
# CMD intentionally omitted — set per-service in docker-compose.prod.yml.
