import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extract } from "../../../mcp/lib/fingerprint/extractors/composer.js";

describe("composer extractor", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "composer-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("parses composer.lock packages and marks direct deps", () => {
    fs.writeFileSync(path.join(dir, "composer.json"), JSON.stringify({
      require: { "laravel/framework": "^11.0", "php": "^8.2" }
    }));
    fs.writeFileSync(path.join(dir, "composer.lock"), JSON.stringify({
      packages: [
        { name: "laravel/framework", version: "v11.0.3" },
        { name: "symfony/console",   version: "v7.0.4" }
      ],
      "packages-dev": [
        { name: "phpunit/phpunit", version: "10.5.0" }
      ]
    }));
    const { packages } = extract(dir);
    const purls = packages.map((p) => p.purl);
    assert.ok(purls.includes("pkg:composer/laravel/framework@11.0.3"));
    assert.ok(purls.includes("pkg:composer/symfony/console@7.0.4"));
    assert.ok(purls.includes("pkg:composer/phpunit/phpunit@10.5.0"));

    const laravel = packages.find((p) => p.purl.includes("laravel/framework"));
    assert.strictEqual(laravel.direct, true);

    const symfony = packages.find((p) => p.purl.includes("symfony/console"));
    assert.strictEqual(symfony.direct, false);
  });

  it("falls back to composer.json when no lockfile", () => {
    fs.writeFileSync(path.join(dir, "composer.json"), JSON.stringify({
      require: { "laravel/framework": "^11.0" }
    }));
    const { packages } = extract(dir);
    assert.strictEqual(packages.length, 1);
    assert.match(packages[0].purl, /laravel\/framework/);
  });

  it("returns empty when neither file exists", () => {
    assert.deepStrictEqual(extract(dir), { packages: [], evidence: [] });
  });

  it("strips leading v from versions", () => {
    fs.writeFileSync(path.join(dir, "composer.json"), JSON.stringify({ require: {} }));
    fs.writeFileSync(path.join(dir, "composer.lock"), JSON.stringify({
      packages: [{ name: "foo/bar", version: "v1.2.3" }]
    }));
    const { packages } = extract(dir);
    assert.strictEqual(packages[0].purl, "pkg:composer/foo/bar@1.2.3");
  });
});
