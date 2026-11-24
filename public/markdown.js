// Markdown for the Life and Repo tabs: markdown-it (the vendored global `markdownit`) with raw
// HTML on, and its output sanitized by DOMPurify (the vendored global `DOMPurify`). See
// DESIGN.md → Life and Repo.

import { mermaidUrl } from "./diagrams.js";
import { hashFor, resolve, slug } from "./routes.js";

/** @typedef {import("./routes.js").Tab} Tab */
/** @typedef {{ path: string, tab: Tab, seen: Map<string, number> }} Env */

const DEFAULT_SORT_RE = /^<!-- default-sort: (.+?)(?: (asc|desc))? -->$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Remove HTML comments outside fenced code, keeping `default-sort` lines, which the renderer
 * turns into a sort on the table that follows.
 * @param {string} source
 */
export function stripComments(source) {
  const out = [];
  /** @type {string[]} */
  let chunk = [];
  let fence = "";
  const flush = () => {
    if (chunk.length === 0) return;
    const text = chunk
      .join("\n")
      .replace(/<!--[\s\S]*?-->/g, (c) => (DEFAULT_SORT_RE.test(c.trim()) ? c : ""));
    out.push(...text.split("\n"));
    chunk = [];
  };
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const match = line.match(FENCE_RE);
    if (fence) {
      out.push(line);
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length) fence = "";
    } else if (match) {
      flush();
      fence = match[1];
      out.push(line);
    } else chunk.push(line);
  }
  flush();
  return out.join("\n");
}

const md = globalThis.markdownit({ html: true, linkify: true });

// default-sort: an HTML block that is just the comment marks a header cell of the next table.
md.core.ruler.push("default_sort", (state) => {
  const tokens = state.tokens;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].type !== "html_block") continue;
    const match = tokens[i].content.trim().match(DEFAULT_SORT_RE);
    if (!match) continue;
    const column = match[1].trim().toLowerCase();
    if (tokens[i + 1]?.type === "table_open") {
      for (let j = i + 2; j < tokens.length && tokens[j].type !== "thead_close"; j++) {
        if (tokens[j].type === "th_open" && tokens[j + 1].content.trim().toLowerCase() === column) {
          tokens[j].attrSet("data-default-sort", match[2] || "asc");
          break;
        }
      }
    }
    tokens.splice(i, 1);
  }
});

// Task lists, as on GitHub: `[ ]` or `[x]` opening a list item becomes a read-only checkbox.
md.core.ruler.push("task_lists", (state) => {
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i];
    if (inline.type !== "inline" || tokens[i - 2].type !== "list_item_open") continue;
    const first = inline.children?.[0];
    const match = first?.type === "text" && first.content.match(/^\[([ xX])\] /);
    if (!first || !match) continue;
    first.content = first.content.slice(match[0].length);
    const box = new state.Token("html_inline", "", 0);
    box.content = `<input type="checkbox" disabled${match[1] === " " ? "" : " checked"}> `;
    inline.children?.unshift(box);
    tokens[i - 2].attrJoin("class", "task");
  }
});

// Heading ids, as GitHub makes them, so links to #headings work.
md.core.ruler.push("heading_ids", (state) => {
  const env = /** @type {Env} */ (state.env);
  state.tokens.forEach((token, i) => {
    if (token.type !== "heading_open") return;
    const text = (state.tokens[i + 1].children ?? [])
      .filter((c) => c.type === "text" || c.type === "code_inline")
      .map((c) => c.content)
      .join("");
    token.attrSet("id", slug(text, env.seen));
  });
});

// Section numbers and contents, as md-viewer: H2–H6 numbered (`1.`, `1.1.`), after the ids, so
// the ids stay unnumbered; with two or more H2/H3, a collapsed contents list after the H1.
md.core.ruler.push("section_numbers", (state) => {
  const { path, tab } = /** @type {Env} */ (state.env);
  const tokens = state.tokens;
  const counters = [0, 0, 0, 0, 0, 0, 0];
  /** @type {string[]} */
  const items = [];
  let afterH1 = -1;
  tokens.forEach((token, i) => {
    if (token.type === "heading_close" && token.tag === "h1" && afterH1 < 0) afterH1 = i + 1;
    if (token.type !== "heading_open" || token.tag === "h1") return;
    const depth = Number(token.tag[1]);
    counters[depth]++;
    for (let deeper = depth + 1; deeper < 7; deeper++) counters[deeper] = 0;
    const number = `${counters.slice(2, depth + 1).join(".")}. `;
    const inline = tokens[i + 1];
    const text = new state.Token("text", "", 0);
    text.content = number;
    inline.children?.unshift(text);
    if (depth > 3) return;
    const label = (inline.children ?? [])
      .filter((c) => c.type === "text" || c.type === "code_inline")
      .map((c) => c.content)
      .join("");
    const href = hashFor(tab, path, token.attrGet("id") ?? "");
    const esc = md.utils.escapeHtml;
    items.push(`<li class="toc-d${depth}"><a href="${esc(href)}">${esc(label)}</a></li>`);
  });
  if (items.length < 2) return;
  const toc = new state.Token("html_block", "", 0);
  toc.content = `<div class="toc"><details><summary>Contents</summary><ul>${items.join("")}</ul></details></div>\n`;
  tokens.splice(Math.max(afterH1, 0), 0, toc);
});

