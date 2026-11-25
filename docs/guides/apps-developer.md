# Developer tools

**Forgejo** is your own Git server: repositories with a web page for code, issues, pull requests,
and releases, like a private GitHub. Every account can install it.

## 1. Install it

Open **Apps**, pick **Forgejo**, and press **Install Forgejo**.

## 2. Set it up

Open the app's address on a device with Tailscale. The first page is Forgejo's setup, filled in
already:

1. Under **Server and third-party service settings**, set **Server domain** and **Forgejo base
   URL** to the app's address, so clone links point at it.
2. At the bottom, under **Administrator account settings**, create your account. Do it now: until
   then, whoever opens the page first can.
3. Press **Install Forgejo**.

## 3. Use it

- **Create a repository**, then clone it over HTTP with the address Forgejo shows. Sign in with
  your Forgejo account, or an access token from **Settings → Applications**.
- **Mirror a GitHub repository** with **New migration**, to keep a copy at home that updates by
  itself.

Cloning over SSH is off: Hangar does not publish Forgejo's SSH port. Everything is kept in the
app's `data` storage.

Your own projects in Hangar still deploy from GitHub; Forgejo is for code you keep at home.
