// Composer (PHP) extractor — parses composer.lock (preferred; exact versions
// + direct/transitive distinction) or falls back to composer.json.
// Purls: pkg:composer/<vendor>/<name>@<version>.

import fs from "node:fs";
import path from "node:path";

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

function purl(name, version) {
  // Composer names are already vendor/name; strip a leading "v" off versions.
  const cleaned = version?.replace(/^v/, "");
  return cleaned ? `pkg:composer/${name}@${cleaned}` : `pkg:composer/${name}`;
}

export function extract(projectDir) {
  const lockPath = path.join(projectDir, "composer.lock");
  const jsonPath = path.join(projectDir, "composer.json");

  const lock = readJson(lockPath);
  const manifest = readJson(jsonPath);
  if (!lock && !manifest) return { packages: [], evidence: [] };

  const directNames = new Set();
  if (manifest?.require && typeof manifest.require === "object") {
    for (const n of Object.keys(manifest.require)) {
      if (n !== "php" && !n.startsWith("ext-")) directNames.add(n);
    }
  }

  const packages = [];
  const manifestPath = lock ? lockPath : jsonPath;

  if (lock) {
    for (const p of lock.packages || []) {
      packages.push({
        purl: purl(p.name, p.version),
        scope: "runtime",
        direct: directNames.has(p.name),
        manifest: path.relative(projectDir, lockPath) || "composer.lock",
        confidence: 1.0,
      });
    }
    for (const p of lock["packages-dev"] || []) {
      packages.push({
        purl: purl(p.name, p.version),
        scope: "dev",
        direct: false, // composer.lock dev-require is flattened; skip direct-tagging
        manifest: path.relative(projectDir, lockPath) || "composer.lock",
        confidence: 1.0,
      });
    }
  } else {
    for (const name of directNames) {
      const constraint = manifest.require[name];
      const versionMatch = constraint?.match(/(\d+(?:\.\d+){0,2}(?:-[A-Za-z0-9.-]+)?)/);
      packages.push({
        purl: purl(name, versionMatch?.[1] || null),
        scope: "runtime",
        direct: true,
        manifest: path.relative(projectDir, jsonPath) || "composer.json",
        confidence: versionMatch ? 0.85 : 0.6,
      });
    }
  }

  const evidence = packages.length ? [{
    type: "manifest",
    source: path.relative(projectDir, manifestPath) || path.basename(manifestPath),
    matched: path.basename(manifestPath),
    supports: ["package_manager", "runtime"],
  }] : [];

  return { packages, evidence };
}
