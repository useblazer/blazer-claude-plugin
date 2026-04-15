# blazer-claude-plugin

A Claude Code plugin + MCP server that connects agents to the Blazer
platform for software-stack fingerprinting, product discovery, and
guided integration/migration journeys.

This file is the plugin-specific complement to the monorepo's root
`CLAUDE.md`. When working inside `blazer-claude-plugin/`, follow these
conventions; defer to the root `CLAUDE.md` for cross-component context.

## What this plugin does

- **Fingerprints stacks.** Scans a project's manifests (package.json,
  Gemfile.lock, pyproject.toml, Cargo.toml, Podfile.lock, Package.resolved,
  composer.lock, build.gradle, pom.xml) and emits a schema-conformant
  fingerprint body. See `mcp/lib/fingerprint/`.
- **Submits fingerprints to Blazer.** Hashes repo URL + commit SHA + branch
  locally using an HMAC key fetched from Blazer (per ADR 0001), then
  POSTs to `/api/v1/fingerprints`. The server returns matched archetypes.
- **Discovers products.** Searches the Blazer catalog, assesses
  alternatives, tracks integration/migration journeys.

## Layout

```
mcp/
  server.js                  # MCP server entry (registers tools, dispatches calls)
  auth.js                    # API key + failure state
  api-client.js              # HTTP client talking to blazer-rails API
  lib/
    fingerprint/             # New fingerprint pipeline (spec §7–§8)
      canonical.js           # URL/SHA/branch canonicalization (parity with Ruby lib)
      hasher.js              # buildSource() — pairs canonicalization with HMAC
      key-cache.js           # Tenant hash-key cache (CLAUDE_PLUGIN_DATA-scoped)
      consent.js             # FingerprintConsent (global, versioned)
      schema-validator.js    # AJV-based fingerprint.schema.json validator
      extractors/            # One file per manifest family, emits purls+evidence
        npm.js bundler.js pip.js cargo.js
        cocoapods.js spm.js composer.js gradle.js maven.js
      facet-rules.json       # Data-driven rules mapping purls/files to canonical IDs
      facet-mapper.js        # Rule engine
      pipeline.js            # buildFingerprintBody(projectDir) — end-to-end orchestrator
    consent.js               # LEGACY per-project consent (for deprecated tool)
    fingerprint-extractors.js # LEGACY extractor (deprecated, used by extract_stack_fingerprint)
    plugin-data.js           # Plugin persistent-state helper
    project-hash.js          # Legacy project-hash (still used by journey tools)
  tools/
    extract-fingerprint.js   # NEW: local extract, no submit, no hash key needed
    submit-fingerprint.js    # NEW: extract + hash + POST /fingerprints
    extract-stack-fingerprint.js  # DEPRECATED (v0.5 removal): emits one-shot deprecation notice
    ... (catalog/journey/migration/ad/review tools)
scripts/
  sync-fixtures.mjs          # Copies the cross-repo canonicalization fixture into test/fixtures/
  session-start.js
  session-end.js
test/
  fingerprint/               # Tests for the new pipeline + cross-repo parity
  fixtures/                  # Plugin-local copy of the cross-repo canonicalization fixture
  tools/                     # Tests for MCP tool handlers
```

## Tech stack

- **Node.js >= 18, ES modules** (`"type": "module"` in package.json).
- **MCP:** `@modelcontextprotocol/sdk` over stdio.
- **Validation:** `ajv` + `ajv-formats` (draft-2020-12 schema).
- **No bundler, no TypeScript.** Plain ESM JavaScript. Keep deps minimal.
- **Tests:** `node --test` (native runner). No test framework dep.

## Running

```bash
npm install
npm test                 # runs all tests, both unit and parity
npm run sync:fixtures    # copies docs/fingerprint/fixtures/canonicalization.json into test/fixtures/
```

Plugin expects these environment variables at runtime (set by Claude Code
when the plugin is loaded):

- `CLAUDE_PLUGIN_DATA` — absolute path to the plugin's persistent data
  directory. Credentials, consent, and per-project context all live here.
