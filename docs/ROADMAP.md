# Roadmap: from deploy tool to home server dashboard

Each phase ends with something you can use on your own server, and each one becomes Decisions
rows in [ARCHITECTURE.md](ARCHITECTURE.md) when it lands.

## Where things stand (updated 2026-11-18)

| Phase                               | State                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1. Apps with storage                | **Built**, released to `main` (commit `503c98f`), CI green, running on the maintainer's server. Not yet in a tagged release. |
| 2. The app catalog                  | Next. Not started.                                                                                                           |
| 3. Smart home, games, private HTTPS | Planned.                                                                                                                     |
| 4. For students and projects        | Planned.                                                                                                                     |
| 5. See everything                   | Planned.                                                                                                                     |
| 6. Bring your own setup             | Planned.                                                                                                                     |

### What phase 1 delivered (D42)

- `projects.kind` is `source` or `image`. Image apps are pulled, tagged
  `hangar/<app>:<n>-<digest>`, deployed by **Update** only, private by default.
- Kept folders (`app_volumes`, Docker volumes `hangar-data-<app>-<name>`) for any app or project,
  kept on delete unless asked, reused only by the same account.
- The `recreate` strategy (`projects.strategy`), set automatically when storage is added.
- Libraries (`libraries`, `app_libraries`): Settings → Storage, path rules in
  `packages/shared/src/apps.ts`, the probe in `apps/server/src/platform/host.ts`.
- The graphics chip (`projects.gpu`, `/dev/dri`), detected by the same probe.
- Admin-only: libraries, the chip, image apps (`POST /api/apps` is `admin`), re-checked in the
  pipeline and the reconciler.
- The catalog is `CATALOG` in `packages/shared/src/apps.ts`: one app, Jellyfin (`12.4`).
- Dashboard: **Apps** (`AppsView`), the install page (`AppInstallView`), each app's Storage panel
  (`StorageEditor`), Settings → Storage (`LibrariesPanel`), first steps on a catalog app's page.
- Guide: `docs/guides/apps.md`. Tour data includes a sample Jellyfin.

### Open items from phase 1

- **Jellyfin has not been installed for real yet.** First real run: make `/srv/media/movies` on
  the server, install from **Apps**, confirm playback and the graphics chip, then update its
  version once to see the recreate path.
- **Cut a release** (`v0.4.0`) once that works: move the changelog's Unreleased notes, bump the
  versions (see CONTRIBUTING.md), tag.
- Members cannot install catalog apps yet (all image apps are admin-only). Phase 2's server-side
  template enforcement is what lets standard-tier templates open up to members.
- Not built yet, planned for later phases: backups of kept folders (section 6), update checks
  for images (section 7), alerts (section 8), private registries, a per-app Network tab.
- The deployment list shows an image app's pulls as "builds" (Build times chart, branch column
  empty); wording can be tuned when the app page gets its phase 2 tabs.

### To do: estimated time to take off

Some apps take much longer to deploy than others: a large image on a slow Wi-Fi link, a heavy
build on a small computer, a first build with an empty cache. Each app already has a build time
limit (Settings, 1 to 120 minutes, default 15). What is missing is telling people, before and
during a deploy, how long it will likely take and whether it fits the limit.

**On the app's Settings page, beside the build time limit (before anyone presses Deploy):**

- Show **Estimated time to take off**: how long the next deploy should take, end to end (wait in
  the queue, build or download, start, health check).
- If the estimate is longer than the limit, show a warning there, with the fix in one click:
  "This app usually takes about 22 minutes, longer than its 15-minute limit. Raise the limit to 30
  minutes?" The same warning appears next to **Deploy** / **Update** on the app's page.
- When there is nothing to go on yet (a new app), say so plainly and use a cautious default.

**On the deployment page, while it runs:**

- A live **estimated time remaining** countdown that updates every second, alongside the elapsed
  time, per step (queued, building or downloading, starting, checking).
- It re-estimates as it goes: during a pull, from the bytes downloaded so far and the current
  speed; during a build, from how far previous builds had got at this point.
