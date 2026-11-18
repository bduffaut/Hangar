# Contributing to Hangar

Thanks for helping. Bug reports, ideas, and pull requests are all welcome.

## Reporting

- **Bugs:** open an issue with what you did, what you expected, and what happened. Include your
  Hangar version (bottom of Settings, or `curl <tower>/api/health`), your OS, and logs from
  `sudo docker logs hangar-core` if the server is involved.
- **Security problems:** please do not open a public issue. See [SECURITY.md](SECURITY.md).

## Developing

You need Node.js 24, pnpm 10, and Docker (Docker Desktop on macOS works).

```sh
pnpm install
pnpm dev     # Postgres, Traefik, and core in Docker, and the dashboard on http://localhost:5173
```

The first run shows the Preflight Checklist; get a boarding pass with
`pnpm hangar-admin issue-setup-code`. The public site (front page, guides, tour) runs with
`pnpm site` on `http://localhost:5174`; its tour needs no server at all.

[docs/GUIDE.md](docs/GUIDE.md) explains how the pieces fit, in plain language, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) is the engineering reference, including the
numbered decisions (D1, D2, …) the code refers to.

## Before you open a pull request

```sh
pnpm lint && pnpm typecheck && pnpm test   # what CI runs first
pnpm test:integration                      # with `pnpm dev` running
pnpm test:e2e                              # browser tests, for dashboard changes
pnpm test:site                             # the public site's browser tests
```

A few house rules, which keep the codebase easy to work in:

- **One contract.** New endpoints go in `packages/shared/src/contract.ts` with their Zod shapes in
  `schemas.ts`; the server registers them with `route()` and the dashboard calls them by name.
- **Theme the copy, not the code.** Code uses plain names. Every word a user reads lives in
  `packages/shared/src/copy.ts`. Puns only where they help, never in errors, warnings, or
  instructions someone must follow carefully.
- **Database changes** go in `apps/server/src/db/schema.ts`, then
  `pnpm db:generate --name <change>`.
- **Decisions** that change how things work get a row in the Decisions table of
  `docs/ARCHITECTURE.md`.
- Keep pull requests focused, and describe what changed and how you checked it.

## Releasing (maintainers)

1. Move the `Unreleased` notes in [CHANGELOG.md](CHANGELOG.md) under the new version and date.
2. Set the version in `package.json` and the default `HANGAR_VERSION` in `installer/install.sh`.
3. Commit, then tag and push: `git tag v0.3.0 && git push origin v0.3.0`. The Release workflow
   builds the multi-arch image, packages the installer, and creates the GitHub release; the Site
   workflow publishes hangar.benduffaut.com with an `install.sh` for that release.

By contributing you agree that your work is released under the [MIT license](LICENSE).
