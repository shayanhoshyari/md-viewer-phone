import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../worker/index.js";

vi.mock("../public/config.json", () => ({
  default: { REPO: "o/r", GITHUB_CLIENT_ID: " id ", NOW_FILE: "" },
}));

const env = { GITHUB_CLIENT_SECRET: "secret" };
const URL_ = "https://life.example.dev/api/token";

/**
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
function post(body, headers = {}) {
  return new Request(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("fetch", () => {
  it("exchanges with GitHub and returns only the tokens and lifetimes", async () => {
    const github = vi.fn(async () =>
      Response.json({
        access_token: "a",
        expires_in: 28800,
        refresh_token: "r",
        refresh_token_expires_in: 15811200,
        token_type: "bearer",
        scope: "",
      }),
    );
    vi.stubGlobal("fetch", github);
    const reply = await worker.fetch(post({ code: "c", code_verifier: "v" }), env);
    expect(reply.status).toBe(200);
    expect(reply.headers.get("Cache-Control")).toBe("no-store");
    expect(await reply.json()).toEqual({
      access_token: "a",
      expires_in: 28800,
      refresh_token: "r",
      refresh_token_expires_in: 15811200,
    });
    const [, init] = /** @type {any} */ (github.mock.calls[0]);
    expect(Object.fromEntries(init.body)).toEqual({
      client_id: "id",
      client_secret: "secret",
      code: "c",
      code_verifier: "v",
    });
  });

  it("sends a refresh as a refresh_token grant, and passes on GitHub's error name only", async () => {
    const github = vi.fn(async () =>
      Response.json({ error: "bad_refresh_token", error_description: "x" }),
    );
    vi.stubGlobal("fetch", github);
    const reply = await worker.fetch(post({ refresh_token: "r" }), env);
    expect(reply.status).toBe(400);
    expect(await reply.json()).toEqual({ error: "bad_refresh_token" });
    const [, init] = /** @type {any} */ (github.mock.calls[0]);
    expect(Object.fromEntries(init.body)).toEqual({
      client_id: "id",
      client_secret: "secret",
      grant_type: "refresh_token",
      refresh_token: "r",
    });
  });

  it("answers a failure with a bare error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("network down, SENT");
    });
    const reply = await worker.fetch(post({ refresh_token: "r" }), env);
    expect(reply.status).toBe(500);
    expect(reply.headers.get("Cache-Control")).toBe("no-store");
    expect(await reply.json()).toEqual({ error: "internal" });
  });

  it("refuses other bodies, origins, methods and paths without calling GitHub or echoing", async () => {
    const github = vi.fn();
    vi.stubGlobal("fetch", github);
    const long = "x".repeat(1000);
    const cases = [
      post({ code: "c", code_verifier: "v", client_id: "evil" }),
      post({ code: "c", code_verifier: "v", refresh_token: "r" }),
      post({ code: "c" }),
      post({ refresh_token: "" }),
      post({ refresh_token: 1 }),
      post({ refresh_token: long }),
      post({ nope: "SENT" }),
      post(null),
      post([]),
      post("SENT"),
      post({ refresh_token: "SENT" }, { Origin: "https://evil.example" }),
      new Request(URL_, { method: "POST", body: "{not json SENT" }),
      new Request(URL_, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({ refresh_token: "SENT" }),
      }),
      new Request(URL_),
      new Request("https://life.example.dev/other", { method: "POST" }),
    ];
    for (const request of cases) {
      const reply = await worker.fetch(request, env);
      expect(reply.ok).toBe(false);
      expect(reply.status).toBeLessThan(500);
      const text = await reply.text();
      expect(text).not.toContain("SENT");
      expect(text).not.toContain(long);
      expect(Object.keys(JSON.parse(text))).toEqual(["error"]);
    }
    expect(github).not.toHaveBeenCalled();
  });
});
