import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../../mcp/tools/record-archetype-outcome.js";

function makeApiClient(response) {
  return {
    _lastCall: null,
    async post(path, body) {
      this._lastCall = { path, body };
      return response;
    },
  };
}

describe("record_archetype_outcome tool", () => {
  it("POSTs to the correct selection-scoped path", async () => {
    const client = makeApiClient({ selection_id: "gsel_abc", outcome: "confirmed" });
    const handler = makeHandler(client);
    await handler({ selection_id: "gsel_abc", outcome: "confirmed" });
    assert.strictEqual(client._lastCall.path, "/archetype_selections/gsel_abc/outcome");
    assert.deepStrictEqual(client._lastCall.body, { outcome: "confirmed" });
  });

  it("URL-encodes the selection_id", async () => {
    const client = makeApiClient({});
    const handler = makeHandler(client);
    await handler({ selection_id: "gsel/with slash", outcome: "rejected" });
    assert.strictEqual(client._lastCall.path, "/archetype_selections/gsel%2Fwith%20slash/outcome");
  });

  it("rejects unknown outcomes without calling the API", async () => {
    const client = makeApiClient({});
    const handler = makeHandler(client);
    const result = await handler({ selection_id: "gsel_abc", outcome: "weird" });
    assert.strictEqual(result.error, "validation_error");
    assert.strictEqual(client._lastCall, null);
  });

  it("rejects missing selection_id without calling the API", async () => {
    const client = makeApiClient({});
    const handler = makeHandler(client);
    const result = await handler({ outcome: "confirmed" });
    assert.strictEqual(result.error, "validation_error");
    assert.strictEqual(client._lastCall, null);
  });
});
