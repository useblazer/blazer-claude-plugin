// Canonicalization and hashing for fingerprint identifiers.
//
// Mirrors blazer-rails/lib/blazer/fingerprint/canonical.rb byte-for-byte.
// Both implementations are asserted against
// docs/fingerprint/fixtures/canonicalization.json. Drift between them
// silently breaks within-tenant repo correlation — see ADR 0001.
//
// The implementation is intentionally regex/string-based (not URL-parser
// based) so the Ruby and JS ports stay byte-equivalent without arguing
// about each language's URL parsing quirks.

import { createHmac } from "node:crypto";

const SSH_FORM = /^git@([^:]+):(.+)$/;
const URL_FORM = /^([a-z][a-z0-9+\-.]*):\/\/(?:[^/@]+@)?([^/?#]+)(\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i;
const TRAILING_SLASHES = /\/+$/;
const TRAILING_GIT = /\.git$/;

/**
 * Canonicalize a repo URL per fingerprint.schema.json.
 *
 * Steps (must match canonical.rb):
 *   1. Trim.
 *   2. If SSH short form (git@host:path), rewrite to https://host/path.
 *   3. If scheme://[userinfo@]host[:port]/path[?query][#frag], strip
 *      userinfo and port and force scheme=https.
 *   4. Strip trailing slashes → strip trailing .git → strip trailing slashes.
 *   5. Lowercase the whole thing.
 */
export function repoUrl(input) {
  if (input == null || String(input).trim() === "") {
    throw new TypeError("repo url must be a non-empty string");
  }

  let s = String(input).trim();

  const sshMatch = s.match(SSH_FORM);
  if (sshMatch) {
    s = `https://${sshMatch[1]}/${sshMatch[2]}`;
  }

  const urlMatch = s.match(URL_FORM);
  if (urlMatch) {
    let host = urlMatch[2];
    const path = urlMatch[3] || "";
    host = host.replace(/:\d+$/, "");
    s = `https://${host}${path}`;
  }

  s = s.replace(TRAILING_SLASHES, "");
  s = s.replace(TRAILING_GIT, "");
  s = s.replace(TRAILING_SLASHES, "");

  return s.toLowerCase();
}

/**
 * Canonicalize a commit SHA: 40-char lowercase hex.
 */
export function commitSha(sha) {
  if (sha == null || String(sha).trim() === "") {
    throw new TypeError("commit sha must be a non-empty string");
  }
  const s = String(sha).trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(s)) {
    throw new TypeError(`commit sha must be 40 hex chars, got ${JSON.stringify(s)}`);
  }
  return s;
}

/**
 * Branch names are passed through as-is. Branch names are case-sensitive
 * in git, so we do NOT downcase. Also no trim — leading/trailing whitespace
 * is its own (cursed) meaningful input.
 */
export function branch(name) {
  if (name == null || String(name) === "") {
    throw new TypeError("branch must be a non-empty string");
  }
  return String(name);
}

/**
 * Hex HMAC-SHA-256 of the canonical value under `key`.
 *
 * @param {Buffer|Uint8Array|string} key - raw key bytes. A hex-encoded
 *   string is also accepted (common in tests); strings are treated as
 *   UTF-8 bytes if not valid hex.
 * @param {string} canonicalValue - UTF-8 string to sign.
 * @returns {string} 64-char hex digest.
 */
export function hmacHex(key, canonicalValue) {
  return createHmac("sha256", key).update(canonicalValue, "utf8").digest("hex");
}