md.renderer.rules.link_open = (tokens, i, options, env, self) => {
  const token = tokens[i];
  const { path, tab } = /** @type {Env} */ (env);
  const target = resolve(path, token.attrGet("href") ?? "");
  if (target) {
    token.attrSet("href", hashFor(tab, target.path, target.anchor));
  } else {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");
  }
  return self.renderToken(tokens, i, options);
};

// Repo images are fetched by the page (the repo is private) and shown as blob: URLs.
md.renderer.rules.image = (tokens, i, options, env, self) => {
  const token = tokens[i];
  const { path } = /** @type {Env} */ (env);
  const target = resolve(path, token.attrGet("src") ?? "");
  if (target) {
    token.attrSet("data-repo-src", target.path);
    token.attrSet("src", "");
  }
  token.attrSet("alt", self.renderInlineAsText(token.children ?? [], options, env));
  return self.renderToken(tokens, i, options);
};

// Diagram fences: an image from a public service, then the source, collapsed. Mermaid's URL
// is written here; PlantUML's needs deflating, so the page fills it in (DESIGN.md → Life and
// Repo).
/** @type {Record<string, string>} */
const DIAGRAMS = { mermaid: "mermaid", plantuml: "plantuml", puml: "plantuml" };
const defaultFence = md.renderer.rules.fence;
md.renderer.rules.fence = (tokens, i, options, env, self) => {
  const token = tokens[i];
  const word = token.info.trim().split(/\s+/)[0].toLowerCase();
  const kind = Object.hasOwn(DIAGRAMS, word) ? DIAGRAMS[word] : "";
  if (!kind) {
    return defaultFence ? defaultFence(tokens, i, options, env, self) : "";
  }
  const esc = md.utils.escapeHtml;
  const src = kind === "mermaid" ? ` src="${esc(mermaidUrl(token.content))}"` : "";
  const alt = kind === "mermaid" ? "Mermaid diagram" : "PlantUML diagram";
  return (
    `<div class="diagram"><img alt="${alt}" data-diagram="${kind}"${src}>` +
    `<details><summary>Diagram source</summary><pre><code>${esc(token.content)}</code></pre>` +
    "</details></div>\n"
  );
};

md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
md.renderer.rules.table_close = () => "</table></div>\n";

// What may come through: markdown-it's own tags, plus the few HTML tags repo files use.
const PURIFY = {
  ALLOWED_TAGS: [
    ...["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "hr", "pre", "code", "div"],
    ...["ul", "ol", "li", "a", "em", "strong", "s", "img", "input"],
    ...["table", "thead", "tbody", "tr", "th", "td"],
    ...["details", "summary", "br", "kbd", "sub", "sup"],
  ],
  ALLOWED_ATTR: [
    ...["href", "title", "alt", "src", "id", "class", "target", "rel", "start", "open"],
    ...["type", "checked", "disabled", "width", "height"],
  ],
  // Ids get GitHub's `user-content-` prefix, so a heading can't shadow a page global.
  SANITIZE_NAMED_PROPS: true,
};

const purify = globalThis.DOMPurify;
purify.addHook("afterSanitizeAttributes", (node) => {
  // The only input is the read-only task checkbox.
  if (node.nodeName === "INPUT") {
    node.setAttribute("type", "checkbox");
    node.setAttribute("disabled", "");
  }
  if (node.nodeName === "A" && node.hasAttribute("target")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/**
 * Render a repo markdown file to sanitized HTML.
 * @param {string} source
 * @param {string} path the file's repo path
 * @param {Tab} tab the tab it is shown in
 */
export function render(source, path, tab) {
  /** @type {Env} */
  const env = { path, tab, seen: new Map() };
  return purify.sanitize(md.render(stripComments(source), env), PURIFY);
}
