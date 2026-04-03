# Blazer — Claude Code Plugin

AI-native SaaS product selection, integration telemetry, and structured reviews for agentic workflows.

## Prerequisites

- **Node.js** >= 18 (for the MCP server)
- **jq** (for telemetry hook scripts — optional but recommended)

## Installation

```bash
claude plugin add github:useblazer/claude-code-plugin
```

## Configuration

Sign up at [userblazer.ai](https://userblazer.ai) and generate an API key, then:

```bash
claude plugin config blazer Blazer_API_KEY <your-key>
```

## What This Plugin Provides

### Skills (2)
- **select-saas** — Guided workflow for selecting and integrating a new SaaS product
- **assess-stack** — Guided workflow for assessing existing integrations and executing migrations

### MCP Tools (11)
- `extract_stack_fingerprint` — Analyze project technology stack (runs locally)
- `search_catalog` — Search the Blazer product catalog
- `get_journey_status` — Check for active integration journeys
- `begin_integration` / `complete_integration` — Manage integration journey lifecycle
- `submit_review` — Submit structured integration review
- `get_product_detail` — Get detailed product information
- `report_session_context` — Register session for journey correlation
- `assess_alternatives` — Evaluate alternatives to existing products
- `begin_migration` / `complete_migration` — Manage migration journey lifecycle

### Hook Scripts (5)
- Passive telemetry capture for integration quality measurement
- Session registration for cross-session journey correlation
- Telemetry aggregation and upload on session end

## License

Apache-2.0
