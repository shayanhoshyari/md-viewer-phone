import { describe, expect, it } from "vitest";
import { parseConfig } from "../public/config.js";

describe("parseConfig", () => {
  it("reads the repo, the client ID and the NOW_FILE's folder", () => {
    expect(
      parseConfig({ REPO: " o/r.x ", GITHUB_CLIENT_ID: "id", NOW_FILE: "/notes/home/now.md/" }),
    ).toEqual({
      owner: "o",
      repo: "r.x",
      clientId: "id",
      nowFile: "notes/home/now.md",
      folder: "notes/home",
    });
  });

  it("takes an empty or missing NOW_FILE as Repo only, and a root one as folder ''", () => {
    const base = { REPO: "o/r", GITHUB_CLIENT_ID: "id" };
    expect(parseConfig(base)).toMatchObject({ nowFile: "", folder: "" });
    expect(parseConfig({ ...base, NOW_FILE: "" })).toMatchObject({ nowFile: "", folder: "" });
    expect(parseConfig({ ...base, NOW_FILE: "now.md" })).toMatchObject({
      nowFile: "now.md",
      folder: "",
    });
  });

  it("names the missing or malformed required settings", () => {
    expect(() => parseConfig({ REPO: "", GITHUB_CLIENT_ID: "" })).toThrow(
      "Set REPO (owner/name) and GITHUB_CLIENT_ID (your GitHub App's client ID) in wrangler.toml's [vars], then deploy.",
    );
    expect(() => parseConfig({ REPO: "just-a-name", GITHUB_CLIENT_ID: "id" })).toThrow(
      /^Set REPO \(owner\/name\) in/,
    );
    expect(() => parseConfig({ REPO: "o/r" })).toThrow(/^Set GITHUB_CLIENT_ID/);
    expect(() => parseConfig(null)).toThrow(/^Set REPO/);
  });
});
