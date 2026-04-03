import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { makeHandler } from "../../mcp/tools/begin-migration.js";
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

describe("begin_migration tool", () => {
  let tmpData;
  let pluginData;

  beforeEach(() => {
    tmpData = fs.mkdtempSync(path.join(os.tmpdir(), "blazer-begin-mig-"));
    pluginData = new PluginData(tmpData);
  });

  afterEach(() => {
    fs.rmSync(tmpData, { recursive: true, force: true });
  });

  it("calls POST /migrations/begin with args", async () => {
    const client = makeApiClient({ journey_id: "j1", session_id: "s1", to_product_id: "newrelic" });
    const handler = makeHandler(client, pluginData);
    await handler({ from_product_id: "datadog", to_product_id: "newrelic", project_hash: "abc" });
    assert.strictEqual(client._lastCall.path, "/migrations/begin");
    assert.strictEqual(client._lastCall.data.from_product_id, "datadog");
  });

  it("writes active-session.json with to_product_id as product_id on success", async () => {
    const client = makeApiClient({ journey_id: "j1", session_id: "s1", to_product_id: "newrelic" });
    const handler = makeHandler(client, pluginData);
    await handler({ from_product_id: "datadog", to_product_id: "newrelic", project_hash: "abc" });
    const session = pluginData.readActiveSession();
    assert.strictEqual(session.journey_id, "j1");
    assert.strictEqual(session.product_id, "newrelic");
  });

  it("does not write active-session.json on error", async () => {
    const client = makeApiClient({ error: "api_error", message: "failed" });
    const handler = makeHandler(client, pluginData);
    await handler({ from_product_id: "datadog", to_product_id: "newrelic", project_hash: "abc" });
    const session = pluginData.readActiveSession();
    assert.strictEqual(session, null);
  });

  it("returns the API response", async () => {
    const expected = { journey_id: "j1", session_id: "s1", to_product_id: "newrelic" };
    const client = makeApiClient(expected);
    const handler = makeHandler(client, pluginData);
    const result = await handler({ from_product_id: "datadog", to_product_id: "newrelic" });
    assert.deepStrictEqual(result, expected);
  });
});