- It warns before the limit is reached ("At this rate the download will need about 4 more minutes
  than the limit allows"), not only when the build is stopped.

**How to estimate (to design):**

- Builds: from the app's own recent deploys (the median of the last few successful ones, per
  step), falling back to similar apps on the same computer, then to a default.
- Image apps: the image's size from its registry manifest (compressed layers, minus layers
  already on the computer), divided by the computer's recent download speed, which Hangar can
  measure from its own pulls.
- First builds and builds after an env var change skip the cache, so they need a separate, longer
  estimate.
- Record per-step timings on each deployment (queued, building, deploying, health check) so the
  estimates have data; today only the start and end of the whole deployment are kept.

### To do: stress testing

A way to find out how much a Hangar computer can handle before it falls over, and where it
breaks first. It should run either system-wide or on the pieces you pick, with the limits set in
one place.

**What it can stress, each one on its own or all together:**

- **Deploys:** many builds and image downloads queued at once, back to back, including uncached
  builds and large images.
- **Running apps:** many containers started at once, then CPU, memory, and disk pressure from
  inside them (a set of small load apps Hangar deploys for the test).
- **Traffic:** requests per second through Traefik to apps, and through the Cloudflare tunnel to
  public addresses.
- **The dashboard and API:** many signed-in sessions, live streams (status, logs, metrics), and
  API calls.
- **Storage:** writes to kept folders and libraries, and how disk fills.
- **Network:** a download that fills the link, to see how the tunnels and other sites on the
  computer cope (the problem seen while shipping, now noted in CLAUDE.md).

**What can be configured:** which pieces, how hard (counts, rates, sizes), how long, how quickly
it ramps up, and stop conditions (CPU, memory, disk, or temperature above a threshold, an app
failing its health check, any other site on the computer slowing down).

**What it reports:** a timeline of the machine's readings, deploy times, request latency and
errors, the first thing that failed and at what load, and a plain summary ("This computer handled
6 builds at once and about 400 requests a second before memory ran out").

**Safety:** admins only; it runs in its own account and network, labels everything it creates,
cleans all of it up afterwards (also after a crash), never touches containers Hangar did not
create, and stops at once on a stop condition or when the admin presses Stop. Production apps
keep running; a warning before starting says what may slow down.

Where it lives (a dashboard page, `hangar-admin stress`, or both) is to be decided.

### Phase 2, first steps

1. **Server-side templates.** Installing with a `catalogId` takes the image, ports, and storage
   from the template on the server (not from the request), so a member can install
   `tier: standard` apps safely. Keep `POST /api/apps` admin-only for arbitrary images.
2. **Stacks.** A `services` table (one row per container of an app); the pipeline starts them in
   `dependsOn` order on an internal network per stack; only the primary service is routed.
   Generated secrets per install, stored encrypted like env vars.
3. **Templates:** Immich (the stack proof), Vaultwarden (needs phase 3's private HTTPS; can wait),
   Uptime Kuma, Navidrome, Audiobookshelf, Paperless-ngx, Mealie, File Browser.
4. **The app launcher** widget on the home screen.
5. Tour data, catalog screenshots, and a guide per category.

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

### Phase 1: Apps with storage (M) — built

**At the end:** you can install **Jellyfin**, point it at your movies, watch on your phone over
Tailscale, update it, and lose nothing.

- `kind: image` apps: **Run an image** with an image name, port, env vars, and memory.
- Managed volumes and the recreate strategy, with data kept across deploys and Hangar updates.
- Libraries: Settings → Storage, admin-only, path checks, read-only by default.
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

Phase 1 keeps the catalog as typed code in `packages/shared/src/apps.ts` (`CATALOG`), checked by
tests, which needs no parser and cannot drift from the API. Once stacks arrive (phase 2) it may
move to one file per app in `catalog/<id>.yaml`, released with Hangar. Example of that shape:

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

## Order

Phase 1 came first because everything else stands on storage and the app model (done). Phases 2
and 3 can swap places. Phase 4 can start in parallel, since add-ons are apps with storage. Phase
1 deliberately left out a `services` table: one container per app until stacks need more (phase
2).
