// Cross-repo parity test for canonicalization + HMAC.
//
// The fixture at docs/fingerprint/fixtures/canonicalization.json is the
// contract between this plugin and blazer-rails. Both implementations
// MUST produce identical output for every input in the fixture — otherwise
// two users at the same tenant would produce different hashes for the
// same repo, silently breaking within-tenant correlation (ADR 0001).

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoUrl, commitSha, branch, hmacHex } from "../../mcp/lib/fingerprint/canonical.js";
import { buildSource } from "../../mcp/lib/fingerprint/hasher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Prefer the plugin-local copy (standalone CI — synced via
// scripts/sync-fixtures.mjs); fall back to the monorepo-relative path
// (default in-tree during co-development).
const PLUGIN_LOCAL_FIXTURE = path.resolve(__dirname, "../fixtures/canonicalization.json");
const MONOREPO_FIXTURE     = path.resolve(__dirname, "../../../docs/fingerprint/fixtures/canonicalization.json");

function resolveFixturePath() {
  if (fs.existsSync(PLUGIN_LOCAL_FIXTURE)) return PLUGIN_LOCAL_FIXTURE;
  if (fs.existsSync(MONOREPO_FIXTURE))     return MONOREPO_FIXTURE;
  return null;
}

describe("canonical (cross-repo fixture parity)", () => {
  let fixture;
  let key;

  before(() => {
    const fixturePath = resolveFixturePath();
    if (!fixturePath) {
      throw new Error(
        "Canonicalization fixture not found.\n" +
        "  - Monorepo mode: expected " + MONOREPO_FIXTURE + "\n" +
        "  - Standalone mode: run `node scripts/sync-fixtures.mjs` from " +
        "inside a monorepo checkout to copy it to " + PLUGIN_LOCAL_FIXTURE + "."
      );
    }
    fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
    key = Buffer.from(fixture.key.hex, "hex");
  });

  it("has a non-empty fixture", () => {
    assert.ok(Array.isArray(fixture.repo_urls) && fixture.repo_urls.length > 0);
    assert.ok(Array.isArray(fixture.commit_shas) && fixture.commit_shas.length > 0);
    assert.ok(Array.isArray(fixture.branches) && fixture.branches.length > 0);
  });

  it("every repo_url fixture entry canonicalizes + hashes to expected values", () => {
    for (const entry of fixture.repo_urls) {
      const canonical = repoUrl(entry.input);
      assert.strictEqual(
        canonical,
        entry.canonical,
        `repo_url canonical mismatch for ${JSON.stringify(entry.input)}`
      );
      assert.strictEqual(
        hmacHex(key, canonical),
        entry.hash,
        `repo_url hash mismatch for ${JSON.stringify(entry.input)}`
      );
    }
  });

  it("every commit_sha fixture entry canonicalizes + hashes to expected values", () => {
    for (const entry of fixture.commit_shas) {
      const canonical = commitSha(entry.input);
      assert.strictEqual(canonical, entry.canonical);
      assert.strictEqual(hmacHex(key, canonical), entry.hash);
    }
  });

  it("every branch fixture entry canonicalizes + hashes to expected values", () => {
    for (const entry of fixture.branches) {
      const canonical = branch(entry.input);
      assert.strictEqual(canonical, entry.canonical);
      assert.strictEqual(hmacHex(key, canonical), entry.hash);
    }
  });
});

describe("canonical (input validation)", () => {
  it("repoUrl rejects nil and empty", () => {
    assert.throws(() => repoUrl(null), /non-empty/);
    assert.throws(() => repoUrl(""), /non-empty/);
    assert.throws(() => repoUrl("   "), /non-empty/);
  });

  it("commitSha rejects non-hex and wrong length", () => {
    assert.throws(() => commitSha("abcd"), /40 hex/);
    assert.throws(() => commitSha("g".repeat(40)), /40 hex/);
    assert.throws(() => commitSha(null), /non-empty/);
  });

  it("branch rejects empty", () => {
    assert.throws(() => branch(""), /non-empty/);
    assert.throws(() => branch(null), /non-empty/);
  });

  it("hmacHex is stable for same key/value", () => {
    const k = Buffer.alloc(32, 0x01);
    const a = hmacHex(k, "https://github.com/foo/bar");
    const b = hmacHex(k, "https://github.com/foo/bar");
    assert.strictEqual(a, b);
    assert.match(a, /^[a-f0-9]{64}$/);
  });
});

describe("buildSource", () => {
  it("produces hashed source block matching fingerprint schema", () => {
    const key = Buffer.alloc(32, 0x42);
    const source = buildSource({
      key,
      keyVersion: 3,
      repoUrl: "git@github.com:foo/bar.git",
      commit: "abcdef0123456789abcdef0123456789abcdef01",
      branchName: "main",
      detector: "blazer-claude-plugin",
      detectorVersion: "0.4.0",
    });

    assert.strictEqual(source.hash_algorithm, "hmac-sha256");
    assert.strictEqual(source.key_version, 3);
    assert.strictEqual(source.detector, "blazer-claude-plugin");
    assert.strictEqual(source.detector_version, "0.4.0");
    assert.match(source.repo_hash, /^[a-f0-9]{64}$/);
    assert.match(source.commit_hash, /^[a-f0-9]{64}$/);
    assert.match(source.branch_hash, /^[a-f0-9]{64}$/);
  });

  it("omits optional hashes when inputs are absent", () => {
    const source = buildSource({
      key: Buffer.alloc(32),
      keyVersion: 1,
    });
    assert.strictEqual(source.repo_hash, undefined);
    assert.strictEqual(source.commit_hash, undefined);
    assert.strictEqual(source.branch_hash, undefined);
    assert.strictEqual(source.detector, undefined);
  });

  it("stays byte-identical to blazer-rails output for a known key + inputs", () => {
    // Regression fixture: if buildSource drifts, the failure surfaces here
    // before shipping. These expected values were produced with the Ruby
    // lib against the same key (hex 42..42).
    const key = Buffer.from("42".repeat(32), "hex");
    const source = buildSource({
      key,
      keyVersion: 1,
      repoUrl: "https://github.com/foo/bar",
      commit: "abcdef0123456789abcdef0123456789abcdef01",
      branchName: "main",
    });
    assert.strictEqual(source.repo_hash,   "4ddab11c60ae2f1e274fb6c913c90213d19d5417197d6b4a67a6d44075e8e3a9");
    assert.strictEqual(source.commit_hash, "c9d9a7f68f43e9bd60400a0344d0c5ca6eafc0556c4b10269cc1436f661b5440");
    assert.strictEqual(source.branch_hash, "9de0ffa8ca7b779e7d82004093619f5c2fe9933549fa65750aece00f5b2a5658");
  });
});
