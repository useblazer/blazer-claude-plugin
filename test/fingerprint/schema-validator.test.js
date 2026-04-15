import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, isValid } from "../../mcp/lib/fingerprint/schema-validator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function minimalBody() {
  return {
    fingerprint_version: "0.1.0",
    detected_at: "2026-04-15T12:00:00Z",
  };
}

describe("schema-validator", () => {
  it("accepts the checked-in example fingerprint", () => {
    const body = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../../docs/fingerprint/example-fingerprint.json"), "utf-8")
    );
    assert.deepStrictEqual(validate(body), []);
  });

  it("accepts the mobile example fingerprint", () => {
    const body = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../../docs/fingerprint/example-fingerprint-mobile.json"), "utf-8")
    );
    assert.deepStrictEqual(validate(body), []);
  });

  it("accepts a minimal valid body", () => {
    assert.ok(isValid(minimalBody()));
  });

  it("rejects missing required fingerprint_version", () => {
    const body = minimalBody();
    delete body.fingerprint_version;
    const errors = validate(body);
    assert.ok(errors.length > 0);
    assert.ok(errors.some((e) => e.message.includes("fingerprint_version")));
  });

  it("rejects wrong const for fingerprint_version", () => {
    const body = { ...minimalBody(), fingerprint_version: "0.2.0" };
    assert.ok(validate(body).length > 0);
  });

  it("rejects non-hex repo_hash", () => {
    const body = { ...minimalBody(), source: { hash_algorithm: "hmac-sha256", repo_hash: "not-a-hash" } };
    const errors = validate(body);
    assert.ok(errors.some((e) => e.path.includes("repo_hash")));
  });

  it("rejects unexpected top-level property", () => {
    const body = { ...minimalBody(), garbage: "nope" };
    assert.ok(validate(body).length > 0);
  });

  it("rejects facet value with unsupported prefix", () => {
    const body = { ...minimalBody(), facets: { runtime: [{ id: "mystery:foo" }] } };
    assert.ok(validate(body).length > 0);
  });
});
