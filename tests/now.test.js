/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  conflict,
  DIVIDER,
  hasMarkers,
  links,
  merge,
  rebuild,
  same,
  split,
} from "../public/now.js";

const sample = readFileSync(new URL("./now.md", import.meta.url), "utf8");

const E = { inbox: "", other: "", mind: "" };

/** A section heading as rebuild writes it, between dividers. */
const h = (/** @type {string} */ heading) => `${DIVIDER}\n${heading}\n${DIVIDER}`;

describe("split", () => {
  it("reads the header and all sections", () => {
    const text =
      "# Now\n\nlegend\n\n## Mind\n\nidea one\n\nidea two\n\n## Todo inbox\n\n- buy milk\n\n" +
      "## Other inbox\n\n### Garden\n\nwater the tomatoes\n";
    expect(split(text)).toEqual({
      header: "# Now\n\nlegend",
      inbox: "- buy milk",
      other: "### Garden\n\nwater the tomatoes",
      mind: "idea one\n\nidea two",
    });
  });

  it("reads a missing heading as that section empty", () => {
    expect(split("# Now\n\n## Todo inbox\n\n- a\n")).toEqual({
      ...E,
      header: "# Now",
      inbox: "- a",
    });
    expect(split("# Now\n\n## Mind\n\nm\n")).toEqual({ ...E, header: "# Now", mind: "m" });
  });

  it("keeps everything as header when every heading is gone", () => {
    expect(split("# Now\n\nstray\n")).toEqual({ ...E, header: "# Now\n\nstray" });
  });

  it("handles the sections in any order and other headings inside them", () => {
    const text = "## Todo inbox\n\n- a\n\n## Mind\n\nm\n\n### sub\n\nx\n\n## Other inbox\n\no\n";
    expect(split(text)).toEqual({
      header: "",
      inbox: "- a",
      other: "o",
      mind: "m\n\n### sub\n\nx",
    });
  });

  it("matches headings exactly, allowing trailing spaces and CRLF", () => {
    expect(split("## Mind  \r\nm\r\n## Inbox\r\nz\r\n")).toEqual({
      ...E,
      header: "",
      mind: "m\n## Inbox\nz",
    });
  });

  it("keeps a first line's indent", () => {
    expect(split("## Mind\n\n    code\n").mind).toBe("    code");
  });

  it("leaves out the dividers right above and below section headings", () => {
    const text =
      "# Now\n\n<!---->\n## Todo inbox\n<!------------>\n\n- a\n\n" +
      `${DIVIDER}\n## Other inbox\n\no\n\n## Mind\n  ${DIVIDER}  \n\nm\n`;
    expect(split(text)).toEqual({ header: "# Now", inbox: "- a", other: "o", mind: "m" });
  });

  it("keeps other comments, and dividers away from headings", () => {
    const text = `## Mind\n<!-- note -->\n\nm\n\n${DIVIDER}\n\nn\n`;
    expect(split(text).mind).toBe(`<!-- note -->\n\nm\n\n${DIVIDER}\n\nn`);
  });
});

describe("rebuild", () => {
  it("round-trips a full now.md", () => {
    const { header, ...sections } = split(sample);
    expect(rebuild(header, sections)).toBe(sample);
  });

  it("brings back emptied sections' headings", () => {
    expect(rebuild("# Now", E)).toBe(
      `# Now\n\n${h("## Todo inbox")}\n\n${h("## Other inbox")}\n\n${h("## Mind")}\n`,
    );
  });

  it("writes the sections after the header", () => {
    expect(rebuild("# Now\n", { inbox: "- a\n- b", other: "### T\n\nx", mind: "\n\nm\n" })).toBe(
      `# Now\n\n${h("## Todo inbox")}\n\n- a\n- b\n\n${h("## Other inbox")}\n\n### T\n\nx\n\n` +
        `${h("## Mind")}\n\nm\n`,
    );
  });

  it("works with no header", () => {
    expect(rebuild("", { ...E, mind: "m" })).toBe(
      `${h("## Todo inbox")}\n\n${h("## Other inbox")}\n\n${h("## Mind")}\n\nm\n`,
    );
  });

  it("is stable through split again", () => {
    const text = rebuild("# Now", { inbox: "- c", other: "o", mind: "a\n\nb" });
    const { header, ...sections } = split(text);
    expect(rebuild(header, sections)).toBe(text);
  });
});

