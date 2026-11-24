# Troubleshooting

Start with the doctor. On the Hangar computer:

```sh
sudo hangar-doctor
```

It checks every piece and says, in plain words, what to fix.

## The Control Tower does not open

- **Is Tailscale on**, on the device you are using, and signed in to the same account as the
  Hangar computer? Open the Tailscale app and check that the Hangar computer is listed.
- **Is the computer on and online?** In the Tailscale app it shows as connected.
- **Right address?** Run `sudo hangar-doctor` on the computer; it prints it.
- **Renamed the computer in Tailscale?** Run `sudo hangar-tailscale` so Hangar learns its new
  address.

## The installer stopped at the Tailscale sign-in

The link is valid for a few minutes. Run the installer again, or just `sudo hangar-tailscale`, to
get a new one. On a computer without a screen, open the link on your phone.

## "Port 80 is already in use"

Another program (often a web server like Apache or nginx) listens on port 80 on the Tailscale
address. Stop it, or move it to another port, then run the installer again.

## A deploy failed

Open the deployment: the **Flight Recorder** shows the build log, and the failure explains what
went wrong and how to fix it. Common causes:

- **Build failed:** the same command fails on your own computer too. Run the build there first.
- **Health check failed:** the app started but did not answer. Make sure it listens on
  `0.0.0.0` (not `localhost`) and on the port shown in the app's Settings, or set the port there.
  If the log says the image's own health check did not pass, the app answers but reports itself
  not ready: the `HEALTHCHECK` in its Dockerfile (or the image's) keeps failing. Its last output is
  in the log.

The version that was running keeps running.

## A public address does not work

On the app's page, each address shows what a real request from the internet found, with a fix.
Check that the Cloudflare tunnel has the `*` hostname pointing at `http://hangar-proxy:8081`
([guide](go-public.md)).

## Logs

```sh
sudo docker logs hangar-core --tail 100   # Hangar itself
sudo docker logs hangar-proxy --tail 100  # routing
sudo docker logs hangar-tunnel --tail 100 # Cloudflare tunnel
```

## Still stuck?

[Open an issue](https://github.com/bduffaut/Hangar/issues/new/choose) with what you did, what
happened, and the output of `sudo hangar-doctor`.
