// The page's settings: wrangler.toml's [vars], served by the Worker as /config.json.
// See DESIGN.md → Settings.

/**
 * @typedef {{
 *   owner: string,
 *   repo: string,
 *   clientId: string,
 *   nowFile: string,
 *   folder: string,
 * }} Config
 */

/**
 * The settings in use, filled by `configure` before the page starts. `folder` is the folder
 * holding `nowFile` ("" at the repo root); both are "" without a NOW_FILE.
 * @type {Config}
 */
export const config = { owner: "", repo: "", clientId: "", nowFile: "", folder: "" };

/** @param {unknown} value */
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The settings in a /config.json reply. Throws, naming what to set, when a required one is
 * missing or malformed.
 * @param {unknown} raw
 * @returns {Config}
 */
export function parseConfig(raw) {
  const vars = /** @type {Record<string, unknown>} */ (
    typeof raw === "object" && raw !== null ? raw : {}
  );
  const repo = text(vars.REPO);
  const clientId = text(vars.GITHUB_CLIENT_ID);
  const nowFile = text(vars.NOW_FILE).replace(/^\/+|\/+$/g, "");
  const problems = [];
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) problems.push("REPO (owner/name)");
  if (!clientId) problems.push("GITHUB_CLIENT_ID (your GitHub App's client ID)");
  if (problems.length) {
    throw new Error(`Set ${problems.join(" and ")} in wrangler.toml's [vars], then deploy.`);
  }
  const [owner, name] = repo.split("/");
  const slash = nowFile.lastIndexOf("/");
  return {
    owner,
    repo: name,
    clientId,
    nowFile,
    folder: slash < 0 ? "" : nowFile.slice(0, slash),
  };
}

/**
 * Use these settings from now on.
 * @param {unknown} raw a /config.json reply
 */
export function configure(raw) {
  Object.assign(config, parseConfig(raw));
  return config;
}

/** Fetch /config.json from the Worker and use it. */
export async function loadConfig() {
  const reply = await fetch("/config.json", { cache: "no-store" });
  if (!reply.ok) throw new Error(`Couldn't read the settings: the Worker said ${reply.status}.`);
  return configure(await reply.json());
}
