# Changelog

All notable changes to Hangar. The format follows [Keep a Changelog](https://keepachangelog.com),
and versions follow [Semantic Versioning](https://semver.org). Each version is a git tag (`vX.Y.Z`)
with an installer and a `ghcr.io/bduffaut/hangar-core` image.

## [0.3.0] - Unreleased

### Added

- **The tour.** Visitors can explore the whole dashboard with a sample hangar, with no account:
  two servers, four apps, two weeks of deployments, and a deploy that runs while they watch. It
  lives in the browser and never touches the server. Anything that would change something asks
  them to sign up. Open it from **Take the tour** on the front page, or at `/tour`.
- **Delete your own account** under Account. Your servers are disconnected and forget the site.
- **Terms and privacy pages** (`/terms`, `/privacy`), linked from the front page.
- Questions and answers on the front page: cost, what the hosted site can see, what happens if it
  goes down, ports, and leaving.

### Changed

- The front page leads with **Sign up with GitHub** and **Take the tour** when sign-up is open.
- An account can connect at most 10 servers.
- The README, guide, and security notes describe the hosted Control Tower and its trust model.
- `Spec.md` moved to `docs/SPEC.md`.

## [0.2.0] - 2026-11-11

The first public release.

### Added

- Push-to-deploy from GitHub, with Dockerfile or Railpack builds, zero-downtime switching, and
  one-click rollback.
- The Control Tower dashboard: a customizable home screen, live build and app logs, CPU and memory
  per app, deploy history, and environment variables.
- Public addresses on your own domains through a Cloudflare Tunnel, with live checks that each
  address answers from the internet.
- Accounts with per-account isolation (own GitHub token, Docker network, and builder), invite
  links, and sign in with GitHub through a GitHub App.
- People's own servers, run from one central Control Tower over an outbound relay connection,
  with a one-line install command.
- A guided **Get set up** checklist, Publish page, and Servers page.
- An installer for Ubuntu 22.04/24.04 and Debian 12 (amd64 and arm64), with `hangar-update`,
  `hangar-uninstall`, and `hangar-admin`.

[0.3.0]: https://github.com/bduffaut/Hangar/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/bduffaut/Hangar/releases/tag/v0.2.0
