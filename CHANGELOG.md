# Changelog

All notable changes to Hangar. The format follows [Keep a Changelog](https://keepachangelog.com),
and versions follow [Semantic Versioning](https://semver.org). Each version is a git tag (`vX.Y.Z`)
with an installer and a `ghcr.io/bduffaut/hangar-core` image.

## [0.3.0] - Unreleased

Hangar is now one private Hangar per person. The central Control Tower is gone: everything,
including the dashboard, runs on your own computer, and the dashboard is private to your Tailscale
network.

### Added

- **A private dashboard.** The installer installs Tailscale, signs the computer in, and makes
  Hangar listen on its Tailscale address only. With HTTPS certificates on for your tailnet, the
  Control Tower is at `https://<machine>.<tailnet>.ts.net`. The installer prints the address and a
  QR code for your phone.
- **One-line install:** `curl -fsSL https://hangar.benduffaut.com/install.sh | sudo bash`. It
  downloads the release from GitHub and checks its checksum.
- `hangar-doctor` checks Docker, Hangar, Tailscale, HTTPS, the tunnel and disk, and explains what
  to fix. `hangar-tailscale` runs the Tailscale step again.
- **The public site**, hangar.benduffaut.com: a front page, guides for every step (install,
  Tailscale, going public, GitHub, sharing, updating, troubleshooting, security), and **the tour**:
  the real dashboard with sample data, running in your browser.
- **Delete your own account** under Account.
- Ubuntu 26.04 and Debian 13 are supported.

### Changed

- The Control Tower can no longer be made public, and Hangar refuses any dashboard request that
  arrives through the Cloudflare tunnel.
- The first-steps checklist starts with opening Hangar on your other devices.
- Settings → Network shows your private address.

### Removed

- The central Control Tower, connected servers, the relay, and open sign-up (0.2.0). Accounts made
  through open sign-up are removed when you update; they could never use your machine.
- `hangar-admin set-public-tower`.

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
- People's own servers, run from one central Control Tower over an outbound relay connection
  (removed in 0.3.0).
- A guided **Get set up** checklist and a Publish page.
- An installer for Ubuntu 22.04/24.04 and Debian 12 (amd64 and arm64), with `hangar-update`,
  `hangar-uninstall`, and `hangar-admin`.

[0.3.0]: https://github.com/bduffaut/Hangar/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/bduffaut/Hangar/releases/tag/v0.2.0
