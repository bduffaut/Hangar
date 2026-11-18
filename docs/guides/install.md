# Install Hangar

About 10 minutes, start to finish. You need a spare computer that can stay on, and your phone or
laptop to reach the dashboard from.

## What you need

- **A computer for Hangar.** An old laptop, a mini PC, or a Raspberry Pi 4 or 5. It runs your apps,
  so it should stay on and connected.
  - Ubuntu 22.04, 24.04 or 26.04, or Debian 12 or 13
  - 64-bit Intel/AMD or ARM, 2 GB of memory, 10 GB of free disk
  - Never installed Linux? Follow Ubuntu's guide:
    [Install Ubuntu Server](https://ubuntu.com/tutorials/install-ubuntu-server). Choose
    "Install OpenSSH server" when asked, so you can work on it from your own computer.
- **A free Tailscale account.** Tailscale connects your devices privately. Your dashboard answers
  only there, so nobody else can reach it. [Why Tailscale?](tailscale.md)

## 1. Put Tailscale on your phone or laptop

Install Tailscale from [tailscale.com/download](https://tailscale.com/download) on the device you
will use to open the dashboard, and sign in. Remember which account you used (Google, GitHub,
Microsoft, or email): the Hangar computer must join the same one.

## 2. Turn on HTTPS for your Tailscale network (recommended)

In the Tailscale admin console, open [DNS](https://login.tailscale.com/admin/dns), make sure
**MagicDNS** is on, and turn on **HTTPS Certificates**. Your dashboard then gets a real HTTPS
address like `https://hangar.tail1234.ts.net`.

You can skip this and do it later. Hangar then answers at `http://hangar.tail1234.ts.net`, which
is still encrypted by Tailscale.

## 3. Run the installer

On the Hangar computer, open a terminal (or connect with `ssh you@computer`) and run:

```sh
curl -fsSL https://github.com/bduffaut/Hangar/releases/latest/download/install.sh | sudo bash
```

It checks the computer, installs Docker and Tailscale, and starts Hangar. Along the way it
**prints a link to sign the computer in to Tailscale**: open it on your phone or laptop, sign in
with the same account as in step 1, and approve the computer. The installer carries on by itself.

At the end it prints:

- your **Control Tower** address, such as `https://hangar.tail1234.ts.net`, and a QR code for your
  phone
- a one-time **setup code** (the boarding pass)

> Prefer to check what you run first? Download the script, read it, then run it:
> `curl -fsSLO https://github.com/bduffaut/Hangar/releases/latest/download/install.sh && less install.sh && sudo bash install.sh`.
> It downloads Hangar from the [GitHub release](https://github.com/bduffaut/Hangar/releases) and
> checks its checksum before running anything.

## 4. Open your dashboard

On your phone or laptop, with Tailscale on, open the Control Tower address. Enter the setup code,
choose a username and password, and the Preflight Checklist walks you through the rest:

1. Confirm the address
2. Connect GitHub (see [Connect GitHub](github.md))
3. Take a test flight: a sample site deploys so you see it work

## 5. Publish your first app

Press **Publish**, pick a repository, and Hangar builds and starts it. It answers right away on
your Tailscale network. To put it on the internet at your own domain, follow
[Put your apps on the internet](go-public.md).

## Next

- [How Hangar works](how-it-works.md)
- [Share Hangar with family or a team](sharing.md)
- [Updating, backups, and removing Hangar](updating.md)
- Something wrong? Run `sudo hangar-doctor` on the computer, and see
  [Troubleshooting](troubleshooting.md).

## Without Tailscale

If you only want Hangar on your home network, install with `HANGAR_TAILSCALE=0`:

```sh
curl -fsSL https://github.com/bduffaut/Hangar/releases/latest/download/install.sh | sudo HANGAR_TAILSCALE=0 bash
```

The Control Tower then answers at `http://tower.<ip>.sslip.io` to every device on your network.
You can add Tailscale later with `sudo hangar-tailscale`.
