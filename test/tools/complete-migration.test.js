import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { makeHandler } from "../../mcp/tools/complete-migration.js";
import { PluginData } from "../../mcp/lib/plugin-data.js";

function makeApiClient(response) {
  return {
    _lastCall: null,
    async post(path, data) {
      this._lastCall = { path, data };
      return response;
    },
  };
}

describe("complete_migration tool", () => {
  let tmpData;
  let pluginData;

  beforeEach(() => {
    tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "blazer-complete-mig-"));
    pluginData = new PluginData(tmpData);
    // Pre-populate active session
    pluginData.writeActiveSession({ journey_id: "j1", session_id: "s1", product_id: "newrelic" });
  });

  afterEach(() => {
    fs.rmSync(tmpData, { recursive: true, force: true });
  });

  it("calls POST /migrations/complete with args", async () => {
    const client = makeApiClient({ status: "completed" });
    const handler = makeHandler(client, pluginData);
    await handler({ journey_id: "j1", outcome: "success" });
    assert.strictEqual(client._lastCall.path, "/migrations/complete");
    assert.strictEqual(client._lastCall.data.journey_id, "j1");
  });

  it("clears active-session.json on success", async () => {
    const client = makeApiClient({ status: "completed" });
    const handler = makeHandler(client, pluginData);
    await handler({ journey_id: "j1", outcome: "success" });
    const session = pluginData.readActiveSession();
    assert.strictEqual(session, null);
  });

  it("does not clear active-session.json on error", async () => {
    const client = makeApiClient({ error: "api_error", message: "failed" });
    const handler = makeHandler(client, pluginData);
    await handler({ journey_id: "j1", outcome: "success" });
    const session = pluginData.readActiveSession();
    assert.ok(session);
    assert.strictEqual(session.journey_id, "j1");
  });

  it("returns the API response", async () => {
    const expected = { status: "completed" };
    const client = makeApiClient(expected);
    const handler = makeHandler(client, pluginData);
    const result = await handler({ journey_id: "j1", outcome: "success" });
    assert.deepStrictEqual(result, expected);
  });
});
