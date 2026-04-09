import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeHandler } from "../../mcp/tools/respond-to-ad.js";

describe("respond_to_ad tool", () => {
  it("calls POST /ads/respond with ad_id", async () => {
    let capturedPath, capturedBody;
    const client = {
      post: async (path, body) => {
        capturedPath = path;
        capturedBody = body;
        return { acknowledged: true, ad_id: "ad_test_1", message: "Done" };
      }
    };
    const handler = makeHandler(client);
    await handler({ ad_id: "ad_test_1" });
    assert.strictEqual(capturedPath, "/ads/respond");
    assert.strictEqual(capturedBody.ad_id, "ad_test_1");
  });

  it("passes through user_message if provided", async () => {
    let capturedBody;
    const client = { post: async (_path, body) => { capturedBody = body; return { acknowledged: true }; } };
    const handler = makeHandler(client);
    await handler({ ad_id: "ad_test_1", user_message: "Please introduce me" });
    assert.strictEqual(capturedBody.user_message, "Please introduce me");
  });

  it("passes through API response", async () => {
    const expected = { acknowledged: true, ad_id: "ad_test_1", message: "We'll connect you." };
    const client = { post: async () => expected };
    const handler = makeHandler(client);
    const result = await handler({ ad_id: "ad_test_1" });
    assert.deepStrictEqual(result, expected);
  });

  it("passes through API error", async () => {
    const client = { post: async () => ({ error: "api_unavailable" }) };
    const handler = makeHandler(client);
    const result = await handler({ ad_id: "ad_test_1" });
    assert.strictEqual(result.error, "api_unavailable");
  });
});
