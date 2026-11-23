// The phone page: tabs, Now's sync and Commit, and the read-only Life and Repo views.
// See DESIGN.md → The page.

import { config, loadConfig } from "./config.js";
import {
  BRANCH,
  contentsPath,
  decodeBase64,
  encodeBase64,
  finishSignIn,
  gh,
  load,
  repoPath,
  SignedOut,
  save,
  signedIn,
  signIn,
  signOut,
} from "./github.js";
import { render } from "./markdown.js";
import {
  empty,
  hasMarkers,
  links,
  merge,
  rebuild,
  SECTIONS,
  same,
  split,
  toggleTask,
} from "./now.js";
import { HOME, hashFor, hasNow, lifeFolder, listed, parse, tabs } from "./routes.js";

/** @typedef {import("./routes.js").Route} Route */
/** @typedef {import("./now.js").Sections} Sections */
/** @typedef {{ text: string, sha: string }} Base */
/** @typedef {{ sha: string, entries: [string, number][] }} Tree */

const IMAGE_TYPES = /** @type {Record<string, string>} */ ({
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
});

/** @param {string} path */
function baseName(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The commit message for the NOW_FILE: `<folder>: <file> from the phone`. */
function commitMessage() {
  const file = baseName(config.nowFile);
  const folder = baseName(config.folder);
  return folder ? `${folder}: ${file} from the phone` : `${file} from the phone`;
}

/** @param {string} id */
function $(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} missing`);
  return element;
}

/** The text box of each section, by key; their ids are `now-<key>`. */
const sectionBoxes = SECTIONS.map(
  ([key]) => /** @type {[keyof Sections, HTMLTextAreaElement]} */ ([key, $(`now-${key}`)]),
);
const commitButton = /** @type {HTMLButtonElement} */ ($("now-commit"));
const discardButton = /** @type {HTMLButtonElement} */ ($("now-discard"));
const content = $("view-content");

/**
 * @param {string} id
 * @param {string} text
 * @param {boolean} [error]
 */
function status(id, text, error = false) {
  const element = $(id);
  element.textContent = text;
  element.classList.toggle("error", error);
}

/** @param {unknown} error */
function message(error) {
  if (error instanceof SignedOut) return "Signed out: sign in again.";
  if (error instanceof TypeError) return "Offline? Couldn't reach GitHub.";
  return error instanceof Error ? error.message : String(error);
}

// ---- Sign-in ----

function showAuth() {
  const inside = signedIn();
  $("sign-in").hidden = inside;
  $("sign-out").hidden = !inside;
}

/** @param {unknown} error */
function handle(error, statusId = "now-status") {
  if (error instanceof SignedOut) showAuth();
  status(statusId, message(error), true);
}

$("sign-in-button").addEventListener("click", () => {
  signIn().catch((error) => {
    const element = $("sign-in-error");
    element.hidden = false;
    element.textContent = message(error);
  });
});

$("sign-out").addEventListener("click", () => {
  signOut();
  save("tree", null);
  shown = "";
  showAuth();
  route();
});

// ---- Now ----

/** @returns {Sections} */
function boxes() {
  const sections = empty();
  for (const [key, box] of sectionBoxes) sections[key] = box.value;
  return sections;
}

/**
 * The tappable links under a box, since a textarea can't hold links itself.
 * @param {HTMLTextAreaElement} box
 */
function showLinks(box) {
  const row = $(`${box.id}-links`);
  row.replaceChildren(
    ...links(box.value, location.origin, config.folder).map(({ href, label, inside }) => {
      const link = document.createElement("a");
      link.href = href;
      link.textContent = label;
      if (!inside) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      return link;
    }),
  );
  row.hidden = row.childElementCount === 0;
}

/** The boxes as last read from or committed to GitHub; empty before the first read. */
function baseSections() {
  /** @type {Base | null} */
  const base = load("base");
  return base ? split(base.text) : empty();
}

/** Show or hide the "Not committed" mark and Discard, by whether the boxes differ from base. */
function showDirty() {
  const dirty = !same(boxes(), baseSections());
  $("now-dirty").hidden = !dirty;
  discardButton.hidden = !dirty;
  if (!dirty) disarmDiscard();
}

/**
 * Make a box as tall as its text, so the page scrolls rather than the box. In focus mode the
 * stylesheet sizes it instead.
 * @param {HTMLTextAreaElement} box
 */
function grow(box) {
  if (focused || box.offsetParent === null) return;
  const y = window.scrollY;
  box.style.height = "auto";
  box.style.height = `${box.scrollHeight + 2}px`;
  window.scrollTo(window.scrollX, y);
}

function growAll() {
  for (const [, box] of sectionBoxes) grow(box);
}

/**
 * Fill the boxes, a missing section as empty (a `mine` saved before it existed).
 * @param {Partial<Sections>} sections
 */
function fillBoxes(sections) {
  for (const [key, box] of sectionBoxes) {
    box.value = sections[key] ?? "";
    showLinks(box);
    grow(box);
    refreshPreview(box);
  }
}

/** @param {Sections} sections */
function setBoxes(sections) {
  fillBoxes(sections);
  save("mine", boxes());
  showDirty();
}

/**
 * After a box's text changed, by typing or a tap in Preview.
 * @param {HTMLTextAreaElement} box
 */
function edited(box) {
  save("mine", boxes());
  showLinks(box);
  grow(box);
  showDirty();
}

for (const [, box] of sectionBoxes) {
  box.addEventListener("input", () => edited(box));
  box.addEventListener("focus", () => enterFocus(box));
}

window.addEventListener("resize", growAll);

// ---- Focus mode and Preview ----

/**
 * The box in focus mode, filling the visible screen; null when none is.
 * @type {HTMLTextAreaElement | null}
 */
let focused = null;

/** @param {HTMLTextAreaElement} box */
function wrapOf(box) {
  return $(`${box.id}-box`);
}

/** Fit Now to the visible screen, above the keyboard. */
function fitToScreen() {
  if (!focused) return;
  const view = window.visualViewport;
  const now = $("now");
  now.style.top = `${view ? view.offsetTop : 0}px`;
  now.style.height = `${view ? view.height : window.innerHeight}px`;
}

window.visualViewport?.addEventListener("resize", fitToScreen);
window.visualViewport?.addEventListener("scroll", fitToScreen);

/** @param {HTMLTextAreaElement} box */
function enterFocus(box) {
  if (focused === box) return;
  if (focused) leaveFocus();
  focused = box;
  wrapOf(box).classList.add("focused");
  document.body.classList.add("focus");
  fitToScreen();
}

/** Leave focus mode: only Done does, or leaving the Now tab; a blur doesn't. */
function leaveFocus() {
  const box = focused;
  if (!box) return;
  showPreview(box, false);
  focused = null;
  wrapOf(box).classList.remove("focused");
  document.body.classList.remove("focus");
  const now = $("now");
  now.style.top = "";
  now.style.height = "";
  box.blur();
  growAll();
  if (!$("now").hidden) wrapOf(box).scrollIntoView({ block: "start" });
}

/** @param {HTMLTextAreaElement} box */
function previewOf(box) {
  return $(`${box.id}-preview`);
}

/**
 * Show a box's markdown rendered, or its text again. Only the task checkboxes can be changed
 * in the preview: a tap flips that task in the text.
 * @param {HTMLTextAreaElement} box
 * @param {boolean} on
 */
function showPreview(box, on) {
  const preview = previewOf(box);
  preview.hidden = !on;
  box.hidden = on;
  const button = wrapOf(box).querySelector(".box-preview");
  if (button) button.textContent = on ? "Edit" : "Preview";
  if (on) {
    box.blur();
    refreshPreview(box);
  } else preview.replaceChildren();
}

/**
 * Render a box's preview, if shown.
 * @param {HTMLTextAreaElement} box
 */
function refreshPreview(box) {
  const preview = previewOf(box);
  if (preview.hidden) return;
  // Safe: render sanitizes its output with DOMPurify (DESIGN.md → Security).
  preview.innerHTML = render(box.value, config.nowFile, "life");
  preview.querySelectorAll('input[type="checkbox"]').forEach((input, i) => {
    /** @type {HTMLInputElement} */ (input).disabled = false;
    input.addEventListener("change", () => {
      box.value = toggleTask(box.value, i);
      edited(box);
      refreshPreview(box);
    });
  });
  loadImages(preview);
}

for (const [, box] of sectionBoxes) {
  const wrap = wrapOf(box);
  wrap.querySelector(".box-preview")?.addEventListener("click", () => {
    if (previewOf(box).hidden) showPreview(box, true);
    else {
      showPreview(box, false);
      box.focus();
    }
  });
  wrap.querySelector(".box-done")?.addEventListener("click", leaveFocus);
}

// Discard takes two taps: the first arms it for a few seconds, the second resets the boxes.
/** @type {ReturnType<typeof setTimeout> | undefined} */
let discardTimer;

function disarmDiscard() {
  clearTimeout(discardTimer);
  discardTimer = undefined;
  discardButton.textContent = "Discard";
}

discardButton.addEventListener("click", () => {
  if (busy) return;
  if (discardTimer === undefined) {
    discardButton.textContent = "Tap again to discard";
    discardTimer = setTimeout(disarmDiscard, 4000);
    return;
  }
  disarmDiscard();
  setBoxes(baseSections());
  status("now-status", "Discarded the changes on this phone.");
});

let busy = false;

/**
 * Run one Now task at a time, with Commit disabled meanwhile.
 * @param {() => Promise<void>} task
 */
async function exclusive(task) {
  if (busy) return;
  busy = true;
  commitButton.disabled = true;
  try {
    await task();
  } catch (error) {
    handle(error);
  } finally {
    busy = false;
    commitButton.disabled = false;
  }
}

/** @returns {Promise<Base>} */
async function fetchNow() {
  const reply = await gh(contentsPath(config.nowFile));
  if (!reply.ok) throw new Error(`Couldn't read ${config.nowFile}: GitHub said ${reply.status}.`);
  const data = await reply.json();
  return { text: decodeBase64(data.content), sha: data.sha };
}

