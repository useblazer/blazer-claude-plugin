import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extract } from "../../../mcp/lib/fingerprint/extractors/spm.js";

describe("swift package manager extractor", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "spm-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("parses v2 Package.resolved at project root", () => {
    fs.writeFileSync(path.join(dir, "Package.resolved"), JSON.stringify({
      pins: [
        { identity: "alamofire", state: { version: "5.9.0" } },
        { identity: "firebase-ios-sdk", state: { version: "11.0.0" } }
      ],
      version: 2
    }));
    const { packages } = extract(dir);
    const purls = packages.map((p) => p.purl);
    assert.ok(purls.includes("pkg:swift/alamofire@5.9.0"));
    assert.ok(purls.includes("pkg:swift/firebase-ios-sdk@11.0.0"));
  });

  it("parses v1 Package.resolved with nested object.pins", () => {
    fs.writeFileSync(path.join(dir, "Package.resolved"), JSON.stringify({
      object: {
        pins: [
          { package: "Alamofire", state: { version: "5.9.0" } }
        ]
      },
      version: 1
    }));
    const { packages } = extract(dir);
    assert.ok(packages.some((p) => p.purl === "pkg:swift/Alamofire@5.9.0"));
  });

  it("finds Package.resolved inside .xcworkspace/xcshareddata/swiftpm/", () => {
    const nested = path.join(dir, "MyApp.xcworkspace", "xcshareddata", "swiftpm");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "Package.resolved"), JSON.stringify({
      pins: [{ identity: "snapkit", state: { version: "5.7.1" } }]
    }));
    const { packages } = extract(dir);
    assert.ok(packages.some((p) => p.purl === "pkg:swift/snapkit@5.7.1"));
  });

  it("returns empty when no Package.resolved anywhere", () => {
    assert.deepStrictEqual(extract(dir), { packages: [], evidence: [] });
  });
});
