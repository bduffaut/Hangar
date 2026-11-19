# Changelog

All notable changes to Hangar. The format follows [Keep a Changelog](https://keepachangelog.com),
and versions follow [Semantic Versioning](https://semver.org). Each version is a git tag (`vX.Y.Z`)
with an installer and a `ghcr.io/bduffaut/hangar-core` image.

## [Unreleased]

### Added

- **Apps from images (D42).** Install ready-made software in one click from **Apps**, starting
  with **Jellyfin**, or run any published image by name. Apps are private to your Tailscale
  devices by default and update when you press **Update**.
- **Storage that survives.** Any app or project can have kept folders: Docker volumes that last
  across deploys, updates, and restarts, with their size shown. Deleting an app keeps its data
  unless you choose otherwise; **Settings → Storage** lists and removes what deleted apps left.
- **Libraries.** Admins share folders from the computer (movies, photos) with apps, read-only by
  default. Hangar refuses system folders and links, and checks the folder on every deploy.
- **Graphics chip.** Apps like Jellyfin can use `/dev/dri` for faster video conversion.
- Apps with storage stop the old version before starting the new one, and start it again if the
  new one fails.
- A guide: [Install apps like Jellyfin](docs/guides/apps.md).
- **A build time limit per app**, in its Settings: 15 minutes by default, from 1 to 120. For an
  app from an image it limits the download.
- **Five more apps in the catalog (D43):** Navidrome (music), Audiobookshelf (audiobooks and
  podcasts), Uptime Kuma (monitoring), Mealie (recipes), and File Browser (files).
- **Members can install apps.** Apps that need nothing from the computer (Uptime Kuma, Mealie,
  File Browser) are open to every account; the server installs them exactly as the catalog
  describes, and members can change their version. Apps that read a library or use the graphics
  chip stay with admins.
- **Immich: back up your phone's photos (D44).** The first app made of several parts: the app,
  its database, a cache, and machine learning for faces and search. Hangar starts, updates, and
  stops them together, makes the database password for each install, and keeps the parts on a
  private network only the app can reach.
- Apps can have a longer download time limit set by their template (Immich: 45 minutes).
- Apps whose first visitor becomes their admin are installed privately, so nobody on the internet
  can claim them before their owner finishes setup.

## [0.3.1] - 2026-11-18

### Changed

- **The install command downloads from the GitHub release:**
  `curl -fsSL https://github.com/bduffaut/Hangar/releases/latest/download/install.sh | sudo bash`.
  Each release carries an `install.sh` pinned to it, so the site serves nothing you run.
- **hangar.benduffaut.com runs on Hangar**, deployed from this repository like any app (the root
  `Dockerfile`), instead of on GitHub Pages.
- An admin can give an app the address `hangar.<domain>`, which was reserved for the public Control
  Tower before 0.3.0.

## [0.3.0] - 2026-11-18

Hangar is now one private Hangar per person. The central Control Tower is gone: everything,
including the dashboard, runs on your own computer, and the dashboard is private to your Tailscale
network.

### Added

- **A private dashboard.** The installer installs Tailscale, signs the computer in, and makes
  Hangar listen on its Tailscale address only. With HTTPS certificates on for your tailnet, the
  Control Tower is at `https://<machine>.<tailnet>.ts.net`. The installer prints the address and a
  QR code for your phone.
- **One-line install** (see 0.3.1 for its address). It
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

[0.3.1]: https://github.com/bduffaut/Hangar/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/bduffaut/Hangar/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/bduffaut/Hangar/releases/tag/v0.2.0
