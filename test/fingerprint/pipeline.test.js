import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildFingerprintBody } from "../../mcp/lib/fingerprint/pipeline.js";

// The end-to-end pipeline: given a project dir with manifests + CI config,
// it emits a schema-conformant body whose facets + packages are enough to
// match against seeded archetypes.

describe("pipeline.buildFingerprintBody", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("emits a schema-valid body for a Rails project", () => {
    // Minimal Rails monorepo shape.
    fs.writeFileSync(path.join(dir, "Gemfile.lock"),
      `GEM
  remote: https://rubygems.org/
  specs:
    rails (8.1.3)
    pg (1.5.9)

DEPENDENCIES
  rails (~> 8.1.3)
  pg (~> 1.5)
`);
    fs.mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".github", "workflows", "ci.yml"), "name: ci\n");
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM ruby:3.4.9-slim\n");

    const { body, validationErrors } = buildFingerprintBody(dir, {
      detectedAt: "2026-04-15T12:00:00Z",
    });

    assert.deepStrictEqual(validationErrors, []);
    assert.strictEqual(body.fingerprint_version, "0.1.0");
    assert.ok(body.packages.some((p) => p.purl === "pkg:gem/rails@8.1.3"));
    assert.ok(body.facets.runtime?.some((v) => v.id === "otel:ruby"));
    assert.ok(body.facets.framework?.some((v) => v.id === "purl:pkg:gem/rails"));
    assert.ok(body.facets.ci_cd?.some((v) => v.id === "cncf:github-actions"));
    assert.ok(body.facets.container_build?.some((v) => v.id === "cncf:docker"));
  });

  it("emits a schema-valid body for a Next.js project", () => {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({
      dependencies: { next: "^14.0.0", react: "^18.0.0" },
    }));
    fs.writeFileSync(path.join(dir, "package-lock.json"), JSON.stringify({
      packages: {
        "node_modules/next":  { version: "14.2.3" },
        "node_modules/react": { version: "18.3.1" },
      },
    }));

    const { body, validationErrors } = buildFingerprintBody(dir);
    assert.deepStrictEqual(validationErrors, []);
    assert.ok(body.packages.some((p) => p.purl === "pkg:npm/next@14.2.3"));
    assert.ok(body.facets.framework?.some((v) => v.id === "purl:pkg:npm/next"));
    assert.ok(body.facets.runtime?.some((v) => v.id === "otel:nodejs"));
  });

  it("dedups packages across extractors by purl, keeping direct deps", () => {
    // Same repo has both Gemfile.lock and a minimal pyproject — extractors
    // shouldn't trip over each other.
    fs.writeFileSync(path.join(dir, "Gemfile.lock"),
      "GEM\n  specs:\n    rails (8.1.3)\n\nDEPENDENCIES\n  rails\n"
    );
    fs.writeFileSync(path.join(dir, "requirements.txt"), "django==5.0.3\n");
    const { body, validationErrors } = buildFingerprintBody(dir);
    assert.deepStrictEqual(validationErrors, []);
    assert.ok(body.packages.some((p) => p.purl.startsWith("pkg:gem/rails")));
    assert.ok(body.packages.some((p) => p.purl.startsWith("pkg:pypi/django")));
  });

  it("produces a usable body even on an empty project dir", () => {
    const { body, validationErrors } = buildFingerprintBody(dir);
    assert.deepStrictEqual(validationErrors, []);
    assert.strictEqual(body.packages.length, 0);
  });
});
