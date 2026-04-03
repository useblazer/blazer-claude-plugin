import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConsentManager } from "../mcp/lib/consent.js";

describe("ConsentManager", () => {
  let tmpDir;
  let consent;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "blazer-consent-test-"));
    fs.mkdirSync(path.join(tmpDir, ".claude"), { recursive: true });
    consent = new ConsentManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns false when no consent file exists", () => {
    assert.strictEqual(consent.hasConsent(), false);
  });

  it("grants consent and creates file", () => {
    consent.grant();
    assert.strictEqual(consent.hasConsent(), true);
    assert.ok(fs.existsSync(path.join(tmpDir, ".claude", "blazer-consent.json")));
  });

  it("consent file contains granted_at timestamp", () => {
    consent.grant();
    const data = JSON.parse(fs.readFileSync(path.join(tmpDir, ".claude", "blazer-consent.json"), "utf-8"));
    assert.ok(data.granted_at);
  });

  it("adds entry to .gitignore if not present", () => {
    consent.grant();
    const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    assert.ok(gitignore.includes(".claude/blazer-consent.json"));
  });

  it("does not duplicate .gitignore entry", () => {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), ".claude/blazer-consent.json\n");
    consent.grant();
    const gitignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    const count = gitignore.split(".claude/blazer-consent.json").length - 1;
    assert.strictEqual(count, 1);
  });
});
