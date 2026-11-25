# How Hangar works

Hangar is a small deploy platform that runs on one computer you own. It does for that computer
what services like Vercel or Render do in their cloud: you push code to GitHub, and it builds it,
runs it, and gives it an address.

## The pieces

```
 Your phone / laptop ──Tailscale──▶ Control Tower (dashboard)  ┐
                                                               │  all on your
 GitHub ◀── checks for new commits ── Hangar ──▶ Docker ──▶ your apps  │  Hangar computer
                                                               │
 Visitors ──▶ Cloudflare ──▶ tunnel ──────────────▶ your apps  ┘
```

- **The Control Tower** is the dashboard. It runs on your Hangar computer and answers only on your
  Tailscale network, so only your own devices can open it.
- **Builds** happen on the same computer. Hangar uses your repository's Dockerfile, or detects the
  framework (Node.js, Vite, Next.js, Astro, Python, Go, static sites, and more) and builds it for
  you.
- **Apps** run as Docker containers. Each gets an address on your Tailscale network right away,
  and, if you want, a public address on your own domain.
- **Cloudflare Tunnel** (optional) carries visitors from the internet to the apps you publish. The
  tunnel connects out from your computer, so no router ports are opened and your home IP stays
  hidden.

## A deploy, step by step

1. You push to GitHub. Hangar notices within a minute (or instantly, with a webhook).
2. It downloads that commit and builds an image.
3. It starts the new version **next to** the old one and waits until it answers.
4. Only then does traffic move to the new version, and the old one stops. Visitors never see a
   broken half-deploy.
5. If the build or the start fails, the old version keeps running. You can also roll back to any
   earlier version in one click, without rebuilding.

**Ready-made apps** like Jellyfin work the same way, except that Hangar downloads the app's
published image instead of building your code, and only when you press **Update**. An app that
keeps data stops its old version just before starting the new one, so the two never write to the
same files, and starts it again if the new one fails. See [Install apps](apps.md).

## What hangar.benduffaut.com is

Just these guides and the tour. It has no accounts, serves no scripts (the install command
downloads from GitHub), and never talks to your computer. Your Hangar is entirely yours; this site could disappear and your Hangar would keep
running.

## Where your data lives

On your Hangar computer, in `/opt/hangar` and Docker volumes: the database (accounts, projects,
settings, encrypted environment variables), your built images, your apps, and each app's **kept
folders** (volumes named `hangar-data-<app>-<folder>`). Libraries stay where they are, in the
folders you shared. See
[Updating, backups, and removing Hangar](updating.md) for backing it up.
