// The Worker's code. public/ is served as static assets before this runs, so the only paths
// here are GET /config.json, the page's settings, and POST /api/token: the GitHub token
// exchange, which needs the App's client secret. See DESIGN.md → Settings, Sign-in and Security.

/**
 * @typedef {{
 *   GITHUB_CLIENT_ID?: string,
 *   GITHUB_CLIENT_SECRET?: string,
 *   REPO?: string,
 *   NOW_FILE?: string,
 * }} Env
 */

/** The [vars] the page reads; never the secret. */
const SETTINGS = /** @type {const} */ (["REPO", "GITHUB_CLIENT_ID", "NOW_FILE"]);

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";

/** The fields passed back to the page; anything else GitHub returns is dropped. */
const KEPT = ["access_token", "expires_in", "refresh_token", "refresh_token_expires_in"];

/**
 * @param {unknown} body
 * @param {number} [status]
 */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** @param {unknown} value */
function isText(value) {
  return typeof value === "string" && value.length > 0 && value.length < 1000;
}

/**
 * The form posted to GitHub for a request body, or null if the body is not one of the two
 * allowed shapes: `{code, code_verifier}` or `{refresh_token}`.
 * @param {unknown} body
 * @returns {Record<string, string> | null}
 */
export function grant(body) {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const fields = /** @type {Record<string, unknown>} */ (body);
  const keys = Object.keys(fields).sort().join(",");
  if (keys === "code,code_verifier" && isText(fields.code) && isText(fields.code_verifier)) {
    return {
      code: /** @type {string} */ (fields.code),
      code_verifier: /** @type {string} */ (fields.code_verifier),
    };
  }
  if (keys === "refresh_token" && isText(fields.refresh_token)) {
    return {
      grant_type: "refresh_token",
      refresh_token: /** @type {string} */ (fields.refresh_token),
    };
  }
  return null;
}

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/config.json") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      return json(Object.fromEntries(SETTINGS.map((k) => [k, env[k] ?? ""])));
    }
    if (url.pathname !== "/api/token") return json({ error: "not_found" }, 404);
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const origin = request.headers.get("Origin");
    if (origin !== null && origin !== url.origin) return json({ error: "forbidden" }, 403);

    let form;
    try {
      form = grant(await request.json());
    } catch {
      form = null;
    }
    if (!form) return json({ error: "bad_request" }, 400);

    const reply = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "User-Agent": "md-viewer-phone" },
      body: new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID ?? "",
        client_secret: env.GITHUB_CLIENT_SECRET ?? "",
        ...form,
      }),
    });
    /** @type {Record<string, unknown>} */
    let data;
    try {
      data = await reply.json();
    } catch {
      return json({ error: "github_unavailable" }, 502);
    }
    if (!reply.ok || typeof data.access_token !== "string") {
      const error = typeof data.error === "string" ? data.error : "github_error";
      return json({ error }, 400);
    }
    return json(Object.fromEntries(KEPT.filter((k) => k in data).map((k) => [k, data[k]])));
  },
};
