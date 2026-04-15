import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mapFacets } from "../../mcp/lib/fingerprint/facet-mapper.js";

describe("facet-mapper", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "facet-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("maps pkg:gem/rails to runtime=otel:ruby + framework=purl:pkg:gem/rails", () => {
    const { facets } = mapFacets({ projectDir: dir, packages: [{ purl: "pkg:gem/rails@8.1.3" }] });
    assert.ok(facets.runtime.some((v) => v.id === "otel:ruby"));
    assert.ok(facets.framework.some((v) => v.id === "purl:pkg:gem/rails"));
    assert.ok(facets.package_manager.some((v) => v.id === "cncf:bundler"));
  });

  it("maps pkg:npm/next to framework=purl:pkg:npm/next + runtime=otel:nodejs", () => {
    const { facets } = mapFacets({ projectDir: dir, packages: [{ purl: "pkg:npm/next@14.0.0" }] });
    assert.ok(facets.runtime.some((v) => v.id === "otel:nodejs"));
    assert.ok(facets.framework.some((v) => v.id === "purl:pkg:npm/next"));
  });

  it("maps presence of .github/workflows to ci_cd=cncf:github-actions", () => {
    const wfDir = path.join(dir, ".github", "workflows");
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, "ci.yml"), "name: ci\n");

    const { facets } = mapFacets({ projectDir: dir, packages: [] });
    assert.ok(facets.ci_cd?.some((v) => v.id === "cncf:github-actions"));
  });

  it("maps Dockerfile presence to container_build=cncf:docker", () => {
    fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM ruby:3.4.9-slim\n");
    const { facets } = mapFacets({ projectDir: dir, packages: [] });
    assert.ok(facets.container_build?.some((v) => v.id === "cncf:docker"));
  });

  it("does nothing when the matched directory is empty", () => {
    fs.mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
    const { facets } = mapFacets({ projectDir: dir, packages: [] });
    assert.ok(!facets.ci_cd);
  });

  it("dedupes values per facet when multiple rules contribute the same id", () => {
    const { facets } = mapFacets({
      projectDir: dir,
      packages: [{ purl: "pkg:gem/rails@8.1.3" }, { purl: "pkg:gem/activerecord@8.1.3" }],
    });
    const runtimes = facets.runtime.map((v) => v.id);
    assert.strictEqual(runtimes.filter((id) => id === "otel:ruby").length, 1);
  });
});
