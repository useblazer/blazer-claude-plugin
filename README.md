# Blazer for Claude Code

**Helps agents pick the right tools and architectures.** Blazer plugs into
Claude Code with three workflows:

- **Pick a SaaS product** — catalog-backed recommendations when you need
  to add analytics, auth, payments, monitoring, etc. to a project.
- **Assess an existing integration** — is Datadog still the right call
  for your stack? Side-by-side alternatives with real compatibility data.
- **Choose an architecture for a new project** — five questions pin down
  the right stack (Next.js / FastAPI / Rails / Expo / Streamlit / MCP
  server / Cloudflare Workers / SvelteKit) and write the CLAUDE.md
  starter template into your project.

Recommendations come from the Blazer catalog (live pricing, compatibility,
and quality metrics), not training data.

## Install

Inside Claude Code:

```
/plugin marketplace add useblazer/blazer-claude-plugin
/plugin install blazer@useblazer
```

Claude Code will prompt for a Blazer API key during install. Grab one
(free) at [userblazer.ai/keys](https://userblazer.ai/keys) — starts with
`sk-bzr_`. Paste it into the prompt and you're done. The key is stored
in your system keychain, never in plain text.

Restart Claude Code so the plugin picks up the key, then try one of the
trigger phrases below.

**Requirements:** Node.js >= 18. Works on macOS, Linux, and Windows
(Claude Code handles the cross-platform bits).

## Use

The plugin activates automatically when you ask the right kind of
question. You don't need to invoke anything explicitly.

| Say something like… | What happens |
|---|---|
| "Help me add analytics to this project" | `select-saas` walks you through picking and integrating a tool |
| "Should we keep Datadog or switch?" | `assess-stack` compares alternatives using your real stack |
| "I'm starting a new project, help me pick a stack" | `select-archetype` asks 5 questions and writes `CLAUDE.md` |

The first time any workflow runs, the plugin will ask your permission to
analyze the project's manifest files (`package.json`, `Gemfile.lock`,
`pyproject.toml`, etc.) — this is what makes recommendations stack-aware.
Consent is stored once per machine and the stack data is hashed with a
tenant-local key before it leaves your computer. See the privacy note
below for details.

## Reconfigure

Paste a new API key:
1. Claude Code → Plugin panel → **Blazer** → "Blazer API Key" field
2. Or re-run `/plugin install blazer@useblazer` to be prompted again

The plugin reads the key from your keychain on every session — no
restart needed after a change.

## Troubleshoot

- **"API key is not configured"** — the plugin is installed but no key
  is in the keychain. Open the plugin panel and paste your key.
- **"API key authentication failed"** — the key doesn't match what the
  server has. Check the key at [userblazer.ai/keys](https://userblazer.ai/keys)
  and update the plugin setting.
- **"Blazer API is unreachable"** — the plugin falls back to your
  training data for recommendations and buffers telemetry locally for a
  later session. No action needed; it'll retry automatically.
- **Workflow didn't trigger** — be explicit: "Use Blazer to pick an
  analytics tool" or "Use the Blazer greenfield recommender."

## Privacy

- **What we see:** technology signals (languages, frameworks, package
  identifiers, CI platform) and anonymized telemetry (tool call counts,
  durations, error rates) tied to integration journeys.
- **What we never see:** source code, credentials, business logic,
  environment variables, file contents beyond the manifests listed
  above, or anything outside the manifests we explicitly declare.
- **Repo identifiers** (remote URL, commit SHA, branch name) are hashed
  locally with an HMAC key fetched once from your Blazer tenant before
  transmission. The server sees only the hash.

## License

Apache-2.0. See [LICENSE](./LICENSE) for details.

## Support

- Docs: [userblazer.ai/docs/claude-code](https://userblazer.ai/docs/claude-code)
- Issues: [github.com/useblazer/blazer-claude-plugin/issues](https://github.com/useblazer/blazer-claude-plugin/issues)
- Email: support@userblazer.ai
