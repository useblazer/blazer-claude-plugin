---
name: assess-stack
description: >
  Guides the agent through assessing a project's existing SaaS integrations
  against alternatives, identifying migration opportunities, and executing
  migrations. Activate when the user asks to "audit our stack", "evaluate
  alternatives to X", "should we switch from X", "compare X vs Y for our
  project", "what are better options for our analytics/monitoring/auth/etc",
  or any request to review, benchmark, or rationalize the project's current
  SaaS dependencies. Also activate when the user wants to migrate from one
  product to another.
invocation: auto
---

# Stack Assessment & Migration Workflow

When the user wants to evaluate their existing SaaS integrations or consider
alternatives, follow this workflow. This is different from the greenfield
`select-saas` workflow — here, the project ALREADY uses a product and the
question is whether a better option exists and whether migration is worth it.

## Step 0: Verify Authentication

Before proceeding, ensure the Blazer plugin is authenticated. If any MCP tool
call returns an `auth_required` or `auth_failed` error, stop the workflow and
guide the user through setup:

1. Sign up or log in at the URL in the error response (typically userblazer.ai/signup)
2. Generate an API key at userblazer.ai/keys
3. Configure the key: `claude plugin config blazer Blazer_API_KEY <key>`
4. Restart the session so the MCP server picks up the new key

Do not attempt catalog queries, assessments, or migrations until authentication
is confirmed.

## Step 1: Extract Stack Fingerprint

Call `mcp__blazer__extract_stack_fingerprint` to get the full stack
context, including the `existing_integrations` list. This tells you what
products the project currently uses and in which categories.

## Step 2: Determine Scope

Clarify with the user what they want assessed:
- **Full stack audit**: Evaluate alternatives for ALL existing integrations
- **Category-specific**: Evaluate alternatives for a specific category (e.g., "analytics")
- **Product-specific**: Compare a specific product against alternatives (e.g., "is there something better than Datadog for us?")

## Step 3: Assess Alternatives

For each product/category in scope, call `mcp__blazer__assess_alternatives`
with the current product ID and stack fingerprint. This returns:

- Ranked alternatives with compatibility scores for THIS stack
- **Migration complexity estimate** for each alternative (based on the specific
  from-to product pair and this stack type)
- Comparative quality metrics (the alternative's integration quality vs. what's
  known about the current product)
- Migration journey insights from other orgs who made the same switch
- Cost comparison (if pricing data is available)

## Step 4: Present Assessment Report

Synthesize the results into a structured assessment. For each integration
evaluated, categorize it as:

- **Well-positioned**: Current product scores highly, no significantly better
  alternative exists for this stack. Recommendation: keep.
- **Worth considering**: One or more alternatives score meaningfully better on
  compatibility, quality, or cost. Migration complexity is moderate or low.
  Recommendation: evaluate further.
- **At risk**: Current product has declining quality scores, recent breaking
  changes, poor stack compatibility, or significantly better alternatives exist
  with low migration complexity. Recommendation: plan migration.

Present the assessment with clear trade-offs. Migration is always costly —
the alternative needs to be substantially better, not just marginally better,
to justify the switch.

## Step 5: Execute Migration (if user decides to proceed)

If the user decides to migrate from one product to another:

1. Call `mcp__blazer__begin_migration` with the `from_product`,
   `to_product`, and stack fingerprint. This creates a migration journey
   with specific phases and telemetry.

2. Follow the migration playbook in `migration-playbook.md`. The general
   pattern is:
   a. Integrate the new product alongside the old one
   b. Verify functional equivalence (parallel run)
   c. Cut over to the new product
   d. Remove the old product's SDK and configuration

3. During the parallel run phase, validate that the new product produces
   equivalent results. For analytics, this might mean checking event counts.
   For monitoring, it might mean comparing alert thresholds.

4. Call `mcp__blazer__complete_migration` when done, reporting the outcome
   and any data migration results.

5. Submit a migration-specific review via `mcp__blazer__submit_review`.

## Important Guidelines

- ALWAYS use catalog data for comparisons, not training data — unless the API is
  unreachable, in which case fall back to training data with a clear notice (see below)
- Present migration complexity HONESTLY — switching costs are real and the assessment should reflect them
- A "keep current product" recommendation is a valid and valuable outcome
- If the assessment shows the current product is the best option, say so clearly
- Never recommend migration for marginal improvements — the bar should be meaningful
- If the user asks about a product that isn't in the catalog, note this limitation and offer to provide what information you can from training data, clearly marked as potentially outdated

## Degraded Mode (API Unreachable)

If the Blazer API is unreachable (network error, timeout, 5xx response):

1. **Assessments fall back to training data.** Present comparisons from your
   training knowledge, but prefix them with a clear notice:
   > "The Blazer catalog is currently unavailable. The following assessment is
   > based on my training data and does not include real-time quality metrics,
   > migration complexity estimates, or journey insights from other teams.
   > Re-run this assessment when connectivity is restored."
2. **Migration journeys cannot be started.** `begin_migration` requires the API.
   If the user wants to proceed with a migration without journey tracking, they
   can — but inform them that telemetry and migration guidance will not be
   available. If connectivity returns mid-session, they can start the journey
   retroactively.
3. **Telemetry hooks continue buffering locally** and will upload when
   connectivity is restored (see `select-saas` degraded mode for details).
