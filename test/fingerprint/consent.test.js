import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FingerprintConsent, CONSENT_VERSION } from "../../mcp/lib/fingerprint/consent.js";

describe("FingerprintConsent", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "blazer-consent-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("defaults to no consent", () => {
    const c = new FingerprintConsent({ dir });
    assert.strictEqual(c.hasConsent(), false);
  });

  it("grant() persists consent and hasConsent() reads it back", () => {
    const c = new FingerprintConsent({ dir });
    c.grant();
    assert.strictEqual(c.hasConsent(), true);
  });

  it("stored record has current version + granted_at", () => {
    const c = new FingerprintConsent({ dir });
    c.grant();
    const stored = JSON.parse(fs.readFileSync(c.path, "utf-8"));
    assert.strictEqual(stored.version, CONSENT_VERSION);
    assert.ok(stored.granted_at);
    assert.strictEqual(stored.scope, "fingerprint");
  });

  it("version mismatch invalidates stored consent (forces re-prompt)", () => {
    const c = new FingerprintConsent({ dir });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(c.path, JSON.stringify({ version: 0, granted_at: "old" }));
    assert.strictEqual(c.hasConsent(), false);
  });

  it("revoke() deletes the record", () => {
    const c = new FingerprintConsent({ dir });
    c.grant();
    assert.ok(c.hasConsent());
    c.revoke();
    assert.strictEqual(c.hasConsent(), false);
  });
});
