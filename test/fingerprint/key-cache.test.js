import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KeyCache } from "../../mcp/lib/fingerprint/key-cache.js";

describe("KeyCache", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "blazer-keycache-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  function make() { return new KeyCache({ dir }); }

  it("read() returns null when no cache file", () => {
    assert.strictEqual(make().read(), null);
  });

  it("write() creates file with 0600 perms and round-trips values", () => {
    const c = make();
    c.write({ tenant_hash_key_b64u: "QkI", tenant_hash_key_version: 2 });
    const r = c.read();
    assert.strictEqual(r.tenant_hash_key_version, 2);
    assert.strictEqual(r.tenant_hash_key_b64u, "QkI");

    const stat = fs.statSync(c.path);
    // 0o600 = 0o100600 when mode includes file-type bits — mask to perms.
    assert.strictEqual(stat.mode & 0o777, 0o600);
  });

  it("write() preserves unrelated fields (e.g. api_key)", () => {
    const c = make();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(c.path, JSON.stringify({ api_key: "sk-bzr_test" }));
    c.write({ tenant_hash_key_b64u: "X", tenant_hash_key_version: 1 });
    const parsed = JSON.parse(fs.readFileSync(c.path, "utf-8"));
    assert.strictEqual(parsed.api_key, "sk-bzr_test");
    assert.strictEqual(parsed.tenant_hash_key_version, 1);
  });

  it("read() returns null when the hash-key fields are absent", () => {
    const c = make();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(c.path, JSON.stringify({ api_key: "sk-bzr_test" }));
    assert.strictEqual(c.read(), null);
  });

  it("clear() removes hash key fields without deleting api_key", () => {
    const c = make();
    c.write({ tenant_hash_key_b64u: "Zm9v", tenant_hash_key_version: 3, api_key: "sk-bzr_keep" });
    c.clear();
    const parsed = JSON.parse(fs.readFileSync(c.path, "utf-8"));
    assert.strictEqual(parsed.api_key, "sk-bzr_keep");
    assert.strictEqual(parsed.tenant_hash_key_b64u, undefined);
  });

  it("keyBytes() decodes base64url back to raw bytes", () => {
    const c = make();
    const raw = Buffer.alloc(32, 0xab);
    const b64u = raw.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    c.write({ tenant_hash_key_b64u: b64u, tenant_hash_key_version: 1 });
    assert.deepStrictEqual(c.keyBytes(), raw);
  });

  it("read() returns null for malformed JSON", () => {
    const c = make();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(c.path, "not-json");
    assert.strictEqual(c.read(), null);
  });
});
