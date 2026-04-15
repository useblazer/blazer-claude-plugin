import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { makeHandler, _resetDeprecationNotice } from "../../mcp/tools/extract-stack-fingerprint.js";
import { PluginData } from "../../mcp/lib/plugin-data.js";

describe("extract_stack_fingerprint tool", () => {
  let tmpProject;
  let tmpData;
  let pluginData;
  let handler;

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "blazer-fp-tool-"));
    tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "blazer-fp-data-"));
    pluginData = new PluginData(tmpData);
    _resetDeprecationNotice();
    handler = makeHandler(pluginData);

    fs.writeFileSync(path.join(tmpProject, "package.json"), JSON.stringify({
      name: "test", dependencies: { express: "^4.0.0" }
    }));
  });

  afterEach(() => {
    fs.rmSync(tmpProject, { recursive: true, force: true });
    fs.rmSync(tmpData, { recursive: true, force: true });
  });

  it("returns consent prompt when consent not granted and not confirmed", async () => {
    const result = await handler({ project_dir: tmpProject });
    assert.ok(result.consent_required);
  });

  it("extracts fingerprint when consent_confirmed is true", async () => {
    const result = await handler({ project_dir: tmpProject, consent_confirmed: true });
    assert.ok(result.project_hash);
    assert.strictEqual(result.schema_version, "1");
    assert.ok(result.frameworks.some(f => f.name === "express"));
  });

  it("caches project context to plugin data", async () => {
    await handler({ project_dir: tmpProject, consent_confirmed: true });
    const cached = pluginData.readProjectContext();
    assert.ok(cached.project_hash);
  });

  it("skips consent prompt if consent file already exists", async () => {
    fs.mkdirSync(path.join(tmpProject, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(tmpProject, ".claude", "blazer-consent.json"), '{"granted_at":"2026-01-01"}');
    const result = await handler({ project_dir: tmpProject });
    assert.ok(result.project_hash);
  });

  it("emits a one-shot deprecation notice pointing at the new tools", async () => {
    const first = await handler({ project_dir: tmpProject, consent_confirmed: true });
    assert.ok(first.deprecation);
    assert.strictEqual(first.deprecation.code, "tool_deprecated");
    assert.ok(first.deprecation.replacement.includes("extract_fingerprint"));
    assert.ok(first.deprecation.replacement.includes("submit_fingerprint"));

    // Second call in the same process does NOT repeat the notice.
    const second = await handler({ project_dir: tmpProject });
    assert.strictEqual(second.deprecation, undefined);
  });
});
