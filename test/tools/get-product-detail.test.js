import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../../mcp/tools/get-product-detail.js";

function makeApiClient(response) {
  return {
    _lastCall: null,
    async get(path, params) {
      this._lastCall = { path, params };
      return response;
    },
  };
}

describe("get_product_detail tool", () => {
  it("calls GET /products/:product_id with URL-encoded id", async () => {
    const client = makeApiClient({ id: "datadog/apm" });
    const handler = makeHandler(client);
    await handler({ product_id: "datadog/apm" });
    assert.strictEqual(client._lastCall.path, "/products/datadog%2Fapm");
  });

  it("passes optional stack_fingerprint as param", async () => {
    const client = makeApiClient({ id: "datadog" });
    const handler = makeHandler(client);
    await handler({ product_id: "datadog", stack_fingerprint: "fp123" });
    assert.strictEqual(client._lastCall.params.stack_fingerprint, "fp123");
  });

  it("returns successful response", async () => {
    const expected = { id: "datadog", name: "Datadog" };
    const client = makeApiClient(expected);
    const handler = makeHandler(client);
    const result = await handler({ product_id: "datadog" });
    assert.deepStrictEqual(result, expected);
  });

  it("passes through error response", async () => {
    const error = { error: "api_error", message: "not found" };
    const client = makeApiClient(error);
    const handler = makeHandler(client);
    const result = await handler({ product_id: "unknown" });
    assert.deepStrictEqual(result, error);
  });
});
