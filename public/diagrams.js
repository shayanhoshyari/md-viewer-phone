// Diagram fences as images from public services, as md-viewer does for PlantUML. See DESIGN.md
// → Life and Repo.

export const MERMAID_HOST = "https://mermaid.ink";
export const PLANTUML_HOST = "https://www.plantuml.com";

/**
 * The bytes as base64url, without padding.
 * @param {Uint8Array} bytes
 */
function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * mermaid.ink's SVG of a Mermaid diagram.
 * @param {string} text
 */
export function mermaidUrl(text) {
  return `${MERMAID_HOST}/svg/${base64url(new TextEncoder().encode(text))}`;
}

const PLANTUML_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/**
 * Bytes in PlantUML's base64: its own alphabet, every 3 bytes (the last group padded with
 * zeros) to 4 characters.
 * @param {Uint8Array} bytes
 */
export function plantumlEncode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1] ?? 0;
    const b3 = bytes[i + 2] ?? 0;
    out += PLANTUML_ALPHABET[b1 >> 2];
    out += PLANTUML_ALPHABET[((b1 & 0x3) << 4) | (b2 >> 4)];
    out += PLANTUML_ALPHABET[((b2 & 0xf) << 2) | (b3 >> 6)];
    out += PLANTUML_ALPHABET[b3 & 0x3f];
  }
  return out;
}

/**
 * The PlantUML server's SVG of a diagram: the UTF-8 text deflated (raw) and PlantUML-encoded.
 * Rejects where the browser lacks `CompressionStream("deflate-raw")`.
 * @param {string} text
 */
export async function plantumlUrl(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return `${PLANTUML_HOST}/plantuml/svg/${plantumlEncode(bytes)}`;
}
