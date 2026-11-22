// The page's routes, in the URL hash: #now, #life/<path>, #repo/<path>, with an optional
// ?a=<heading id>. Pure functions of the settings, tested in tests/routes.test.js.

import { config } from "./config.js";

/** @typedef {"now" | "life" | "repo"} Tab */

/** Where each tab starts: Life on the todo, the others at their top. */
export const HOME = /** @type {Record<Tab, string>} */ ({
  now: "#now",
  life: "#life/todo.md",
  repo: "#repo",
});

const LIFE_HIDDEN = new Set(["AGENTS.md", "CLAUDE.md"]);

/** Whether the Now and Life tabs show: only with a NOW_FILE. */
export function hasNow() {
  return config.nowFile !== "";
}

/** The tabs shown, in order. */
export function tabs() {
  return /** @type {Tab[]} */ (hasNow() ? ["now", "life", "repo"] : ["repo"]);
}

/** Life's folder, a repo path ("" for the repo root). */
export function lifeFolder() {
  return config.folder;
}

/** @param {string} path a repo path */
function inLife(path) {
  const folder = config.folder;
  return folder === "" || path === folder || path.startsWith(`${folder}/`);
}

/** @param {string} rest a path inside Life's folder */
function lifePath(rest) {
  return [config.folder, rest].filter(Boolean).join("/");
}

/**
 * Whether a folder listing in `tab` shows the entry `name`. Life hides code and agent files
 * (`_` and `.` names, AGENTS.md, CLAUDE.md); Repo shows everything.
 * @param {Tab} tab
 * @param {string} name
 */
export function listed(tab, name) {
  if (tab !== "life") return true;
  return !/^[_.]/.test(name) && !LIFE_HIDDEN.has(name);
}
/** @typedef {{ tab: Tab, path: string, anchor: string }} Route */

/** @param {string} path */
function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

/**
 * The route in a URL hash. `path` is a repo path ("" for the repo root).
 * @param {string} hash
 * @returns {Route}
 */
export function parse(hash) {
  const raw = hash.replace(/^#/, "");
  const [main, query = ""] = raw.split("?");
  const anchor = new URLSearchParams(query).get("a") ?? "";
  const slash = main.indexOf("/");
  const tab = slash < 0 ? main : main.slice(0, slash);
  let rest = "";
  try {
    rest = slash < 0 ? "" : decodeURIComponent(main.slice(slash + 1));
  } catch {
    rest = "";
  }
  rest = rest.replace(/^\/+|\/+$/g, "");
  if (tab === "repo") return { tab, path: rest, anchor };
  if (!hasNow()) return { tab: "repo", path: "", anchor: "" };
  if (tab === "life") return { tab, path: lifePath(rest), anchor };
  return { tab: "now", path: "", anchor: "" };
}

/**
 * The hash for a repo path, staying in the Life tab while the path is inside Life's folder.
 * @param {Tab} tab the tab the link is shown in
 * @param {string} path a repo path
 * @param {string} [anchor]
 */
export function hashFor(tab, path, anchor = "") {
  const folder = config.folder;
  const base =
    tab === "life" && hasNow() && inLife(path)
      ? `#life/${encodePath(folder ? path.slice(folder.length + 1) : path)}`
      : `#repo/${encodePath(path)}`;
  const clean = base.replace(/\/$/, "");
  return anchor ? `${clean}?a=${encodeURIComponent(anchor)}` : clean;
}

/**
 * Resolve a link in the file at `from` to a repo path and heading anchor, or null when the link
 * leaves the repo (another scheme or host). A link that climbs above the root is null too.
 * @param {string} from the repo path of the file the link is in
 * @param {string} href
 * @returns {{ path: string, anchor: string } | null}
 */
export function resolve(from, href) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return null;
  const hashAt = href.indexOf("#");
  const target = (hashAt < 0 ? href : href.slice(0, hashAt)).split("?")[0];
  const anchor = hashAt < 0 ? "" : href.slice(hashAt + 1);
  if (!target) return { path: from, anchor };
  let decoded = target;
  try {
    decoded = decodeURI(target);
  } catch {}
  const parts = decoded.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const part of decoded.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  return { path: parts.join("/"), anchor };
}

/**
 * GitHub's heading id for a heading's text, made unique against `seen`.
 * @param {string} text
 * @param {Map<string, number>} seen
 */
export function slug(text, seen) {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-");
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count ? `${base}-${count}` : base;
}
