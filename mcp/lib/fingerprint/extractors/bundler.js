// Bundler extractor — parses Gemfile.lock for exact versions and marks
// direct deps (those in the DEPENDENCIES section).

import fs from "node:fs";
import path from "node:path";

function purl(name, version) {
  return version ? `pkg:gem/${name}@${version}` : `pkg:gem/${name}`;
}

function parseLockfile(contents) {
  // Minimal Gemfile.lock parser.
  //
  // Gems live under `GEM:` then an indented `specs:` block where each
  // spec is `  name (version)` at 4-space indent, with dependencies at
  // 6-space indent that we skip.
  //
  // Direct deps live under the `DEPENDENCIES` section at 2-space indent.
  const lines = contents.split(/\r?\n/);
  const gems = new Map();      // name -> version
  const direct = new Set();
  let section = null;

  for (const line of lines) {
    if (/^[A-Z_]+$/.test(line.trim()) && !line.startsWith(" ")) {
      section = line.trim();
      continue;
    }

    if (section === "GEM" || section === "PATH" || section === "GIT") {
      // A spec line: exactly 4 spaces then `name (version)`
      const m = line.match(/^    ([A-Za-z0-9._-]+) \(([^)]+)\)\s*$/);
      if (m) gems.set(m[1], m[2]);
    } else if (section === "DEPENDENCIES") {
      // `  name` or `  name (~> 1.0)` at 2-space indent
      const m = line.match(/^  ([A-Za-z0-9._-]+)/);
      if (m) direct.add(m[1]);
    }
  }
  return { gems, direct };
}

export function extract(projectDir) {
  const lockPath = path.join(projectDir, "Gemfile.lock");
  const contents = (() => { try { return fs.readFileSync(lockPath, "utf-8"); } catch { return null; } })();
  if (!contents) return { packages: [], evidence: [] };

  const { gems, direct } = parseLockfile(contents);
  const packages = [];
  for (const [name, version] of gems) {
    packages.push({
      purl: purl(name, version),
      scope: "runtime",
      direct: direct.has(name),
      manifest: path.relative(projectDir, lockPath) || "Gemfile.lock",
      confidence: 1.0,
    });
  }

  const evidence = packages.length ? [{
    type: "manifest",
    source: path.relative(projectDir, lockPath) || "Gemfile.lock",
    matched: "Gemfile.lock",
    supports: ["package_manager", "runtime"],
  }] : [];

  return { packages, evidence };
}
