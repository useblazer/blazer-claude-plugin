import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../../mcp/tools/select-archetype.js";

function makeApiClient(response) {
  return {
    _lastCall: null,
    async post(path, body) {
      this._lastCall = { path, body };
      return response;
    },
  };
}

describe("select_archetype tool", () => {
  it("POSTs answers and schema_version to /greenfield/recommend", async () => {
    const client = makeApiClient({
      selection_id: "gsel_abc",
      recommendation: { archetype_slug: "nextjs-app" },
      alternatives: [],
      schema_version: 1,
    });
    const handler = makeHandler(client);
    const result = await handler({
      answers: { ui_surface: "web_app", language: "typescript" },
      schema_version: 1,
    });
    assert.strictEqual(client._lastCall.path, "/greenfield/recommend");
    assert.deepStrictEqual(client._lastCall.body.answers, {
      ui_surface: "web_app",
      language: "typescript",
    });
    assert.strictEqual(client._lastCall.body.schema_version, 1);
    assert.strictEqual(result.selection_id, "gsel_abc");
  });

  it("passes through API errors", async () => {
    const error = { error: "api_error", message: "boom" };
    const client = makeApiClient(error);
    const handler = makeHandler(client);
    const result = await handler({ answers: {}, schema_version: 1 });
    assert.deepStrictEqual(result, error);
  });
});
