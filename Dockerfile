# syntax=docker/dockerfile:1

# The public site (hangar.benduffaut.com): the front page, the guides, and the tour, as static
# files behind nginx. Hangar deploys it like any other app (D41). The Control Tower's own image is
# docker/core.Dockerfile.
#
#   docker build -t hangar-site . && docker run --rm -p 8080:8080 hangar-site
#
# Dockerfile.dockerignore (not .dockerignore) decides what this build sees.

FROM node:24-trixie-slim@sha256:54f84b4cf8432b21aaffd5d3ce8d41e12cea0d10d33c09d2f3c9879d49d6b446 AS build
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter @hangar/frontend...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY frontend frontend
COPY docs/guides docs/guides
COPY scripts/site-postbuild.mjs scripts/
RUN pnpm --filter @hangar/frontend build:site

# Runs as an unprivileged user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6
COPY docker/site.nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/site-headers.inc /etc/nginx/site-headers.inc
COPY --from=build /src/frontend/dist-site /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
