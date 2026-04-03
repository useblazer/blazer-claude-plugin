import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { computeProjectHash } from "../mcp/lib/project-hash.js";

describe("computeProjectHash", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "blazer-hash-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns sha256: prefixed hash", async () => {
    const hash = await computeProjectHash(tmpDir);
    assert.ok(hash.startsWith("sha256:"));
    assert.strictEqual(hash.length, 7 + 64);
  });

  it("returns stable hash for same directory", async () => {
    const hash1 = await computeProjectHash(tmpDir);
    const hash2 = await computeProjectHash(tmpDir);
    assert.strictEqual(hash1, hash2);
  });

  it("returns different hashes for different directories", async () => {
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "blazer-hash-test2-"));
    const hash1 = await computeProjectHash(tmpDir);
    const hash2 = await computeProjectHash(tmpDir2);
    assert.notStrictEqual(hash1, hash2);
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  });
});
