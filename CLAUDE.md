# Working on Hangar

Hangar is a self-hosted deploy platform and home server dashboard: push to GitHub and the app
builds and runs on your own computer, plus ready-made apps (Jellyfin first) with storage that
survives. One private Hangar per person, reachable only over Tailscale (D40).

## Where to pick up

- **Plan and status:** [docs/ROADMAP.md](docs/ROADMAP.md), section "Where things stand". It lists
  what each phase delivered, the open items, and the first steps of the next phase. Update it
  when a phase or an open item changes.
- **Why things are the way they are:** the Decisions table (D1 … D42) in
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Code comments cite these numbers. A change to how
  something works gets a new row.
- **How the code fits together, in plain language:** [docs/GUIDE.md](docs/GUIDE.md).
- **What changed:** [CHANGELOG.md](CHANGELOG.md); unreleased work is under `[Unreleased]`.
- **User-facing guides** (also the public site's /docs): `docs/guides/*.md`.

## Layout

- `packages/shared`: the API contract (`contract.ts`), Zod shapes (`schemas.ts`), every word users
  read (`copy.ts`), and pure rules shared by server and dashboard (`apps.ts`: image names,
  library paths, the catalog; `hostnames.ts`; `validation.ts`).
- `apps/server`: Fastify API and worker. `src/modules/<feature>/{repo,service,routes}.ts`,
  `src/platform/` adapters (Docker, git, Traefik, the host probe), `src/worker/` (the deploy
  pipeline, reconciler, cleanup, poller, and `stack.ts` for a stack's supporting services, D44).
  Migrations in `drizzle/`.
- `frontend`: Vue 3 dashboard. UI primitives are the `Base*` wrappers in `src/ui/` (PrimeVue is
  imported only there). `VITE_HANGAR_SITE=1` builds the public site, whose tour answers every
  API call from `src/demo/`: new endpoints need a demo answer there.
- `installer/`: the shell installer, `hangar-tailscale`, `hangar-doctor`, update and uninstall.
- `Dockerfile` (root) builds the public site; `docker/core.Dockerfile` builds Hangar itself.

## House rules

- One contract: new endpoints go in `contract.ts` with shapes in `schemas.ts`; responses are
  parsed on the way out, so internal fields cannot leak.
- Every user-facing string lives in `copy.ts` or the component, in plain language: say what
  happened and what to do. Errors are `UserError`s with an actionable message and hint.
- Database changes: edit `apps/server/src/db/schema.ts`, then `pnpm db:generate --name <change>`.
- Security is enforced on the server, never only in the form. Powerful options (libraries, the
  graphics chip, published images) are admin-only and re-checked at deploy time. There is no
  option to run an app privileged or mount the Docker socket; keep it that way.
- Keep the runner lean: reuse the existing pipeline (image apps are "pull and tag" in place of
  "build"), cache expensive Docker calls, and prefer one container per app until stacks need more.
- Commits and pull requests carry no AI attribution lines.

## Commands

```sh
pnpm install
pnpm dev                 # Postgres, Traefik, and core in Docker; dashboard on :5173
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration    # needs pnpm dev; real deploys through the dev stack
pnpm test:site           # the public site and tour in a browser
pnpm ship                # build here and install on the server over SSH (HANGAR_SHIP_HOST)
```

Testing notes:

- On macOS (Docker Desktop) the two integration tests that check real library folders are
  skipped: Docker Desktop does not let containers see the computer's folders. CI (Linux) runs
  them.
- Sign-in and invite redemption are rate limited per address; tests that need a fresh account
  pass `remoteAddress` to `call()`.
- Long integration runs take minutes; run them in the background.
- `HANGAR_TEST_TEMPLATES=1` (set in `docker/compose.dev.yml`, ignored in production) adds the
  small `stack-test` template the integration tests use. After adding a catalog template or
  changing its version, run it for real: `HANGAR_TEST_CATALOG=<id> pnpm vitest run --project
integration catalog`.
- Pipe test output to a file, not straight into `tail`: a pipe hides the exit code.

## Shipping

- `main` deploys the public site by itself: the maintainer's own Hangar runs it as an app
  (`hangar-site`, D41) and checks `main` every minute.
- `pnpm ship` updates the maintainer's server. **Another production site runs in its own
  containers on that same machine and must stay up:** never restart Docker or touch containers
  Hangar did not create, and check that site answers before, during, and after a deploy.
  `pnpm ship` compresses the image and caps the copy at 6 MB/s (`HANGAR_SHIP_RATE_MB`): an
  uncapped copy once filled the server's network link long enough for both Cloudflare tunnels to
  drop for about 15 seconds.
- Releases: follow "Releasing" in [CONTRIBUTING.md](CONTRIBUTING.md). Tagging `v*` runs the
  Release workflow, which builds the image and attaches `install.sh`; the one-line install uses
  the newest release.
