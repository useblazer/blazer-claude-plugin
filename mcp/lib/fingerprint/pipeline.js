// Orchestrates the end-to-end extract pipeline: manifest discovery →
// per-family extractors → facet mapping → schema-conformant body.
//
// Does NOT hash or sign — callers attach a `source` block separately via
// hasher.js (the tenant key isn't available in-tree).

import { extract as extractNpm }       from "./extractors/npm.js";
import { extract as extractBundler }   from "./extractors/bundler.js";
import { extract as extractPip }       from "./extractors/pip.js";
import { extract as extractCargo }     from "./extractors/cargo.js";
import { extract as extractCocoapods } from "./extractors/cocoapods.js";
import { extract as extractSpm }       from "./extractors/spm.js";
import { extract as extractComposer }  from "./extractors/composer.js";
import { extract as extractGradle }    from "./extractors/gradle.js";
import { extract as extractMaven }     from "./extractors/maven.js";
import { mapFacets } from "./facet-mapper.js";
import { validate } from "./schema-validator.js";

const EXTRACTORS = [
  extractNpm, extractBundler, extractPip, extractCargo,
  extractCocoapods, extractSpm, extractComposer, extractGradle, extractMaven,
];

const SCHEMA_VERSION = "0.1.0";

/**
 * Run all extractors, then map facets, then assemble a schema-conformant
 * body (minus the `source` block — the caller attaches that).
 *
 * @param {string} projectDir
 * @param {object} opts - { detector, detectorVersion, detectedAt }
 * @returns {{ body, validationErrors, matchedRules }}
 */
export function buildFingerprintBody(projectDir, opts = {}) {
  const allPackages = [];
  const allEvidence = [];

  for (const fn of EXTRACTORS) {
    const { packages, evidence } = fn(projectDir);
    allPackages.push(...packages);
    allEvidence.push(...evidence);
  }

  // Dedup packages by purl, taking the highest-confidence + direct=true entry.
  const byPurl = new Map();
  for (const p of allPackages) {
    const existing = byPurl.get(p.purl);
    if (!existing) { byPurl.set(p.purl, p); continue; }
    if (p.direct && !existing.direct) byPurl.set(p.purl, p);
    else if (p.confidence > existing.confidence) byPurl.set(p.purl, p);
  }
  const packages = [...byPurl.values()];

  const { facets, matchedRules } = mapFacets({ projectDir, packages });

  const body = {
    fingerprint_version: SCHEMA_VERSION,
    detected_at: opts.detectedAt || new Date().toISOString(),
    packages,
    facets,
    evidence: allEvidence,
  };

  const validationErrors = validate(body);
  return { body, validationErrors, matchedRules };
}
