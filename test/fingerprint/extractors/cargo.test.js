import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extract } from "../../../mcp/lib/fingerprint/extractors/cargo.js";

describe("cargo extractor", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "cargo-x-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("parses simple + table dependencies", () => {
    fs.writeFileSync(path.join(dir, "Cargo.toml"),
      `[package]
name = "demo"
version = "0.1.0"

[dependencies]
serde = "1.0.195"
tokio = { version = "1.37.0", features = ["full"] }

[dev-dependencies]
mockito = "1.2"
`
    );
    const { packages } = extract(dir);
    const purls = packages.map((p) => p.purl);
    assert.ok(purls.includes("pkg:cargo/serde@1.0.195"));
    assert.ok(purls.includes("pkg:cargo/tokio@1.37.0"));
    assert.ok(purls.includes("pkg:cargo/mockito@1.2"));

    const mockito = packages.find((p) => p.purl.startsWith("pkg:cargo/mockito"));
    assert.strictEqual(mockito.scope, "dev");
  });

  it("returns empty for projects without Cargo.toml", () => {
    assert.deepStrictEqual(extract(dir), { packages: [], evidence: [] });
  });
});
