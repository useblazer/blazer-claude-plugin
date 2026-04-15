// npm extractor — reads package.json (+ optionally package-lock.json)
// and emits purls + evidence.
//
// Purls use the format pkg:npm/<name>@<version>. Scoped names keep the
// leading @: pkg:npm/@scope/name@version (the fingerprint schema accepts
// either form; we pick the more readable one).

import fs from "node:fs";
import path from "node:path";

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

function purl(name, version) {
  return version ? `pkg:npm/${name}@${version}` : `pkg:npm/${name}`;
}

function resolveLockVersions(lock) {
  // npm v7+ package-lock.json has a `packages` map keyed by node_modules path;
  // the empty key is the root. Older lockfiles use `dependencies`.
  const versions = new Map();
  if (!lock) return versions;

  if (lock.packages && typeof lock.packages === "object") {
    for (const [k, v] of Object.entries(lock.packages)) {
      if (!k || !v?.version) continue;
      const name = k.split("node_modules/").pop();
      if (name) versions.set(name, v.version);
    }
  }
  if (lock.dependencies && typeof lock.dependencies === "object") {
    for (const [name, v] of Object.entries(lock.dependencies)) {
      if (v?.version && !versions.has(name)) versions.set(name, v.version);
    }
  }
  return versions;
}

function rangeToVersion(range) {
  // Best-effort stripping of semver range operators for the case where we
  // don't have a lockfile. Keeps "1.2.3" / "1.2" / "1" reasonably intact.
  if (!range || typeof range !== "string") return null;
  const m = range.match(/(\d+(?:\.\d+){0,2}(?:-[A-Za-z0-9.-]+)?)/);
  return m ? m[1] : null;
}

export function extract(projectDir) {
  const pkgPath = path.join(projectDir, "package.json");
  const pkg = readJson(pkgPath);
  if (!pkg) return { packages: [], evidence: [] };

  const lock = readJson(path.join(projectDir, "package-lock.json"));
  const lockVersions = resolveLockVersions(lock);

  const packages = [];
  const evidence = [];

  const sections = [
    { key: "dependencies",          scope: "runtime",  direct: true  },
    { key: "devDependencies",       scope: "dev",      direct: true  },
    { key: "peerDependencies",      scope: "runtime",  direct: true  },
    { key: "optionalDependencies",  scope: "optional", direct: true  },
  ];

  let anyDeclared = false;
  for (const { key, scope, direct } of sections) {
    const deps = pkg[key];
    if (!deps || typeof deps !== "object") continue;
    anyDeclared = true;
    for (const [name, range] of Object.entries(deps)) {
      const lockedVersion = lockVersions.get(name);
      const version = lockedVersion || rangeToVersion(range);
      packages.push({
        purl: purl(name, version),
        scope,
        direct,
        manifest: path.relative(projectDir, pkgPath) || "package.json",
        // 1.0 only when the version came from the lockfile. Range-derived
        // versions are a best guess (^1.2.0 could resolve to anything in 1.x).
        confidence: lockedVersion ? 1.0 : 0.7,
      });
    }
  }

  if (anyDeclared) {
    evidence.push({
      type: "manifest",
      source: path.relative(projectDir, pkgPath) || "package.json",
      matched: "package.json#dependencies",
      supports: ["package_manager", "runtime"],
    });
  }

  return { packages, evidence };
}
