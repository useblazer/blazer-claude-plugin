// Maven extractor — scans pom.xml for direct dependencies.
// Purls: pkg:maven/<groupId>/<artifactId>@<version>.
//
// We do NOT pull in an XML parser. The structure we need is a repeating
// <dependency>…</dependency> block, which a focused regex can extract
// reliably enough for a fingerprint (property resolution, parent POMs,
// and version ranges are out of scope — dynamic/unresolved versions just
// lower confidence).

import fs from "node:fs";
import path from "node:path";

function purl(group, artifact, version) {
  return version ? `pkg:maven/${group}/${artifact}@${version}` : `pkg:maven/${group}/${artifact}`;
}

function parsePom(contents) {
  const results = [];
  // Strip XML comments to avoid false matches inside <!-- --> blocks.
  const stripped = contents.replace(/<!--[\s\S]*?-->/g, "");
  for (const m of stripped.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const block = m[1];
    const group    = block.match(/<groupId>([^<]+)<\/groupId>/)?.[1]?.trim();
    const artifact = block.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1]?.trim();
    const version  = block.match(/<version>([^<]+)<\/version>/)?.[1]?.trim();
    const scope    = block.match(/<scope>([^<]+)<\/scope>/)?.[1]?.trim();
    if (!group || !artifact) continue;
    results.push({ group, artifact, version, scope });
  }
  return results;
}

const MVN_SCOPE_TO_BLAZER = {
  "test":     "test",
  "provided": "build",
  "runtime":  "runtime",
  "compile":  "runtime",
};

export function extract(projectDir) {
  const pomPath = path.join(projectDir, "pom.xml");
  let contents;
  try { contents = fs.readFileSync(pomPath, "utf-8"); } catch { return { packages: [], evidence: [] }; }

  const deps = parsePom(contents);
  const packages = deps.map((d) => {
    const propertyVersion = d.version?.startsWith("${");
    return {
      purl: purl(d.group, d.artifact, propertyVersion ? null : d.version),
      scope: MVN_SCOPE_TO_BLAZER[d.scope] || "runtime",
      direct: true,
      manifest: path.relative(projectDir, pomPath) || "pom.xml",
      confidence: propertyVersion ? 0.7 : 0.95, // ${property} — we don't resolve
    };
  });

  const evidence = packages.length ? [{
    type: "manifest",
    source: path.relative(projectDir, pomPath) || "pom.xml",
    matched: "pom.xml#dependencies",
    supports: ["package_manager", "runtime", "build_system"],
  }] : [];

  return { packages, evidence };
}
