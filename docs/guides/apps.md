# Install apps like Jellyfin

Besides your own code, Hangar runs ready-made apps: software someone else publishes as a Docker
image. The first one in the catalog is **Jellyfin**, a media server that streams your movies
and shows to your phone, TV, and laptop, like your own Netflix. More are on the
[roadmap](https://github.com/bduffaut/Hangar/blob/main/docs/ROADMAP.md).

Apps are private by default: only your devices with Tailscale can reach them.

> Installing apps needs an admin account. Apps can read folders on the computer and use its
> hardware, so Hangar keeps that to admins.

## 1. Put your files in a folder

Copy your videos to a folder on the Hangar computer, for example `/srv/media/movies`:

```sh
sudo mkdir -p /srv/media/movies
```

Then copy files in over the network, from a USB drive, or with `scp` from your laptop:

```sh
scp -r ~/Movies/* you@computer:/srv/media/movies/
```

An external drive works too. It usually appears under `/media/<you>/<drive name>` or `/mnt`.

## 2. Install Jellyfin

1. In the dashboard, open **Apps** and pick **Jellyfin**.
2. Under **Movies and shows**, add your folder as a **library**: give it a name (Movies) and its
   path (`/srv/media/movies`). Hangar checks that the folder exists.
3. If the computer has a graphics chip, leave **Graphics chip** on. Video then plays smoothly on
   phones and TVs.
4. Press **Install Jellyfin**.

Hangar downloads Jellyfin (about a minute the first time) and starts it. The app's page shows its
address and the first steps.

## 3. Set Jellyfin up

Open the address on any device with Tailscale and follow Jellyfin's own setup:

1. Pick a language and create your Jellyfin account.
2. Add a media library: choose **Movies** (or **Shows**) and the folder **`/media`**. That is where
   Hangar puts your library inside the app.
3. Install the Jellyfin app on your phone or TV, and sign in with the same address.

## What Hangar keeps for you

- **Kept folders.** Jellyfin's settings, accounts, and watch history live in storage that
  survives restarts, updates, and Hangar's own updates. Each app's **Settings → Storage** lists
  them, with their size.
- **Libraries are read-only** unless you allow writing in **Settings → Storage**. Jellyfin only
  needs to read your videos.
- **Updates are yours to start.** An app's version is pinned (Jellyfin `12.4`). To upgrade, change
  the version under the app's **Settings**, then press **Update**. Hangar stops the running
  version first, so two copies never write to the same storage. If the new one does not start, it
  starts the previous one again.
- **Deleting an app keeps its data** unless you tick the box to delete it too. Install it again
  with the same name and it picks the data back up. Data left by deleted apps is listed under
  **Settings → Storage**.

## Any other app

**Apps → Any image** runs any published Docker image, such as `ghcr.io/owner/app:1.2`:

1. Enter the image, with a version.
2. Under **Customize**, add a **kept folder** for each folder the image's documentation calls a
   volume (often `/config` or `/data`). Without one, the app starts fresh after every update.
3. Set the **web port** if the image listens on more than one.

## On the internet

An app can also get a public address, like any project: turn on **Also put it on the internet**
when installing, or add an address under the app's **Settings → Public addresses**. See
[Put your apps on the internet](go-public.md). For a media server, staying private is usually
best: Tailscale already reaches it from anywhere.
