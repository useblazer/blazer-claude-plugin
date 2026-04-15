import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extract } from "../../../mcp/lib/fingerprint/extractors/cocoapods.js";

const SAMPLE = `PODS:
  - Alamofire (5.9.0)
  - FirebaseAnalytics (11.0.0):
    - FirebaseCore (~> 11.0)
    - FirebaseInstallations (~> 11.0)
  - FirebaseCore (11.0.0)
  - FirebaseInstallations (11.0.0)

DEPENDENCIES:
  - Alamofire (~> 5.9)
  - FirebaseAnalytics

SPEC CHECKSUMS:
  Alamofire: fffff
`;

describe("cocoapods extractor", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "pods-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("returns empty when no Podfile.lock", () => {
    assert.deepStrictEqual(extract(dir), { packages: [], evidence: [] });
  });

  it("parses pods list and marks declared deps as direct", () => {
    fs.writeFileSync(path.join(dir, "Podfile.lock"), SAMPLE);
    const { packages } = extract(dir);
    const purls = packages.map((p) => p.purl);
    assert.ok(purls.includes("pkg:cocoapods/Alamofire@5.9.0"));
    assert.ok(purls.includes("pkg:cocoapods/FirebaseAnalytics@11.0.0"));
    assert.ok(purls.includes("pkg:cocoapods/FirebaseCore@11.0.0"));

    const alamo = packages.find((p) => p.purl.startsWith("pkg:cocoapods/Alamofire"));
    assert.strictEqual(alamo.direct, true);

    const fc = packages.find((p) => p.purl.startsWith("pkg:cocoapods/FirebaseCore@"));
    assert.strictEqual(fc.direct, false); // transitive dep of FirebaseAnalytics
  });
});