/** Bring the boxes up to date with GitHub's NOW_FILE, merging local edits. Returns a message. */
async function sync() {
  const remote = await fetchNow();
  /** @type {Base | null} */
  const base = load("base");
  if (base && base.sha === remote.sha) return "Up to date.";
  const merged = merge(base ? split(base.text) : empty(), boxes(), split(remote.text));
  save("base", remote);
  setBoxes(merged);
  return merged.conflicts
    ? "GitHub and the phone changed the same section: fix the marked text, then Commit."
    : "Updated from GitHub.";
}

function syncNow() {
  if (!signedIn() || !hasNow()) return Promise.resolve();
  return exclusive(async () => {
    status("now-status", "Checking GitHub…");
    status("now-status", await sync());
  });
}

commitButton.addEventListener("click", () => {
  if (!signedIn()) {
    status("now-status", "Sign in first; your text is kept on this phone.", true);
    return;
  }
  exclusive(async () => {
    const mine = boxes();
    if (SECTIONS.some(([key]) => hasMarkers(mine[key]))) {
      status("now-status", "Remove the <<<<<<< ======= >>>>>>> lines first.", true);
      return;
    }
    /** @type {Base | null} */
    const base = load("base");
    if (!base) {
      status("now-status", `${await sync()} Check it, then Commit again.`);
      return;
    }
    const { header, ...committed } = split(base.text);
    if (same(mine, committed)) {
      status("now-status", "Nothing to commit.");
      return;
    }
    const text = rebuild(header, mine);
    status("now-status", "Committing…");
    const reply = await gh(contentsPath(config.nowFile), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: commitMessage(),
        content: encodeBase64(text),
        sha: base.sha,
        branch: BRANCH,
      }),
    });
    if (reply.status === 409 || reply.status === 422) {
      status("now-status", `GitHub moved on. ${await sync()} Check it, then Commit again.`);
      return;
    }
    if (!reply.ok) throw new Error(`Commit failed: GitHub said ${reply.status}.`);
    const data = await reply.json();
    save("base", { text, sha: data.content.sha });
    showDirty();
    status("now-status", "Committed.");
  });
});

