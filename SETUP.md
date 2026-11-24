# Phone page — Setup

Each deployment is its own: your Cloudflare account, your GitHub App, your repo. A source repo
may keep a record of what it set up, as this one's `DEPLOYMENT.md`.

## Secrets

| Secret | Live | Local dev |
|---|---|---|
| `GITHUB_CLIENT_SECRET` | `wrangler secret put GITHUB_CLIENT_SECRET` | a line in `.dev.vars`, gitignored |

The Worker reads it as `env.GITHUB_CLIENT_SECRET`, like the plain values in `[vars]`. Keep it in
a password manager: GitHub shows it once. It never goes in the repo. The App's client ID is
public.

## Steps

1. **Cloudflare**: sign up at dash.cloudflare.com, no card. Workers & Pages → pick the
   `workers.dev` subdomain. Then `mise exec -- npx wrangler login`, once on the laptop. Set the
   Worker's `name` in `wrangler.toml`, and put its URL,
   `https://<name>.<subdomain>.workers.dev/`, in `github-app.json`.
2. **GitHub App**: create it from `github-app.json` with GitHub's manifest flow. A form posts
   the manifest to `github.com/settings/apps/new`; one click on Create, then GitHub redirects
   to the Worker with a `code`. The App exists only once the code is converted, within the
   hour: `gh api -X POST /app-manifests/<code>/conversions --jq '{id, slug, client_id}'`,
   which prints only those and drops the secrets in the response. (Or fill in the same
   settings by hand at Settings → Developer settings → GitHub Apps → New.) Put the client ID
   in `wrangler.toml` as `GITHUB_CLIENT_ID`. Install the App from
   `github.com/apps/<name>/installations/new` → Only select repositories → your repo.
3. **Settings**: `REPO` and, for the Now and Life tabs, `NOW_FILE` in `wrangler.toml`. The
   file's format is in [DESIGN.md](DESIGN.md#now); it can start empty.
4. **Secret**: in the App's Credentials, generate a new client secret, then, in this folder,
   `mise exec -- npx wrangler secret put GITHUB_CLIENT_SECRET` and paste it. If the Worker
   doesn't exist yet, answer yes to creating it. To replace the secret later, do the same
   again.
5. `make dev`, then `make deploy`.
6. **Other users**: add them as collaborators on the repo, with write access for Commit.
7. **Each iPhone**: open the Worker's URL in Safari, Share → Add to Home Screen, open it from
   the icon, Sign in with GitHub, approve the App.

The GitHub App's settings, from `github-app.json` except the last:

| Setting | Value | Why |
|---|---|---|
| Public | yes | other users can sign in with it; they still see only repos they can reach, where it is installed |
| Permissions | Contents read and write | Metadata read comes with it; nothing else |
| Callback URLs | the Worker's URL, and `http://localhost:8787/` | sign-in live and in [Local dev](#local-dev) |
| Webhook | off | |
| OAuth request during installation | off | |
| User-to-server token expiry | on | GitHub's default; under Optional features, not in the manifest |

## Local dev

`make serve` runs `wrangler dev`: the page and the Worker at `http://localhost:8787`, with the
code from the working tree.

| | On localhost |
|---|---|
| Secret | from `.dev.vars`, one line `GITHUB_CLIENT_SECRET=...`: the same App and secret as live, so nothing extra to keep in sync. Agents don't read or print it |
| Settings | from `wrangler.toml`; a line in `.dev.vars` such as `NOW_FILE=` overrides one |
| Sign-in | a real login, with the same access as on the phone; its tokens live in the laptop browser's `localStorage` for `localhost:8787` |
| Commit | writes the real `NOW_FILE` on GitHub |

## Revoke a lost phone's login

The owner of the lost phone opens GitHub → Settings → Applications → Authorized GitHub Apps →
the App → Revoke. That ends every login of theirs to the App, so they sign in again on their
other phones. The lost phone's tokens, refresh token included, stop working, and signing in
again there needs their GitHub password. To shut out everyone at once, suspend or delete the App
in its settings.
