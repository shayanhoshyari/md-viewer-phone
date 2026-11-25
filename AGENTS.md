# Phone page development notes

The phone page for one notes file, `now.md`, and reading a private GitHub repo: plain HTML and
JS served by a Cloudflare Worker that also does the GitHub sign-in. An npm project, mirrored to
the public repo `shayanhoshyari/md-viewer-phone`.

## Boundaries

- `DESIGN.md`: the spec, and the source of truth. Its Files section maps the code.
- `SETUP.md`: standing up a deployment, secrets, local dev.
- `DEPLOYMENT.md`: a deployment's record of what exists in Cloudflare and GitHub, if kept.
- `CHANGELOG.md`: releases.
- `docs/web-security.md`: general knowledge on XSS, sanitizers and CSP. Not a spec, and not
  updated with the page.
- `wrangler.toml`, `github-app.json`: the Worker and the GitHub App, the source of truth for
  both. `public/config.json`: the page's settings.
- `template/`: the public repo's versions of the files of the same names.
- `Makefile`: every command, with comments on what the less obvious ones do.
- Plans live in the source repo, next to this folder; there is no `plans/` here.

## Guidelines

### Making a change

- Change `DESIGN.md` first, then the code and its tests.
- A user-visible change gets a `CHANGELOG.md` entry and a version bump in `package.json`.
- Run `make lint test` before handing off. Tests stay offline: no GitHub or Cloudflare calls.
- `make serve` tries it at `http://localhost:8787`. It signs in for real and talks to the real
  repo: a Commit there writes the real `now.md`.
- A change to Cloudflare or GitHub goes in `wrangler.toml` or `github-app.json` first, then is
  applied with Wrangler or `gh`, or else through the web form with the Chrome extension.
  Update `DEPLOYMENT.md` with it.
- To change an icon where `public/icons/` has a `files.toml`, replace the file and run
  `google-mcp files push public/icons` (drive-files skill).

### Ask the owner first

- `make deploy` and `make publish`.
- Every Create, Save or Submit click in a GitHub or Cloudflare web form.
- Anything that widens what the page can do: only `now.md` is editable, markdown's HTML goes
  through DOMPurify's allowlist (DESIGN's Security), and every script is served from the Worker.
- A toolchain problem: stop and raise it rather than working around it. The one exception is a
  missing `mise`, installed with `curl https://mise.run | sh`.

### Tools

- Run everything through `make`, which uses `mise exec`; never a global Node or npm.
- npm runs no package install scripts unless `allowScripts` in `package.json` lists them;
  approve one only when a tool needs it, as Wrangler needs esbuild and workerd.

### Secrets

- Never in the repo, `.dev.vars` aside (gitignored), and never read or printed. SETUP.md →
  Secrets has where each one lives.

### What goes public

- `make publish` mirrors this folder, leaving out `scripts/`, `DEPLOYMENT.md` and `template/`
  and writing each file in `template/` over its namesake (`DEPLOYMENT.md` → Publishing).
- Everything that goes up stays safe to publish: no personal names, repos, IDs, URLs or paths,
  including in tests and the changelog. The repo's, the App's and the Worker's names live only
  in the files `template/` replaces.
- Never edit the public repo directly.

### Keeping this file

- One rule per bullet, in one place. A new rule goes under the heading it belongs to.
- What a file already says about itself (the `Makefile`, DESIGN's Files) is pointed
  to, not repeated here.