// ---- Life and Repo ----

/** @type {Promise<Map<string, number>> | null} */
let treePromise = null;

/** The repo's file list, path → 1 for a folder or 0 for a file, cached by tree sha. */
function tree() {
  treePromise ??= (async () => {
    const branch = await gh(`${repoPath()}/branches/${BRANCH}`);
    if (!branch.ok) throw new Error(`Couldn't read the repo: GitHub said ${branch.status}.`);
    const sha = (await branch.json()).commit.commit.tree.sha;
    /** @type {Tree | null} */
    let cached = load("tree");
    if (!cached || cached.sha !== sha) {
      const reply = await gh(`${repoPath()}/git/trees/${sha}?recursive=1`);
      if (!reply.ok) throw new Error(`Couldn't list the repo: GitHub said ${reply.status}.`);
      /** @type {{ tree: { path: string, type: string }[] }} */
      const data = await reply.json();
      cached = {
        sha,
        entries: data.tree
          .filter((e) => e.type !== "commit")
          .map((e) => [e.path, e.type === "tree" ? 1 : 0]),
      };
      try {
        save("tree", cached);
      } catch {
        // Too big for storage: keep it for this open only.
      }
    }
    return new Map(cached.entries);
  })();
  treePromise.catch(() => {
    treePromise = null;
  });
  return treePromise;
}

