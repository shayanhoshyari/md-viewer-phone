# Changelog

## 0.9.0 - 2026-11-23

- Now: each box grows to fit its text, in the system font rather than monospace. Focusing a
  box fills the screen above the keyboard with it, keeping Commit below; **Done** goes back.
  There, **Preview** renders the box's markdown, and tapping a task's checkbox ticks it in the
  text.
- Now: the links under a box are one per line, and say where they go: the page's own links
  show the repo path they open (with ` § heading` for one), others their host, path and hash.
- The top bar has **‹ › ↻**: back, forward and reload, for the home-screen app, which has no
  browser buttons; the reload also picks up a new deploy.
- Buttons and links show a pressed look on the phone.

## 0.8.0 - 2026-11-21

- Settings: the repo, the GitHub App's client ID and the `now.md` path come from the Worker's
  `[vars]` (`REPO`, `GITHUB_CLIENT_ID`, `NOW_FILE`), served as `/config.json`; nothing about
  them is in the page's code. Missing a required one, the page says what to set.
- Without a `NOW_FILE`, only the Repo tab shows. With one, Life is the folder holding it, opens
  on its `todo.md` or, without one, on the folder, and its first breadcrumb is the folder's name.
- Commit's message is `<folder>: <file> from the phone`.
- Published as `md-viewer-phone`, with a README and an MIT license.

## 0.7.0 - 2026-11-21

- Life and Repo: H2–H6 headings are numbered (`1.`, `1.1.`) as in md-viewer, and a file with
  two or more H2/H3 headings gets a collapsed **Contents** list after its title.

## 0.6.0 - 2026-11-21

- Now: the divider lines around `now.md`'s section headings no longer show in the boxes, and
  Commit always writes them back above and below each heading.

## 0.5.0 - 2026-11-21

- Now: three boxes, **Todo inbox**, **Other inbox** and Mind, matching `now.md`'s renamed
  `## Todo inbox` and new `## Other inbox`. Other inbox takes notes for other areas, each under
  its own `### Heading`.

## 0.4.0 - 2026-11-15

- Now: a **Not committed** mark and a **Discard** button show while the boxes differ from
  GitHub; Discard takes two taps.
- Now: Inbox comes first, then Mind, each with a one-line hint; `now.md` is written in that order.

## 0.3.0 - 2026-11-15

- Now: the web links in Mind and Inbox show as tappable links under each box; a link to the
  page itself opens in place.

## 0.2.0 - 2026-11-15

- Life opens on `todo.md`; its folder listing hides `_` and `.` names, `AGENTS.md` and
  `CLAUDE.md`.
- A folder shows only its `README.md` above the listing, never `AGENTS.md`.
- Markdown renders sanitized raw HTML (DOMPurify), so `<details>` toggles and `<br>` work, and
  `[ ]` / `[x]` list items show as read-only checkboxes.

## 0.1.1 - 2026-11-15

- Sign-in sends the page's own address as `redirect_uri`, so it also works at
  `http://localhost:8787` under `make serve`, the new local dev target.

## 0.1.0 - 2026-11-15

- The Worker's `/api/token`: the GitHub sign-in and renewal exchange.
- The page: Now (Mind and Inbox boxes, sync on open, Commit with merge on conflict), and
  read-only Life and Repo views with markdown, sortable tables and repo images.
- Home-screen icon and web app manifest.

## 0.0.0 - 2026-11-14

- Scaffold: design, dev notes and tooling. Nothing deployed yet.
