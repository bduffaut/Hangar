# Install apps like Jellyfin

Besides your own code, Hangar runs ready-made apps: software someone else publishes as a Docker
image. Open **Apps** in the dashboard to pick one:

| App                | What it does                                              | Who can install it |
| ------------------ | --------------------------------------------------------- | ------------------ |
| **Immich**         | Backs up your phone's photos, like your own Google Photos | Everyone           |
| **Jellyfin**       | Movies and shows on any device, like your own Netflix     | Admins             |
| **Navidrome**      | Your music collection, like your own Spotify              | Admins             |
| **Audiobookshelf** | Audiobooks and podcasts, with progress kept               | Admins             |
| **Uptime Kuma**    | Watches your sites and tells you when one is down         | Everyone           |
| **Mealie**         | Recipes, meal plans, and shopping lists                   | Everyone           |
| **Paperless-ngx**  | Your paper documents, scanned, read, and searchable       | Everyone           |
| **File Browser**   | Upload, download, and share files from a browser          | Everyone           |

More are on the [roadmap](https://github.com/bduffaut/Hangar/blob/main/docs/ROADMAP.md).

Apps are private by default: only your devices with Tailscale can reach them.

> **Who can install what.** Apps that read a folder on the computer (your movies, music, or
> books) or use its graphics chip need an admin. The others are open to every account. Hangar
> installs them exactly as the catalog describes, whatever the form sends.

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

## New versions

When a newer version of an app's image is out, its page says so, for example "Version v3.5.0 is
out. This app runs v3.4.2." Press **Update to v3.5.0** to switch: Hangar downloads it, keeps the
app's storage, and keeps the current version running if the new one does not start. Hangar checks
at most twice a day, and only offers versions in the same style as the one you run (so never
`latest` or a test release). Some apps change their data when they update and cannot go back to
an older version afterwards; read the app's release notes before a big jump.

## The other apps

Each app's page shows its first steps once it is running. In short:

- **Immich** runs as four parts: the app, its database, a cache, and machine learning for faces
  and search. Hangar starts, updates, and stops them together, makes the database password for
  you, and keeps the database where only Immich can reach it. The first install downloads several
  gigabytes, so it can take a while. Open it, create the admin account, then install the Immich
  phone app, sign in with the app's address, and turn on backup. Photos are kept in the app's
  storage (`library`), and the database in the storage of its `database` part; both survive
  updates. Together the parts may use up to about 6 GB of memory.
  For any app made of several parts, the app's **Radio** tab lists them with how each is doing;
  pick one to see its live output, for example when the database will not start.
- **Paperless-ngx** runs as three parts: the app, its database, and a queue for reading documents.
  Open it and create your account (the first one has full access), then drag documents onto the
  page or scan them with a Paperless phone app. Documents are kept in the app's storage (`media`).
  When you give it a public address, Hangar tells Paperless about it and restarts it, so you can
  sign in from there too.

- **Navidrome** and **Audiobookshelf** work like Jellyfin: add your music or audiobooks folder as
  a library, install, then create the admin account. Navidrome works with any Subsonic app on
  your phone; Audiobookshelf has its own app.
- **Uptime Kuma**: choose SQLite when it asks for a database, create your account, then add a
  monitor for each site.
- **Mealie** starts with the account `changeme@example.com` and the password `MyPassword`. Sign in
  straight away and change both.
- **File Browser** makes a random password for its `admin` account. Find it in the app's
  **Logs** in Hangar, sign in, and change it.

> **Set an app up right after installing it.** Most apps make whoever opens them first their
> admin. That is why Hangar does not offer a public address while installing those apps: finish
> the setup on your own devices first, then add an address under the app's **Settings**.

Anyone with an account can change the version of an app they installed (under **Settings**, then
**Update**); only an admin can point an app at a different image.

## Any other app

**Apps → Any image** (admins only) runs any published Docker image, such as
`ghcr.io/owner/app:1.2`:

1. Enter the image, with a version.
2. Under **Customize**, add a **kept folder** for each folder the image's documentation calls a
   volume (often `/config` or `/data`). Without one, the app starts fresh after every update.
3. Set the **web port** if the image listens on more than one.

## On the internet

An app can also get a public address, like any project: turn on **Also put it on the internet**
when installing, or add an address under the app's **Settings → Public addresses**. See
[Put your apps on the internet](go-public.md). For a media server, staying private is usually
best: Tailscale already reaches it from anywhere.
