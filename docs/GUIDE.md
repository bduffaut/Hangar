# Hangar, explained

This guide explains what Hangar is, what every part of the project does, and how the parts work together. It uses plain language and defines each technical word the first time it matters. For the detailed engineering reference (every decision and its reason), see [ARCHITECTURE.md](ARCHITECTURE.md).

## Contents

1. [What Hangar does](#1-what-hangar-does)
2. [Words used in this guide](#2-words-used-in-this-guide)
3. [What runs on the server](#3-what-runs-on-the-server)
4. [What happens when a request arrives](#4-what-happens-when-a-request-arrives)
5. [What happens when you deploy](#5-what-happens-when-you-deploy)
6. [The project, folder by folder](#6-the-project-folder-by-folder)
7. [The server code](#7-the-server-code)
8. [The dashboard code](#8-the-dashboard-code)
9. [Keeping things secure](#9-keeping-things-secure)
10. [Installing, updating, removing](#10-installing-updating-removing)
11. [Tests](#11-tests)
12. [Everyday tasks](#12-everyday-tasks)
13. [When something goes wrong](#13-when-something-goes-wrong)

---

## 1. What Hangar does

Hangar turns a spare computer into a place where your web apps run. You install it once on a Linux server. Then, in its web dashboard (the **Control Tower**), you connect a code repository. Hangar downloads the code, turns it into a runnable package, starts it, and gives it its own web address. Every time you push new code, it does that again, swaps the new version in without downtime, and keeps the old ones so you can go back.

Your own setup: Hangar runs on your laptop server (`homeserver`) and is reachable only through Tailscale, at `http://tower.100-113-190-111.sslip.io`. Your other site, benduffaut.com, runs separately on the same laptop and Hangar does not touch it.

---

## 2. Words used in this guide

| Word                               | Meaning                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Server**                         | The computer Hangar is installed on (your laptop).                                                                                                                                |
| **Repository (repo)**              | A folder of code tracked by git, usually hosted on GitHub.                                                                                                                        |
| **Branch**                         | A named line of work inside a repository, like `main`.                                                                                                                            |
| **Commit**                         | One saved change in a repository. Each has an ID called a **SHA**, a long string of letters and digits. Hangar shows the first seven characters and calls it the **tail number**. |
| **Push**                           | Sending new commits to GitHub.                                                                                                                                                    |
| **Docker**                         | Software that runs programs in **containers**: isolated boxes that each have their own files and network, sharing the server's operating system.                                  |
| **Image**                          | A frozen, ready-to-run snapshot of an app and everything it needs. A container is an image that is running.                                                                       |
| **Build**                          | Turning source code into an image.                                                                                                                                                |
| **Deploy**                         | Building (if needed) and starting a new version so visitors see it. One attempt is a **deployment**.                                                                              |
| **Dockerfile**                     | A recipe in a repository that tells Docker exactly how to build its image.                                                                                                        |
| **Railpack**                       | A tool that looks at a repository without a Dockerfile, works out what kind of app it is (Node, static site, Python, and more), and builds an image for it.                       |
| **Port**                           | A numbered door on a computer that a program listens on. Web traffic uses port 80; apps inside containers often use 3000.                                                         |
| **Docker network**                 | A private network that lets containers talk to each other by name.                                                                                                                |
| **Reverse proxy**                  | A program that receives every web request and forwards it to the right app based on the address. Hangar uses **Traefik**.                                                         |
| **Hostname / domain**              | The name in a web address, like `blog.100-113-190-111.sslip.io`.                                                                                                                  |
| **sslip.io**                       | A free public service: any name ending in `<ip-with-dashes>.sslip.io` points to that IP address. It gives every app a real address without configuring anything.                  |
| **Tailscale**                      | Software that puts your devices on a private network with each other. Your laptop's Tailscale address is `100.113.190.111`.                                                       |
| **Database**                       | Where Hangar stores its records (projects, deployments, settings). Hangar uses **PostgreSQL** ("Postgres").                                                                       |
| **Migration**                      | A versioned change to the database's structure, applied automatically when Hangar starts.                                                                                         |
| **API**                            | The list of requests the server answers (like "list projects" or "deploy this project"). Each one is an **endpoint**.                                                             |
| **Frontend / backend**             | The frontend is the dashboard that runs in your browser. The backend is the server code that does the work.                                                                       |
| **TypeScript**                     | JavaScript with types: the code says what kind of data each thing holds, and mistakes are caught before running. All of Hangar is TypeScript.                                     |
| **Vue**                            | The library the dashboard is built with. **Pinia** keeps shared dashboard state. **Vite** builds the dashboard.                                                                   |
| **PrimeVue**                       | A ready-made set of dashboard components (buttons, inputs, dialogs, tabs). Hangar uses version 4.5.5, which is free (MIT license).                                                |
| **Chart.js**                       | The library that draws Hangar's charts.                                                                                                                                           |
| **Environment variable (env var)** | A named setting passed to an app when it starts, such as `API_KEY=...`.                                                                                                           |
| **Secret**                         | A value that must stay private, like a password or token.                                                                                                                         |
| **Hash**                           | A one-way fingerprint of a value. You can check a value against its hash, but you cannot get the value back from the hash.                                                        |
| **Encryption**                     | Scrambling data with a key so only someone with the key can read it. Hangar encrypts env vars and tokens with AES-256-GCM.                                                        |
| **Session / cookie**               | After you sign in, the browser keeps a small random token (a cookie) that proves who you are on each request.                                                                     |
| **CSRF**                           | Cross-site request forgery: a trick where another website makes your browser send a request to Hangar. Hangar blocks it with a per-session token and an origin check.             |
| **SSE (server-sent events)**       | A connection the server keeps open to push updates to the browser as they happen. Hangar uses it for live status, logs, and metrics.                                              |
| **Webhook**                        | A message GitHub sends to a web address when something happens, like a push.                                                                                                      |
| **Polling**                        | Checking regularly for changes. Without public access, Hangar checks your branch every minute.                                                                                    |
| **Job queue**                      | A list of work waiting to be done (like "build deployment #4"), processed one at a time. Hangar uses **pg-boss**, which stores the queue in Postgres.                             |
| **Health check**                   | Asking an app "are you up?" and waiting for any answer.                                                                                                                           |
| **Rollback**                       | Switching back to an earlier version using its saved image, without rebuilding.                                                                                                   |
| **Monorepo / package**             | One repository holding several related code projects (packages) that share tools.                                                                                                 |
| **CI**                             | Continuous integration: GitHub runs the tests on every push.                                                                                                                      |

---

## 3. What runs on the server

Hangar is three containers, plus one container per app you deploy:

```
                       your devices (over Tailscale)
                                  │  port 80 on 100.113.190.111 only
                                  ▼
                        ┌───────────────────┐
                        │  hangar-proxy     │  Traefik: reads the address of each
                        │  (Traefik)        │  request and forwards it
                        └───┬───────────┬───┘
     tower.… and the IP     │           │   <app>.…
                            ▼           ▼
                ┌──────────────────┐   ┌──────────────────────┐
                │  hangar-core     │   │  hangar-app-blog-7   │  your apps,
                │  API, worker,    │──▶│  hangar-app-api-3    │  one container
                │  dashboard       │   │  …                   │  each
                └──┬────────────┬──┘   └──────────────────────┘
                   │            │
                   ▼            ▼
          ┌──────────────┐   Docker (through /var/run/docker.sock):
          │  hangar-db   │   core builds images and starts and
          │  (Postgres)  │   stops app containers
          └──────────────┘
```

- **hangar-proxy (Traefik)** is the only container that accepts traffic from outside. It listens on port 80 of the Tailscale address only, so nothing on the Wi-Fi network can reach it.
- **hangar-core** is Hangar itself, one program with three jobs:
  - the **API** (answers the dashboard);
  - the **worker** (builds and deploys in the background);
  - serving the **dashboard** files.

  It talks to Docker through Docker's control socket, which lets it build images and manage containers.

- **hangar-db (Postgres)** stores everything. Its data lives in a Docker volume (a storage area Docker keeps across restarts) named `hangar_hangar-db-data`.
- **Your apps** each run in their own container, named `hangar-app-<project>-<deployment number>`.

There are two Docker networks:

| Network       | Members                | Why                                                                                                                  |
| ------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `hangar`      | database, core, proxy  | The platform's private network.                                                                                      |
| `hangar-apps` | proxy, core, your apps | Apps are reachable by the proxy (to serve them) and core (to health-check them), but they cannot reach the database. |

Everything Hangar needs is in `/opt/hangar` on the server: `docker-compose.yml` (describes the three containers), `traefik.yml` (Traefik's fixed settings), and `.env` (the generated secrets, readable only by root).

---

## 4. What happens when a request arrives

1. Your browser asks for `http://blog.100-113-190-111.sslip.io`. sslip.io answers that this name means `100.113.190.111`, so the browser connects to your laptop over Tailscale.
2. **Traefik** receives the request. It looks at the name and checks its routing file, which Hangar writes from the database.
3. If `blog` has a running version, Traefik forwards the request to that app's container. If not, it sends it to core, which shows a page saying the app is not running.
4. For `tower.100-113-190-111.sslip.io`, Traefik forwards to **core**, which serves the dashboard and its API.

Hangar never edits Traefik's routes by hand. The **database is the source of truth**. Whenever something changes (a deploy goes live, an app stops, the address changes), core rewrites the routing file from the database, and Traefik picks it up about two seconds later.

---

## 5. What happens when you deploy

Pressing **Deploy** (or a push, or the minute-by-minute check finding a new commit) does this:

1. **Queue.** The API records a new deployment with status `queued` (shown as **Holding**) and adds a job to the queue. Only one build runs at a time, so a small server is never overloaded.
2. **Download.** The worker picks up the job (status `building`, shown as **Preflight**) and downloads exactly that commit with git.
3. **Safety check.** Hangar checks that no file in the repository is a link pointing outside it. Build tools follow such links, so this stops a repository from making Hangar read its own secrets.
4. **Build.** If the repository has a Dockerfile, Docker builds it. Otherwise Railpack detects the framework and builds it. Env vars are handed to the build as secrets: available while building, never saved in the image. Every line of output is saved and streamed to the **Flight Recorder**.
5. **Start.** Status becomes `deploying` (**Taking off**). Hangar starts a new container next to the old one, with your env vars, a `PORT` variable, and a memory limit. Nobody is sent to it yet.
6. **Health check.** Hangar asks the new container for a page every second, for up to 60 seconds. Any answer counts. If the app crashes, it stops waiting at once and shows the app's last output.
7. **Switch.** Hangar points Traefik at the new container and waits until Traefik confirms. Then, in one database step, it records the deployment as live (`ready`, **Airborne**). Only after that is the old container stopped.
8. **Clean up.** The downloaded code is deleted. Old images are pruned, keeping the five newest successful ones for rollbacks.

If anything fails, the new container is removed, the deployment is marked `failed` (**Grounded**) with a plain explanation, and **the previous version keeps serving the whole time**.

A **rollback** skips steps 2 to 4 and starts an older deployment's saved image.

If Hangar itself is restarted in the middle of a deploy, it marks that deploy as interrupted when it comes back, removes anything half-started, and makes Docker and Traefik match the database again.

---

## 6. The project, folder by folder

The repository is a **monorepo**: one repository with several packages, managed by **pnpm**.

```
hangar/
├── apps/server/          The backend: API, worker, and the hangar-admin command
├── frontend/             The dashboard (Control Tower)
├── packages/shared/      Code both sides use: the API contract, wording, rules
├── installer/            What gets installed on a server
├── docker/               How Hangar's own image and the development setup are built
├── fixtures/             Five tiny sample apps used by the tests
├── e2e/                  Browser tests
├── scripts/              Helper scripts for development and shipping
├── docs/                 This guide and the architecture reference
├── Spec.md               What Hangar should do (the product description)
└── package.json          The commands you run (pnpm dev, pnpm test, …)
```

### `packages/shared` (used by both server and dashboard)

| File                                     | What it holds                                                                                                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contract.ts`                            | Every API endpoint: its method, path, who may call it, and the shape of its input and output. The server registers its routes from this list and the dashboard calls endpoints by name from it, so the two cannot disagree. |
| `schemas.ts`                             | The exact shapes of requests and responses (with **Zod**, a library that checks data at runtime). Responses are filtered through these, so an internal field such as a secret can never be sent by accident.                |
| `copy.ts`                                | **All user-facing wording** in one place: the brand name, the themed status labels and their plain meanings, failure explanations and fixes, empty states, the setup checklist, the guide, and the tour.                    |
| `statuses.ts`, `failures.ts`, `enums.ts` | The lists of deployment statuses, failure reasons, and other fixed choices.                                                                                                                                                 |
| `validation.ts`, `hostnames.ts`          | Rules for valid branch names, repository URLs, domains, folder paths, and project names (including reserved names like `tower`).                                                                                            |
| `constants.ts`                           | Limits and defaults: build timeout (15 minutes), health check (60 seconds), memory (512 MB), images kept (5), and the test flight's source.                                                                                 |
| `settings.ts`                            | The list of server settings and their types.                                                                                                                                                                                |

### `apps/server` (the backend)

| Folder or file      | Role                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`       | Starts everything: loads settings, upgrades the database, starts the worker and the web server.                                                    |
| `src/config.ts`     | Reads and checks the environment variables Hangar is started with.                                                                                 |
| `src/context.ts`    | Builds the `ctx` object handed to all code: database, Docker, git, builder, proxy, queue, events, encryption, GitHub. Tests can swap pieces of it. |
| `src/http/`         | The web layer (see section 7).                                                                                                                     |
| `src/modules/`      | The features, one folder each: `auth`, `projects`, `deployments`, `env-vars`, `settings`, `github`, `webhooks`, `metrics`, `system`.               |
| `src/platform/`     | Adapters to the outside world: Docker, git, the builder, Traefik, the GitHub API, encryption, the queue, events, host metrics.                     |
| `src/worker/`       | Background work: the deploy pipeline, the reconciler, cleanup, the poller, crash recovery.                                                         |
| `src/db/`           | The database structure (`schema.ts`), connection, migrations, and locks.                                                                           |
| `drizzle/`          | The migrations, generated from `schema.ts` by **Drizzle** (the database library).                                                                  |
| `src/cli.ts`        | `hangar-admin`: issue a new setup code, or reset a password.                                                                                       |
| `scripts/hangar.ts` | A development command-line tool (`pnpm hangar …`) to drive deploys without the dashboard.                                                          |
| `scripts/build.mjs` | Bundles the server into one file for the production image.                                                                                         |
| `test/integration/` | Tests that run against the real development setup.                                                                                                 |

### `frontend` (the dashboard)

Described in [section 8](#8-the-dashboard-code).

### `installer`

| File                 | Role                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install.sh`         | Checks the server, installs Docker if missing, writes `/opt/hangar`, generates secrets, starts the stack, and prints the Control Tower address and the boarding pass. Safe to run twice. |
| `update.sh`          | Installed as `hangar-update`: backs up the database, then updates and restarts Hangar.                                                                                                   |
| `uninstall.sh`       | Installed as `hangar-uninstall`: removes Hangar, asking separately before deleting any data.                                                                                             |
| `lib.sh`             | Shared helpers: the themed progress lines, questions, waiting for Hangar to be healthy.                                                                                                  |
| `docker-compose.yml` | Describes the three containers, the volumes, and the two networks. The Postgres and Traefik images are pinned by digest, so every install gets exactly the tested versions.              |
| `traefik.yml`        | Traefik's fixed settings: listen on port 80, and read routes from the folder Hangar writes.                                                                                              |

### Other folders

- `docker/core.Dockerfile`: builds Hangar's image. The `dev` stage is used while developing; the `build` and `runtime` stages produce the production image (with git, Docker's command-line tools, and Railpack included).
- `docker/compose.dev.yml`: the development setup, with the same container names as production.
- `fixtures/`: `static-site`, `node-express`, `vite-app`, `dockerfile-app`, and `broken-healthcheck` (which crashes on purpose, to test that a failed deploy keeps the old version).
- `scripts/dev.mjs`: `pnpm dev`. `scripts/ship.mjs`: `pnpm ship` (section 10).

---

## 7. The server code

### Layers

Each feature in `src/modules/` is split the same way:

- `routes.ts` receives HTTP requests, checks the input against the contract, and calls the service. No database or Docker code here.
- `service.ts` holds the rules ("you cannot roll back to a failed deployment", "the branch must exist").
- `repo.ts` holds the database queries for that feature.

`platform/` never depends on `modules/` or `worker/`, so the adapters stay simple and replaceable.

### The web layer (`src/http/`)

- `server.ts` creates the web server (**Fastify**) and checks every request in order:
  1. **Host:** the API only answers on the Control Tower's own addresses. Anything else gets the "app not running" page.
  2. **Entrypoint:** requests from the public internet can only reach webhooks, unless you choose to expose the dashboard.
  3. **Origin:** anything that changes data must come from the dashboard's own page.
  4. **Session:** signed-in requests need a valid session cookie.
  5. **CSRF token:** changes also need the session's matching token.

  It also has `route()`, which registers one contract endpoint with all checks applied, and `eventStream()` for live streams.

- `access.ts` decides which hostnames and origins are allowed.
- `sse.ts` keeps live connections open with a heartbeat every 15 seconds.
- `web.ts` serves the built dashboard, with security headers that only allow the dashboard's own scripts and forbid embedding it in other sites.

### Background work (`src/worker/`)

| File                                    | Job                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipeline.ts`                           | The deploy steps from section 5.                                                                                                                                                      |
| `jobs.ts`                               | Starts the worker: crash recovery first, then handles queue jobs (build, deploy, cleanup, reconcile, poll) and cancel requests.                                                       |
| `reconciler.ts`                         | Makes Docker and Traefik match the database: restarts or recreates missing app containers, writes the routing file, runs the Cloudflare tunnel when configured. Safe to run any time. |
| `poller.ts`                             | Every minute, checks each project's branch with `git ls-remote` and deploys new commits. Backs off when a repository is unreachable.                                                  |
| `gc.ts`                                 | Cleanup: old images, old build logs, leftover build folders, expired sessions.                                                                                                        |
| `app-container.ts`, `deployment-log.ts` | Starting an app container; writing build output in batches.                                                                                                                           |

### How the parts communicate

- **Through the database.** Everything important is a row: projects, deployments, logs, settings, env vars (encrypted), users, sessions.
- **Through Postgres notifications** (`LISTEN/NOTIFY`): when a status changes or new log lines are saved, a small message goes out, and the live streams read the details from the database. This is why the API and the worker could later run as separate containers without code changes.
- **Through the job queue** (pg-boss): the API adds jobs; the worker takes them one at a time.
- **Through locks:** a per-project lock means two deploys of the same project never start or switch containers at the same time; a routing lock means only one change to the routing file happens at a time.

### The database tables

| Table             | Holds                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `users`           | Your account (the password is stored only as an **argon2** hash) and your home screen layout.                              |
| `sessions`        | Signed-in browsers (only a hash of each session token).                                                                    |
| `settings`        | Server address, public domain, encrypted GitHub and tunnel tokens, the setup code's hash.                                  |
| `projects`        | One row per app: repository, branch, folder, port, memory limit, how it deploys, custom domains, which deployment is live. |
| `deployments`     | One row per attempt: number, commit, status, failure reason, image, timings.                                               |
| `deployment_logs` | Every build log line, numbered, so a live viewer can resume where it left off.                                             |
| `env_vars`        | Each project's variables, encrypted.                                                                                       |

---

## 8. The dashboard code

The dashboard lives in `frontend/src/`. It is organized so that colors, wording, and the component library can each be changed in one place.

| Folder        | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme/`      | **All colors, fonts, and sizes.** `tokens.ts` is the single source: the dark "night chart" and light "day chart" palettes, the five status colors, chart colors, terminal colors, the type scale. Every color was checked for readability (WCAG AA contrast). `css.ts` turns the tokens into CSS variables (`--hg-…`) that every style uses. `preset.ts` points PrimeVue's theme at the same variables. `useTheme.ts` switches dark, light, or match-system, and remembers the choice. |
| `ui/`         | **The component wrappers.** `BaseButton`, `BaseInput`, `BaseSelect`, `BaseDialog`, `BaseTabs`, and the rest wrap PrimeVue. The rest of the dashboard only uses these, and a lint rule (an automatic code check) rejects any PrimeVue import outside this folder. To switch to another component library, you rewrite these files and nothing else.                                                                                                                                     |
| `charts/`     | `BaseChart`, the only place Chart.js is used. Charts take their colors from the theme and redraw when you switch theme.                                                                                                                                                                                                                                                                                                                                                                |
| `api/`        | `client.ts` calls endpoints by name (`api('getProject', { params: { id } })`) with types taken from the shared contract, and adds the CSRF token. `streams.ts` opens live streams that reconnect by themselves.                                                                                                                                                                                                                                                                        |
| `stores/`     | Shared state (Pinia): `session` (who is signed in), `projects`, `live` (one status stream while signed in), `metrics` (CPU and memory samples, streamed only while something on screen needs them).                                                                                                                                                                                                                                                                                    |
| `dashboard/`  | **The widget system.** The home screen is a grid of widgets you can rearrange, built on your `custom-dashboard-grid` library. `types.ts` defines what a widget and a widget plugin are, `registry.ts` keeps the list of widgets, `plugins.ts` is where external widget packages are added, `layout.ts` holds the grid settings and the starting layout, and `useDashboardLayout.ts` loads and saves your layout on the server.                                                         |
| `components/` | The dashboard's own pieces, built from `ui/` and `charts/`: status badges, the **runway lights** (a project's recent deployments as a row of lights, newest on the right, the one in progress pulsing), trend lines, the Flight Recorder log viewer, the app frame, the tour, the grid and the frame around each widget (`dashboard/`), the built-in widgets (`widgets/`), and the project page's tabs (`project/`).                                                                   |
| `views/`      | One file per page: Setup (Preflight Checklist), Login, Home, New project, Project, Deployment, Settings, Guide, Not found.                                                                                                                                                                                                                                                                                                                                                             |
| `lib/`        | Small helpers: formatting sizes and times, and turning colored build-log text into safe plain text.                                                                                                                                                                                                                                                                                                                                                                                    |
| `brand/`      | The logo and the browser-tab icon.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Changing things later

- **Colors:** edit `frontend/src/theme/tokens.ts`. Every page and component follows.
- **Wording or brand name:** edit `packages/shared/src/copy.ts`.
- **Logo:** edit `frontend/src/brand/BrandMark.vue` and `favicon.svg`.
- **Component library:** rewrite the files in `frontend/src/ui/` to use the new library, keeping the same `Base*` names and options.
- **Your own dashboard widgets:**
  1. Your package exports `defineDashboardPlugin({ name, install({ registerWidget }) { … } })`. Each widget has an id, a title, a one-line description, a category, a Vue component, and a starting size in grid cells (12 columns across; rows are 8 px, and `rowsFor(px)` converts a height). It receives everything it shows through one prop, `data`: the projects (and whether they have loaded), the deployments in progress, and recent resource readings. A widget never touches Hangar's internals, so it can live in its own package.
  2. Install it with `pnpm --filter @hangar/frontend add <your-package>`.
  3. Add it to the list in `frontend/src/dashboard/plugins.ts`.

  It then shows in the list under **Customize** on the home screen, ready to drag onto the board.

### Design choices

- **The idea:** an air traffic controller's desk drawn like an aeronautical chart, rather than a cockpit.
- **Type:** B612, the typeface Airbus made for cockpit screens, for all text. JetBrains Mono is for things you copy exactly: addresses you type, commit IDs, and logs.
- **Color:** deep chart navy at night and white chart paper by day. Links are the blue charts use for airports. The one accent is magenta, the course line a pilot follows on a navigation display: it marks primary buttons, the current page, focus, and anything on its way to going live. Statuses use the colors of cockpit flight displays: gray Holding, cyan Preflight, magenta Taking off, green Airborne, red Grounded.
- **Home screen:** a grid of widgets you can rearrange with **Customize**: drag a widget by its title, resize it from its corner, remove it with its ×, or add one from the list that appears. Undo and redo work while customizing. Your layout is saved to your account, so it is the same in every browser. **Reset layout** goes back to the start.
  - **Departures:** each deployment under way drawn as a route through Holding, Preflight, Taking off, and Airborne. Legs flown are solid, the leg being flown moves.
  - **Instruments:** CPU, memory, disk, temperature, battery, and uptime, each with its trend and a scale marked with caution (amber) and warning (red) ranges, like engine gauges. A reading turns amber or red when it enters them.
  - **Projects:** one flight strip per app, edged in its status color. Hovering slides it along like a strip pushed in its rack.
  - **Latest activity**, **Deployment results**, and **Machine** (processor, kernel, version).
- **Motion:** buttons respond quietly (a primary button's icon lifts a pixel; others draw a short magenta line under the label). The only motion that runs by itself is a deployment moving along its route.
- **Accessibility and phones:** keyboard focus is always visible, motion is turned off when your device asks for less motion, and every page works at phone width. The browser tests check desktop and phone.

---

## 9. Keeping things secure

| Risk                                | What Hangar does                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Someone else claiming your server   | The first account needs the **boarding pass**, a one-time 140-bit code. Only its hash is stored.                                                                                                                                                                                                       |
| Password guessing                   | Passwords are hashed with argon2. Sign-in is limited per address and per account, and an account locks for 15 minutes after 10 failures.                                                                                                                                                               |
| Other websites acting as you        | The API only answers on Control Tower addresses, changes must come from the dashboard's own page, and each session has a CSRF token. The session cookie is not readable by scripts and is never sent to app addresses.                                                                                 |
| Leaked secrets                      | Env vars, the GitHub token, and the tunnel token are encrypted in the database. Responses are filtered so internal fields cannot leak. Env vars reach builds as secrets and never end up in images. The GitHub token is only ever sent to github.com.                                                  |
| A malicious repository              | Commands run without a shell. Branch names, URLs, and folders are checked. Symlinks pointing outside the repository stop the build. Builds and apps never see Hangar's own environment.                                                                                                                |
| A deployed app attacking Hangar     | Apps run on their own Docker network, without access to the database. Hangar's API ignores requests that did not come through the proxy, so an app gets no more access than any device on your network. Each app is limited to 4096 processes and gets less CPU priority than Hangar and the database. |
| Scripts injected into the dashboard | Build logs are shown as text, never as HTML, and the dashboard's security headers only allow its own scripts.                                                                                                                                                                                          |
| Exposure on your network            | On your laptop, Hangar listens only on the Tailscale address. Public access happens only if you set up a Cloudflare tunnel, and even then the dashboard stays private unless you choose otherwise.                                                                                                     |

**One thing to keep in mind:** Hangar runs code from the repositories you connect, and it controls Docker, which means it effectively controls the server. Only connect repositories you trust.

---

## 10. Installing, updating, removing

### On a new server (once publishing is set up)

Run the installer as root. It prints the Control Tower address and the boarding pass; open the address and follow the Preflight Checklist.

### On your laptop, from this PC

```
HANGAR_BIND_IP=100.113.190.111 pnpm ship
```

This builds Hangar's image on this PC, copies it to the laptop over your SSH connection, copies the installer, and runs it with Hangar bound to the Tailscale address. Nothing is published anywhere. Running it again updates Hangar and keeps all your data and secrets.

### On the laptop itself

| Command                                   | Does                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `sudo hangar-admin issue-setup-code`      | Prints a new boarding pass (only before the first account exists).                                                    |
| `sudo hangar-admin reset-password <user>` | Sets a new password (typed on the next line) and signs out every session.                                             |
| `sudo hangar-admin set-lan-ip <address>`  | Changes the address Hangar answers on, if the server's IP changed.                                                    |
| `sudo hangar-update`                      | Backs up the database, then updates and restarts Hangar. If the new version fails to start, it prints how to go back. |
| `sudo hangar-uninstall`                   | Removes Hangar, asking before deleting data.                                                                          |
| `sudo docker logs hangar-core`            | Hangar's own log, for troubleshooting.                                                                                |

---

## 11. Tests

| Command                       | What it checks                                                                                                                                                                                                                                       | Needs                                                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm test`                   | **Unit tests** (143): small pieces in isolation, such as encryption, validation, the routing file, wording completeness, log parsing, formatting.                                                                                                    | Nothing.                                                                                                    |
| `pnpm test:integration`       | **Integration tests** (50): real deploys of every sample app, failed deploys keeping the old version, rollback, cancel, killing Hangar mid-build, the safety checks, the API's sign-in and validation, and the whole flow over HTTP through Traefik. | `pnpm dev` running.                                                                                         |
| `pnpm test:e2e`               | **Browser tests**: a real browser completes the Preflight Checklist with a test flight, then creates, deploys, configures, rolls back, and deletes a project, on a desktop and a phone screen.                                                       | `pnpm dev` running, and the browser container (see `e2e/`). This resets the development instance's account. |
| `pnpm lint`, `pnpm typecheck` | Code style and type mistakes.                                                                                                                                                                                                                        | Nothing.                                                                                                    |

GitHub runs the lint, type, unit, and integration checks on every push.

---

## 12. Everyday tasks

| Task                                       | How                                                                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start developing                           | `pnpm dev`, then open `http://localhost:5173` (or `http://tower.127-0-0-1.sslip.io` after `pnpm --filter @hangar/frontend build`). Stop with Ctrl+C and `pnpm dev:down`.                  |
| Deploy from the command line (development) | `pnpm hangar help` lists the commands.                                                                                                                                                    |
| Change the database structure              | Edit `apps/server/src/db/schema.ts`, then run `pnpm db:generate --name <change>`.                                                                                                         |
| Add an API endpoint                        | Add it to `packages/shared/src/contract.ts` (and its shapes in `schemas.ts`), then register it with `route()` in the feature's `routes.ts`. The dashboard can call it by name right away. |
| Ship to the laptop                         | `HANGAR_BIND_IP=100.113.190.111 pnpm ship`.                                                                                                                                               |

### Putting apps on your own domain

Apps reach the internet through a **Cloudflare Tunnel**: the server makes an outgoing connection to Cloudflare, so no router ports are opened and your home address stays hidden. Hangar runs its own tunnel, separate from any other one on the machine.

1. In the Cloudflare dashboard, open Zero Trust, then Networks, then Tunnels, and create a tunnel (type "Cloudflared"). Copy its token. You do not need to install anything; Hangar runs the connector.
2. In the tunnel, add a public hostname `*` on your domain (for example `*.example.com`) with service `http://hangar-proxy:8081`. Every app then gets `name.example.com`. Exact records you already have, like `example.com` and `www`, keep working; the wildcard only covers names that have no record of their own.
3. In Hangar, under Settings, then Public access, enter the domain and save it, then paste the token and save it.

To serve one app on an exact address, like `example.com` itself or `www.example.com`:

1. On the project's Settings tab, under Custom domains, enter the addresses, one per line, and save. They take effect right away.
2. In the same Cloudflare tunnel, add a public hostname for each address with the same service, `http://hangar-proxy:8081`. If the address already points somewhere else (another tunnel, or a server), Cloudflare asks to replace that record; replacing it moves the address's traffic to the app. To move back, point the hostname at the old tunnel again.

---

## 13. When something goes wrong

| Symptom                                                         | Where to look                                                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A deploy failed                                                 | Open the deployment. The "What went wrong" box explains it in plain words, and the Flight Recorder shows the full build log.   |
| An app shows "This app isn't running"                           | The project is stopped, has no live deployment, or the name is wrong. Check its page in the Control Tower.                     |
| New commits stop deploying                                      | A stopped app does not deploy new commits until you start it (or press Deploy). Check the project's "New commits" setting too. |
| The Control Tower stopped opening after the server's IP changed | On the server: `sudo hangar-admin set-lan-ip <new address>`.                                                                   |
| The app deployed but behaves oddly                              | The project's **Radio** tab shows what the app prints while running.                                                           |
| The dashboard does not load                                     | On the laptop: `sudo docker ps` (are `hangar-core`, `hangar-db`, and `hangar-proxy` up?) and `sudo docker logs hangar-core`.   |
| Lost the boarding pass                                          | `sudo hangar-admin issue-setup-code` on the laptop.                                                                            |
| Forgot the password                                             | `sudo hangar-admin reset-password <username>` on the laptop.                                                                   |
