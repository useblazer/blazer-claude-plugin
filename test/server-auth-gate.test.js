import { describe, it } from "node:test";
import assert from "node:assert/strict";

// We can't easily test the full MCP server without stdio, but we can test checkAuth directly
// Import the function from server.js if it's exported, or test the Auth class behavior

import { Auth } from "../mcp/auth.js";

describe("Auth gate behavior", () => {
  it("blocks unauthenticated requests with auth_required", () => {
    const auth = new Auth("", "https://api.example.com");
    const result = auth.check();
    assert.strictEqual(result.error, "auth_required");
    assert.ok(result.signup_url);
    assert.ok(result.message);
  });

  it("allows authenticated requests", () => {
    const auth = new Auth("sk-bzr_test123", "https://api.example.com");
    const result = auth.check();
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.error, undefined);
  });

  it("blocks after auth failure is cached", () => {
    const auth = new Auth("sk-bzr_test123", "https://api.example.com");
    auth.setFailed("401 from server");
    const result = auth.check();
    assert.strictEqual(result.error, "auth_failed");
  });
});
