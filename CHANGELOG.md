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
- Guides for the apps: [Install apps](docs/guides/apps.md), then one per kind of app
  ([movies, music, and books](docs/guides/apps-media.md), [photos](docs/guides/apps-photos.md),
  [documents and files](docs/guides/apps-documents.md), [recipes and monitoring](docs/guides/apps-home.md)),
  with pictures of the dashboard.
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
- **The launcher.** A new home screen widget with a tile per app, each with the app's own icon and
  a status dot: one click opens it, like a folder of bookmarks. On existing dashboards, add it
  under **Customize**.
- **Paperless-ngx: your paper documents, searchable.** The second app made of several parts (the
  app, Postgres, and a Valkey queue). Upload or scan a document and it is read, filed, and found
  by a search later. Open to every account. When it gets a public address, Hangar tells it and
  restarts it, so sign-ins work there too (D48).
- **Each part of an app, on Radio.** For apps made of several parts, the app's **Radio** tab lists
  them (its database, cache, and so on) with how each is doing, and shows any one's live output.
- **Deploys respect an image's own health check (D46).** If an image (or your Dockerfile) declares a
  `HEALTHCHECK`, a deploy goes live only once it passes, not at the app's first answer. Hangar runs
  it straight away rather than waiting on Docker's schedule, so deploys stay quick.
- **New versions of apps (D47).** An app's page says when its image has a newer version (for
  example Immich v3.5.0 while it runs v3.4.2) and updates to it in one click. Hangar asks the
  image's registry at most twice a day.
- Apps can have a longer download time limit set by their template (Immich: 45 minutes).
- Apps whose first visitor becomes their admin are installed privately, so nobody on the internet
  can claim them before their owner finishes setup.
- **Minecraft: your own world, for friends to join over Tailscale (D51).** The first app that is not
  a web page: players connect to `<your computer>.ts.net:25565`, shown on the app's page and
  copied by its launcher tile. Ports like this are published on the Tailscale address only, never
  on your home network or the internet, and one app holds a port at a time. Installing it asks you
  to accept Minecraft's EULA (D52).
- **Home Assistant and Mosquitto: a smart home at home.** Home Assistant works behind Hangar right
  away: Hangar gives it a starting `configuration.yaml` that trusts its proxy (D53). Mosquitto,
  the MQTT broker, has no web page and no port on the computer; your other apps reach it at
  `mosquitto:1883`. Both are open to every account. Templates' starting files are written only
  when missing, so your own edits are never overwritten.
- **Any image as a game server or other non-web app.** Under **Customize**, an admin can mark an
  image as not a web page and give it TCP or UDP ports on the Tailscale address.
- **Home Assistant on your home network (D54).** An admin can turn on **Home network** when
  installing Home Assistant, so it finds Chromecast, HomeKit, and other devices that announce
  themselves there. Its private address stays the same.
- **USB sticks and Zigbee2MQTT (D55).** An admin can give an app a Zigbee or Z-Wave stick, picked
  from what is plugged in and remembered by its own name, so it keeps working in another socket.
  **Zigbee2MQTT** is the first app to use one: Zigbee devices from any brand, passed to Home
  Assistant through Mosquitto.
- **Every port on the computer, in one list.** Settings → Network shows each port an app holds,
  with its app, owner, and the address to connect to.
- **Apps reach each other by name (D50).** An app can talk to another app of the same account at
  its name, like `http://jellyfin:8096`, ready for smart home apps that work together.

### Fixed

- A deploy that Hangar's own restart cut short (an update, a reboot) is tried again when it starts,
  instead of waiting for the next commit (D49).
- Closing an app's live output could, rarely, stop Hangar when Docker dropped the connection.

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
