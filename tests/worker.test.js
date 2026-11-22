import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { grant } from "../worker/index.js";

const env = { GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" };
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

describe("grant", () => {
  it("accepts a code with its verifier, or a refresh token", () => {
    expect(grant({ code: "c", code_verifier: "v" })).toEqual({ code: "c", code_verifier: "v" });
    expect(grant({ refresh_token: "r" })).toEqual({
      grant_type: "refresh_token",
      refresh_token: "r",
    });
  });

  it("refuses anything else", () => {
    for (const body of [
      null,
      [],
      "x",
      {},
      { code: "c" },
      { code: "c", code_verifier: "v", client_id: "evil" },
      { refresh_token: 1 },
      { refresh_token: "" },
      { code: "c", code_verifier: "v", refresh_token: "r" },
    ]) {
      expect(grant(body)).toBeNull();
    }
  });
});

describe("fetch", () => {
  it("serves the settings at /config.json, never the secret", async () => {
    const reply = await worker.fetch(new Request("https://life.example.dev/config.json"), {
      ...env,
      REPO: "o/r",
    });
    expect(reply.status).toBe(200);
    expect(reply.headers.get("Cache-Control")).toBe("no-store");
    expect(await reply.json()).toEqual({ REPO: "o/r", GITHUB_CLIENT_ID: "id", NOW_FILE: "" });
    const post = new Request("https://life.example.dev/config.json", { method: "POST" });
    expect((await worker.fetch(post, env)).status).toBe(405);
  });

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

  it("passes on GitHub's error name only", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ error: "bad_refresh_token", error_description: "x" }),
    );
    const reply = await worker.fetch(post({ refresh_token: "r" }), env);
    expect(reply.status).toBe(400);
    expect(await reply.json()).toEqual({ error: "bad_refresh_token" });
  });

  it("refuses other paths, methods, origins and bodies without calling GitHub", async () => {
    const github = vi.fn();
    vi.stubGlobal("fetch", github);
    const cases = [
      [new Request("https://life.example.dev/other"), 404],
      [new Request(URL_), 405],
      [post({ refresh_token: "r" }, { Origin: "https://evil.example" }), 403],
      [post({ nope: 1 }), 400],
      [new Request(URL_, { method: "POST", body: "{not json" }), 400],
    ];
    for (const [request, status] of cases) {
      expect((await worker.fetch(/** @type {Request} */ (request), env)).status).toBe(status);
    }
    expect(github).not.toHaveBeenCalled();
  });
});
