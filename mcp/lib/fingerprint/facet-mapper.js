// Turns detected packages + file-existence signals into canonical facet
// values, driven by facet-rules.json.
//
// Rule semantics:
//   - `when.package` — string; supports trailing "*" glob. Matches against
//     any detected package's purl.
//   - `when.file_exists` — repo-relative path to a file OR directory.
//     Directory paths match if the directory exists and is non-empty.
//   - All matching rules contribute; per-facet values are unioned.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.join(__dirname, "facet-rules.json");

let cachedRules = null;
function loadRules() {
  if (!cachedRules) {
    cachedRules = JSON.parse(fs.readFileSync(RULES_PATH, "utf-8")).rules || [];
  }
  return cachedRules;
}

function packageMatches(pattern, purl) {
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return purl.startsWith(prefix);
  }
  return purl === pattern;
}

function fileOrDirExists(projectDir, rel) {
  const p = path.join(projectDir, rel);
  try {
    const s = fs.statSync(p);
    if (s.isDirectory()) {
      return fs.readdirSync(p).length > 0;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Evaluate facet rules against a project's detected packages + directory
 * contents. Returns:
 *   { facets: { <facet>: [{id, confidence}] }, matchedRules: [...] }
 */
export function mapFacets({ projectDir, packages = [], rules = loadRules() }) {
  const facets = {};          // facet -> Map<id, confidence>
  const matchedRules = [];

  const addValue = (facet, id, confidence) => {
    const bucket = facets[facet] ||= new Map();
    const prev = bucket.get(id);
    if (prev == null || prev < confidence) bucket.set(id, confidence);
  };

  const purls = packages.map((p) => p.purl);

  for (const rule of rules) {
    const when = rule.when || {};
    let matched = false;
    let confidence = 1.0;

    if (when.package) {
      const hit = purls.some((purl) => packageMatches(when.package, purl));
      if (hit) matched = true;
    }
    if (when.file_exists) {
      if (fileOrDirExists(projectDir, when.file_exists)) matched = true;
    }

    if (!matched) continue;
    matchedRules.push(rule);

    for (const [facet, value] of Object.entries(rule.set || {})) {
      const values = Array.isArray(value) ? value : [value];
      for (const id of values) addValue(facet, id, confidence);
    }
  }

  // Convert per-facet Map to array-of-facetValues shape (fingerprint schema).
  const out = {};
  for (const [facet, bucket] of Object.entries(facets)) {
    out[facet] = [];
    for (const [id, confidence] of bucket) {
      out[facet].push({ id, confidence });
    }
  }

  return { facets: out, matchedRules };
}
