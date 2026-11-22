// Sign-in, token renewal and GitHub calls. See DESIGN.md → Sign-in.

import { config } from "./config.js";

export const BRANCH = "main";

const API = "https://api.github.com";
const AUTH_KEY = "auth";
const LOGIN_KEY = "login";
const RENEW_EARLY_MS = 5 * 60 * 1000;

/** @typedef {{ access: string, expiresAt: number, refresh: string | null }} Auth */

/** Thrown when there is no usable login; the page shows Sign in with GitHub. */
export class SignedOut extends Error {
  constructor() {
    super("Signed out");
  }
}

/**
 * @template T
 * @param {string} key
 * @returns {T | null}
 */
export function load(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function save(key, value) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}

export function signedIn() {
  return load(AUTH_KEY) !== null;
}

export function signOut() {
  save(AUTH_KEY, null);
}

/** @param {Uint8Array} bytes */
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function random() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Go to GitHub to sign in, with a fresh state and PKCE verifier saved for the way back. */
export async function signIn() {
  const state = random();
  const verifier = random();
  save(LOGIN_KEY, { state, verifier });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const query = new URLSearchParams({
    client_id: config.clientId,
    state,
    code_challenge: base64url(new Uint8Array(digest)),
    code_challenge_method: "S256",
    // The page's own address, so the same code signs in live and on localhost (DESIGN.md).
    redirect_uri: `${location.origin}/`,
  });
  location.assign(`https://github.com/login/oauth/authorize?${query}`);
}

/**
 * Store the tokens from /api/token.
 * @param {Record<string, unknown>} data
 */
function store(data) {
  /** @type {Auth} */
  const auth = {
    access: String(data.access_token),
    expiresAt: typeof data.expires_in === "number" ? Date.now() + data.expires_in * 1000 : Infinity,
    refresh: typeof data.refresh_token === "string" ? data.refresh_token : null,
  };
  // JSON has no Infinity; null reads back as "never expires".
  save(AUTH_KEY, { ...auth, expiresAt: Number.isFinite(auth.expiresAt) ? auth.expiresAt : null });
  return auth;
}

/** @returns {Auth | null} */
function current() {
  /** @type {{ access: string, expiresAt: number | null, refresh: string | null } | null} */
  const auth = load(AUTH_KEY);
  return auth && { ...auth, expiresAt: auth.expiresAt ?? Infinity };
}

/** @param {Record<string, string>} body */
async function exchange(body) {
  const reply = await fetch("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await reply.json().catch(() => ({}));
  if (!reply.ok || typeof data.access_token !== "string") {
    throw new Error(`Sign-in failed: ${data.error ?? reply.status}`);
  }
  return data;
}

/**
 * Finish signing in if the URL holds GitHub's `code` and `state`. Returns whether it did.
 * Throws if the state doesn't match or the exchange fails.
 */
export async function finishSignIn() {
  const query = new URLSearchParams(location.search);
  const code = query.get("code");
  const state = query.get("state");
  if (!code && !query.has("error")) return false;
  /** @type {{ state: string, verifier: string } | null} */
  const login = load(LOGIN_KEY);
  save(LOGIN_KEY, null);
  history.replaceState(null, "", `${location.pathname}#now`);
  if (!code) throw new Error(`Sign-in cancelled: ${query.get("error")}`);
  if (!login || login.state !== state) {
    throw new Error("Sign-in failed: start it again from the same place (home screen or Safari).");
  }
  store(await exchange({ code, code_verifier: login.verifier }));
  return true;
}

/**
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function underLock(task) {
  return navigator.locks ? navigator.locks.request("renew", task) : task();
}

/**
 * Renew the access token with the refresh token, once across the page's open copies.
 * `stale` is the access token that was found too old or refused.
 * @param {string} stale
 * @returns {Promise<string>}
 */
function renew(stale) {
  return underLock(async () => {
    const auth = current();
    if (!auth) throw new SignedOut();
    if (auth.access !== stale && auth.expiresAt - Date.now() > RENEW_EARLY_MS) return auth.access;
    if (!auth.refresh) {
      signOut();
      throw new SignedOut();
    }
    try {
      return store(await exchange({ refresh_token: auth.refresh })).access;
    } catch (error) {
      // Offline is not a dead login; anything else is.
      if (error instanceof TypeError) throw error;
      signOut();
      throw new SignedOut();
    }
  });
}

async function token() {
  const auth = current();
  if (!auth) throw new SignedOut();
  if (auth.expiresAt - Date.now() > RENEW_EARLY_MS) return auth.access;
  return renew(auth.access);
}

/**
 * Call the GitHub API as the signed-in user; renews and retries once on 401.
 * @param {string} path  e.g. `/repos/o/r/contents/x`
 * @param {RequestInit & { raw?: boolean }} [init]
 */
export async function gh(path, init = {}) {
  const { raw, ...rest } = init;
  /** @param {string} access */
  const call = (access) =>
    fetch(`${API}${path}`, {
      ...rest,
      cache: "no-store",
      headers: {
        Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json",
        Authorization: `Bearer ${access}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...rest.headers,
      },
    });
  const access = await token();
  const reply = await call(access);
  if (reply.status !== 401) return reply;
  return call(await renew(access));
}

/** @param {string} path a repo path */
export function contentsPath(path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${repoPath()}/contents/${encoded}`;
}

/** The API path of the repo in the settings. */
export function repoPath() {
  return `/repos/${config.owner}/${config.repo}`;
}

/** @param {string} text */
export function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** @param {string} base64 */
export function decodeBase64(base64) {
  const binary = atob(base64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}
