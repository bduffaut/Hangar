# syntax=docker/dockerfile:1

# Tools hangar-core shells out to: git for cloning, the Docker CLI with buildx for builds.
FROM node:24-trixie-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git gnupg \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian trixie stable" \
    > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin \
 && rm -rf /var/lib/apt/lists/*

# Railpack builds repos without a Dockerfile. The CLI writes a build plan; the matching BuildKit
# frontend (HANGAR_RAILPACK_FRONTEND, pinned by digest) turns the plan into an image.
ARG RAILPACK_VERSION=0.40.1
ARG RAILPACK_SHA256_AMD64=2842de93e68713af9037e0bc0a398d7da78f3b96aa4804303a638db2bc69bd30
ARG RAILPACK_SHA256_ARM64=c24a064b586b8f4f8c2fab44dd5ef19253e4c6cc4e1df793b3ae19cd87f7a5d4
ARG TARGETARCH
RUN case "$TARGETARCH" in \
      amd64) arch=x86_64; sum=$RAILPACK_SHA256_AMD64 ;; \
      arm64) arch=arm64; sum=$RAILPACK_SHA256_ARM64 ;; \
      *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
 && curl -fsSL -o /tmp/railpack.tar.gz \
    "https://github.com/railwayapp/railpack/releases/download/v${RAILPACK_VERSION}/railpack-v${RAILPACK_VERSION}-${arch}-unknown-linux-musl.tar.gz" \
 && echo "$sum  /tmp/railpack.tar.gz" | sha256sum -c - \
 && tar -xzf /tmp/railpack.tar.gz -C /usr/local/bin railpack \
 && rm /tmp/railpack.tar.gz \
 && railpack --version
ENV HANGAR_RAILPACK_FRONTEND=ghcr.io/railwayapp/railpack-frontend:v0.40.1@sha256:f1973377693af30c9b37a92c97c661c07b277ccdc6be909213c74c771f8d2d6d

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Development: the repo is bind-mounted at /repo with node_modules installed on the host.
FROM base AS dev
# Bind-mounted files belong to the host user; let git read them (tests clone from file:// repos).
RUN git config --system --add safe.directory '*'
WORKDIR /repo
CMD ["pnpm", "--filter", "@hangar/server", "dev"]

# Production, step 1: install everything and build the dashboard and the server bundle.
FROM base AS build
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY frontend frontend
RUN pnpm --filter @hangar/frontend build \
 && pnpm --filter @hangar/server build \
 && pnpm --filter @hangar/server deploy --prod --legacy /out

# Production, step 2: only what runs. The server bundle, its runtime libraries, the migrations,
# and the built dashboard.
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HANGAR_MIGRATIONS_DIR=/app/drizzle \
    HANGAR_WEB_DIR=/app/web
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /src/apps/server/dist ./dist
COPY --from=build /src/apps/server/drizzle ./drizzle
COPY --from=build /src/frontend/dist ./web
# The stack files travel with each release so hangar-update can refresh them.
COPY installer ./installer
RUN printf '#!/bin/sh\nexec node /app/dist/cli.js "$@"\n' > /usr/local/bin/hangar-admin \
 && chmod 755 /usr/local/bin/hangar-admin
ARG HANGAR_VERSION=dev
ENV HANGAR_VERSION=${HANGAR_VERSION}
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--enable-source-maps", "/app/dist/main.js"]
