# Roadmap: from deploy tool to home server dashboard

Status: plan, 2026-11-18. Nothing here is built yet. Each phase ends with something you can use
on your own server, and each one becomes Decisions rows in [ARCHITECTURE.md](ARCHITECTURE.md)
when it lands.

## The goal

Hangar becomes the one dashboard for a computer at home. It should be easy enough for a student
deploying a first project, and deep enough that someone running a media server, photo backup, and
smart home on it never needs another tool.

- **Projects:** your own code from GitHub, built and deployed on every push (what Hangar does
  today).
- **Apps:** ready-made software (Jellyfin, Immich, Home Assistant, Vaultwarden, a Minecraft
  server, ...) installed from a catalog in one click.
- **One place to watch it all:** the machine, every app, storage, backups, updates, and alerts on
  your phone.

### Principles

1. **Defaults first, options one click away.** Every install works with no choices made. Each
   form opens with the recommended values filled in. "Customize" reveals everything else, and
   nothing advanced is hidden behind a config file you can't see.
2. **Private by default.** A new app answers only on your Tailscale network. Making it public is
   a deliberate, visible step, as it is for projects today.
3. **Data is sacred.** Anything an app writes to its storage survives updates, restarts,
   redeploys, and Hangar upgrades. It is included in backups. Deleting an app asks separately
   before deleting its data, as `hangar-uninstall` does.
4. **Powerful options belong to admins.** Folders on the computer, hardware, and the host network
   can reach past an app's container. Only an admin can grant them, and the app's page always
   shows what it was granted.
5. **No new moving parts for the owner.** Still one installer, one dashboard, plain Docker
   underneath, with no Kubernetes and no second orchestrator. Anything Hangar runs can be
   inspected with `docker ps`.
6. **The catalog is code.** App templates live in this repository as reviewed, versioned files,
   released with Hangar. Nothing is fetched and run from an unreviewed source.

### Names

