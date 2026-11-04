# Security

## Reporting a problem

Please report vulnerabilities through
[GitHub's private reporting](https://github.com/bduffaut/Hangar/security/advisories/new), not in a
public issue.

## What Hangar protects

- **Accounts.** Invite-only, with one-time links. Passwords are hashed with argon2id, sessions are
  stored as hashes, and every change needs a CSRF token and a known origin. Failed sign-ins are
  limited per address and per account.
- **Separation between accounts.** Projects, deployments, logs, env vars, metrics, and live events
  are visible only to their owner, admins included. Each account uses its own GitHub token, and
  its apps and builds run on their own Docker network, with their own build cache.
- **The platform.** Apps cannot reach the database or Traefik's API, and core refuses connections
  that did not come through Traefik. Secrets are encrypted at rest with AES-256-GCM and tied to
  their record.
- **Exposure.** The Control Tower stays private unless an admin makes it public. Public traffic
  arrives only through the Cloudflare Tunnel, with no open ports.

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
- **The Control Tower speaks plain HTTP on your network.** Use it on a network you trust, such as
  Tailscale, or expose it through the tunnel, which adds HTTPS.
- **No two-factor sign-in yet.** A public Control Tower (`hangar.<your domain>`) shows its sign-in
  page to the whole internet, protected by passwords and sign-in limits alone. Use long, unique
  passwords, or add Cloudflare Access in front of that address.
