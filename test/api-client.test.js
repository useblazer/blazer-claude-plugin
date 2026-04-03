import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ApiClient } from "../mcp/api-client.js";
import { Auth } from "../mcp/auth.js";

describe("ApiClient", () => {
  let auth;

  beforeEach(() => {
    auth = new Auth("sk-bzr_test123", "https://api.example.com");
  });

  it("constructs with auth and version", () => {
    const client = new ApiClient(auth, "0.3.0");
    assert.ok(client);
  });

  it("builds full URL from path", () => {
    const client = new ApiClient(auth, "0.3.0");
    assert.strictEqual(client.url("/catalog/search"), "https://api.example.com/catalog/search");
  });

  it("includes plugin_version in request body", () => {
    const client = new ApiClient(auth, "0.3.0");
    const body = client.buildBody({ category: "analytics" });
    assert.strictEqual(body.plugin_version, "0.3.0");
    assert.strictEqual(body.category, "analytics");
  });

  it("marks auth as failed on 401 response", async () => {
    const client = new ApiClient(auth, "0.3.0");
    client._fetch = async () => ({ ok: false, status: 401, text: async () => "Unauthorized" });

    const result = await client.post("/journeys/begin", {});
    assert.strictEqual(result.error, "auth_failed");
    assert.strictEqual(auth.check().error, "auth_failed");
  });

  it("returns api_unavailable on network error", async () => {
    const client = new ApiClient(auth, "0.3.0");
    client._fetch = async () => { throw new Error("fetch failed"); };

    const result = await client.post("/journeys/begin", {});
    assert.strictEqual(result.error, "api_unavailable");
  });

  it("returns parsed JSON on success", async () => {
    const client = new ApiClient(auth, "0.3.0");
    const expected = { journey_id: "jrny_1" };
    client._fetch = async () => ({ ok: true, status: 200, json: async () => expected });

    const result = await client.post("/journeys/begin", {});
    assert.deepStrictEqual(result, expected);
  });

  it("get() uses GET method", async () => {
    const client = new ApiClient(auth, "0.3.0");
    let capturedMethod;
    client._fetch = async (url, opts) => {
      capturedMethod = opts.method;
      return { ok: true, status: 200, json: async () => ({}) };
    };

    await client.get("/products/mixpanel");
    assert.strictEqual(capturedMethod, "GET");
  });
});
