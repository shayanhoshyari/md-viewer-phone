# md-viewer-phone

> [!NOTE]
> This is a personal project, shaped around the author's own use, and shared to show the idea. The Now tab's three sections are fixed; for anything else, fork it and have your coding agent change it ([DESIGN.md](DESIGN.md) is the spec). Only `now.md` is editable.

A phone companion to [md-viewer](https://github.com/shayanhoshyari/md-viewer): a home-screen page for reading a private GitHub repo and writing one notes file, `now.md`, from an iPhone. It is plain HTML and JS served by a Cloudflare Worker on the free plan. You sign in with GitHub, and the page then talks to GitHub directly with your own token; the Worker only swaps the sign-in code for a token and keeps nothing.

It exists because jotting a thought down on the phone should not need a git client, and the notes it lands in are the same markdown files an agent works from on the laptop.

| Now | Life | Repo |
|:---:|:---:|:---:|
| <img width="240" alt="The Now tab: three boxes of notes and Commit" src="https://github.com/user-attachments/assets/0c0d5fca-dcaf-4442-a41b-0e120239b901" /> | <img width="240" alt="The Life tab: a todo table rendered with numbered headings" src="https://github.com/user-attachments/assets/b6dc387a-c563-4e65-8637-bb2ed6468223" /> | <img width="240" alt="The Repo tab: the repo's README, then its folders and files" src="https://github.com/user-attachments/assets/1fa4dc61-f5e2-408a-97fb-d9fd7efbd1e1" /> |

- **Now**: `now.md` as three boxes, Todo inbox, Other inbox and Mind, with Commit. Edits are kept on the phone until committed, and if the file changed on GitHub meanwhile, they are merged section by section.
- **Life**: the folder holding `now.md`, read-only, opening on its `todo.md`.
- **Repo**: the whole repo, read-only. Markdown renders as in md-viewer: numbered headings, a contents list, sortable tables, `<details>` toggles and checkboxes.

## On the Home Screen

Added to the iPhone's Home Screen, it opens like an app: its own icon, full screen, without Safari's address bar. In Safari, tap Share → Add to Home Screen, keep **Open as Web App** on, and tap Add. You sign in once, there.

| 1. Share → Add to Home Screen | 2. Keep Open as Web App on, Add | 3. The icon on the Home Screen |
|:---:|:---:|:---:|
| <img width="240" alt="Safari's Share sheet, with Add to Home Screen marked" src="https://github.com/user-attachments/assets/3c7a05dd-95b9-40ae-8920-63b45044b3dc" /> | <img width="240" alt="Add to Home Screen, with Open as Web App on and Add marked" src="https://github.com/user-attachments/assets/9c8fde67-aa94-4aff-a65e-6d7af8e5250c" /> | <img width="240" alt="The Life icon on the Home Screen" src="https://github.com/user-attachments/assets/e2af8557-68ee-4fa7-b956-f21d1f610db0" /> |

## The `now.md` file

A header, kept as it is, then three sections, each heading between divider lines that the page writes back on every commit. A missing section reads as empty.

```markdown
# Now

<!---------------------------->
## Todo inbox
<!---------------------------->

- things to file into the todo later

<!---------------------------->
## Other inbox
<!---------------------------->

### Garden

notes for other areas, a `###` heading each

<!---------------------------->
## Mind
<!---------------------------->

free notes
```

## Setup

Needs a Cloudflare account, a GitHub account and [mise](https://mise.jdx.dev), which brings Node.

1. In `wrangler.toml`, set the Worker's `name` and, under `[vars]`, `REPO` (`owner/name`) and `NOW_FILE` (such as `notes/now.md`). With no `NOW_FILE`, only the Repo tab shows.
2. Create your own GitHub App from `github-app.json`, with your Worker's URL in it, and install it on the repo. Put its client ID in `wrangler.toml` as `GITHUB_CLIENT_ID`.
3. Generate a client secret in the App and store it with `mise exec -- npx wrangler secret put GITHUB_CLIENT_SECRET`.
4. `make dev`, then `make deploy`. Open the Worker's URL in Safari and add it to the Home Screen, [as above](#on-the-home-screen).

The full steps, local dev with `make serve`, and revoking a lost phone are in [DESIGN.md](DESIGN.md#setup).

## More

- [DESIGN.md](DESIGN.md): the full spec: settings, sign-in, sync and merge, security, setup.
- [CHANGELOG.md](CHANGELOG.md): releases.
- [AGENTS.md](AGENTS.md): development notes (`make dev lint test`).
