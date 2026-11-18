# Share Hangar with family or a team

One Hangar can be shared. Each person has their own account and sees only their own apps, logs,
and settings; admins manage accounts but cannot see other people's apps either.

## 1. Give them access to the computer

The Control Tower answers only on your Tailscale network, so the person needs to reach your
Hangar computer:

- **Same household, one Tailscale account?** Nothing to do: they sign in to Tailscale with it.
- **Their own Tailscale account?** In the Tailscale admin console, open **Machines**, choose your
  Hangar computer, and **Share** it with them
  ([how sharing works](https://tailscale.com/kb/1084/sharing)). They see only that one computer.

## 2. Invite them

In the dashboard, open **People → Create invite link**. Send them the link; it works once, for 7 days.
They choose a username and password, or continue with GitHub.

## Good to know

- Everyone's apps run on the same computer, so invite people you trust. See
  [Security](security.md).
- Forgotten password? An admin can create a reset link under **People**, or on the computer:
  `sudo hangar-admin reset-password <username>`.
- People can delete their own accounts under **Account**.