/** @param {string} path */
async function raw(path) {
  const reply = await gh(contentsPath(path), { raw: true });
  if (!reply.ok) throw new Error(`Couldn't read ${path}: GitHub said ${reply.status}.`);
  return reply;
}

/** @param {string} path */
function extension(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
}

/** @type {string[]} */
const blobUrls = [];

/** @param {Blob} blob */
function blobUrl(blob) {
  const url = URL.createObjectURL(blob);
  blobUrls.push(url);
  return url;
}

/**
 * @param {string} path
 * @param {string} type
 */
async function imageUrl(path, type) {
  const bytes = await (await raw(path)).arrayBuffer();
  return blobUrl(new Blob([bytes], { type }));
}

/**
 * Fetch and show the repo images in rendered markdown.
 * @param {HTMLElement} root
 */
function loadImages(root) {
  for (const img of root.querySelectorAll("img[data-repo-src]")) {
    const path = img.getAttribute("data-repo-src") ?? "";
    const type = IMAGE_TYPES[extension(path)];
    if (!type) continue;
    imageUrl(path, type).then(
      (url) => img.setAttribute("src", url),
      () => img.classList.add("broken"),
    );
  }
}

// Tap a table header to sort by that column: ascending, descending, then the file's order.
// Empty cells stay last. A header with data-default-sort is sorted that way on load.
function sortableTables() {
  for (const table of content.querySelectorAll("table")) {
    const body = table.tBodies[0];
    if (!body) continue;
    const original = Array.from(body.rows);
    const headers = Array.from(table.querySelectorAll("thead th"));
    /**
     * @param {HTMLElement} th
     * @param {number} col
     * @param {string} dir
     */
    const sortBy = (th, col, dir) => {
      for (const h of headers) delete (/** @type {HTMLElement} */ (h).dataset.sort);
      const rows = original.slice();
      if (dir) {
        th.dataset.sort = dir;
        rows.sort((a, b) => {
          const x = a.cells[col]?.textContent?.trim() ?? "";
          const y = b.cells[col]?.textContent?.trim() ?? "";
          if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1);
          const c = x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
          return dir === "asc" ? c : -c;
        });
      }
      for (const row of rows) body.appendChild(row);
    };
    headers.forEach((h, col) => {
      const th = /** @type {HTMLElement} */ (h);
      th.addEventListener("click", () => {
        const next = /** @type {Record<string, string>} */ ({ "": "asc", asc: "desc", desc: "" });
        sortBy(th, col, next[th.dataset.sort ?? ""]);
      });
      if (th.dataset.defaultSort) sortBy(th, col, th.dataset.defaultSort);
    });
  }
}

/** @param {string} anchor */
function scrollTo(anchor) {
  // Ids carry the sanitizer's `user-content-` prefix, as on GitHub; links name them without it.
  const id = `user-content-${anchor}`;
  const target = anchor && content.querySelector(`[id="${CSS.escape(id)}"]`);
  if (target) target.scrollIntoView();
  else window.scrollTo(0, 0);
}

/**
 * @param {Route} route
 */
function crumbs(route) {
  const nav = $("view-crumbs");
  nav.replaceChildren();
  const root = route.tab === "life" ? lifeFolder() : "";
  const parts = route.path.slice(root.length).split("/").filter(Boolean);
  /**
   * @param {string} label
   * @param {string} path
   */
  const add = (label, path) => {
    if (nav.childElementCount) nav.append(" / ");
    const link = document.createElement("a");
    link.textContent = label;
    link.href = hashFor(route.tab, path);
    nav.append(link);
  };
  add((route.tab === "life" && baseName(root)) || config.repo, root);
  let path = root;
  for (const part of parts) {
    path = path ? `${path}/${part}` : part;
    add(part, path);
  }
}

/**
 * @param {string} source
 * @param {string} path
 * @param {Route} route
 */
function showMarkdown(source, path, route) {
  const article = document.createElement("div");
  article.className = "markdown";
  // Safe: markdown-it runs with raw HTML off, so the output holds only its own tags.
  article.innerHTML = render(source, path, route.tab);
  return article;
}

/**
 * @param {Route} route
 * @param {Map<string, number>} entries
 */
async function folderView(route, entries) {
  const prefix = route.path ? `${route.path}/` : "";
  const children = [...entries]
    .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
    .filter(([p]) => listed(route.tab, p.slice(prefix.length)))
    .sort(([a, ad], [b, bd]) => bd - ad || a.localeCompare(b, undefined, { numeric: true }));
  const list = document.createElement("ul");
  list.className = "listing";
  for (const [path, isFolder] of children) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = hashFor(route.tab, path);
    link.textContent = path.slice(prefix.length) + (isFolder ? "/" : "");
    if (isFolder) link.className = "folder";
    item.append(link);
    list.append(item);
  }
  const readme = entries.get(`${prefix}README.md`) === 0 ? `${prefix}README.md` : "";
  const parts = [];
  if (readme) parts.push(showMarkdown(await (await raw(readme)).text(), readme, route));
  parts.push(list);
  return parts;
}

