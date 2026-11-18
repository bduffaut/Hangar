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
- **The public site** (hangar.benduffaut.com) is static: guides, the tour, and the install script.
  It has no accounts and never connects to anyone's Hangar. The install script downloads the
  release from GitHub and checks its checksum before running it.

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
- **The install command is trusted.** `curl … | sudo bash` runs what hangar.benduffaut.com
  serves. It only fetches a GitHub release and checks its checksum, but a compromised site could
  serve a different script to new installs. The install guide shows how to read it first, or to
  install from a release by hand.
