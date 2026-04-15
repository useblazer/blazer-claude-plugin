import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extract } from "../../../mcp/lib/fingerprint/extractors/npm.js";

describe("npm extractor", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "npm-x-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("returns empty when no package.json", () => {
    assert.deepStrictEqual(extract(dir), { packages: [], evidence: [] });
  });

  it("extracts direct deps with lockfile-resolved versions", () => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({
      dependencies: { react: "^18.0.0", next: "^14.0.0" },
      devDependencies: { typescript: "^5.0.0" },
    }));
    fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify({
      packages: {
        "": { name: "x" },
        "node_modules/react": { version: "18.3.1" },
        "node_modules/next":  { version: "14.2.3" },
        "node_modules/typescript": { version: "5.4.5" },
      },
    }));
    const { packages, evidence } = extract(dir);
    const purls = packages.map((p) => p.purl);
    assert.ok(purls.includes("pkg:npm/react@18.3.1"));
    assert.ok(purls.includes("pkg:npm/next@14.2.3"));
    assert.ok(purls.includes("pkg:npm/typescript@5.4.5"));
    assert.ok(packages.find((p) => p.purl.startsWith("pkg:npm/typescript"))?.scope === "dev");
    assert.ok(evidence.length > 0);
  });

  it("falls back to range-stripped version when no lockfile", () => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({
      dependencies: { react: "^18.2.0" },
    }));
    const { packages } = extract(dir);
    const p = packages.find((x) => x.purl.startsWith("pkg:npm/react"));
    assert.ok(p.purl, "pkg:npm/react@18.2.0");
    assert.ok(p.confidence < 1.0);
  });

  it("keeps scoped names intact", () => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({
      dependencies: { "@nestjs/core": "10.0.0" },
    }));
    const { packages } = extract(dir);
    const p = packages.find((x) => x.purl.includes("@nestjs/core"));
    assert.ok(p);
    assert.match(p.purl, /@nestjs\/core@/);
  });
});
