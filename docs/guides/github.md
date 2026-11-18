# Connect GitHub

Hangar needs to read your repositories to build them. There are two ways to connect, and both
give Hangar **read-only** access to the repositories you choose.

## Sign in with GitHub (easiest)

An admin sets this up once, in **People → Sign in with GitHub → Set up on GitHub**. GitHub asks you
to confirm a new GitHub App that belongs to you, then sends you back. After that:

- Everyone connects with one click under **Account → Connect with GitHub**.
- Each person picks which repositories Hangar may see, with **Choose repositories**.
- The sign-in page offers **Sign in with GitHub**, for accounts that already exist.

The app asks GitHub for read access to code and metadata, and permission to add webhooks.

## A personal access token

If you prefer not to create a GitHub App, paste a token under **Account → Use a token instead**:

1. On GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained
   tokens**, and press **Generate new token**.
2. Choose the repositories Hangar should see.
3. Under **Repository permissions**, set **Contents** to _Read-only_ (Metadata is added
   automatically). Add **Webhooks: Read and write** if you want instant deploys.
4. Generate it, copy it, and paste it into Hangar.

Tokens are encrypted on your Hangar computer and never shown again.

## Public repositories

Public repositories deploy without any GitHub connection: paste the repository's address when you
create a project.
