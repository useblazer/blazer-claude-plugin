# Stack Fingerprint Schema v0.1.0

The stack fingerprint is a privacy-preserving, schema-governed description
of a project's architectural choices. It is extracted from manifest files
(package.json, Gemfile.lock, pyproject.toml, Podfile.lock, Package.resolved,
Cargo.toml, composer.lock, build.gradle, pom.xml, etc.) + file-presence
signals (Dockerfile, .github/workflows/, terraform/, fly.toml, etc.).

The canonical schema lives in `docs/fingerprint/fingerprint.schema.json`.
Below is a hand-summary of the shape agents see.

## Shape

```json
{
  "fingerprint_version": "0.1.0",
  "detected_at": "2026-04-15T12:00:00Z",

  "source": {
    "hash_algorithm": "hmac-sha256",
    "key_version": 1,
    "repo_hash":   "7a9c6e4b…",
    "commit_hash": "3f5d7b9e…",
    "branch_hash": "1e3c5a7f…",
    "detector": "blazer-claude-plugin",
    "detector_version": "0.3.1"
  },

  "packages": [
    { "purl": "pkg:npm/express@4.21.0", "scope": "runtime", "direct": true, "manifest": "package.json", "confidence": 1.0 }
  ],

  "facets": {
    "runtime":         [{ "id": "otel:nodejs", "confidence": 1.0 }],
    "framework":       [{ "id": "purl:pkg:npm/express", "confidence": 1.0 }],
    "package_manager": [{ "id": "cncf:npm" }],
    "ci_cd":           [{ "id": "cncf:github-actions" }],
    "container_build": [{ "id": "cncf:docker" }],
    "iac":             [{ "id": "cncf:terraform" }],
    "observability":   [{ "id": "saas:datadog" }],
    "payments":        [{ "id": "saas:stripe" }],
    "datastore":       [{ "id": "purl:pkg:generic/postgres" }]
  },

  "evidence": [
    { "type": "manifest", "source": "package.json", "matched": "package.json#dependencies", "supports": ["package_manager", "runtime"] }
  ],

  "matched_archetypes": [
    { "id": "express-api",  "confidence": 1.0, "matched_predicates": ["runtime", "packages"] },
    { "id": "react-spa",    "confidence": 1.0, "matched_predicates": ["runtime", "packages"] }
  ]
}
```

## Key fields

- **`source.repo_hash` / `commit_hash` / `branch_hash`** — HMAC-SHA-256
  of the canonical repo URL / 40-char commit SHA / branch name using the
  tenant's hash key. The plugin hashes these locally; raw values never
  reach Blazer. Two users at the same tenant produce the same hashes for
  the same repo (see ADR 0001).

- **`packages`** — Package URLs (purls) with manifest provenance. Use
  this list to detect specific products the project already uses
  (e.g. `pkg:npm/dd-trace` → Datadog SDK, `pkg:gem/stripe` → Stripe).

- **`facets`** — Layered, multi-valued categorization. Canonical ID
  prefixes: `cncf:` (CNCF Landscape), `otel:` (OpenTelemetry semantic
  conventions), `cloud:` (cloud service identifiers), `purl:pkg:…`
  (when a package is the architectural signal), `saas:` (vendor outside
  CNCF), `tool:` (proprietary developer tooling).

- **`matched_archetypes`** — Server-derived categorization returned by
  `submit_fingerprint`. A single project can match multiple archetypes
  (backend + frontend, mobile + API, etc.). Use the first two as the
  headline description of the project.

## Privacy boundary

The fingerprint extractor MUST NOT capture:
- Source code or business logic
- API keys, tokens, passwords, or connection-string credentials
- File contents beyond manifest metadata
- User data, PII, or anything from `.env` files
- Raw git history, commit messages, or branch names (branch is optional
  and hashed when included; by default the plugin omits `branch_hash`
  for non-default branches)

## Related

- Full schema: `docs/fingerprint/fingerprint.schema.json`
- Tenant hash-key rationale: `docs/adr/0001-tenant-hash-key-for-fingerprint-identifiers.md`
- Archetype definitions: `docs/fingerprint/archetypes.yaml`