/**
 * @param {Route} route
 */
async function fileView(route) {
  const type = IMAGE_TYPES[extension(route.path)];
  if (type) {
    const img = document.createElement("img");
    img.src = await imageUrl(route.path, type);
    img.alt = route.path;
    return [img];
  }
  const reply = await raw(route.path);
  const bytes = new Uint8Array(await reply.arrayBuffer());
  if (bytes.subarray(0, 8000).includes(0)) {
    const note = document.createElement("p");
    note.className = "status";
    note.textContent = "A binary file; not shown here.";
    return [note];
  }
  const text = new TextDecoder().decode(bytes);
  if (extension(route.path) === "md") return [showMarkdown(text, route.path, route)];
  const pre = document.createElement("pre");
  pre.className = "plain";
  pre.textContent = text;
  return [pre];
}

let shown = "";
let generation = 0;

/** @param {Route} route */
async function showView(route) {
  crumbs(route);
  if (!signedIn()) {
    content.replaceChildren();
    status("view-status", "");
    return;
  }
  const key = `${route.tab}:${route.path}`;
  if (key === shown) {
    scrollTo(route.anchor);
    return;
  }
  const mine = ++generation;
  status("view-status", "Loading…");
  try {
    const entries = await tree();
    const kind = route.path === "" ? 1 : entries.get(route.path);
    if (kind === undefined && location.hash === HOME.life) {
      // Life opens on todo.md; a folder without one opens on its listing instead.
      location.replace("#life");
      return;
    }
    if (kind === undefined) throw new Error(`${route.path} isn't in the repo.`);
    const parts = kind ? await folderView(route, entries) : await fileView(route);
    if (mine !== generation) return;
    for (const url of blobUrls.splice(0)) URL.revokeObjectURL(url);
    content.replaceChildren(...parts);
    shown = key;
    status("view-status", "");
    loadImages(content);
    sortableTables();
    scrollTo(route.anchor);
  } catch (error) {
    if (mine === generation) handle(error, "view-status");
  }
}

// ---- Routing ----

/** The last route seen in each tab, so a tab opens where it was left. */
const lastHash = /** @type {Record<string, string>} */ ({ ...HOME });

function route() {
  const current = parse(location.hash);
  lastHash[current.tab] = location.hash.startsWith(`#${current.tab}`)
    ? location.hash
    : HOME[current.tab];
  const shownTabs = tabs();
  for (const tab of /** @type {const} */ (["now", "life", "repo"])) {
    const link = /** @type {HTMLAnchorElement} */ ($(`tab-${tab}`));
    link.hidden = !shownTabs.includes(tab);
    link.classList.toggle("active", tab === current.tab);
    link.href = tab === current.tab ? HOME[tab] : lastHash[tab];
  }
  if (current.tab !== "now") leaveFocus();
  $("now").hidden = current.tab !== "now";
  $("view").hidden = current.tab === "now";
  if (current.tab === "now") growAll();
  else showView(current);
}

window.addEventListener("hashchange", route);

// The top bar's ‹ › ↻, as the home-screen app has no browser buttons. Reloading is safe: the
// boxes are already saved as `mine`.
$("nav-back").addEventListener("click", () => history.back());
$("nav-forward").addEventListener("click", () => history.forward());
$("nav-reload").addEventListener("click", () => location.reload());

// iOS Safari applies :active (the pressed look) only once the page has a touchstart listener.
document.addEventListener("touchstart", () => {}, { passive: true });

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !signedIn()) return;
  treePromise = null;
  syncNow();
});

// ---- Start ----

async function start() {
  try {
    await loadConfig();
  } catch (error) {
    $("sign-in").hidden = false;
    $("sign-in-button").hidden = true;
    const element = $("sign-in-error");
    element.hidden = false;
    element.textContent = message(error);
    return;
  }
  /** @type {Partial<Sections> | null} */
  const mine = load("mine");
  if (mine) fillBoxes(mine);
  showDirty();
  try {
    await finishSignIn();
  } catch (error) {
    const element = $("sign-in-error");
    element.hidden = false;
    element.textContent = message(error);
  }
  showAuth();
  route();
  await syncNow();
}

start();
