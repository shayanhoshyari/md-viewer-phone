// now.md's split, rebuild and merge: pure functions, tested in tests/now.test.js.
// See DESIGN.md → The page → Now.

/** @typedef {{ inbox: string, other: string, mind: string }} Sections */
/** @typedef {Sections & { header: string }} NowFile */

/**
 * The sections, in the order they are written back, with their headings.
 * @type {[keyof Sections, string][]}
 */
export const SECTIONS = [
  ["inbox", "## Todo inbox"],
  ["other", "## Other inbox"],
  ["mind", "## Mind"],
];

/** The line written above and below each section heading; see DESIGN.md → Now. */
export const DIVIDER = `<!--${"-".repeat(24)}-->`;

const DIVIDER_RE = /^[ \t]*<!---*-->[ \t]*$/;

/** @returns {Sections} */
export function empty() {
  return { inbox: "", other: "", mind: "" };
}

/**
 * Drop blank lines at the start and whitespace at the end, keeping a first line's indent.
 * @param {string | undefined} text
 */
function tidy(text) {
  return (text ?? "").replace(/^(?:[ \t]*\n)+/, "").trimEnd();
}

/**
 * Split now.md at its section headings (SECTIONS). The text before the first of them is the
 * header. A missing heading reads as that section empty; with none, all of it is header.
 * @param {string} text
 * @returns {NowFile}
 */
export function split(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const at = SECTIONS.map(([, heading]) => lines.findIndex((l) => l.trimEnd() === heading));
  const starts = at.filter((i) => i >= 0).sort((a, b) => a - b);
  // A divider right above or below a section heading is the phone's own; leave it out.
  for (const i of starts) {
    for (const j of [i - 1, i + 1]) {
      if (j >= 0 && j < lines.length && !starts.includes(j) && DIVIDER_RE.test(lines[j])) {
        lines[j] = "";
      }
    }
  }
  /** @param {number} start */
  const body = (start) => {
    if (start < 0) return "";
    const end = starts.find((i) => i > start) ?? lines.length;
    return tidy(lines.slice(start + 1, end).join("\n"));
  };
  const file = { header: tidy(lines.slice(0, starts[0] ?? lines.length).join("\n")), ...empty() };
  SECTIONS.forEach(([key], i) => {
    file[key] = body(at[i]);
  });
  return file;
}

/**
 * Build now.md from a header, then the sections in SECTIONS order; every heading always comes
 * back, between two DIVIDER lines.
 * @param {string} header
 * @param {Sections} sections
 */
export function rebuild(header, sections) {
  const blocks = [tidy(header)];
  for (const [key, heading] of SECTIONS)
    blocks.push(`${DIVIDER}\n${heading}\n${DIVIDER}`, tidy(sections[key]));
  return `${blocks.filter(Boolean).join("\n\n")}\n`;
}

/**
 * The conflict block shown in a box when both sides changed a section differently.
 * @param {string} mine
 * @param {string} theirs
 */
export function conflict(mine, theirs) {
  return `<<<<<<< phone\n${mine}\n=======\n${theirs}\n>>>>>>> github`;
}

/**
 * Three-way merge per section. A section changed on one side takes that side; changed on both
 * to the same text takes it; changed differently shows both as a conflict block.
 * @param {Sections} base
 * @param {Sections} mine
 * @param {Sections} theirs
 * @returns {Sections & { conflicts: boolean }}
 */
export function merge(base, mine, theirs) {
  let conflicts = false;
  /** @param {keyof Sections} key */
  const one = (key) => {
    const [b, m, t] = [base[key], mine[key], theirs[key]].map(tidy);
    if (m === b || m === t) return t;
    if (t === b) return m;
    conflicts = true;
    return conflict(m, t);
  };
  const merged = empty();
  for (const [key] of SECTIONS) merged[key] = one(key);
  return { ...merged, conflicts };
}

/**
 * Whether a box still holds a conflict marker line, which blocks Commit.
 * @param {string} text
 */
export function hasMarkers(text) {
  return /^(?:<<<<<<< phone|=======|>>>>>>> github)[ \t]*$/m.test(text);
}

/**
 * Whether two sets of sections hold the same text.
 * @param {Sections} a
 * @param {Sections} b
 */
export function same(a, b) {
  return SECTIONS.every(([key]) => tidy(a[key]) === tidy(b[key]));
}

const URL_RE = /https?:\/\/[^\s<>"'`]+/g;

/** @param {string} text */
function decoded(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * The label of a link to the page's own address, by its hash: the repo path it opens (a
 * `#life/…` path with Life's folder in front), ` § <id>` for a `?a=<id>`, or `now`.
 * @param {string} hash such as `#life/todo.md?a=notes`
 * @param {string} folder Life's folder, a repo path ("" for the repo root)
 */
function ownLabel(hash, folder) {
  const [main, query = ""] = hash.replace(/^#/, "").split("?");
  const anchor = new URLSearchParams(query).get("a") ?? "";
  const slash = main.indexOf("/");
  const tab = slash < 0 ? main : main.slice(0, slash);
  const rest = decoded(slash < 0 ? "" : main.slice(slash + 1)).replace(/^\/+|\/+$/g, "");
  let label;
  if (tab === "repo") label = rest || "repo";
  else if (tab === "life") label = [folder, rest].filter(Boolean).join("/") || "life";
  else if (tab === "now" || tab === "") label = "now";
  else label = decoded(main);
  return anchor ? `${label} § ${anchor}` : label;
}

/**
 * The web links in a box's text, for the tappable rows under it: deduplicated, trailing
 * punctuation dropped. A link to the page itself (`origin`) becomes just its hash, so it opens
 * in place, labelled with the repo path it opens; any other is labelled host, path and hash.
 * @param {string} text
 * @param {string} origin the page's own origin, such as https://phone.example.workers.dev
 * @param {string} [folder] Life's folder, a repo path ("" for the repo root)
 * @returns {{ href: string, label: string, inside: boolean }[]}
 */
export function links(text, origin, folder = "") {
  /** @type {Map<string, { href: string, label: string, inside: boolean }>} */
  const found = new Map();
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0].replace(/[).,;:!?\]]+$/, "");
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    const inside = parsed.origin === origin;
    const href = inside ? parsed.hash || "#now" : parsed.href;
    if (found.has(href)) continue;
    const path = parsed.pathname === "/" && !parsed.hash ? "" : parsed.pathname;
    const label = inside ? ownLabel(href, folder) : decoded(`${parsed.host}${path}${parsed.hash}`);
    found.set(href, { href, label, inside });
  }
  return [...found.values()];
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const TASK_RE = /^(\s*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\](?=[ \t]+\S)/;

/**
 * Flip the `n`th task checkbox in markdown text (0-based): `[ ]` becomes `[x]`, and `[x]` or
 * `[X]` becomes `[ ]`. Tasks are list items opening with a checkbox, counted in order and
 * skipping fenced code, as the preview renders them. Out of range, the text is unchanged.
 * @param {string} text
 * @param {number} n
 */
export function toggleTask(text, n) {
  const lines = text.split("\n");
  let fence = "";
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(FENCE_RE);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = "";
      continue;
    }
    if (open) {
      fence = open[1];
      continue;
    }
    const task = lines[i].match(TASK_RE);
    if (!task) continue;
    if (count++ !== n) continue;
    const mark = task[2] === " " ? "x" : " ";
    lines[i] = `${task[1]}[${mark}]${lines[i].slice(task[0].length)}`;
    return lines.join("\n");
  }
  return text;
}
