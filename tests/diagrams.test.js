import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { mermaidUrl, plantumlEncode, plantumlUrl } from "../public/diagrams.js";

describe("mermaidUrl", () => {
  it("is mermaid.ink's SVG of the UTF-8 text in base64url, unpadded", () => {
    const url = mermaidUrl("graph TD\n  A[Ünï] --> B");
    expect(url).toBe("https://mermaid.ink/svg/Z3JhcGggVEQKICBBW8OcbsOvXSAtLT4gQg");
    const encoded = url.split("/").pop() ?? "";
    expect(Buffer.from(encoded, "base64url").toString("utf8")).toBe("graph TD\n  A[Ünï] --> B");
  });

  it("uses - and _ in place of + and /", () => {
    // ">>>?" is 0x3e3e3e3f, which standard base64 writes as "Pj4+Pw==".
    expect(mermaidUrl(">>>?")).toBe("https://mermaid.ink/svg/Pj4-Pw");
  });
});

describe("plantumlEncode", () => {
  it("writes PlantUML's alphabet, padding the last group with zero bytes", () => {
    expect(plantumlEncode(new Uint8Array([0, 1, 2, 255]))).toBe("0042_m00");
    expect(plantumlEncode(new Uint8Array([0xfb, 0xff]))).toBe("-_y0");
  });
});

describe("plantumlUrl", () => {
  it("matches PlantUML's own example, checked against the public server", async () => {
    expect(await plantumlUrl("Bob -> Alice : hello")).toBe(
      "https://www.plantuml.com/plantuml/svg/SyfFKj2rKt3CoKnELR1Io4ZDoSa70000",
    );
  });

  it("deflates the UTF-8 text", async () => {
    const text = "@startuml\nÜnï -> B : ✓\n@enduml\n";
    const encoded = (await plantumlUrl(text)).split("/").pop() ?? "";
    // Undo PlantUML's alphabet back to standard base64, then inflate.
    const from = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
    const to = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const base64 = [...encoded].map((c) => to[from.indexOf(c)]).join("");
    const bytes = Buffer.from(base64, "base64");
    expect(inflateRawSync(bytes, { finishFlush: 2 }).toString("utf8")).toBe(text);
  });
});
