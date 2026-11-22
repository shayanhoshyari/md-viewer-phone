import { beforeEach, describe, expect, it } from "vitest";
import { configure } from "../public/config.js";
import { hashFor, hasNow, listed, parse, resolve, slug, tabs } from "../public/routes.js";

/** @param {string} nowFile */
const use = (nowFile) => configure({ REPO: "o/r", GITHUB_CLIENT_ID: "id", NOW_FILE: nowFile });

beforeEach(() => use("notes/home/now.md"));

describe("parse", () => {
  it("reads each tab", () => {
    expect(parse("")).toEqual({ tab: "now", path: "", anchor: "" });
    expect(parse("#nonsense")).toEqual({ tab: "now", path: "", anchor: "" });
    expect(parse("#life")).toEqual({ tab: "life", path: "notes/home", anchor: "" });
    expect(parse("#life/todo.md?a=notes")).toEqual({
      tab: "life",
      path: "notes/home/todo.md",
      anchor: "notes",
    });
    expect(parse("#repo")).toEqual({ tab: "repo", path: "", anchor: "" });
    expect(parse("#repo/a%20b/c.md")).toEqual({ tab: "repo", path: "a b/c.md", anchor: "" });
  });

  it("opens Repo for Now and Life without a NOW_FILE", () => {
    use("");
    expect(hasNow()).toBe(false);
    expect(tabs()).toEqual(["repo"]);
    for (const hash of ["", "#now", "#life/todo.md", "#nonsense"]) {
      expect(parse(hash)).toEqual({ tab: "repo", path: "", anchor: "" });
    }
    expect(parse("#repo/x.md")).toEqual({ tab: "repo", path: "x.md", anchor: "" });
  });

  it("takes the repo root as Life for a NOW_FILE at the root", () => {
    use("now.md");
    expect(tabs()).toEqual(["now", "life", "repo"]);
    expect(parse("#life")).toEqual({ tab: "life", path: "", anchor: "" });
    expect(parse("#life/todo.md")).toEqual({ tab: "life", path: "todo.md", anchor: "" });
  });
});

describe("hashFor", () => {
  it("stays in Life inside its folder and goes to Repo outside it", () => {
    expect(hashFor("life", "notes/home/todo.md")).toBe("#life/todo.md");
    expect(hashFor("life", "notes/home")).toBe("#life");
    expect(hashFor("life", "notes/homework.md")).toBe("#repo/notes/homework.md");
    expect(hashFor("life", "AGENTS.md")).toBe("#repo/AGENTS.md");
    expect(hashFor("repo", "notes/home/todo.md", "x y")).toBe("#repo/notes/home/todo.md?a=x%20y");
    expect(hashFor("repo", "")).toBe("#repo");
  });

  it("round-trips through parse", () => {
    const hash = hashFor("life", "notes/home/a b/c?.md", "h");
    expect(parse(hash)).toEqual({ tab: "life", path: "notes/home/a b/c?.md", anchor: "h" });
  });

  it("keeps the whole repo in Life for a NOW_FILE at the root", () => {
    use("now.md");
    expect(hashFor("life", "a/b.md")).toBe("#life/a/b.md");
    expect(hashFor("life", "")).toBe("#life");
  });
});

describe("resolve", () => {
  const from = "notes/home/plans/p.md";

  it("resolves relative, root and same-file links", () => {
    expect(resolve(from, "../todo.md")).toEqual({ path: "notes/home/todo.md", anchor: "" });
    expect(resolve(from, "./x.md#sec")).toEqual({ path: "notes/home/plans/x.md", anchor: "sec" });
    expect(resolve(from, "/AGENTS.md")).toEqual({ path: "AGENTS.md", anchor: "" });
    expect(resolve(from, "#goal")).toEqual({ path: from, anchor: "goal" });
    expect(resolve(from, "a%20b.md")).toEqual({ path: "notes/home/plans/a b.md", anchor: "" });
    expect(resolve(from, "../")).toEqual({ path: "notes/home", anchor: "" });
  });

  it("returns null for links outside the repo", () => {
    expect(resolve(from, "https://example.com")).toBeNull();
    expect(resolve(from, "mailto:a@b.c")).toBeNull();
    expect(resolve(from, "//example.com/x")).toBeNull();
    expect(resolve(from, "../../../../x")).toBeNull();
  });
});

describe("slug", () => {
  it("makes GitHub's ids, unique per page", () => {
    const seen = new Map();
    expect(slug("Life and Repo", seen)).toBe("life-and-repo");
    expect(slug("Revoke a lost phone's login", seen)).toBe("revoke-a-lost-phones-login");
    expect(slug("Life and Repo", seen)).toBe("life-and-repo-1");
    expect(slug("`now.md` & co", seen)).toBe("nowmd--co");
  });
});

describe("listed", () => {
  it("hides code and agent files in Life only", () => {
    for (const name of ["_code", ".github", ".ignore", "AGENTS.md", "CLAUDE.md"]) {
      expect(listed("life", name)).toBe(false);
      expect(listed("repo", name)).toBe(true);
    }
    for (const name of ["todo.md", "plans", "notes.md", "my_notes.md"]) {
      expect(listed("life", name)).toBe(true);
    }
  });
});
