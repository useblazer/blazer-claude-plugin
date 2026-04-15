// Global consent for the new fingerprint pipeline (spec §7.2).
//
// Stored in the plugin's persistent data directory (CLAUDE_PLUGIN_DATA,
// per Claude Code's plugin convention) so it persists across projects and
// plugin updates. The legacy per-project consent in mcp/lib/consent.js is
// for the deprecated extract_stack_fingerprint tool and stays untouched
// during the migration window.
//
// The stored record has a `version` field so a future change to the
// consent text (one that expands data categories, per §17 / D5) can
// trigger re-consent cleanly.

import fs from "node:fs";
import path from "node:path";

export const CONSENT_VERSION = 1;

export const CONSENT_TEXT = [
  "Blazer analyzes your project's architectural choices to provide relevant",
  "recommendations. A fingerprint includes:",
  "",
  "  • programming languages and package dependencies (as purls)",
  "  • frameworks, cloud providers, CI/CD tools, datastores in use",
  "  • a one-way HMAC of your repo URL and commit SHA so Blazer can",
  "    recognize when it's seen this repo before — WITHOUT learning",
  "    its location or identity",
  "",
  "A fingerprint NEVER includes:",
  "",
  "  • source code, commit messages, branch names (by default), or PRs",
  "  • credentials, environment variables, or secrets",
  "  • anything from your working directory other than manifest files",
  "",
  "You can revoke consent at any time by deleting the Blazer plugin's",
  "consent.json (in the Claude Code plugin data directory).",
].join("\n");

const DEFAULT_FILE = "consent.json";

function defaultDir() {
  const envDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!envDir) {
    throw new Error("CLAUDE_PLUGIN_DATA environment variable is not set");
  }
  return envDir;
}

export class FingerprintConsent {
  constructor({ dir, file = DEFAULT_FILE } = {}) {
    this.dir  = dir ?? defaultDir();
    this.path = path.join(this.dir, file);
  }

  // True only when a consent record exists AND matches the current text
  // version. A version bump invalidates old consent — forcing re-prompt.
  hasConsent() {
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(this.path, "utf-8")); } catch { return false; }
    return parsed && parsed.version === CONSENT_VERSION;
  }

  grant() {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const record = {
      version: CONSENT_VERSION,
      granted_at: new Date().toISOString(),
      scope: "fingerprint",
    };
    fs.writeFileSync(this.path, JSON.stringify(record, null, 2), { mode: 0o600 });
  }

  revoke() {
    try { fs.unlinkSync(this.path); } catch { /* already gone */ }
  }
}