- `Blazer_API_KEY` — user's Blazer API key (`sk-bzr_…`).
- `Blazer_API_URL` — optional override, defaults to `https://api.userblazer.ai/v1`.

## Plugin state

All plugin-local state lives under `CLAUDE_PLUGIN_DATA` (per Claude Code's
plugin convention — see the Claude Code plugins reference). This directory
survives plugin updates. Files we write there:

| File | Contents | Mode |
|---|---|---|
| `credentials.json` | `api_key` (user-set), `tenant_hash_key_b64u` + `tenant_hash_key_version` (server-fetched) | 0600 |
| `consent.json` | Global fingerprint consent record with `version` for re-consent on category change | 0600 |
| `project-context.json` | Per-project cached fingerprint + project_hash (legacy tool) | default |
| `active-session.json` | Most-recent integration/migration session state | default |

**Never** write plugin state outside `CLAUDE_PLUGIN_DATA`. Never use
`~/.config/…`, `~/.claude/…` directly, or `XDG_CONFIG_HOME`. Claude Code
provides the right path; we use it.

## Fingerprint pipeline — the important invariant

`mcp/lib/fingerprint/canonical.js` MUST produce byte-identical output to
`blazer-rails/lib/blazer/fingerprint/canonical.rb` for every input. If they
drift, two users at the same tenant produce different hashes for the same
repo — silently breaking within-tenant correlation (ADR 0001). The contract
is enforced by a shared fixture at
`docs/fingerprint/fixtures/canonicalization.json` in the monorepo; both
repos assert against it in CI.

If you change `canonical.js`:

1. Update the paired Ruby implementation in the same commit.
2. Regenerate the fixture via the Ruby side:
   ```bash
   cd ../blazer-rails && ruby /tmp/gen_fixture.rb > ../docs/fingerprint/fixtures/canonicalization.json
   ```
   (or run the blazer-rails canonical tests, which will fail loudly if outputs drift)
3. `npm run sync:fixtures` to refresh the plugin-local copy.
4. `npm test` to confirm parity.

## MCP tools

Three fingerprint-related tools are registered:

- `extract_fingerprint` — **local only**, no submit, no API auth. Runs the
  pipeline against `project_dir` and returns the schema-conformant body.
  Requires global consent (see `FingerprintConsent`).
- `submit_fingerprint` — extracts, attaches a hashed `source` block using
  the cached tenant key, and POSTs to Blazer. Handles `stale_key_version`
  warnings, `410 Gone` rotation auto-retry, and degraded-mode (hash-key
  fetch failure disables submit but keeps `extract_fingerprint` working).
- `extract_stack_fingerprint` — **DEPRECATED** (removal in v0.5). Emits
  a one-shot deprecation notice pointing at the two new tools.

## Coding conventions

- **ES modules only.** `import`/`export`, no `require`.
- **Node stdlib first.** Avoid new dependencies unless they pay for themselves
  (AJV and MCP SDK are the only non-trivial ones).
- **No emoji** in source files unless the user asks for them.
- **Small files.** Each extractor/tool lives in its own file. Pure functions
  over classes where possible; classes when we need state (`KeyCache`,
  `FingerprintConsent`).
- **Don't mutate the fingerprint schema casually.** Any schema change needs
  matching updates in blazer-rails's `Blazer::Fingerprints::SchemaValidator`
  and the example fingerprints in `docs/fingerprint/`.
- **Test with tmpdirs.** All extractor/pipeline tests use
  `fs.mkdtempSync(path.join(os.tmpdir(), "…"))` and clean up in `afterEach`.

## Git hygiene (submodule context)

This repo is a **git submodule** of `useblazer/blazer`. The monorepo tracks
a specific commit SHA, not individual files. When making changes:

1. Commit inside this repo first (`blazer-claude-plugin/`), then push.
2. Back in the monorepo root, `git add blazer-claude-plugin` stages the new
   commit SHA as a submodule pointer update.
3. Cross-component changes (plugin + Rails) should be a single monorepo
   commit that bumps the submodule pointer alongside the Rails changes —
   the plugin change must be pushed first so the pointer resolves.

Never commit plugin-tracked files through the monorepo. Never rewrite
history on a published submodule commit.
