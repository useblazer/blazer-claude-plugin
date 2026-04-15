// Gradle extractor — scans build.gradle / build.gradle.kts for declared
// dependencies. Purls: pkg:maven/<group>/<artifact>@<version>.
//
// This is intentionally shallow. Gradle is Turing-complete (Groovy/Kotlin
// DSL); we only recognize `implementation`, `api`, `runtimeOnly`,
// `testImplementation`, etc. declarations using the string-literal form
// ("group:artifact:version") or the named-argument form. Version catalogs
// (libs.foo.bar), dependencyManagement platforms, and dynamic version
// strings are out of scope — adding real Gradle parsing requires a JVM.
//
// Even this shallow pass is enough to trigger the Spring Boot archetype
// via facet-rules, which is the primary v1 use case for JVM detection.

import fs from "node:fs";
import path from "node:path";

const CONFIGS = {
  implementation:      { scope: "runtime",  direct: true },
  api:                 { scope: "runtime",  direct: true },
  compile:             { scope: "runtime",  direct: true },
  runtimeOnly:         { scope: "runtime",  direct: true },
  compileOnly:         { scope: "build",    direct: true },
  annotationProcessor: { scope: "build",    direct: true },
  testImplementation:  { scope: "test",     direct: true },
  testRuntimeOnly:     { scope: "test",     direct: true },
  testCompileOnly:     { scope: "test",     direct: true },
};

function purl(group, artifact, version) {
  return version ? `pkg:maven/${group}/${artifact}@${version}` : `pkg:maven/${group}/${artifact}`;
}

function scanFile(contents) {
  const hits = [];
  // Match configs followed by either ("g:a:v") OR ("g:a:v") with quotes swapped.
  for (const config of Object.keys(CONFIGS)) {
    const re = new RegExp(
      `\\b${config}\\s*[\\(]?\\s*["']([^"'\\s]+:[^"'\\s]+:[^"'\\s]+)["']`,
      "g"
    );
    for (const m of contents.matchAll(re)) {
      const [group, artifact, version] = m[1].split(":");
      if (group && artifact && version) hits.push({ config, group, artifact, version });
    }
  }
  return hits;
}

export function extract(projectDir) {
  const candidates = [
    path.join(projectDir, "build.gradle"),
    path.join(projectDir, "build.gradle.kts"),
  ];

  let contents = null, manifestPath = null;
  for (const p of candidates) {
    try { contents = fs.readFileSync(p, "utf-8"); manifestPath = p; break; } catch { /* try next */ }
  }
  if (!contents) return { packages: [], evidence: [] };

  const packages = [];
  for (const { config, group, artifact, version } of scanFile(contents)) {
    const meta = CONFIGS[config];
    packages.push({
      purl: purl(group, artifact, version),
      scope: meta.scope,
      direct: meta.direct,
      manifest: path.relative(projectDir, manifestPath) || path.basename(manifestPath),
      confidence: 0.9, // we don't execute the build script; dynamic versions slip through
    });
  }

  const evidence = packages.length ? [{
    type: "manifest",
    source: path.relative(projectDir, manifestPath) || path.basename(manifestPath),
    matched: path.basename(manifestPath),
    supports: ["package_manager", "runtime", "build_system"],
  }] : [];

  return { packages, evidence };
}
