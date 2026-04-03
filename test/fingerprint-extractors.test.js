import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { extractFingerprint } from "../mcp/lib/fingerprint-extractors.js";

const FIXTURES = path.join(import.meta.dirname, "fixtures", "sample-project");

describe("extractFingerprint", () => {
  it("detects languages from package.json", async () => {
    const fp = await extractFingerprint(FIXTURES);
    const names = fp.languages.map(l => l.name);
    assert.ok(names.includes("javascript"));
  });

  it("detects frameworks from dependencies", async () => {
    const fp = await extractFingerprint(FIXTURES);
    const names = fp.frameworks.map(f => f.name);
    assert.ok(names.includes("express"));
    assert.ok(names.includes("react"));
  });

  it("detects cloud provider from terraform", async () => {
    const fp = await extractFingerprint(FIXTURES);
    assert.strictEqual(fp.cloud.provider, "aws");
  });

  it("detects compute from terraform resources", async () => {
    const fp = await extractFingerprint(FIXTURES);
    assert.ok(fp.cloud.compute.includes("ecs"));
  });

  it("detects databases from terraform", async () => {
    const fp = await extractFingerprint(FIXTURES);
    assert.ok(fp.databases.some(d => d.type === "postgresql"));
  });

  it("detects CI/CD platform", async () => {
    const fp = await extractFingerprint(FIXTURES);
    assert.strictEqual(fp.ci_cd.platform, "github-actions");
  });

  it("detects existing integrations from known SDKs", async () => {
    const fp = await extractFingerprint(FIXTURES);
    const products = fp.existing_integrations.map(i => i.product);
    assert.ok(products.includes("sentry"));
    assert.ok(products.includes("stripe"));
    assert.ok(products.includes("auth0"));
  });

  it("returns schema_version", async () => {
    const fp = await extractFingerprint(FIXTURES);
    assert.strictEqual(fp.schema_version, "1");
  });

  it("detects cloud regions from terraform", async () => {
    const fp = await extractFingerprint(FIXTURES);
    assert.ok(fp.cloud.regions.includes("us-east-1"));
  });
});
