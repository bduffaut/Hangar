# Hangar

Your own place to deploy apps. Hangar turns a spare Linux box into a small, self-hosted
deployment platform: connect a GitHub repository, and every push builds and deploys to its own
address, with logs, rollbacks, and a dashboard called the Control Tower.

- Builds repositories with a Dockerfile, or detects the framework with Railpack
- Zero-downtime deploys: traffic moves only after the new version answers
- Public addresses on your own domains through a Cloudflare Tunnel, with no open ports
- Live status for every address, measured from the internet
- Invite-only accounts: each person sees only their own projects

## Install

You need Ubuntu 22.04 or 24.04, or Debian 12, on amd64 or arm64, with 2 GB of memory and 10 GB of
free disk. Download `hangar-installer.tar.gz` and its `.sha256` file from the latest
[release](https://github.com/bduffaut/Hangar/releases), then:

```sh
sha256sum -c hangar-installer.tar.gz.sha256
tar -xzf hangar-installer.tar.gz
sudo HANGAR_VERSION=<version> bash installer/install.sh
```

The installer prints the Control Tower's address and a one-time setup code. By default Hangar
listens on every network the server is on; set `HANGAR_BIND_IP` to limit it to one, such as a
Tailscale address.

Update with `sudo hangar-update`, and remove with `sudo hangar-uninstall`.

## Documentation

- [How Hangar works, in plain language](docs/GUIDE.md)
- [Architecture and decisions](docs/ARCHITECTURE.md)
- [Security model and known limits](SECURITY.md)

## Development

```sh
pnpm install
pnpm dev               # the stack, with the dashboard on http://localhost:5173
pnpm test              # unit tests
pnpm test:integration  # needs `pnpm dev` running
pnpm test:e2e          # browser tests
```

## License

MIT. See [LICENSE](LICENSE).
