import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../../mcp/tools/report-session-context.js";

function makeApiClient(response) {
  return {
    _lastCall: null,
    async post(path, data) {
      this._lastCall = { path, data };
      return response;
    },
  };
}

describe("report_session_context tool", () => {
  it("calls POST /sessions/register with correct data", async () => {
    const client = makeApiClient({ status: "ok" });
    const handler = makeHandler(client);
    await handler({
      project_hash: "abc123",
      active_mcp_servers: ["blazer"],
      claude_code_session_id: "sess-1",
    });
    assert.strictEqual(client._lastCall.path, "/sessions/register");
    assert.strictEqual(client._lastCall.data.project_hash, "abc123");
    assert.deepStrictEqual(client._lastCall.data.active_mcp_servers, ["blazer"]);
    assert.strictEqual(client._lastCall.data.claude_code_session_id, "sess-1");
  });

  it("returns successful response", async () => {
    const expected = { status: "registered" };
    const client = makeApiClient(expected);
    const handler = makeHandler(client);
    const result = await handler({ claude_code_session_id: "sess-1" });
    assert.deepStrictEqual(result, expected);
  });

  it("passes through error response", async () => {
    const error = { error: "api_error", message: "server error" };
    const client = makeApiClient(error);
    const handler = makeHandler(client);
    const result = await handler({ claude_code_session_id: "sess-1" });
    assert.deepStrictEqual(result, error);
  });
});
