import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extract } from "../../../mcp/lib/fingerprint/extractors/pip.js";

describe("pip extractor", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "pip-x-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("parses requirements.txt with pinned + unpinned entries", () => {
    fs.writeFileSync(path.join(dir, "requirements.txt"),
      "# top-level deps\ndjango==4.2.1\nfastapi>=0.100\nrequests[security]~=2.31  # inline\n"
    );
    const { packages } = extract(dir);
    const purls = packages.map((p) => p.purl);
    assert.ok(purls.includes("pkg:pypi/django@4.2.1"));
    assert.ok(purls.includes("pkg:pypi/fastapi"));
    assert.ok(purls.includes("pkg:pypi/requests"));

    const django = packages.find((p) => p.purl.startsWith("pkg:pypi/django"));
    assert.strictEqual(django.confidence, 1.0); // pinned

    const fastapi = packages.find((p) => p.purl === "pkg:pypi/fastapi");
    assert.strictEqual(fastapi.confidence, 0.7); // unpinned
  });

  it("parses PEP 621 pyproject dependencies", () => {
    fs.writeFileSync(path.join(dir, "pyproject.toml"),
      `[project]
name = "demo"
dependencies = [
  "django==5.0.3",
  "fastapi==0.110.0",
]
`
    );
    const { packages } = extract(dir);
    const purls = packages.map((p) => p.purl);
    assert.ok(purls.includes("pkg:pypi/django@5.0.3"));
    assert.ok(purls.includes("pkg:pypi/fastapi@0.110.0"));
  });

  it("parses poetry dependencies, excluding python itself", () => {
    fs.writeFileSync(path.join(dir, "pyproject.toml"),
      `[tool.poetry.dependencies]
python = "^3.11"
django = "^5.0"
gunicorn = "21.2.0"
`
    );
    const { packages } = extract(dir);
    const purls = packages.map((p) => p.purl);
    assert.ok(purls.some((p) => p.startsWith("pkg:pypi/django")));
    assert.ok(purls.some((p) => p.startsWith("pkg:pypi/gunicorn@21.2.0")));
    assert.ok(!purls.some((p) => p.startsWith("pkg:pypi/python")));
  });

  it("normalizes name capitalization + underscores per PEP 503", () => {
    fs.writeFileSync(path.join(dir, "requirements.txt"), "Flask_Login==0.6.3\n");
    const { packages } = extract(dir);
    assert.ok(packages[0].purl === "pkg:pypi/flask-login@0.6.3");
  });
});
