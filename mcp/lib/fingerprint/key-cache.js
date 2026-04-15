// Local cache of the tenant hash key — see ADR 0001.
//
// The key lets the plugin produce HMACs for repo/commit/branch without
// round-tripping to the server. It's stored in the plugin's own persistent
// data directory (CLAUDE_PLUGIN_DATA, per Claude Code's plugin convention)
// with 0600 permissions alongside the API key. Rotation is detected
// reactively (via 202/Warning or 410 responses from POST /fingerprints);
// we do NOT preemptively poll /hash_key on each submission.

import fs from "node:fs";
import path from "node:path";

const DEFAULT_FILE = "credentials.json";

function defaultDir() {
  const envDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!envDir) {
    throw new Error("CLAUDE_PLUGIN_DATA environment variable is not set");
  }
  return envDir;
}

export class KeyCache {
  constructor({ dir, file = DEFAULT_FILE } = {}) {
    this.dir  = dir ?? defaultDir();
    this.path = path.join(this.dir, file);
  }

  // Returns { tenant_hash_key_b64u, tenant_hash_key_version } or null if
  // the cache doesn't exist or is malformed.
  read() {
    let contents;
    try { contents = fs.readFileSync(this.path, "utf-8"); } catch { return null; }
    let parsed;
    try { parsed = JSON.parse(contents); } catch { return null; }
    if (!parsed.tenant_hash_key_b64u || typeof parsed.tenant_hash_key_version !== "number") {
      return null;
    }
    return parsed;
  }

  // Merges the given fields into the credentials file, preserving any
  // other keys (e.g. `api_key`). Writes atomically with 0600 permissions.
  write(fields) {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const existing = (() => {
      try { return JSON.parse(fs.readFileSync(this.path, "utf-8")); } catch { return {}; }
    })();
    const merged = { ...existing, ...fields };
    const tmp = `${this.path}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.path);
    try { fs.chmodSync(this.path, 0o600); } catch { /* non-POSIX fs */ }
  }

  // Removes the cached hash-key fields (leaves api_key and others alone).
  clear() {
    let existing;
    try { existing = JSON.parse(fs.readFileSync(this.path, "utf-8")); } catch { return; }
    delete existing.tenant_hash_key_b64u;
    delete existing.tenant_hash_key_version;
    fs.writeFileSync(this.path, JSON.stringify(existing, null, 2), { mode: 0o600 });
  }

  // Returns raw key bytes (Buffer) or null.
  keyBytes() {
    const r = this.read();
    if (!r) return null;
    return Buffer.from(r.tenant_hash_key_b64u.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  }

  keyVersion() {
    return this.read()?.tenant_hash_key_version ?? null;
  }
}
