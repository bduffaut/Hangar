# Reach your dashboard from anywhere

Your Control Tower controls everything on your Hangar computer, so it should not be on the public
internet. Hangar puts it on your **Tailscale network** instead: a private network made of your own
devices, wherever they are.

## Why Tailscale

- **Only your devices can reach it.** Not even the sign-in page is visible to anyone else.
- **It works from anywhere**: at home, on mobile data, at work.
- **Nothing to open.** No router settings, no port forwarding, no exposed home IP.
- **Free** for personal use, with up to 100 devices.

## Adding a device

1. Install Tailscale from [tailscale.com/download](https://tailscale.com/download).
2. Sign in with the **same account** your Hangar computer uses.
3. Open your Control Tower address, for example `https://hangar.tail1234.ts.net`. Bookmark it, or
   on a phone, add it to your home screen.

Your address is shown in the dashboard under **Settings → Network**, and on the computer with
`sudo hangar-doctor`.

## HTTPS

Turn on **HTTPS Certificates** in the Tailscale admin console under
[DNS](https://login.tailscale.com/admin/dns), then on the Hangar computer run:

```sh
sudo hangar-tailscale
```

The Control Tower moves to `https://…ts.net`, with a real certificate. Without it, the address is
`http://…ts.net`: still private, and still encrypted by Tailscale itself.

## Sharing with other people

To let someone else use your Hangar, share the Hangar computer with them from the Tailscale admin
console ([Share a machine](https://tailscale.com/kb/1084/sharing)), then invite them from the
dashboard. See [Share Hangar](sharing.md).

## Machine names

On a fresh install the computer joins Tailscale as `hangar`, so the address starts with
`hangar.`. If the computer was already on Tailscale, it keeps its name. If you rename it later in
the admin console, run `sudo hangar-tailscale` so Hangar learns the new address.

## Without Tailscale

Hangar can also answer only on your home network: install with `HANGAR_TAILSCALE=0`. You can
switch to Tailscale any time with `sudo hangar-tailscale`.
