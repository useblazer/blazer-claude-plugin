// Swift Package Manager extractor — parses Package.resolved.
// Purls: pkg:swift/<name>@<version>.
//
// Package.resolved is JSON with a `pins` array (v2/v3 formats differ slightly).
// We extract the package name from `identity` (v2) or the last URL path
// segment, and the version from `state.version`.

import fs from "node:fs";
import path from "node:path";

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

function purl(name, version) {
  return version ? `pkg:swift/${name}@${version}` : `pkg:swift/${name}`;
}

function extractName(pin) {
  if (pin.identity) return pin.identity;
  if (pin.package) return pin.package;
  if (pin.location) {
    const last = pin.location.split("/").pop() || "";
    return last.replace(/\.git$/, "");
  }
  return null;
}

export function extract(projectDir) {
  // Package.resolved shows up either at the project root (SwiftPM CLI) or
  // inside an Xcode project's .xcworkspace/xcshareddata/swiftpm/ tree.
  const candidatePaths = [
    path.join(projectDir, "Package.resolved"),
    ...expandWorkspacePaths(projectDir),
  ];

  let resolved = null, resolvedPath = null;
  for (const p of candidatePaths) {
    const data = readJson(p);
    if (data) { resolved = data; resolvedPath = p; break; }
  }
  if (!resolved) return { packages: [], evidence: [] };

  const pins = resolved.pins ||
               resolved.object?.pins ||   // v1 nested under "object"
               [];

  const packages = [];
  for (const pin of pins) {
    const name = extractName(pin);
    if (!name) continue;
    const version = pin.state?.version || null;
    packages.push({
      purl: purl(name, version),
      scope: "runtime",
      direct: true, // SPM doesn't distinguish; treat all resolved pins as direct
      manifest: path.relative(projectDir, resolvedPath) || "Package.resolved",
      confidence: version ? 1.0 : 0.85,
    });
  }

  const evidence = packages.length ? [{
    type: "manifest",
    source: path.relative(projectDir, resolvedPath) || "Package.resolved",
    matched: "Package.resolved",
    supports: ["package_manager", "client_platform", "build_system"],
  }] : [];

  return { packages, evidence };
}

function expandWorkspacePaths(projectDir) {
  // Shallow walk: look for one level of *.xcworkspace dirs and check the
  // SPM xcshareddata location inside them.
  let entries;
  try { entries = fs.readdirSync(projectDir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    if (e.isDirectory() && e.name.endsWith(".xcworkspace")) {
      out.push(path.join(projectDir, e.name, "xcshareddata", "swiftpm", "Package.resolved"));
    }
    if (e.isDirectory() && e.name.endsWith(".xcodeproj")) {
      out.push(path.join(projectDir, e.name, "project.xcworkspace", "xcshareddata", "swiftpm", "Package.resolved"));
    }
  }
  return out;
}
