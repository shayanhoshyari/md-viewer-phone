// The Worker's code: POST /api/token, the GitHub token exchange, which needs the App's client
// secret. wrangler.toml sends only /api/token here; everything else is a static file.
// See DESIGN.md → Architecture, Sign-in and Security.

import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import settings from "../public/config.json";

/** @typedef {{ GITHUB_CLIENT_SECRET?: string }} Env */

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

/** The fields passed back to the page; anything else GitHub returns is dropped. */
const KEPT = ["access_token", "expires_in", "refresh_token", "refresh_token_expires_in"];

const Text = v.pipe(v.string(), v.minLength(1), v.maxLength(999));

/** The two bodies accepted, with no other keys: a sign-in code, or a refresh token. */
const Grant = v.union([
  v.strictObject({ code: Text, code_verifier: Text }),
  v.strictObject({ refresh_token: Text }),
]);

/** @type {Hono<{ Bindings: Env }>} */
const app = new Hono();

app.use(async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
});

app.use(async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin !== undefined && origin !== new URL(c.req.url).origin) {
    return c.json({ error: "forbidden" }, 403);
  }
  await next();
});

app.post(
  "/api/token",
  // A refusal never echoes the body back: it can hold a token.
  sValidator("json", Grant, (result, c) => {
    if (!result.success) return c.json({ error: "bad_request" }, 400);
  }),
  async (c) => {
    const body = c.req.valid("json");
    const form = "code" in body ? body : { grant_type: "refresh_token", ...body };
    const reply = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "User-Agent": "md-viewer-phone" },
      body: new URLSearchParams({
        client_id: settings.GITHUB_CLIENT_ID.trim(),
        client_secret: c.env.GITHUB_CLIENT_SECRET ?? "",
        ...form,
      }),
    });
    /** @type {Record<string, unknown>} */
    let data;
    try {
      data = await reply.json();
    } catch {
      return c.json({ error: "github_unavailable" }, 502);
    }
    if (!reply.ok || typeof data.access_token !== "string") {
      const error = typeof data.error === "string" ? data.error : "github_error";
      return c.json({ error }, 400);
    }
    return c.json(Object.fromEntries(KEPT.filter((k) => k in data).map((k) => [k, data[k]])));
  },
);

app.notFound((c) => c.json({ error: "not_found" }, 404));

// Malformed JSON or a wrong Content-Type comes here as an HTTPException; anything else is a bug.
// Neither reply says more than that.
app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: "bad_request" }, error.status);
  return c.json({ error: "internal" }, 500);
});

export default app;
