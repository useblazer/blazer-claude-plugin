#!/usr/bin/env node
// Sync cross-repo fingerprint artifacts from blazer-rails into the plugin tree.
//
// Sources of truth live in the monorepo under
//   blazer-rails/data/fingerprint/
// and this script copies the files the plugin needs so it can run standalone
// (outside the monorepo) without path gymnastics:
//
//   fingerprint.schema.json         -> mcp/lib/fingerprint/fingerprint.schema.json
//   fixtures/canonicalization.json  -> test/fixtures/canonicalization.json
//   example-fingerprint.json        -> test/fixtures/example-fingerprint.json
//   example-fingerprint-mobile.json -> test/fixtures/example-fingerprint-mobile.json
//
// Run from the plugin root:
//   node scripts/sync-fixtures.mjs
//
// The schema is read at runtime by mcp/lib/fingerprint/schema-validator.js.
// The fixtures back the canonicalization-parity and schema-validator tests.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, "..");
const SOURCE_ROOT = path.resolve(PLUGIN_ROOT, "..", "blazer-rails", "data", "fingerprint");

const SYNCS = [
  {
    src: path.join(SOURCE_ROOT, "fingerprint.schema.json"),
    dst: path.join(PLUGIN_ROOT, "mcp", "lib", "fingerprint", "fingerprint.schema.json"),
    label: "schema",
  },
  {
    src: path.join(SOURCE_ROOT, "fixtures", "canonicalization.json"),
    dst: path.join(PLUGIN_ROOT, "test", "fixtures", "canonicalization.json"),
    label: "canonicalization fixture",
  },
  {
    src: path.join(SOURCE_ROOT, "example-fingerprint.json"),
    dst: path.join(PLUGIN_ROOT, "test", "fixtures", "example-fingerprint.json"),
    label: "example fingerprint",
  },
  {
    src: path.join(SOURCE_ROOT, "example-fingerprint-mobile.json"),
    dst: path.join(PLUGIN_ROOT, "test", "fixtures", "example-fingerprint-mobile.json"),
    label: "mobile example fingerprint",
  },
];

let failed = false;
for (const { src, dst, label } of SYNCS) {
  if (!fs.existsSync(src)) {
    console.error(`Source ${label} not found: ${src}`);
    console.error("Run this script from inside the blazer monorepo checkout.");
    failed = true;
    continue;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  const bytes = fs.statSync(dst).size;
  console.log(`Synced ${label} -> ${path.relative(PLUGIN_ROOT, dst)} (${bytes} bytes)`);
}

if (failed) process.exit(1);
