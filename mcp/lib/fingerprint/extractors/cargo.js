// Cargo extractor — reads Cargo.toml [dependencies] + [dev-dependencies]
// tables. Purls: pkg:cargo/<name>@<version>.
//
// Like the pip extractor, this does NOT do full TOML parsing. It scans
// for the known tables and extracts name = "version" lines. Good enough
// to flag Rust projects and populate common archetypes.

import fs from "node:fs";
import path from "node:path";

function purl(name, version) {
  return version ? `pkg:cargo/${name}@${version}` : `pkg:cargo/${name}`;
}

function* sectionEntries(contents, sectionHeader) {
  const header = `[${sectionHeader}]`;
  let inSection = false;
  for (const line of contents.split(/\r?\n/)) {
    if (line.trim() === header) { inSection = true; continue; }
    if (!inSection) continue;
    if (/^\s*\[/.test(line)) return; // next table
    // name = "version" OR name = { version = "...", ... }
    const inline = line.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*"([^"]+)"/);
    if (inline) { yield { name: inline[1], version: inline[2] }; continue; }
    const table  = line.match(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/);
    if (table)  { yield { name: table[1], version: table[2] }; }
  }
}

export function extract(projectDir) {
  const cargoPath = path.join(projectDir, "Cargo.toml");
  let contents;
  try { contents = fs.readFileSync(cargoPath, "utf-8"); } catch { return { packages: [], evidence: [] }; }

  const packages = [];
  for (const { name, version } of sectionEntries(contents, "dependencies")) {
    packages.push({
      purl: purl(name, version),
      scope: "runtime",
      direct: true,
      manifest: path.relative(projectDir, cargoPath) || "Cargo.toml",
      confidence: 0.95,
    });
  }
  for (const { name, version } of sectionEntries(contents, "dev-dependencies")) {
    packages.push({
      purl: purl(name, version),
      scope: "dev",
      direct: true,
      manifest: path.relative(projectDir, cargoPath) || "Cargo.toml",
      confidence: 0.95,
    });
  }

  const evidence = packages.length ? [{
    type: "manifest",
    source: path.relative(projectDir, cargoPath) || "Cargo.toml",
    matched: "Cargo.toml#dependencies",
    supports: ["package_manager", "runtime", "build_system"],
  }] : [];

  return { packages, evidence };
}