describe("merge", () => {
  const base = { inbox: "i", other: "o", mind: "m" };

  it("takes theirs when only GitHub changed", () => {
    expect(merge(base, base, { ...base, mind: "m2" })).toEqual({
      ...base,
      mind: "m2",
      conflicts: false,
    });
  });

  it("takes mine when only the phone changed", () => {
    expect(merge(base, { ...base, other: "o2" }, base)).toEqual({
      ...base,
      other: "o2",
      conflicts: false,
    });
  });

  it("takes each side's section when they changed different ones", () => {
    expect(merge(base, { ...base, inbox: "mine" }, { ...base, mind: "theirs" })).toEqual({
      inbox: "mine",
      other: "o",
      mind: "theirs",
      conflicts: false,
    });
  });

  it("takes the same change made on both sides", () => {
    const both = { ...base, mind: "same" };
    expect(merge(base, both, both)).toEqual({ ...both, conflicts: false });
  });

  it("ignores whitespace-only differences at the ends", () => {
    expect(merge(base, { ...base, mind: "m\n\n" }, { ...base, mind: "m2" }).mind).toBe("m2");
  });

  it("shows both sides when they changed a section differently", () => {
    const result = merge(base, { ...base, mind: "mine" }, { ...base, mind: "theirs" });
    expect(result).toEqual({
      ...base,
      mind: "<<<<<<< phone\nmine\n=======\ntheirs\n>>>>>>> github",
      conflicts: true,
    });
    expect(hasMarkers(result.mind)).toBe(true);
  });

  it("merges with an empty base, as on a first sync with boxes kept", () => {
    expect(merge(E, E, base)).toEqual({ ...base, conflicts: false });
    expect(merge(E, { ...E, mind: "x" }, base).conflicts).toBe(true);
  });
});

describe("hasMarkers", () => {
  it("finds marker lines only", () => {
    expect(hasMarkers(conflict("a", "b"))).toBe(true);
    expect(hasMarkers("a\n=======\nb")).toBe(true);
    expect(hasMarkers("a\n====\nb")).toBe(false);
    expect(hasMarkers("x <<<<<<< phone")).toBe(false);
    expect(hasMarkers("plain")).toBe(false);
  });
});

describe("same", () => {
  it("compares sections ignoring blank ends", () => {
    expect(same({ ...E, mind: "a\n" }, { ...E, mind: "a", other: "\n" })).toBe(true);
    expect(same({ ...E, other: "a" }, { ...E, other: "b" })).toBe(false);
  });
});

describe("links", () => {
  const ORIGIN = "https://phone.example.workers.dev";

  it("finds web links, opening the page's own in place", () => {
    const text = [
      "Some important link: https://phone.example.workers.dev/#repo/notes/trips/2026-09.",
      "(see https://example.com/a?b=1) and [md](https://example.com/x)",
      "again https://example.com/a?b=1 and https://phone.example.workers.dev/",
      "not a link: example.com, ftp://x",
    ].join("\n");
    expect(links(text, ORIGIN)).toEqual([
      {
        href: "#repo/notes/trips/2026-09",
        label: "repo/notes/trips/2026-09",
        inside: true,
      },
      { href: "https://example.com/a?b=1", label: "example.com/a", inside: false },
      { href: "https://example.com/x", label: "example.com/x", inside: false },
      { href: "#now", label: "now", inside: true },
    ]);
  });

  it("is empty without links", () => {
    expect(links("[ ] water the plants", ORIGIN)).toEqual([]);
  });
});
