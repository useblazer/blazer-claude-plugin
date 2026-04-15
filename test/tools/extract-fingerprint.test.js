import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeHandler } from "../../mcp/tools/extract-fingerprint.js";
import { FingerprintConsent } from "../../mcp/lib/fingerprint/consent.js";

describe("extract_fingerprint tool", () => {
  let project, consentDir;
  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), "extract-t-"));
    consentDir = fs.mkdtempSync(path.join(os.tmpdir(), "extract-consent-"));
    fs.writeFileSync(path.join(project, "Gemfile.lock"),
      "GEM\n  specs:\n    rails (8.1.3)\n\nDEPENDENCIES\n  rails\n"
    );
  });
  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true });
    fs.rmSync(consentDir, { recursive: true, force: true });
  });

  it("prompts for consent when first invoked", async () => {
    const handler = makeHandler({ consent: new FingerprintConsent({ dir: consentDir }) });
    const res = await handler({ project_dir: project });
    assert.strictEqual(res.consent_required, true);
    assert.ok(res.message.includes("fingerprint"));
  });

  it("returns a schema-valid body after consent", async () => {
    const consent = new FingerprintConsent({ dir: consentDir });
    const handler = makeHandler({ consent });
    const res = await handler({ project_dir: project, consent_confirmed: true });
    assert.ok(consent.hasConsent());
    assert.deepStrictEqual(res.schema_validation_errors, []);
    assert.ok(res.body.packages.some((p) => p.purl === "pkg:gem/rails@8.1.3"));
  });

  it("does not submit to the network (no apiClient needed)", async () => {
    const consent = new FingerprintConsent({ dir: consentDir });
    consent.grant();
    const handler = makeHandler({ consent });
    // Would throw if this reached apiClient.
    const res = await handler({ project_dir: project });
    assert.ok(res.body);
  });
});
