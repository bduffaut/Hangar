# Security

## Reporting a problem

Please report vulnerabilities through
[GitHub's private reporting](https://github.com/bduffaut/Hangar/security/advisories/new), not in a
public issue.

## What Hangar protects

- **Accounts.** Invite-only, with one-time links; there is no sign-up. Passwords are hashed with argon2id, sessions are
  stored as hashes, and every change needs a CSRF token and a known origin. Failed sign-ins are
  limited per address and per account.
- **Separation between accounts.** Projects, deployments, logs, env vars, metrics, and live events
  are visible only to their owner, admins included. Each account uses its own GitHub token, and
  its apps and builds run on their own Docker network, with their own build cache.
- **The platform.** Apps cannot reach the database or Traefik's API, and core refuses connections
  that did not come through Traefik. Secrets are encrypted at rest with AES-256-GCM and tied to
  their record.
- **Exposure.** The Control Tower answers only on the owner's Tailscale network (or, without
  Tailscale, the local network); Hangar listens on that address alone. It is never routed through
  the Cloudflare Tunnel, and core refuses any dashboard request that arrives on the public
  entrypoint, whatever its hostname. Public traffic reaches only published apps, webhooks, and
  address checks, with no open ports.
- **Folders and hardware are an admin's to grant (D42).** Libraries (folders on the computer), the
  graphics chip, and apps from a published image are admin-only, enforced on the server and
  checked again at every deploy and every restart against the owner's current role. A library
  path is refused if it is, contains, or sits inside a system folder, a hidden folder, or a home
  folder itself; then a short-lived probe container (no network, only the read-search
  capability, a read-only root, the computer's `/` mounted read-only, the path passed as an
  argument) refuses it if it is missing or any part of it is a link. Apps get libraries
  read-only unless the library allows writing, and never by a path a user typed. There is no
  option to run an app privileged or give it the Docker socket.
- **Kept data stays with its account.** A data volume is labelled with the account that made it;
  an app of the same name in another account is refused it rather than inheriting it.
- **The public site** (hangar.benduffaut.com) is static: guides and the tour, served by nginx with
  a strict content security policy. It has no accounts, serves no scripts, and never connects to
  anyone's Hangar. The install command downloads `install.sh` from the GitHub release, which
  downloads the release itself and checks its checksum before running it.

## Known limits

Hangar is built for people who trust each other, such as a household, friends, or a small team. It
is not a hosting service for strangers.

- **Every account runs code on the server.** Apps and builds are ordinary containers, sharing the
  host's kernel. A container escape, which is a Docker or Linux vulnerability rather than a Hangar
  one, would reach everything. Invite only people you would trust with a shell.
- **Core controls Docker.** It holds the Docker socket, so anyone who takes over core takes over
  the server. That is why a repository's code never runs inside core. The one exception to watch
  is `railpack prepare`, which reads a repository from inside core to plan a build. Each account's
  builder is a privileged container, as BuildKit requires, so a BuildKit escape is a server escape.
- **Apps are visitors to each other.** Apps cannot connect directly to another account's
  containers, but through the proxy they can reach any routed app, including one with no public
  address, just as a device on your network can. An app should have its own login if it holds
  anything private.
- **Apps can reach what the host publishes.** An app can open connections to the server's own
  addresses and to the local network. Any service published on the host, including the Control
  Tower's sign-in page on port 80, is reachable from apps. Keep such services behind a login, or
  block containers from them with firewall rules.
- **Resources are shared.** Limits cover each app's memory, processes, and CPU weight, and the
  number of projects per member. Builds have no such limit, run one at a time, and disk use is
  shared, so one account can slow others down.
- **Anyone on your Tailscale network can reach the sign-in page.** Share the Hangar machine only
  with people you would give an account, and use strong passwords. Without Tailscale's HTTPS
  certificates the Control Tower uses plain HTTP, which Tailscale still encrypts end to end;
  without Tailscale at all, it is plain HTTP on the local network.
- **No two-factor sign-in yet.** Tailscale's own sign-in, with its two-factor options, is the
  first door.
- **The install command is trusted.** `curl … | sudo bash` runs the `install.sh` attached to the
  newest GitHub release. Anyone who can publish a release can change it. The install guide shows
  how to read it first, or to install from a release by hand.
- **Catalog apps run someone else's image.** Each template names a pinned image from its
  publisher's own repository, and members can only move between versions of that repository.
  Installing one trusts its publisher as much as running `docker pull` would; Hangar does not scan images.
  Apps whose first visitor becomes admin are installed private, but on a shared Hangar anyone on
  your Tailscale network who opens such an app before its owner can claim it, so set apps up as
  soon as they are installed.
- **A library is the folder it names, nothing more.** Hangar cannot stop someone with a shell on
  the computer from replacing a library's contents; it does check the folder again before each
  deploy. An app with write access to a library can change or delete those files.
- **Published images are what their publishers ship.** Hangar pins what you choose but does not
  review images. Install images from projects you trust, with a version tag.
