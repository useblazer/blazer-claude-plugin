import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../../mcp/tools/search-catalog.js";

function makeApiClient(response) {
  return {
    _lastCall: null,
    async get(path, params) {
      this._lastCall = { path, params };
      return response;
    },
  };
}

describe("search_catalog tool", () => {
  it("calls GET /catalog/search with correct params", async () => {
    const client = makeApiClient({ results: [] });
    const handler = makeHandler(client);
    await handler({ category: "analytics", max_results: 5 });
    assert.strictEqual(client._lastCall.path, "/catalog/search");
    assert.strictEqual(client._lastCall.params.category, "analytics");
    assert.strictEqual(client._lastCall.params.max_results, 5);
  });

  it("returns successful response", async () => {
    const expected = { results: [{ id: "datadog" }] };
    const client = makeApiClient(expected);
    const handler = makeHandler(client);
    const result = await handler({ category: "monitoring" });
    assert.deepStrictEqual(result, expected);
  });

  it("passes through error response", async () => {
    const error = { error: "api_error", message: "server error" };
    const client = makeApiClient(error);
    const handler = makeHandler(client);
    const result = await handler({ category: "monitoring" });
    assert.deepStrictEqual(result, error);
  });
});
