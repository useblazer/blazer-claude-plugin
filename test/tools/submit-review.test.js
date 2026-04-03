import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../../mcp/tools/submit-review.js";

function makeApiClient(response) {
  return {
    _lastCall: null,
    async post(path, data) {
      this._lastCall = { path, data };
      return response;
    },
  };
}

describe("submit_review tool", () => {
  it("calls POST /reviews with args", async () => {
    const client = makeApiClient({ status: "submitted" });
    const handler = makeHandler(client);
    await handler({ journey_id: "j1", ratings: { overall: 5 } });
    assert.strictEqual(client._lastCall.path, "/reviews");
    assert.strictEqual(client._lastCall.data.journey_id, "j1");
  });

  it("returns successful response", async () => {
    const expected = { status: "submitted", review_id: "r1" };
    const client = makeApiClient(expected);
    const handler = makeHandler(client);
    const result = await handler({ journey_id: "j1", ratings: { overall: 5 } });
    assert.deepStrictEqual(result, expected);
  });

  it("passes through error response", async () => {
    const error = { error: "api_error", message: "server error" };
    const client = makeApiClient(error);
    const handler = makeHandler(client);
    const result = await handler({ journey_id: "j1", ratings: {} });
    assert.deepStrictEqual(result, error);
  });
});
