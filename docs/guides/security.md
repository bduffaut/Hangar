# Security

## What protects your Hangar

- **The Control Tower is never on the internet.** It answers only on your Tailscale network, and
  Hangar refuses dashboard requests that arrive through the public tunnel, whatever their
  address.
- **Accounts** use argon2id password hashes, sessions stored as hashes, CSRF tokens, and limits on
  failed sign-ins. New accounts need an invite.
- **Secrets** (environment variables, tokens) are encrypted at rest.
- **Separation between accounts:** each person's apps and builds run on their own Docker network,
  and nobody sees another account's apps, admins included.
- **Apps cannot reach** Hangar's database or the proxy's settings.

## What it does not protect against

- **Everyone with an account runs code on the computer.** Apps and builds share the computer's
  kernel; a Docker or Linux escape would reach everything. Invite only people you trust.
- **Apps are on your home network.** A published app with a security hole sits inside your house.
  If you can, put the Hangar computer on its own network (a guest network or VLAN).
- **Anyone on your Tailscale network can reach the sign-in page.** Use strong passwords, and share
  the computer only with people you would give an account.

The full model and its known limits are in
[SECURITY.md](https://github.com/bduffaut/Hangar/blob/main/SECURITY.md). Found a problem? Report it
privately through
[GitHub](https://github.com/bduffaut/Hangar/security/advisories/new).
