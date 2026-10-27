# Hangar Architecture

This document is the engineering reference for Hangar. `Spec.md` describes _what_ we are building and why; this file describes _how_. Where this document intentionally differs from the spec, the difference is listed in [Decisions](#decisions) with its reason.

---

## Principles

These four rules exist so that every "later" feature in the spec (multi-user, preview deploys, custom domains, split API/worker containers, backups, notifications) is an addition rather than a rewrite.

1. **Postgres is the single source of truth.** Docker containers, the Traefik routing table, and the `cloudflared` container are projections of database state, produced by one reconciler. If Docker and the database disagree, the database wins.
2. **Modules communicate through the database and Postgres `LISTEN/NOTIFY`, never through process memory.** The API and the worker run in one Node process for the MVP, but log lines, status changes, and cancel requests all travel through Postgres. Splitting them into separate containers is a configuration change (`HANGAR_ROLE`), not a code change.
3. **One contract defines the API.** `packages/shared/src/contract.ts` declares every endpoint's method, path, request schema, and response schema with Zod. The server registers routes from it and the web client is typed from it.
4. **Theme the copy, not the code.** All code, tables, routes, and enums use plain names. All user-facing themed text lives in `packages/shared/src/copy.ts` and the installer's message strings. The type system enforces that every status and failure code has a label and a plain description.

Things we deliberately do **not** use: a dependency-injection framework, a repository abstraction on top of Drizzle, Redis, WebSockets, Kubernetes, or a separate BuildKit daemon.

---

## Decisions

| ID  | Decision                                                                                                                                                                                                               | Reason                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Traefik is configured with the **file provider** (`dynamic.yml`) generated from the database, not Docker labels.                                                                                                       | Container labels are immutable, so a base-domain change would require recreating every app container. Labels also cannot express "route to the new container only after its health check passes". A generated file gives atomic, verifiable switchovers and one place to regenerate all routes. |
| D2  | **Two domains** coexist: `lanDomain` (sslip.io, always on) and optional `publicDomain`. Every app gets a hostname on each enabled domain.                                                                              | In public mode, `tower.<publicDomain>` resolves to Cloudflare, so a LAN-only Control Tower would be unreachable by that name from the LAN. The Control Tower always lives on the LAN domain.                                                                                                    |
| D3  | LAN vs public traffic is separated by Traefik **entrypoint** (`web` on host port 80, `public` on internal port 8081), not by IP allow-listing.                                                                         | Tunnel traffic arrives from `cloudflared`'s internal Docker IP, so an IP allow-list would treat all public traffic as LAN traffic.                                                                                                                                                              |
| D4  | Branch polling uses **`git ls-remote`**; commit metadata is read from the clone.                                                                                                                                       | The unauthenticated GitHub API allows 60 requests/hour, which two polled projects would exhaust. `ls-remote` is not subject to that limit and works with any git host. The GitHub API is used only for listing repos and creating webhooks.                                                     |
| D5  | Builds run through the **`docker buildx build` CLI** (via `execFile` with argument arrays). Everything else uses dockerode.                                                                                            | Railpack requires BuildKit. Its BuildKit frontend works with Docker's built-in BuildKit through `buildx`, so no extra container is needed, and Dockerfile and Railpack builds share one code path.                                                                                              |
| D6  | The boarding pass is issued by **`hangar-admin issue-setup-code`** inside the core container, invoked by the installer.                                                                                                | The hash goes straight to the database and the plaintext is printed once, never written to disk. Re-running the installer before setup issues a fresh code. It doubles as a recovery path for a lost code.                                                                                      |
| D7  | Image tags are `hangar/<project>:<n>-<short-sha>`, where `n` is the per-project deployment number.                                                                                                                     | Redeploying the same SHA with new env vars must not overwrite an image that a rollback may need.                                                                                                                                                                                                |
| D8  | The installer requires port 80 and only warns about 443.                                                                                                                                                               | Nothing in the MVP listens on 443; HTTPS is terminated by Cloudflare.                                                                                                                                                                                                                           |
| D9  | The Control Tower also answers on the bare `http://<lan-ip>`.                                                                                                                                                          | Some routers apply DNS-rebinding protection that blocks sslip.io answers pointing at private IPs. The bare IP always works, and the UI explains the issue when it is detected.                                                                                                                  |
| D10 | Public hostnames are limited to one level below the domain (`blog.example.com`).                                                                                                                                       | Cloudflare's free Universal SSL certificate covers only `*.example.com`.                                                                                                                                                                                                                        |
| D11 | Project env vars are passed to **every build as BuildKit secrets** and to the container at runtime.                                                                                                                    | Secrets are available during the build but are never stored in image layers or history. Railpack consumes them automatically; a Dockerfile can opt in with `RUN --mount=type=secret,id=KEY`. Build args are not used because they leak into image history.                                      |
| D12 | Encrypted values use one envelope format everywhere (see [Encryption](#encryption)), so `env_vars` has no separate IV column.                                                                                          | One helper, one format, versioned for future key rotation.                                                                                                                                                                                                                                      |
| D13 | In development the server runs **inside a container** (`core-dev`) on the `hangar` network, using the same base image as production.                                                                                   | Container DNS names, the Docker socket, `git`, `buildx`, and `railpack` behave identically in dev and prod, on any host OS.                                                                                                                                                                     |
| D14 | Repository and images live under the GitHub account **`bduffaut`**: `github.com/bduffaut/hangar`, `ghcr.io/bduffaut/hangar-core`. The test flight is a separate public repo, `github.com/bduffaut/hangar-test-flight`. | A personal account is enough for the MVP. GitHub redirects transferred repos, so moving to an org later is cheap. A tiny separate repo keeps the onboarding clone fast.                                                                                                                         |

---

## Runtime topology

```
LAN browser ──:80──▶ hangar-proxy (Traefik)
                      entrypoint "web"
                        tower.<lan> , <lan-ip>      ─▶ hangar-core:3000
                        <app>.<lan>                 ─▶ hangar-app-<app>-<n>:<port>

Internet ─▶ Cloudflare ─▶ cloudflared ─▶ hangar-proxy:8081
                      entrypoint "public"
                        <app>.<pub>                 ─▶ app containers
                        hooks.<pub>/api/webhooks/*  ─▶ hangar-core:3000
                        tower.<pub> (only if exposeTowerPublicly)

hangar-core ──/var/run/docker.sock──▶ Docker Engine (with built-in BuildKit)
hangar-core ──────────────────────────▶ hangar-db (Postgres 18: data, pg-boss, NOTIFY)
```

### Compose stack (`/opt/hangar/docker-compose.yml`)

| Container      | Image                                            | Notes                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hangar-core`  | `ghcr.io/bduffaut/hangar-core:${HANGAR_VERSION}` | API, worker, SPA. Mounts `/var/run/docker.sock`, `/proc:/host/proc:ro`, `/:/host/root:ro`, and the `traefik-dynamic` volume (read-write).                                                                                            |
| `hangar-db`    | `postgres:18`                                    | Named volume `hangar-db-data`. Not published to the host.                                                                                                                                                                            |
| `hangar-proxy` | `traefik:v3`                                     | Publishes `80:80`. Mounts `traefik-dynamic` (read-only). Static config `traefik.yml` defines entrypoints `web` (:80), `public` (:8081), `traefik` (:8082, API, internal only), and the file provider watching the dynamic directory. |

All three join the external Docker network `hangar`. Every app container and the managed `cloudflared` container join it too.

### Managed containers

Containers created by core carry these labels; reconciliation and garbage collection find them by label, never by name:

- `hangar.managed=true`
- `hangar.kind=app|tunnel`
- `hangar.project=<projectId>`
- `hangar.deployment=<deploymentId>`

Names are for humans only: `hangar-app-<project>-<n>`, `hangar-tunnel`.

---

## Repository layout

```
apps/
  server/
    src/
      main.ts              Reads HANGAR_ROLE (api | worker | all; default all) and starts roles
      config.ts            Zod-parsed environment; fails fast with plain messages
      cli.ts               hangar-admin entrypoint (issue-setup-code; later reset-password, …)
      db/
        schema.ts          Drizzle schema (single file while small)
        migrations/        Generated by drizzle-kit, applied on boot
        client.ts
      platform/            Adapters to the outside world. No business logic.
        docker.ts          dockerode wrapper: containers, images, stats, logs, networks
        builder.ts         buildx + railpack invocation, streaming output
        git.ts             ls-remote, shallow clone at SHA, commit metadata
        proxy.ts           Render + atomically write dynamic.yml; query Traefik API
        crypto.ts          Envelope encryption, HMAC verification, token hashing
        events.ts          LISTEN/NOTIFY publish/subscribe
        queue.ts           pg-boss setup and typed job definitions
        hostmetrics.ts     /host/proc and statfs readers
      modules/             One folder per domain: routes.ts → service.ts → repo.ts
        auth/  settings/  projects/  deployments/  env-vars/  github/  metrics/  system/
      worker/
        pipeline.ts        clone → build → run → health check → switch (each step a function)
        jobs.ts            pg-boss handlers
        reconciler.ts      Database → containers, dynamic.yml, cloudflared
        poller.ts          ls-remote polling with backoff
        gc.ts              Image retention, log pruning, temp-dir sweep
      context.ts           Builds the `ctx` object passed to services
    test/
      integration/         Unit tests sit next to their source as *.test.ts
  web/
    src/
      api/                 Typed client generated from the contract
      stores/              Pinia: session, projects, deployments, settings, metrics
      composables/         useEventStream, useTheme, useClipboard, …
      components/          StatusBadge, LogViewer, Instruments, ProjectCard, EnvEditor, …
      views/               Setup, Home, NewProject, Project (tabs), Deployment, Settings, NotFound
      router.ts
      styles/
packages/
  shared/
    src/
      contract.ts          Every endpoint: method, path, request, response
      schemas/             Zod schemas grouped by domain
      statuses.ts          DeploymentStatus enum + allowed transitions
      failures.ts          FailureCode enum
      hostnames.ts         DNS-label validation, reserved names, hostname builders
      settings.ts          Typed settings keys and their schemas
      copy.ts              All themed, user-facing text
      constants.ts         Limits and defaults (timeouts, memory, retention)
installer/
  install.sh  update.sh  uninstall.sh  lib.sh
  docker-compose.yml  traefik.yml
docker/
  core.Dockerfile          Multi-stage production image (also the dev base)
  compose.dev.yml          postgres, traefik, core-dev
fixtures/
  static-site/  node-express/  vite-app/  dockerfile-app/  broken-healthcheck/
e2e/                       Playwright
docs/
  ARCHITECTURE.md
```

### Server layering rules

- `routes.ts` validates input against the contract and calls a service. No database or Docker access.
- `service.ts` holds business rules. Receives `ctx` (`{ db, docker, builder, git, proxy, events, queue, crypto, config, log }`).
- `repo.ts` holds Drizzle queries for that module only.
- `platform/*` never imports from `modules/*` or `worker/*`.
- Tests substitute fakes into `ctx`; no mocking framework gymnastics required.

---

## Data model

All IDs are UUIDv7. All timestamps are `timestamptz`.

### `users`

`id`, `username` (unique), `password_hash` (argon2id), `created_at`, `updated_at`.

### `sessions`

`id` (SHA-256 of the session token), `user_id` → users, `created_at`, `expires_at`, `last_seen_at`.
The cookie holds the random token, signed. Storing sessions server-side enables logout, revocation, and future multi-user without changes.

### `settings`

`key` (text, PK), `value` (jsonb), `updated_at`. Each key has a Zod schema in `shared/settings.ts`; reads and writes are typed.

| Key                     | Type                                 |
| ----------------------- | ------------------------------------ |
| `lanDomain`             | string, e.g. `192-168-1-50.sslip.io` |
| `lanIp`                 | string                               |
| `publicDomain`          | string or null                       |
| `exposeTowerPublicly`   | boolean                              |
| `githubToken`           | encrypted string or null             |
| `cloudflareTunnelToken` | encrypted string or null             |
| `setupCodeHash`         | string or null                       |

### `projects`

`id`, `name` (unique, DNS label, immutable in MVP), `repo_url`, `branch`, `root_dir`, `port` (nullable: null means auto-detect), `memory_limit_mb` (default 512), `trigger_mode` (`poll|webhook|manual`), `webhook_secret` (encrypted), `last_seen_sha`, `current_deployment_id` → deployments (nullable), `desired_state` (`running|stopped`), `next_deployment_number`, `created_at`, `updated_at`.

### `deployments`

`id`, `project_id` → projects (cascade), `number` (unique per project), `commit_sha`, `commit_message`, `commit_author`, `branch`, `status`, `failure_code` (nullable enum), `failure_reason` (nullable text), `image_tag`, `container_id`, `port` (resolved), `trigger` (`push|poll|manual|rollback`), `source_deployment_id` (rollbacks), `created_at`, `started_at`, `finished_at`.
Indexes: `(project_id, number desc)`, `(status)` partial on non-terminal statuses.

### `deployment_logs`

`deployment_id` → deployments (cascade), `seq` (int), `stream` (`stdout|stderr|system`), `line` (text), `ts`. Primary key `(deployment_id, seq)`.

### `env_vars`

`id`, `project_id` → projects (cascade), `key`, `value_encrypted`, `created_at`, `updated_at`. Unique `(project_id, key)`. Keys validated as `^[A-Za-z_][A-Za-z0-9_]*$`.

### Retention

- Build logs are kept for the last 20 deployments per project.
- Images: the 5 most recent per project, plus the image of `current_deployment_id` regardless of age.
- pg-boss archives are pruned on its default schedule.

---

## Deployment lifecycle

### State machine (`shared/statuses.ts`)

```
queued    → building | deploying (rollback only) | cancelled
building  → deploying | failed | cancelled
deploying → ready | failed
ready, failed, cancelled: terminal
```

Every change goes through `transition(id, from, to, patch)`, which performs
`UPDATE deployments SET status = to … WHERE id = $1 AND status = from` and publishes a NOTIFY on success. A zero-row update means another actor already moved it, and the caller stops.

"Which deployment is live" is `projects.current_deployment_id`, not a status. The UI marks it **Current**.

### Failure codes (`shared/failures.ts`)

`clone_failed`, `build_failed`, `build_timeout`, `image_missing`, `container_start_failed`, `health_check_failed`, `interrupted`, `superseded`, `cancelled_by_user`, `internal`.
`copy.ts` maps each to a plain explanation and a suggested fix. `failure_reason` stores the specific detail (e.g. the last lines of build output or the exit code).

### Queues

| Queue       | Concurrency                                  | Purpose                                                               |
| ----------- | -------------------------------------------- | --------------------------------------------------------------------- |
| `build`     | 1 globally                                   | Full pipeline for push, poll, and manual triggers. 15-minute timeout. |
| `deploy`    | 1 globally                                   | Rollbacks: skips clone and build, uses an existing image.             |
| `poll`      | scheduled every 60 s                         | Runs `ls-remote` for polled projects.                                 |
| `gc`        | scheduled hourly and after each ready deploy | Retention and cleanup.                                                |
| `reconcile` | on boot, on settings change, on demand       | Converges Docker and Traefik to the database.                         |

Jobs carry only IDs. The handler always re-reads the database row and checks its status before acting.

### Enqueueing a deployment

In one transaction:

1. Mark the project's existing `queued` deployments `cancelled` with `failure_code = superseded`.
2. Insert the new deployment with the next `number`.
3. Send the pg-boss job.

### Pipeline (`worker/pipeline.ts`)

Each step receives an `AbortSignal` that fires on timeout or cancel.

1. **Clone.** `git init`, `git -c http.extraHeader="Authorization: Basic …" fetch --depth 1 origin <sha>`, `git checkout FETCH_HEAD`, into `/tmp/hangar-builds/<deploymentId>`. The token is never written into a URL, `.git/config`, or logs. Commit message and author come from `git log -1`.
2. **Build.** Build context is `<clone>/<root_dir>`.
   - If a `Dockerfile` exists: `docker buildx build --load -t <tag> [--secret id=K,env=K …] <ctx>`.
   - Otherwise: `railpack prepare <ctx> --plan-out <tmp>/plan.json`, then `docker buildx build --load -t <tag> --build-arg BUILDKIT_SYNTAX=<pinned railpack frontend> -f <tmp>/plan.json [--secret …] <ctx>`.
   - Env vars are passed to the child process through its environment, never on the command line.
   - stdout and stderr are split into lines, batched (every 100 ms or 200 lines), inserted into `deployment_logs`, and announced with a NOTIFY carrying the highest `seq`.
3. **Resolve port.** `projects.port` if set → the image's single `ExposedPorts` entry → `3000`. Stored on the deployment. `PORT=<port>` is always injected.
4. **Run.** Create and start `hangar-app-<project>-<n>` on the `hangar` network with decrypted env vars, `RestartPolicy: unless-stopped`, the memory limit, and the managed labels. It is not routed yet.
5. **Health check.** `GET http://hangar-app-<project>-<n>:<port>/` every second for up to 60 s. Any HTTP response counts as healthy; only connection errors and timeouts count as failure.
6. **Switch.** Under a per-project Postgres advisory lock:
   1. Set `current_deployment_id`, then re-render `dynamic.yml`.
   2. Poll the Traefik API until the project's service points at the new container (timeout 10 s).
   3. Stop the previous container with SIGTERM and a 10 s grace period, then remove it.
   4. Transition the deployment to `ready`.
7. **Always** (in `finally`): delete the clone directory. On failure, remove the new container and leave the previous one serving.

### Rollback

Creates a new deployment (`trigger = rollback`, `source_deployment_id`, same `image_tag`, `commit_*` copied) and enqueues it on `deploy`. Steps 3–7 run unchanged. If the image is gone, the deployment fails with `image_missing`.

### Cancel

`POST /api/deployments/:id/cancel` publishes a cancel NOTIFY. The worker holding that deployment aborts its `AbortController`, which kills the build process. A `queued` deployment is cancelled directly in the database.

### Start, stop, restart

These update `projects.desired_state` and then act on the current container. The reconciler respects `desired_state` on boot.

### Crash recovery (on worker start)

1. Mark every `building` or `deploying` deployment `failed` with `interrupted`.
2. Remove managed containers whose deployment is not the project's current one.
3. Run the reconciler.
4. Sweep `/tmp/hangar-builds`.

### Reconciler

Idempotent and safe to run at any time:

- For each project with `desired_state = running` and a current deployment, ensure its container exists and is running (recreate from the image if missing).
- Render `dynamic.yml` from projects, settings, and current deployments, and write it atomically (write a temporary file in the same directory, then rename).
- Ensure `hangar-tunnel` runs if and only if a Cloudflare token is set, recreating it when the token changes.

---

## Routing

The routing file (`hangar.yml` in Traefik's dynamic directory) is rendered by a pure function in `platform/proxy.ts`, so it is unit-testable. Traefik applies file changes after a short debounce (about 2 s), which is why the switch step confirms a route through the Traefik API before stopping the old container.

| Router              | Entrypoint      | Rule                                                        | Target                    |
| ------------------- | --------------- | ----------------------------------------------------------- | ------------------------- |
| `tower`             | `web`           | `Host(tower.<lanDomain>) \|\| Host(<lanIp>)`                | `hangar-core:3000`        |
| `tower-public`      | `public`        | `Host(tower.<publicDomain>)`, only if `exposeTowerPublicly` | `hangar-core:3000`        |
| `hooks`             | `public`        | `Host(hooks.<publicDomain>) && PathPrefix(/api/webhooks/)`  | `hangar-core:3000`        |
| `app-<name>`        | `web`           | `Host(<name>.<lanDomain>)`                                  | current container         |
| `app-<name>-public` | `public`        | `Host(<name>.<publicDomain>)`                               | current container         |
| `fallback`          | `web`           | lowest priority catch-all                                   | core's "no such app" page |

On the LAN, a stopped, never-deployed, or unknown app falls through to core, which shows a plain page saying the app is not running. On the public entrypoint there is deliberately no fallback: unknown hosts get Traefik's plain 404, so public traffic can only reach core through `hooks` or an explicitly exposed tower.

Every router that targets core carries a middleware that sets `X-Hangar-Entrypoint: web|public`, overwriting any client-supplied value. Core uses it as a second line of defense: requests marked `public` are refused unless they are webhooks or the tower is exposed.

Reserved names (`shared/hostnames.ts`): `tower`, `hooks`, `www`, `api`, `traefik`, `hangar`, `admin`. Project names: lowercase DNS label, 1–40 characters, `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`.

### Public mode (opening the runway)

1. The user creates a Cloudflare Tunnel in the Cloudflare dashboard and adds a public hostname `*.<theirdomain>` with service `http://hangar-proxy:8081`. Hangar shows that exact service string with a copy button.
2. The user pastes the tunnel token into Hangar.
3. The reconciler starts `hangar-tunnel` (`cloudflare/cloudflared`, pinned) with `tunnel run --token …` on the `hangar` network.

---

## Real-time

| Stream               | Endpoint                                    | Behavior                                                                                                                                                       |
| -------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment status    | `GET /api/events`                           | On connect: snapshot of all non-terminal deployments and each project's current status. Then deltas from NOTIFY.                                               |
| Build logs           | `GET /api/deployments/:id/logs/stream`      | Event `id` = `seq`. On connect, replays rows after `Last-Event-ID` (or from 0), then follows NOTIFY. Ends with a `done` event when the deployment is terminal. |
| Runtime logs (Radio) | `GET /api/projects/:id/runtime-logs/stream` | Follows Docker container logs with `tail=500`.                                                                                                                 |
| Metrics              | `GET /api/metrics/stream`                   | Host and container stats every 5 s, sampled only while at least one client is connected. Keeps a 15-minute in-memory ring buffer for sparklines.               |

All streams send a comment heartbeat every 15 s and set `X-Accel-Buffering: no`.

NOTIFY payloads are small (`{ deploymentId, seq }`, `{ deploymentId, status }`, `{ deploymentId, cancel: true }`); subscribers read details from the database. This keeps payloads well under Postgres's 8 KB limit and works unchanged across processes.

---

## API

Defined in `shared/contract.ts`. All routes are under `/api`. JSON in, JSON out. Errors use one shape: `{ error: { code, message, hint? } }`.

| Area        | Endpoints                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Setup       | `GET /setup/status`, `POST /setup/complete` (boarding pass + username + password)                                                     |
| Auth        | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`                                                                               |
| Settings    | `GET /settings`, `PATCH /settings`, `POST /settings/github/verify`, `POST /settings/tunnel`                                           |
| GitHub      | `GET /github/repos`, `GET /github/branches?repo=`                                                                                     |
| Projects    | `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`, `POST /projects/:id/{start,stop,restart,deploy}`, `GET /projects/:id/webhook` |
| Deployments | `GET /projects/:id/deployments`, `GET /deployments/:id`, `GET /deployments/:id/logs`, `POST /deployments/:id/{cancel,rollback}`       |
| Env vars    | `GET /projects/:id/env` (masked), `GET /projects/:id/env/:key/reveal`, `PUT /projects/:id/env` (full replace)                         |
| System      | `GET /system/info` (version, disk used by images), `GET /health` (unauthenticated)                                                    |
| Webhooks    | `POST /webhooks/github/:projectId` (unauthenticated, HMAC-verified)                                                                   |

---

## Security

- **Passwords:** argon2id via `@node-rs/argon2`.
- **Sessions:** random 32-byte token in a signed, `httpOnly`, `SameSite=Lax`, host-only cookie (no `Domain` attribute, so apps on sibling subdomains never receive it). 30-day sliding expiry.
- **CSRF:** every non-GET request must pass an `Origin` check against the Control Tower's hostnames **and** carry an `X-CSRF-Token` header matching a per-session token. SameSite alone is not enough because apps on `*.sslip.io` are same-site with the Control Tower.
- **Rate limiting:** login and setup are limited per IP and per username (`@fastify/rate-limit`, in-memory while single-process).
- **Boarding pass:** 128-bit random code shown in readable groups; only its SHA-256 is stored. Account creation is `INSERT … WHERE NOT EXISTS (SELECT 1 FROM users)` in the same transaction that clears `setupCodeHash`.
- **Webhooks:** `X-Hub-Signature-256` verified with `crypto.timingSafeEqual` before any job is queued.
- **Input to external commands:** branch names validated with `git check-ref-format` rules, SHAs `^[0-9a-f]{40}$`, root dirs normalized and rejected if absolute or containing `..`, ports 1–65535, project names as above. Every process runs via `execFile` with argument arrays; no shell strings are ever built.
- **Secrets on disk:** `/opt/hangar/.env` is `0600 root:root`.
- **README warning:** Hangar builds and runs arbitrary code from connected repositories with access to the Docker socket. Only connect repositories you trust.

### Encryption

`platform/crypto.ts` exposes `seal(plaintext, aad)` and `open(envelope, aad)`.

- Algorithm: AES-256-GCM with a 12-byte random IV.
- Key: `HANGAR_INSTANCE_KEY` (32 bytes, base64) from `.env`.
- Envelope: `v1.<iv>.<tag>.<ciphertext>`, each part base64url.
- AAD binds a value to where it is stored (`env:<projectId>:<key>`, `setting:<key>`, `webhook:<projectId>`), so a ciphertext copied into another row fails to decrypt.
- The `v1` prefix allows key rotation later without a schema change.

---

## Frontend

- **Stack:** Vue 3, TypeScript, Vite, Vue Router, Pinia, Tailwind CSS v4.
- **Theming:** colors are CSS variables, dark by default, light optional, choice remembered per browser.
- **Status colors:** gray (queued), amber (building), blue (deploying), green (ready), red (failed), muted gray (cancelled). An in-progress deploy's dot has a subtle pulse, disabled under `prefers-reduced-motion`.
- **`StatusBadge`:** label, tooltip, and color all come from `copy.ts`.
- **`LogViewer` (Flight Recorder):** virtualized list, ANSI rendering with `anser`, auto-scroll that pauses when the user scrolls up and shows a "Jump to latest" button, copy and download.
- **`useEventStream`:** wraps `EventSource`, exposes reactive state, and closes on unmount.
- **Routes:**

| Path               | View                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| `/setup`           | Preflight Checklist (redirects here while setup is incomplete)                |
| `/login`           | Login                                                                         |
| `/`                | Instruments strip + project grid                                              |
| `/projects/new`    | Create project                                                                |
| `/projects/:name`  | Tabs: Deployments, Radio, Environment, Settings (danger zone inside Settings) |
| `/deployments/:id` | Flight Recorder                                                               |
| `/settings`        | Domains, GitHub, Cloudflare Tunnel, appearance                                |
| `*`                | 404                                                                           |

- **Responsive:** mobile-first. The project grid collapses to one column; the log viewer goes full-width with a sticky toolbar.

---

## Installer and operations

### `install.sh`

1. Check root, distro (Ubuntu 22.04/24.04, Debian 12; otherwise ask to continue), architecture (amd64/arm64), RAM ≥ 2 GB, free disk ≥ 10 GB, port 80 free, port 443 (warn only).
2. Install Docker Engine and the Compose plugin from Docker's official repository if missing; enable the service.
3. Create `/opt/hangar`; download `docker-compose.yml` and `traefik.yml` for the target release.
4. Generate `.env` only if absent (idempotent): `HANGAR_VERSION`, `POSTGRES_PASSWORD`, `HANGAR_SESSION_SECRET`, `HANGAR_INSTANCE_KEY`, `HANGAR_LAN_IP`.
5. Create the `hangar` network if missing, `docker compose pull`, `docker compose up -d`.
6. Wait for `GET /api/health` through Traefik.
7. Run `hangar-admin issue-setup-code` (prints "already set up" if a user exists).
8. Install `hangar-update` and `hangar-uninstall` to `/usr/local/bin`.
9. Print the success banner with the Control Tower URL (and the bare-IP fallback) and the boarding pass.

Each themed line is followed by a dimmed plain description. Errors and the boarding-pass instructions are plain.

### `hangar-update`

Resolve the latest release tag, `pg_dump` to `/opt/hangar/backups/pre-update-<version>.sql.gz` (keep the last 3), download that release's compose files, update `HANGAR_VERSION`, `pull`, `up -d`, and wait for health. Migrations run when core starts.

### `hangar-uninstall`

Stop and remove the stack, managed app containers, and the tunnel. Ask separately, in plain language, before deleting the database volume, app images, and `/opt/hangar`.

### Core image (`docker/core.Dockerfile`)

- Base: Node 24 LTS on Debian slim.
- Includes `git`, the Docker CLI, the `buildx` plugin, and pinned `railpack`.
- Contains the bundled server, the built SPA, and the `hangar-admin` CLI.
- Published for `linux/amd64` and `linux/arm64` to `ghcr.io/bduffaut/hangar-core` on tags `vX.Y.Z` and `latest`.

---

## Development environment

The host OS is Windows 11 with WSL2 (Ubuntu) and Docker Desktop using WSL integration.

- Clone the repo inside the WSL filesystem (`~/code/hangar`), not under `/mnt/c`, for file-watching and I/O speed.
- Host requirements inside WSL: Node 24 (via `fnm`), pnpm (via `corepack`), Docker.
- `pnpm dev` runs:
  - `docker compose -f docker/compose.dev.yml up`: `postgres`, `traefik`, and `core-dev` (built from the core Dockerfile's dev stage, source bind-mounted, `tsx watch`, Docker socket mounted, on the `hangar` network, port 3000 published).
  - the Vite dev server on the host at `http://localhost:5173`, proxying `/api` to `localhost:3000`.
- Apps deployed in dev are reachable from the Windows browser at `http://<name>.127-0-0-1.sslip.io`.
- `pnpm test` runs unit tests. `pnpm test:integration` needs Docker. `pnpm test:e2e` runs Playwright against the dev stack.

---

## Testing

| Layer       | Tool                                                  | Covers                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest                                                | Shared schemas, state machine transitions, `seal`/`open`, webhook HMAC, hostname rules and reserved names, `dynamic.yml` rendering, every status and failure code present in `copy.ts`.                                          |
| Integration | Vitest + real Docker                                  | Each fixture deploys and responds at its hostname; `broken-healthcheck` fails while the previous version keeps serving; rollback restores the previous image; cancel kills a build; restart mid-build recovers to `interrupted`. |
| End to end  | Playwright                                            | Preflight Checklist, create project, watch a deploy reach ready, roll back.                                                                                                                                                      |
| Installer   | Manual checklist on a clean Ubuntu 24.04 Multipass VM | Install, re-run install, update, uninstall.                                                                                                                                                                                      |

CI (GitHub Actions): lint, typecheck, unit tests, and integration tests on every push. Multi-arch image build and publish on `v*` tags.

---

## Build stages

Each stage is finished only when its exit criteria pass.

1. **Foundation.** Monorepo, tooling, `config.ts`, Drizzle schema and first migration, dev compose, `proxy.ts`.
   _Exit:_ a hand-started container is reachable at `x.127-0-0-1.sslip.io` via a generated `dynamic.yml`.
2. **Pipeline.** `git.ts`, `builder.ts`, `docker.ts`, `pipeline.ts`, reconciler, gc, triggered from a script.
   _Exit:_ every fixture deploys; the broken fixture leaves the previous version serving; rollback works; killing the process mid-build recovers cleanly.
3. **API.** Contract, auth and sessions, setup and `hangar-admin`, projects, deployments, env vars, SSE, poller, webhooks, cancel.
   _Exit:_ the full flow works over HTTP; unit tests pass.
4. **Control Tower.** `copy.ts` first, then all views.
   _Exit:_ Playwright flows pass, on desktop and phone widths.
5. **Ship.** Production image, compose files, installer scripts, multi-arch CI, `hangar-test-flight` repo.
   _Exit:_ a blank Ubuntu 24.04 VM goes from nothing to a live app in under ten minutes.
6. **Polish.** Empty states, error copy, loading lines, 404, logo and favicon, README with screenshot, GIF, and the trust warning.

---

## Extension points

How each out-of-scope feature lands without restructuring:

| Feature                  | Lands as                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Multiple users and teams | `teams` table + `team_id` on projects; sessions already server-side; authorization check in services.      |
| Split API and worker     | Run two containers with `HANGAR_ROLE=api` and `HANGAR_ROLE=worker`; the bus is already Postgres.           |
| Preview deployments      | `environment`/`branch` dimension on deployments; another router per preview in `dynamic.yml`.              |
| Custom domains           | `project_domains` table; extra `Host()` rules in the renderer.                                             |
| Let's Encrypt            | `websecure` entrypoint + certificate resolver in `traefik.yml`; port 443 already checked by the installer. |
| Notifications            | A subscriber to the existing status NOTIFY channel.                                                        |
| GitHub App               | Alternate credential source behind `github/service.ts`; polling and webhooks unchanged.                    |
| Other git hosts          | `ls-remote` and clone already host-agnostic; add a repo-listing adapter.                                   |
| Key rotation             | New envelope version `v2`, re-seal on read.                                                                |
| Backups                  | Builds on the `pg_dump` already done by `hangar-update`.                                                   |
