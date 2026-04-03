import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PluginData } from "../mcp/lib/plugin-data.js";

describe("PluginData", () => {
  let tmpDir;
  let pluginData;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "blazer-test-"));
    pluginData = new PluginData(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads and writes JSON files", () => {
    pluginData.writeJson("test.json", { foo: "bar" });
    const result = pluginData.readJson("test.json");
    assert.deepStrictEqual(result, { foo: "bar" });
  });

  it("returns null for missing files", () => {
    const result = pluginData.readJson("nonexistent.json");
    assert.strictEqual(result, null);
  });

  it("reads and writes active session", () => {
    const session = { journey_id: "jrny_1", session_id: "sess_1", product_id: "mixpanel" };
    pluginData.writeActiveSession(session);
    assert.deepStrictEqual(pluginData.readActiveSession(), session);
  });

  it("reads and writes project context", () => {
    const ctx = { project_hash: "sha256:abc123" };
    pluginData.writeProjectContext(ctx);
    assert.deepStrictEqual(pluginData.readProjectContext(), ctx);
  });

  it("clears active session", () => {
    pluginData.writeActiveSession({ journey_id: "jrny_1" });
    pluginData.clearActiveSession();
    assert.strictEqual(pluginData.readActiveSession(), null);
  });
});
