// @vitest-environment jsdom
// DOMPurify needs a DOM; jsdom gives the tests one.
import DOMPurify from "dompurify";
import markdownit from "markdown-it";
import { beforeAll, describe, expect, it } from "vitest";
import { configure } from "../public/config.js";

/** @type {typeof import("../public/markdown.js")} */
let markdown;

beforeAll(async () => {
  configure({ REPO: "o/r", GITHUB_CLIENT_ID: "id", NOW_FILE: "notes/home/now.md" });
  // The page loads markdown-it and DOMPurify as global scripts; do the same here.
  globalThis.markdownit = markdownit;
  globalThis.DOMPurify = DOMPurify;
  markdown = await import("../public/markdown.js");
});

const FILE = "notes/home/plans/p.md";

describe("stripComments", () => {
  it("drops comments outside fences and keeps default-sort lines", () => {
    const source = [
      "a <!-- note --> b",
      "<!--",
      "multi",
      "-->",
      "<!-- default-sort: Due desc -->",
      "```",
      "<!-- kept in code -->",
      "```",
    ].join("\n");
    expect(markdown.stripComments(source)).toBe(
      ["a  b", "", "<!-- default-sort: Due desc -->", "```", "<!-- kept in code -->", "```"].join(
        "\n",
      ),
    );
  });
});

describe("render", () => {
  it("removes unsafe raw HTML", () => {
    const html = markdown.render(
      [
        "<script>alert(1)</script>",
        "",
        '<img src=x onerror="x"> <span style="color:red" onclick="x">s</span>',
        "",
        '<iframe src="https://example.com"></iframe><form><input type="text"></form>',
        "",
        '<a href="javascript:alert(1)">j</a>',
      ].join("\n"),
      FILE,
      "life",
    );
    for (const bad of [
      "<script",
      "alert",
      "onerror",
      "onclick",
      "style",
      "<iframe",
      "<form",
      "<span",
      "javascript:",
    ]) {
      expect(html).not.toContain(bad);
    }
    expect(html).toContain('<input type="checkbox" disabled="">');
  });

  it("keeps details, summary and markdown inside", () => {
    const source = "<details>\n<summary>Week <kbd>1</kbd></summary>\n\n- **a** b\n\n</details>\n";
    const html = markdown.render(source, FILE, "life");
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>Week <kbd>1</kbd></summary>");
    expect(html).toContain("<li><strong>a</strong> b</li>");
    expect(html).not.toContain(" open");
  });

  it("keeps <br> in table cells", () => {
    const html = markdown.render("| A |\n|---|\n| x<br>y |\n", FILE, "life");
    expect(html).toContain("<td>x<br>y</td>");
  });

  it("turns task list items into read-only checkboxes", () => {
    const html = markdown.render("- [ ] open\n- [x] **done**\n- [y] not a task\n", FILE, "life");
    expect(html).toContain('<li class="task"><input type="checkbox" disabled=""> open</li>');
    expect(html).toContain(
      '<li class="task"><input type="checkbox" disabled="" checked=""> <strong>done</strong></li>',
    );
    expect(html).toContain("<li>[y] not a task</li>");
  });

  it("refuses javascript: links", () => {
    expect(markdown.render("[x](javascript:alert(1))", FILE, "life")).not.toContain("href");
  });

  it("marks the default-sort column and drops the comment", () => {
    const source =
      "<!-- default-sort: due DATE desc -->\n| Task | Due Date |\n|---|---|\n| a | 1 |\n";
    const html = markdown.render(source, FILE, "life");
    expect(html).toContain('<th data-default-sort="desc">Due Date</th>');
    expect(html).not.toContain("default-sort:");
    expect(html).toContain('<div class="table-wrap"><table>');
  });

  it("rewrites repo links to routes and opens others outside", () => {
    const html = markdown.render(
      "[t](../todo.md#notes) [r](/AGENTS.md) [h](#goal) [w](https://example.com)",
      FILE,
      "life",
    );
    expect(html).toContain('href="#life/todo.md?a=notes"');
    expect(html).toContain('href="#repo/AGENTS.md"');
    expect(html).toContain('href="#life/plans/p.md?a=goal"');
    expect(html).toContain('href="https://example.com" target="_blank" rel="noopener noreferrer"');
    // A heading named like a document property keeps its id, prefixed.
    expect(markdown.render("## Links\n", FILE, "life")).toContain('id="user-content-links"');
  });

  it("gives headings GitHub's ids", () => {
    const html = markdown.render("# Life and `Repo`\n\n## Life and Repo\n", FILE, "repo");
    expect(html).toContain('<h1 id="user-content-life-and-repo">');
    expect(html).toContain('<h2 id="user-content-life-and-repo-1">');
  });

  it("numbers H2–H6 and keeps the ids unnumbered", () => {
    const html = markdown.render(
      "# T\n\n## A\n\n### B\n\n#### C\n\n### D\n\n## E\n\n### F\n",
      FILE,
      "life",
    );
    expect(html).toContain('<h1 id="user-content-t">T</h1>');
    expect(html).toContain('<h2 id="user-content-a">1. A</h2>');
    expect(html).toContain('<h3 id="user-content-b">1.1. B</h3>');
    expect(html).toContain('<h4 id="user-content-c">1.1.1. C</h4>');
    expect(html).toContain('<h3 id="user-content-d">1.2. D</h3>');
    expect(html).toContain('<h2 id="user-content-e">2. E</h2>');
    expect(html).toContain('<h3 id="user-content-f">2.1. F</h3>');
  });

  it("puts a collapsed contents list of H2 and H3 after the H1", () => {
    const html = markdown.render("# T\n\nIntro\n\n## A\n\n### B\n\n#### C\n", FILE, "life");
    expect(html).toMatch(/<\/h1>\s*<div class="toc"><details><summary>Contents<\/summary>/);
    expect(html).toContain(
      '<li class="toc-d2"><a href="#life/plans/p.md?a=a">1. A</a></li>' +
        '<li class="toc-d3"><a href="#life/plans/p.md?a=b">1.1. B</a></li></ul>',
    );
    expect(html).not.toContain("1.1.1. C</a>");
    expect(html.indexOf('class="toc"')).toBeLessThan(html.indexOf("Intro"));
  });

  it("puts the contents at the top without an H1, and leaves it out under two entries", () => {
    expect(markdown.render("## A\n\n## B\n", FILE, "repo")).toMatch(/^<div class="toc">/);
    expect(markdown.render("# T\n\n## A\n\n#### C\n", FILE, "life")).not.toContain("toc");
  });

  it("escapes heading text in the contents", () => {
    const html = markdown.render("## a &lt;b&gt;\n\n## `<i>`\n", FILE, "life");
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<b>");
  });

  it("leaves repo images for the page to fetch", () => {
    const html = markdown.render("![a cat](cat.png)", FILE, "life");
    expect(html).toContain('data-repo-src="notes/home/plans/cat.png"');
    expect(html).toContain('src=""');
    expect(html).toContain('alt="a cat"');
  });
});
