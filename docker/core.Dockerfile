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
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Development: the repo is bind-mounted at /repo with node_modules installed on the host.
FROM base AS dev
WORKDIR /repo
CMD ["pnpm", "--filter", "@hangar/server", "dev"]
