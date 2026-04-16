import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SCRIPTS_DIR = path.join(import.meta.dirname, "..", "scripts");

/**
 * Run a Node.js hook script with JSON piped to stdin.
 * Works cross-platform (no bash dependency).
 */
function runHookScript(scriptName, inputJson, env) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  return execSync(`node "${scriptPath}"`, {
    input: typeof inputJson === "string" ? inputJson : JSON.stringify(inputJson),
    env: { ...process.env, ...env },
    timeout: 10000,
  });
}

describe("hook scripts", () => {
  let tmpData;
  let tmpProject;

  beforeEach(() => {
    tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "blazer-hook-test-data-"));
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), "blazer-hook-test-proj-"));
  });

  afterEach(() => {
    fs.rmSync(tmpData, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  describe("session-start.js", () => {
    it("creates current-session.json from stdin", () => {
      runHookScript("session-start.js", { session_id: "sess_test1", cwd: tmpProject }, {
        CLAUDE_PLUGIN_DATA: tmpData, BLAZER_API_KEY: "", BLAZER_API_URL: "",
      });
      const session = JSON.parse(fs.readFileSync(path.join(tmpData, "current-session.json"), "utf-8"));
      assert.strictEqual(session.session_id, "sess_test1");
      assert.ok(session.project_hash.startsWith("sha256:"));
      assert.ok(session.started_at);
    });

    it("does not call API when no consent file exists", () => {
      // This test just verifies it exits cleanly without consent
      runHookScript("session-start.js", { session_id: "sess_test2", cwd: tmpProject }, {
        CLAUDE_PLUGIN_DATA: tmpData, BLAZER_API_KEY: "sk-bzr_test", BLAZER_API_URL: "",
      });
      // If we got here without error, the script handled missing consent gracefully
      assert.ok(true);
    });
  });

  describe("telemetry-pre.js", () => {
    it("appends to telemetry JSONL when active session exists", () => {
      // Set up active session
      fs.writeFileSync(path.join(tmpData, "active-session.json"), JSON.stringify({
        journey_id: "jrny_test1", session_id: "sess_1", product_id: "mixpanel"
      }));
      fs.writeFileSync(path.join(tmpData, "current-session.json"), JSON.stringify({
        session_id: "sess_1", project_hash: "sha256:abc"
      }));

      runHookScript("telemetry-pre.js", { tool_name: "mcp__mixpanel__track", tool_input: { event: "test" } }, {
        CLAUDE_PLUGIN_DATA: tmpData,
      });

      const telemetryFile = path.join(tmpData, "telemetry-jrny_test1.jsonl");
      assert.ok(fs.existsSync(telemetryFile));
      const line = fs.readFileSync(telemetryFile, "utf-8").trim();
      const event = JSON.parse(line);
      assert.strictEqual(event.event, "pre_tool_use");
      assert.strictEqual(event.journey_id, "jrny_test1");
      assert.strictEqual(event.tool_name, "mcp__mixpanel__track");
    });

    it("does nothing when no active session exists", () => {
      runHookScript("telemetry-pre.js", { tool_name: "mcp__test__foo", tool_input: {} }, {
        CLAUDE_PLUGIN_DATA: tmpData,
      });
      // No telemetry files should be created
      const files = fs.readdirSync(tmpData).filter(f => f.startsWith("telemetry-"));
      assert.strictEqual(files.length, 0);
    });
  });

  describe("telemetry-post.js", () => {
    it("detects product calls via tool name matching", () => {
      fs.writeFileSync(path.join(tmpData, "active-session.json"), JSON.stringify({
        journey_id: "jrny_test1", session_id: "sess_1", product_id: "mixpanel"
      }));
      fs.writeFileSync(path.join(tmpData, "current-session.json"), JSON.stringify({
        session_id: "sess_1"
      }));

      runHookScript("telemetry-post.js", { tool_name: "mcp__mixpanel__track_event", tool_input: {}, tool_response: {} }, {
        CLAUDE_PLUGIN_DATA: tmpData,
      });

      const line = fs.readFileSync(path.join(tmpData, "telemetry-jrny_test1.jsonl"), "utf-8").trim();
      const event = JSON.parse(line);
      assert.strictEqual(event.is_product_call, true);
      assert.strictEqual(event.success, true);
    });
  });

  describe("telemetry-post-failure.js", () => {
    it("records failure with error message", () => {
      fs.writeFileSync(path.join(tmpData, "active-session.json"), JSON.stringify({
        journey_id: "jrny_test1", session_id: "sess_1", product_id: "mixpanel"
      }));
      fs.writeFileSync(path.join(tmpData, "current-session.json"), JSON.stringify({
        session_id: "sess_1"
      }));

      runHookScript("telemetry-post-failure.js", { tool_name: "mcp__mixpanel__track", tool_response: { error: "timeout" } }, {
        CLAUDE_PLUGIN_DATA: tmpData,
      });

      const line = fs.readFileSync(path.join(tmpData, "telemetry-jrny_test1.jsonl"), "utf-8").trim();
      const event = JSON.parse(line);
      assert.strictEqual(event.success, false);
      assert.strictEqual(event.error, "timeout");
    });
  });
});
