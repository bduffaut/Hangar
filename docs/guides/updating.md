# Updating, backups, and removing Hangar

## Update

On the Hangar computer:

```sh
sudo hangar-update
```

It saves a backup of the database first, downloads the new version, and restarts Hangar. Your
apps keep running while it does. To move to a specific release:
`sudo HANGAR_VERSION=0.3.0 hangar-update`. Releases are listed on
[GitHub](https://github.com/bduffaut/Hangar/releases).

## Backups

Hangar keeps a database backup from before each update and reinstall in `/opt/hangar/backups`.
To make one any time:

```sh
sudo docker exec hangar-db pg_dump -U hangar hangar | gzip > hangar-backup.sql.gz
```

Keep a copy of `/opt/hangar/.env` with it, somewhere safe: it holds the key that decrypts your
environment variables and tokens. A backup without it cannot be read.

Your apps' own data (uploads, databases inside apps) lives in their containers. Store anything
important in a proper database or outside service, as you would on any hosting platform.

## Check everything

```sh
sudo hangar-doctor
```

It checks Docker, Hangar's containers, Tailscale, the HTTPS address, the tunnel, and disk space,
and says what to do about anything wrong. It changes nothing.

## Remove Hangar

```sh
sudo hangar-uninstall
```

It stops Hangar and the apps it deployed, and asks separately before deleting the database, the
built images, and `/opt/hangar`. Containers Hangar did not create are not touched. Tailscale stays
installed, since other things may use it: remove it with `sudo apt-get remove tailscale`.
