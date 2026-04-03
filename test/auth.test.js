import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Auth } from "../mcp/auth.js";

describe("Auth", () => {
  it("returns auth_required when no key is set", () => {
    const auth = new Auth(undefined, "https://api.example.com");
    const result = auth.check();
    assert.strictEqual(result.error, "auth_required");
    assert.ok(result.signup_url);
  });

  it("returns auth_required for empty string key", () => {
    const auth = new Auth("", "https://api.example.com");
    const result = auth.check();
    assert.strictEqual(result.error, "auth_required");
  });

  it("returns auth_invalid_format for key without sk-bzr_ prefix", () => {
    const auth = new Auth("bad-key-format", "https://api.example.com");
    const result = auth.check();
    assert.strictEqual(result.error, "auth_invalid_format");
  });

  it("returns ok for correctly formatted key", () => {
    const auth = new Auth("sk-bzr_test123", "https://api.example.com");
    const result = auth.check();
    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.ok, true);
  });

  it("caches auth failure after setFailed()", () => {
    const auth = new Auth("sk-bzr_test123", "https://api.example.com");
    assert.strictEqual(auth.check().ok, true);
    auth.setFailed("Invalid API key");
    const result = auth.check();
    assert.strictEqual(result.error, "auth_failed");
  });

  it("returns headers with Bearer token", () => {
    const auth = new Auth("sk-bzr_test123", "https://api.example.com");
    const headers = auth.headers();
    assert.strictEqual(headers["Authorization"], "Bearer sk-bzr_test123");
  });

  it("uses default API URL when none provided", () => {
    const auth = new Auth("sk-bzr_test123");
    assert.strictEqual(auth.apiUrl, "https://api.userblazer.ai/v1");
  });
});
