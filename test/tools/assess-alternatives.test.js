import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../../mcp/tools/assess-alternatives.js";

function makeApiClient(response) {
  return {
    _lastCall: null,
    async get(path, params) {
      this._lastCall = { path, params };
      return response;
    },
  };
}

describe("assess_alternatives tool", () => {
  it("calls GET /catalog/assess-alternatives with args as params", async () => {
    const client = makeApiClient({ alternatives: [] });
    const handler = makeHandler(client);
    await handler({ current_product_id: "datadog", stack_fingerprint: "fp123", max_results: 3 });
    assert.strictEqual(client._lastCall.path, "/catalog/assess-alternatives");
    assert.strictEqual(client._lastCall.params.current_product_id, "datadog");
    assert.strictEqual(client._lastCall.params.max_results, 3);
  });

  it("returns successful response", async () => {
    const expected = { alternatives: [{ id: "newrelic" }] };
    const client = makeApiClient(expected);
    const handler = makeHandler(client);
    const result = await handler({ stack_fingerprint: "fp123" });
    assert.deepStrictEqual(result, expected);
  });

  it("passes through error response", async () => {
    const error = { error: "api_error", message: "server error" };
    const client = makeApiClient(error);
    const handler = makeHandler(client);
    const result = await handler({ stack_fingerprint: "fp123" });
    assert.deepStrictEqual(result, error);
  });
});