| Term    | Means                                                                      |
| ------- | -------------------------------------------------------------------------- |
| Project | Built from a GitHub repository (today's only kind).                        |
| App     | Runs a published image: from the catalog, or any image an admin names.     |
| Stack   | An app made of several containers that work together (Immich).             |
| Storage | A Docker volume Hangar creates for an app, kept across deploys, backed up. |
| Library | A folder on the computer an admin shares with apps (movies, photos).       |
| Add-on  | A managed database or cache attached to a project (Postgres, Redis).       |

The dashboard lists projects and apps together. The **Add** button offers three paths:
**Deploy my code**, **Install an app**, and **Run an image** (advanced).

---

## What has to change underneath

These pieces are shared by every phase. Building them first, and building them once, keeps the
catalog as data rather than code.

### 1. One model for everything that runs

Today a project is one container built from a repo. It becomes an **app** with one or more
**services** (containers):

```
apps            (today's projects table, renamed in code; the table keeps its name)
  kind          source | image | stack
  image         e.g. jellyfin/jellyfin:10.11 (kind image)
  catalogId     e.g. jellyfin, with catalogVersion, when installed from the catalog
  strategy      rolling | recreate
services        one row per container of a stack; source and image apps have exactly one
  appId, name, image | build, command, env, healthCheck, dependsOn
volumes         appId, service, name, mountPath, kind managed|library, libraryId, readOnly, backup
ports           appId, service, containerPort, protocol http|tcp|udp, exposure private|public|none
devices         appId, service, kind gpu|usb, path
libraries       admin-defined host folders: name, path, readOnly default
```

The pipeline learns two new start-ups beside "clone and build": **pull an image** and **bring up
a stack** (start the services in `dependsOn` order, health-check each).

### 2. Deploy strategies

- **Rolling** (today, and the default for projects): start the new container, switch traffic,
  then stop the old one. No downtime.
- **Recreate** (the default for anything with storage): stop the old container, then start the
  new one. Two copies of Jellyfin or a database must never write to the same files at once. The
  dashboard shows the few seconds of downtime as "Restarting". A failed start brings the old
  image back on the same storage.

### 3. Storage that survives

- Managed volumes are named `hangar-<app>-<volume>` and labelled with the app, so they outlive
  containers. The current `remove({ v: true })` on replace must stop touching them, and only an
  explicit "Delete app and data" removes them.
- Each app's page shows each volume, its size (measured every few minutes), and what it is for.
- **Libraries** are host folders an admin registers once in **Settings → Libraries** (for
  example `Movies → /srv/media/movies`). Apps mount libraries by name, read-only by default, and
  never by a raw path. Hangar refuses system paths (`/`, `/etc`, `/var/run/docker.sock`, `/opt/hangar`,
  `/home`, ...) and anything that resolves into them through symlinks.

### 4. Permissions

Every app option is in one of two tiers, enforced on the server, never just in the form:

| Tier     | Who      | Options                                                                                                        |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| Standard | everyone | managed storage, env vars, memory, private and public HTTP addresses, catalog apps marked standard             |
| Elevated | admins   | libraries, devices (GPU, USB), TCP/UDP ports, host networking, any image by name, catalog apps marked elevated |

The option to run a container privileged, or to mount the Docker socket, does not exist at all.
Catalog templates declare their tier, so a member can install Jellyfin only after an admin has
shared a library with them.

### 5. Networking

- **HTTP ports** become a list. Each one gets the private address it has today
  (`<app>.<tailnet address>.sslip.io`, or `<app>-<port>...` for extra ports), plus optional
  public addresses.
- **Private HTTPS** for apps that need a secure page (Vaultwarden, and any app with a camera or a
  passkey) uses `tailscale serve` on a port per app:
  `https://<machine>.<tailnet>.ts.net:<port>`. It needs the tailnet's HTTPS certificates on, and
  `hangar-tailscale` manages the list.
- **TCP/UDP ports** (Minecraft 25565, MQTT 1883) are published on the Tailscale address only,
  never on every interface. They can be public only through a Cloudflare Tunnel TCP route, which
  is a separate, explicit, admin step.
- **Host networking** (admins, Home Assistant only in the catalog) is shown with a plain warning.
  Such an app gets no Traefik route; its address is the machine's own on its port.

### 6. Backups

- **What:** Hangar's database (as today), every managed volume with `backup: true` (the
  default), and optionally libraries (off by default, since they are usually large).
- **How:** one backup job per night by default. Each volume is copied from a short-lived helper
  container into `restic` repositories, which deduplicate and encrypt. Recreate apps are paused
  for a consistent copy, and databases are dumped first.
- **Where:** a folder or external drive (the default suggestion is `/opt/hangar/backups`), plus
  any S3-compatible or SFTP destination as an option.
- **Restore** is one button per app (pick a date), and a restore drill test runs it in CI.

### 7. Updates for apps

- Hangar checks each app's image tag for a newer digest daily, and for catalog apps it shows the
  template's own release notes.
- Default policy: **notify**, with a one-click update that backs up the app's storage first and
  rolls back on a failed health check. Options are automatic updates (patch versions only, at
  night) or pinned.

### 8. Alerts

One notification system used by everything: deploy failed, app down, disk nearly full, backup
failed, update available, temperature high. It sends to the dashboard and, optionally, to
**ntfy** (push to your phone; it can run on Hangar itself), email, or a Discord/Slack webhook.
Each alert type can be turned off or on per channel.

---

## Phases

Each phase lists what you can do at the end, what gets built, and how it is checked. Sizes are
rough: S is a few days, M is one to two weeks, L is more.

### Phase 1: Apps with storage (M)

**At the end:** you can install **Jellyfin**, point it at your movies, watch on your phone over
Tailscale, update it, and lose nothing.

- `kind: image` apps: **Run an image** with an image name, port, env vars, and memory.
- Managed volumes and the recreate strategy, with data kept across deploys and Hangar updates.
- Libraries: Settings → Libraries, admin-only, path checks, read-only by default.
- GPU passthrough (`/dev/dri`) as an elevated option, auto-detected and offered when present.
- **Delete app** asks separately about its data.
- Catalog v0: one template (Jellyfin), to prove the format before the catalog grows.
- Tests: redeploy keeps data (integration); a member cannot add a library or a device (API); path
  checks refuse system folders and symlinks (unit); recreate rolls back on a failed start.

