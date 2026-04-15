import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extract } from "../../../mcp/lib/fingerprint/extractors/gradle.js";

describe("gradle extractor", () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "gradle-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("parses build.gradle (Groovy) string-literal deps", () => {
    fs.writeFileSync(path.join(dir, "build.gradle"), `
plugins { id 'java' }
dependencies {
  implementation 'org.springframework.boot:spring-boot-starter-web:3.2.0'
  implementation "com.fasterxml.jackson.core:jackson-databind:2.16.0"
  runtimeOnly 'com.h2database:h2:2.2.224'
  testImplementation 'org.junit.jupiter:junit-jupiter:5.10.1'
}
`);
    const { packages } = extract(dir);
    const purls = packages.map((p) => p.purl);
    assert.ok(purls.includes("pkg:maven/org.springframework.boot/spring-boot-starter-web@3.2.0"));
    assert.ok(purls.includes("pkg:maven/com.fasterxml.jackson.core/jackson-databind@2.16.0"));
    assert.ok(purls.includes("pkg:maven/com.h2database/h2@2.2.224"));

    const junit = packages.find((p) => p.purl.includes("junit-jupiter"));
    assert.strictEqual(junit.scope, "test");
  });

  it("parses build.gradle.kts (Kotlin DSL) deps", () => {
    fs.writeFileSync(path.join(dir, "build.gradle.kts"), `
dependencies {
  implementation("org.springframework.boot:spring-boot-starter:3.2.0")
  testImplementation("io.mockk:mockk:1.13.8")
}
`);
    const { packages } = extract(dir);
    assert.ok(packages.some((p) => p.purl === "pkg:maven/org.springframework.boot/spring-boot-starter@3.2.0"));
    assert.ok(packages.some((p) => p.purl === "pkg:maven/io.mockk/mockk@1.13.8"));
  });

  it("ignores version-catalog references it can't resolve", () => {
    fs.writeFileSync(path.join(dir, "build.gradle"), `
dependencies {
  implementation libs.spring.boot.starter.web
}
`);
    const { packages } = extract(dir);
    assert.deepStrictEqual(packages, []);
  });

  it("returns empty when no build.gradle variant present", () => {
    assert.deepStrictEqual(extract(dir), { packages: [], evidence: [] });
  });
});
