# Phone page development notes

The phone page for one notes file, `now.md`, and reading a private GitHub repo: plain HTML and
JS served by a Cloudflare Worker that also does the GitHub sign-in.

- `docs/web-security.md`: a general knowledge doc on XSS, sanitizers and CSP, not tied to this
  page. Not a spec, and not updated with it.
- `DESIGN.md` is the source of truth: change it first, then the code. A deployment's record of
  what exists in Cloudflare and GitHub, if kept, is `DEPLOYMENT.md`; update it with every
  change there.
- This folder is mirrored to the public repo `shayanhoshyari/md-viewer-phone` by
  `make publish`, which leaves out `scripts/`, `DEPLOYMENT.md` and `template/`, and writes each
  file in `template/` over its namesake (`DEPLOYMENT.md` → Publishing). Its source of truth is
  elsewhere: don't edit the public repo directly. Keep everything that goes up safe to publish:
  no personal names, repos, IDs, URLs or paths, including in tests and the changelog. The
  repo's, the App's and the Worker's names live only in the files `template/` replaces.
- Tools: Node comes from mise, pinned in `mise.toml`, and packages from npm, pinned in
  `package.json` and locked. Run everything through `make`, which uses `mise exec`; never a
  global Node or npm. If `mise` is missing, install it with `curl https://mise.run | sh`. If
  anything else goes wrong with the toolchain, stop and raise it with the owner rather than
  working around it.
- npm runs no package install scripts unless `allowScripts` in `package.json` lists them;
  approve one only when a tool needs it, as Wrangler needs esbuild and workerd.
- `public/icons/`: where it has a `files.toml`, a binary folder, its PNGs on Drive, pulled by
  `make assets` (part of `dev`, `serve` and `deploy`); to change an icon, replace the file and
  run `google-mcp files push public/icons` (drive-files skill). Elsewhere, plain files.
- `make dev` after dependency changes; `make lint test` before handing off. Tests are offline:
  no GitHub or Cloudflare calls.
- `make serve` runs the page and Worker at `http://localhost:8787` with real sign-in, to try a
  change before `make deploy` (DESIGN's Setup → Local dev). It talks to the real repo: a Commit
  there writes the real `now.md`.
- The repo is the source of truth for Cloudflare and GitHub: the Worker in `wrangler.toml`, the
  GitHub App in `github-app.json`. Change the file first, then apply it with Wrangler or `gh`,
  or else through the GitHub or Cloudflare web form with the Chrome extension. Check with
  the owner before every Create, Save or Submit click in the browser, and before `make deploy`
  or `make publish`.
- Secrets: see DESIGN's Setup → Secrets. Never put them in the repo, `.dev.vars` aside
  (gitignored), and never print them.
- Don't widen what the page can do without being asked: only `now.md` is editable, markdown's
  HTML goes through DOMPurify's allowlist (DESIGN's Security), and every script is served from
  the Worker.
- Each user-visible change goes in `CHANGELOG.md` with a version bump in `package.json`.
- New work starts as a plan in the source repo, next to this folder; there is no `plans/` here.