### Phase 2: The app catalog (M)

**At the end:** **Install an app** shows a catalog. Picking Immich, Vaultwarden, or Uptime Kuma
installs it in one click with the recommended settings. **Customize** shows every option.

- Template format (see below), schema-checked in CI, with screenshots, a plain description, and
  a "what it needs" list.
- Stacks: multi-container templates with `dependsOn`, an internal network per stack, generated
  secrets (database passwords made at install, stored encrypted like env vars).
- An app launcher on the home screen: a tile per app with its icon and a status dot, opening its
  address. It can replace the browser bookmarks folder.
- App pages gain Storage, Network, and Updates tabs.
- First catalog (all private by default):

| Category     | Apps                                                         | Tier                                                  |
| ------------ | ------------------------------------------------------------ | ----------------------------------------------------- |
| Media        | Jellyfin, Navidrome (music), Audiobookshelf, Kavita (books)  | elevated (library)                                    |
| Photos       | Immich (phone backup, the stack template)                    | standard (own storage) or elevated (existing library) |
| Files        | File Browser, Syncthing                                      | elevated                                              |
| Passwords    | Vaultwarden (needs private HTTPS, so phase 3)                | standard                                              |
| Monitoring   | Uptime Kuma, ntfy                                            | standard                                              |
| Productivity | Mealie (recipes), Paperless-ngx (documents), Actual (budget) | standard                                              |
| Developer    | Forgejo (Git), code-server (VS Code in the browser)          | standard                                              |

Plex is left out of the defaults: it signs in through Plex's servers. It can still be run as an
image by an admin.

### Phase 3: Smart home, games, and private HTTPS (M)

**At the end:** **Home Assistant** finds your devices, a Zigbee dongle works, friends join your
**Minecraft** server over Tailscale, and Vaultwarden works on `https://`.

- TCP/UDP ports on the Tailscale address; USB devices (`/dev/ttyUSB*`, `/dev/serial/by-id/*`)
  as elevated options, with a device picker.
- Host networking for the Home Assistant template only.
- Private HTTPS per app through `tailscale serve`, falling back to plain http with a note when
  the tailnet's certificates are off.
- Catalog: Home Assistant, Mosquitto (MQTT), Zigbee2MQTT, Node-RED, ESPHome; Minecraft (Java and
  Bedrock), Valheim; AdGuard Home, as the DNS server for your tailnet, with a guide on pointing
  Tailscale's DNS at it.
- Guides: "Smart home with Hangar", "Run a game server", "Ad blocking for all your devices".

### Phase 4: For students and projects (M)

**At the end:** a classmate gets an invite, deploys a Flask app with a Postgres database in five
minutes, and every pull request gets its own preview address.

- **Add-ons:** "Add a database" on a project creates Postgres, MySQL, Redis, or MongoDB with
  storage and backups, and puts `DATABASE_URL` (and friends) into the project's env.
- **Starters:** "Start from a template" for Next.js, Vite + React, Flask, FastAPI, Express,
  Spring Boot, and a static site. Each starter is a public template repo you copy to your GitHub
  account in one click, then deploy.
- **Preview deploys:** an optional per-project setting that deploys each pull request to
  `pr-<n>.<project>...` and removes it when the PR closes. The project's link is posted to the
  PR as a check.
