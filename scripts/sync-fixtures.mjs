#!/usr/bin/env node
// Sync the cross-repo canonicalization fixture into the plugin's test tree.
//
// The fixture lives in the monorepo at
//   docs/fingerprint/fixtures/canonicalization.json
// and is the contract between blazer-rails (Ruby) and this plugin (JS).
// When the plugin runs tests standalone (outside the monorepo), the
// parent-directory path isn't available — so we keep a plugin-local copy
// at test/fixtures/canonicalization.json that this script refreshes.
//
// Run from the plugin root:
//   node scripts/sync-fixtures.mjs
//
// The test file looks for the plugin-local copy first and falls back to
// the monorepo path if absent.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, "..");
const MONOREPO_FIXTURE = path.resolve(PLUGIN_ROOT, "..", "docs", "fingerprint", "fixtures", "canonicalization.json");
const PLUGIN_FIXTURE_DIR = path.join(PLUGIN_ROOT, "test", "fixtures");
const PLUGIN_FIXTURE = path.join(PLUGIN_FIXTURE_DIR, "canonicalization.json");

if (!fs.existsSync(MONOREPO_FIXTURE)) {
  console.error(`Source fixture not found: ${MONOREPO_FIXTURE}`);
  console.error("Run this script from inside the blazer monorepo checkout.");
  process.exit(1);
}

fs.mkdirSync(PLUGIN_FIXTURE_DIR, { recursive: true });
fs.copyFileSync(MONOREPO_FIXTURE, PLUGIN_FIXTURE);

const bytes = fs.statSync(PLUGIN_FIXTURE).size;
console.log(`Synced canonicalization fixture -> ${path.relative(PLUGIN_ROOT, PLUGIN_FIXTURE)} (${bytes} bytes)`);
