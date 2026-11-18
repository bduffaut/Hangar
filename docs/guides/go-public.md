# Put your apps on the internet

Every app answers on your Tailscale network as soon as it is deployed. To let anyone visit it at
your own domain, like `blog.example.com`, connect a **Cloudflare Tunnel**. It is free, needs no
router changes, and keeps your home IP address private.

Only the apps you give a public address are public. The Control Tower never is.

## What you need

- A domain, added to a free Cloudflare account (Cloudflare manages its DNS). Any registrar works;
  Cloudflare's [guide](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/)
  shows how to move DNS over.

## 1. Create the tunnel

1. In the Cloudflare dashboard, open **Zero Trust → Networks → Tunnels** and press **Create a
   tunnel**. Choose **Cloudflared**, and name it `hangar`.
2. On the next page, Cloudflare shows install commands. **Do not run them.** Copy only the long
   token that follows `--token`.
3. In Hangar, open **Settings → Public access**, paste the token, and save. Hangar runs the
   tunnel for you.

## 2. Send your domain through the tunnel

Back in Cloudflare, on the tunnel's **Public Hostname** tab, add one hostname for your domain:

| Field     | Value                        |
| --------- | ---------------------------- |
| Subdomain | `*`                          |
| Domain    | your domain                  |
| Service   | `HTTP` · `hangar-proxy:8081` |

The `*` sends every name under the domain to Hangar, which then routes each one to the right app.
If you also want an app on the bare domain (`example.com`), add a second hostname with an empty
subdomain and the same service.

## 3. Tell Hangar about the domain

In **Settings → Public access**, add the domain and press **Check**. Hangar asks the internet
for a test address and confirms it reaches your computer.

## 4. Give an app an address

Open the app, then **Settings → Public addresses**. New apps get `<name>.<your domain>` by
default; you can choose any name under your domains, or the domain itself. The app's page shows
whether each address really answers from the internet.

## Instant deploys from GitHub

With a domain set up, GitHub can tell Hangar about pushes straight away instead of Hangar
checking every minute. Open the app’s **Settings**, choose **GitHub webhook**, and follow the steps
shown. Only signed GitHub requests are accepted.
