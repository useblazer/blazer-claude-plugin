import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extract } from "../../../mcp/lib/fingerprint/extractors/bundler.js";

const SAMPLE_LOCKFILE = `GEM
  remote: https://rubygems.org/
  specs:
    rails (8.1.3)
    pg (1.5.9)
    phlex-rails (2.0.1)
      phlex (~> 2.0)
      rails (>= 7)
    phlex (2.0.0)
    minitest (5.22.0)

PLATFORMS
  x86_64-linux

DEPENDENCIES
  rails (~> 8.1.3)
  pg (~> 1.5)
  phlex-rails (~> 2.0)
  minitest

BUNDLED WITH
   2.5.9
`;

describe("bundler extractor", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "bundler-x-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("returns empty when no Gemfile.lock", () => {
    assert.deepStrictEqual(extract(dir), { packages: [], evidence: [] });
  });

  it("parses specs and marks direct deps", () => {
    fs.writeFileSync(path.join(dir, "Gemfile.lock"), SAMPLE_LOCKFILE);
    const { packages } = extract(dir);
    const purls = packages.map((p) => p.purl);
    assert.ok(purls.includes("pkg:gem/rails@8.1.3"));
    assert.ok(purls.includes("pkg:gem/phlex@2.0.0"));
    assert.ok(purls.includes("pkg:gem/minitest@5.22.0"));

    const rails = packages.find((p) => p.purl.startsWith("pkg:gem/rails"));
    assert.strictEqual(rails.direct, true);

    const phlex = packages.find((p) => p.purl.startsWith("pkg:gem/phlex@"));
    // phlex is a transitive dep of phlex-rails, NOT in DEPENDENCIES
    assert.strictEqual(phlex.direct, false);
  });
});
