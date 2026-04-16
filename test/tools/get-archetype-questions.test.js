import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../../mcp/tools/get-archetype-questions.js";

function makeApiClient(response) {
  return {
    _lastCall: null,
    async get(path, params) {
      this._lastCall = { path, params };
      return response;
    },
  };
}

describe("get_archetype_questions tool", () => {
  it("calls GET /greenfield/schema", async () => {
    const client = makeApiClient({
      schema_version: 1,
      questions: [{ id: "ui_surface", label: "?", options: [] }],
    });
    const handler = makeHandler(client);
    const result = await handler();
    assert.strictEqual(client._lastCall.path, "/greenfield/schema");
    assert.strictEqual(result.schema_version, 1);
    assert.ok(Array.isArray(result.questions));
  });

  it("passes through API errors", async () => {
    const error = { error: "auth_failed", message: "no key" };
    const client = makeApiClient(error);
    const handler = makeHandler(client);
    const result = await handler();
    assert.deepStrictEqual(result, error);
  });
});
