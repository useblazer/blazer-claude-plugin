# Changelog

All notable changes to the Blazer Claude Code plugin. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — Unreleased

First release installable from the `useblazer` marketplace. Prior versions
were dev-only, loaded via `claude --plugin-dir`.

### Added
- **`select-archetype` skill** — greenfield architecture recommender.
  Walks the user through five questions, gets an opinionated pick from
  the server (one of eight curated archetypes), and writes the
  `CLAUDE.md` template into the new project's root.
- **Three new MCP tools** backing the greenfield flow:
  `get_archetype_questions`, `select_archetype`,
  `record_archetype_outcome`.
- **Marketplace manifest** (`.claude-plugin/marketplace.json`) so this
  repo is installable via `/plugin marketplace add useblazer/blazer-claude-plugin`.
- **CHANGELOG.md** (this file).

### Changed
- **API key configuration is now first-class.** `plugin.json` declares a
  `userConfig.api_key` entry with `sensitive: true` and `required: true`.
  Claude Code prompts for the key at install time, stores it in the
  system keychain, and hands it to the MCP server as
  `CLAUDE_PLUGIN_OPTION_API_KEY` — no more shell env var setup.
- **API URL is no longer user-configurable** via the install prompt. The
  plugin defaults to the production URL (`https://api.userblazer.ai/v1`).
  Developers can still override via the `BLAZER_API_URL` shell env for
  local testing.
- **Plugin slug renamed** from `Blazer` to `blazer` (lowercase,
  CLI-friendly). The `@useblazer` suffix names the marketplace.
- **End-user README** rewritten for installers. Developer-facing docs
  moved to `CLAUDE.md`.
- **`auth_required` error message** no longer references the fictional
  `claude plugin config` command — now points at the plugin panel or
  `/plugin install blazer@useblazer`.

### Internal
- Runtime env vars renamed to uppercase `BLAZER_API_KEY` / `BLAZER_API_URL`.
  The legacy mixed-case `Blazer_API_KEY` / `Blazer_API_URL` are still
  honored as fallbacks so the demo and `--plugin-dir` workflows keep
  working unchanged.

## [0.3.0] — 2026-04-10

### Added
- Fingerprint pipeline (schema-conformant manifest scanning + HMAC
  canonicalization) replacing the legacy `extract_stack_fingerprint`.
- `submit_fingerprint` + `extract_fingerprint` MCP tools.
- `assess-stack` skill for evaluating existing product integrations.
- Migration journeys (`begin_migration` / `complete_migration`).
- Sponsored ad surface on catalog + migration responses.

### Deprecated
- `extract_stack_fingerprint` — scheduled for removal in 0.5. One-shot
  deprecation notice now emitted on first use per session.

## [0.2.0] — 2026-03-22

### Added
- Integration journeys (`begin_integration` / `complete_integration`)
  with telemetry capture via hook scripts.
- Structured review submission (`submit_review`).
- Session correlation hooks.

## [0.1.0] — 2026-02-15

### Added
- Initial MCP server with catalog search (`search_catalog`),
  product detail (`get_product_detail`), and legacy
  `extract_stack_fingerprint`.
- `select-saas` skill.
