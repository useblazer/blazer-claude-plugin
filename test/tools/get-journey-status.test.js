import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../../mcp/tools/get-journey-status.js";

function makeApiClient(response) {
  return {
    _lastCall: null,
    async get(path, params) {
      this._lastCall = { path, params };
      return response;
    },
  };
}

describe("get_journey_status tool", () => {
  it("calls GET /journeys/status with correct params", async () => {
    const client = makeApiClient({ journeys: [] });
    const handler = makeHandler(client, null);
    await handler({ project_hash: "abc123", category: "analytics" });
    assert.strictEqual(client._lastCall.path, "/journeys/status");
    assert.strictEqual(client._lastCall.params.project_hash, "abc123");
    assert.strictEqual(client._lastCall.params.category, "analytics");
  });

  it("returns successful response", async () => {
    const expected = { journeys: [{ id: "j1" }] };
    const client = makeApiClient(expected);
    const handler = makeHandler(client, null);
    const result = await handler({ project_hash: "abc123" });
    assert.deepStrictEqual(result, expected);
  });

  it("returns error when no project_hash and no pluginData", async () => {
    const client = makeApiClient({});
    const handler = makeHandler(client, null);
    const result = await handler({});
    assert.strictEqual(result.error, "missing_project_hash");
  });

  it("reads project_hash from pluginData when not provided", async () => {
    const client = makeApiClient({ journeys: [] });
    const pluginData = { readProjectContext: () => ({ project_hash: "from-ctx" }) };
    const handler = makeHandler(client, pluginData);
    await handler({});
    assert.strictEqual(client._lastCall.params.project_hash, "from-ctx");
  });

  it("passes through error response", async () => {
    const error = { error: "api_error", message: "server error" };
    const client = makeApiClient(error);
    const handler = makeHandler(client, null);
    const result = await handler({ project_hash: "abc123" });
    assert.deepStrictEqual(result, error);
  });
});