- **Workers and scheduled jobs:** services with no port, and cron schedules ("run `npm run
cleanup` every night") with logs per run.
- **Quotas per account** (memory, storage, number of apps), set by an admin, with sensible
  defaults for invited members.
- **A web terminal** into a project's own container (owner and admins), for `rails console` or
  `python manage.py migrate`.
- A class mode for teachers: invite a list of students, give each an account and quota, and see
  everyone's apps on one page.

### Phase 5: See everything (S–M)

**At the end:** the home screen tells you at a glance whether everything is fine. If something
is wrong, your phone already knows.

- Alerts (section 8) with ntfy, email, and webhooks; quiet hours.
- Per-app health: uptime history, restarts, and response time for HTTP apps.
- Storage overview: disk per app, per volume, per library, and a warning before the disk fills.
- **Other containers on this computer:** a read-only list of containers Hangar did not create
  (like benduffaut.com), with status, CPU and memory, so the dashboard covers the whole machine.
- App widgets on the dashboard: Jellyfin's "now playing", Immich's photo count, Home Assistant
  entities, Uptime Kuma status. They use each app's own API with a token stored encrypted, as
  plugins on the existing widget registry.

### Phase 6: Bring your own setup (S–M)

**At the end:** someone with an existing `docker-compose.yml` moves it into Hangar, and backups go
off-site.

- **Import a compose file:** paste or point at a file in a repo. Hangar converts it to a stack,
  shows exactly what it will create, and refuses or flags anything outside the tiers (privileged,
  the Docker socket, raw host paths, which must become libraries).
- Off-site backups (S3, Backblaze B2, SFTP), with a monthly restore check.
- Export an app (template plus data) and move it to another Hangar.
- Community templates: a contributors' guide, a `catalog/` review checklist, and CI that boots
  every template.

---

## Catalog template format

One file per app in `catalog/<id>.yaml`, released with Hangar. Example:

```yaml
id: jellyfin
name: Jellyfin
version: 1 # the template's own version
category: media
summary: Watch your movies and shows on any device.
tier: elevated # it reads a library
needs: [library]
services:
  jellyfin:
    image: jellyfin/jellyfin:10.11 # pinned to an exact release in the real file
    ports:
      - { port: 8096, protocol: http, exposure: private, primary: true }
    volumes:
      - { name: config, mount: /config, backup: true }
      - { name: cache, mount: /cache, backup: false }
    libraries:
      - { ask: Movies and shows, mount: /media, readOnly: true }
    devices:
      - { kind: gpu, optional: true, why: Faster playback on phones and TVs }
    env:
      JELLYFIN_PublishedServerUrl: '{{ app.url }}'
    memory: 2048
    health: { http: /health }
strategy: recreate
updates: notify
```

The form for an install is generated from the template: required questions first (which
library), with everything else under **Customize** and filled in with the template's values.

## Security notes

- Templates pin images by version. CI checks they resolve and records their digests, so an
  install gets what was reviewed.
- Elevated options are checked on every save and every deploy, not only at install. Demoting an
  admin stops their elevated apps from redeploying until another admin approves them.
- Libraries are mounted by Hangar from a list an admin keeps. The API never accepts a host path
  from a member.
- Apps get their own networks, as accounts do today (D32), so an app cannot reach another app's
  database unless they are in the same stack.
- Host-network apps and TCP ports are listed in Settings → Security, so the owner can see
  everything that listens outside Traefik.
- Backups are encrypted with a key generated at install and kept in `.env`, with a
  printable recovery sheet.

## Still out of scope

- Running anything across more than one computer (D20 stays: one Hangar per Docker host).
- Virtual machines.
- Piracy-oriented download stacks in the catalog (they can still be run as images).
- A hosted Hangar (D40 stays: every Hangar is its owner's own).

## Order and first steps

Phase 1 comes first because everything else stands on storage and the app model. Phases 2 and 3
can swap places. Phase 4 can start in parallel once phase 1's model has landed, since add-ons
are apps with storage.

Phase 1, in order:

1. The model: `kind`, `services`, `volumes`, `libraries`, the migration (existing projects
   become `kind: source` apps with one service), and the tier checks.
2. The pipeline: pulling images, the recreate strategy, volumes kept on replace.
3. Settings → Libraries, and the GPU option.
4. **Run an image** and the app page's Storage tab.
5. The Jellyfin template and the minimal catalog page.
6. Tour data and a guide: "Watch your movies anywhere".
