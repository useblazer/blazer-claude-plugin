// CocoaPods extractor — parses Podfile.lock. Purls: pkg:cocoapods/<name>@<version>.
//
// Podfile.lock is YAML-ish but structurally predictable. The `PODS:` list
// has entries like `- FirebaseAnalytics (11.0.0)` or `- Alamofire (5.9.0)`
// (transitive subdeps are indented further). `DEPENDENCIES:` has the
// user-declared ones without version ranges.

import fs from "node:fs";
import path from "node:path";

function purl(name, version) {
  return version ? `pkg:cocoapods/${name}@${version}` : `pkg:cocoapods/${name}`;
}

function parsePodfileLock(contents) {
  const pods = new Map();        // "Name" -> "version"
  const direct = new Set();
  let section = null;

  for (const line of contents.split(/\r?\n/)) {
    if (/^PODS:\s*$/.test(line))          { section = "pods"; continue; }
    if (/^DEPENDENCIES:\s*$/.test(line))  { section = "deps"; continue; }
    if (/^[A-Z_]+:\s*$/.test(line))       { section = null; continue; }

    if (section === "pods") {
      // Match 2-space indent, top-level entry: `  - Name (1.2.3)` or
      // `  - Name (1.2.3):` (followed by transitive deps).
      // Subpecs like `Name/Subspec (version)` take the root name for the purl.
      const m = line.match(/^  - ([^ /]+?)(?:\/[^ ]+)? \(([^)]+)\):?\s*$/);
      if (m) pods.set(m[1], m[2]);
    } else if (section === "deps") {
      // `  - Name` or `  - Name (~> 1.0)` — direct deps, version range noise ignored.
      const m = line.match(/^  - ([^ /]+?)(?:\/[^ ]+)?(?: \(.*?\))?\s*$/);
      if (m) direct.add(m[1]);
    }
  }
  return { pods, direct };
}

export function extract(projectDir) {
  const lockPath = path.join(projectDir, "Podfile.lock");
  let contents;
  try { contents = fs.readFileSync(lockPath, "utf-8"); } catch { return { packages: [], evidence: [] }; }

  const { pods, direct } = parsePodfileLock(contents);
  const packages = [];
  for (const [name, version] of pods) {
    packages.push({
      purl: purl(name, version),
      scope: "runtime",
      direct: direct.has(name),
      manifest: path.relative(projectDir, lockPath) || "Podfile.lock",
      confidence: 1.0,
    });
  }

  const evidence = packages.length ? [{
    type: "manifest",
    source: path.relative(projectDir, lockPath) || "Podfile.lock",
    matched: "Podfile.lock",
    supports: ["package_manager", "client_platform", "build_system"],
  }] : [];

  return { packages, evidence };
}
