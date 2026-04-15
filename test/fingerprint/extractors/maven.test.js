import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extract } from "../../../mcp/lib/fingerprint/extractors/maven.js";

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>demo</artifactId>
  <version>1.0.0</version>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
      <version>3.2.0</version>
    </dependency>
    <dependency>
      <groupId>org.junit.jupiter</groupId>
      <artifactId>junit-jupiter</artifactId>
      <version>5.10.1</version>
      <scope>test</scope>
    </dependency>
    <!-- commented out; should not match
    <dependency>
      <groupId>ignored</groupId><artifactId>ghost</artifactId><version>0.0.0</version>
    </dependency>
    -->
    <dependency>
      <groupId>com.example</groupId>
      <artifactId>resolved-later</artifactId>
      <version>\${some.version}</version>
    </dependency>
  </dependencies>
</project>
`;

describe("maven extractor", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "maven-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("returns empty without pom.xml", () => {
    assert.deepStrictEqual(extract(dir), { packages: [], evidence: [] });
  });

  it("parses direct dependencies with group/artifact/version", () => {
    fs.writeFileSync(path.join(dir, "pom.xml"), SAMPLE);
    const { packages } = extract(dir);
    const purls = packages.map((p) => p.purl);
    assert.ok(purls.includes("pkg:maven/org.springframework.boot/spring-boot-starter-web@3.2.0"));
    assert.ok(purls.includes("pkg:maven/org.junit.jupiter/junit-jupiter@5.10.1"));

    const junit = packages.find((p) => p.purl.includes("junit-jupiter"));
    assert.strictEqual(junit.scope, "test");
  });

  it("skips dependencies inside XML comments", () => {
    fs.writeFileSync(path.join(dir, "pom.xml"), SAMPLE);
    const { packages } = extract(dir);
    assert.ok(!packages.some((p) => p.purl.includes("ignored/ghost")));
  });

  it("emits unresolved property versions as version-less purls with lower confidence", () => {
    fs.writeFileSync(path.join(dir, "pom.xml"), SAMPLE);
    const { packages } = extract(dir);
    const resolvedLater = packages.find((p) => p.purl.includes("resolved-later"));
    assert.strictEqual(resolvedLater.purl, "pkg:maven/com.example/resolved-later");
    assert.ok(resolvedLater.confidence < 0.9);
  });
});
