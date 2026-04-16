---
name: select-archetype
description: >
  Helps the user pick an architecture for a new ("greenfield") AI-native
  project. Activate when the user says they're starting a new project, asks
  "what should I build this in?", "help me pick a stack", "what framework
  for X", or otherwise wants opinionated guidance on how to scaffold a
  fresh codebase. Walks through five questions, asks the Blazer recommender
  for a pick, writes the recommended architecture into the project's
  CLAUDE.md (or the editor-equivalent), and records the outcome.
invocation: auto
---

# Greenfield Archetype Selection Workflow

Use this when the user is starting a brand-new project and wants help
choosing an architecture. The Blazer server holds the questions and the
scoring weights — your job is to ask the questions, capture the answers,
hand them to the server, and write the returned guidance into the user's
project.

This is **not** for evaluating SaaS products to integrate (that's the
`select-saas` skill) or for analyzing an existing codebase (that's the
`assess-stack` skill). If the user already has a working project, route
to one of those instead.

## Step 0: Verify Authentication

Same as every other Blazer skill. If any MCP tool returns `auth_required`
or `auth_failed`, stop and walk the user through API key setup before
continuing.

## Step 1: Fetch the Question Schema

Call `mcp__blazer__get_archetype_questions`. This returns:

```json
{
  "schema_version": 1,
  "questions": [
    {
      "id": "ui_surface",
      "label": "What kind of user interface will this project have?",
      "help": "Pick the primary surface — secondary UIs don't count.",
      "options": [
        { "value": "web_app",       "label": "A web app (server-rendered or browser SPA)" },
        { "value": "mobile_app",    "label": "A mobile app (iOS/Android, possibly cross-platform)" },
        { "value": "api_only",      "label": "Just an API or backend service — no UI of its own" },
        { "value": "cli_or_agent",  "label": "A CLI, MCP server, or agent tool — no human UI" },
        { "value": "data_app",      "label": "A data app or internal dashboard (Streamlit/Gradio/notebooks)" }
      ]
    },
    ...
  ]
}
```

The schema is authoritative. Do NOT cache it across sessions, do NOT add
or remove questions, and do NOT invent your own answer values — the
server scores against the exact `value` strings it gave you.

Remember the `schema_version` for Step 3.

## Step 2: Ask the Questions — One at a Time

Do NOT dump all five questions at once. Walk the user through them
conversationally, one question per turn, with a short preamble so they
know what to expect.

### Step 2a: Friendly preamble

Before asking the first question, send a short, warm intro. Match the
vibe of the rest of the session — don't be over-the-top. Roughly:

> Cool, let's get you set up. I've got five quick questions to pin down
> the right architecture — should take about a minute. Here goes.

Then start with question 1.

### Step 2b: One question per turn

For each question, in the order the server returned:

1. Show the question number and total (e.g. "**Question 1 of 5**")
   followed by the `label` text.
2. If `help` is present, show it as a short italic line under the label.
3. Show the `options` as a **lettered** list (A, B, C, D, E) using the
   option `label` strings. Use letters, never numbers — the question
   numbers above would collide with numeric answer choices.
4. Send the message and **stop**. Wait for the user to reply.
5. When they reply, map their answer to an option `value` (see Step 2c),
   then move to the next question.

Formatting for a single question should look like:

```
**Question 1 of 5 — What kind of user interface will this project have?**
_Pick the primary surface — secondary UIs (admin, docs site) don't count._

  A. A web app (server-rendered pages or browser SPA)
  B. A mobile app (iOS/Android, possibly cross-platform)
  C. Just an API or backend service — no UI of its own
  D. A CLI, MCP server, or agent tool — no human UI
  E. A data app or internal dashboard (Streamlit/Gradio/notebooks)
```

Keep it tight — a preamble, the question, the options, done. No extra
commentary between questions unless the user's answer requires a
clarification.

### Step 2c: Mapping replies to option values

Regardless of how the user answers, map their reply to one of the
option `value` strings — the server scores against those exact strings,
not letters or labels.

- If they reply with a letter ("B" or "b"), use the option at that
  index (A=first option, B=second, …).
- If they reply with the option's label or a close paraphrase ("a SaaS
  dashboard for analysts" → `data_app`), pick the closest match.
- If their answer is genuinely off-menu (they want a game engine,
  a desktop GUI, etc.), say so and re-ask with the list — don't invent
  a value, and don't force a bad fit.
- If they say "I don't know" or "you choose," skip the question and
  note it. Skipped questions contribute zero to scoring, which is fine.

### Step 2d: Confirm before submitting

After question 5, confirm the mapped set before calling
`select_archetype`. Something like:

> Got it — here's what I have:
>   • UI: **web app**
>   • LLM role: **feature**
>   • Language: **TypeScript**
>   • Timeline: **sprint (1-2 weeks)**
>   • Streaming: **yes**
>
> Ready to get the recommendation?

Wait for a clear confirmation (yes / go / sounds right / etc.) before
proceeding. If the user wants to change an answer, edit the mapped set
and re-confirm.

## Step 3: Get the Recommendation

Call `mcp__blazer__select_archetype` with:

```json
{
  "answers": {
    "ui_surface": "web_app",
    "llm_role": "feature",
    "language": "typescript",
    "time_to_ship": "sprint",
    "streaming": "yes"
  },
  "schema_version": 1
}
```

The response looks like:

```json
{
  "schema_version": 1,
  "selection_id": "gsel_a1b2c3d4",
  "recommendation": {
    "archetype_slug": "nextjs-app",
    "name": "Next.js App (App Router)",
    "summary": "...",
    "why": "...",
    "score": 23,
    "architecture_guidance_md": "# Architecture — Next.js App Router\n\nStack: ..."
  },
  "alternatives": [
    { "archetype_slug": "sveltekit-app", "name": "SvelteKit App", "score": 21, "why_not": "..." },
    { "archetype_slug": "edge-worker-cloudflare", "name": "Cloudflare Workers (Edge API)", "score": 17, "why_not": "..." }
  ]
}
```

Hold onto `selection_id` for Step 5.

## Step 4: Present and Write the Guidance

Show the user:

1. The pick — `recommendation.name` and the `recommendation.why`
   sentence.
2. The two alternatives with their `why_not` lines.
3. Ask: "Want me to write the recommended architecture into this
   project as `CLAUDE.md`?"

If yes, write `recommendation.architecture_guidance_md` to **the project
root** at the file the user's editor expects:

| Editor / agent surface | Filename to write |
|---|---|
| Claude Code (default)  | `CLAUDE.md` |
| Cursor                 | `.cursorrules` (legacy) **or** `.cursor/rules/architecture.mdc` (preferred) |
| OpenAI Codex / Codex CLI | `AGENTS.md` |
| Continue.dev           | `.continue/rules/architecture.md` |
| All of the above       | Write `CLAUDE.md` and tell the user it's the canonical home; offer to mirror to the others |

Default to `CLAUDE.md` unless the user explicitly asks for one of the
others or you can detect their editor (e.g. there's already a
`.cursor/` directory).

If `CLAUDE.md` already exists at the project root:
- Do NOT overwrite it.
- Append the recommendation under a clearly-fenced heading:
  ```
  ---

  ## Greenfield Architecture (Blazer recommendation, gsel_a1b2c3d4)

  <architecture_guidance_md content>
  ```
- Tell the user you appended rather than replaced.

If the user wants a different pick (one of the alternatives), don't
re-call `select_archetype` — the server already returned the alternatives
with their full data is not included. Instead: tell the user that picking
an alternative requires a fresh recommendation pass, then re-run with
adjusted answers (or skip the recommender and write a stub yourself).

## Step 5: Record the Outcome

Once the file is written and the user is happy, call
`mcp__blazer__record_archetype_outcome` with `selection_id` and
`outcome: "confirmed"`.

If the user declined the pick (didn't want any of the recommendations,
or backed out before writing the file), call with
`outcome: "rejected"`.

This is what powers the admin dashboard's "what % of recommendations
get used" metric — it's how the recommender gets tuned over time, so
do not skip it.

## Important Guidelines

- This skill is for **brand-new projects**. If the user has an existing
  codebase, route to `select-saas` (adding a SaaS) or `assess-stack`
  (analyzing what's there).
- Never invent answer values. If the user's answer doesn't fit, ask
  again — don't pick the closest one silently and don't pass
  free-text strings as values.
- Always confirm the mapped answers before submitting.
- Always offer to write the file — don't just dump 60 lines of markdown
  into the chat and call it done.
- If `CLAUDE.md` exists, append don't overwrite. Lost user content is
  worse than a slightly messy file.
- Always close the loop with `record_archetype_outcome`. Confirmed,
  rejected — either is fine, but silence is the worst answer.
- The recommendation is opinionated, not authoritative. If the user
  pushes back on a specific choice in the guidance ("we don't use
  Tailwind"), edit the file before writing — the markdown is a starting
  template, not a contract.

## Degraded Mode (API Unreachable)

If `get_archetype_questions` or `select_archetype` returns an
`api_unavailable` error, fall back to picking from training data with a
clear notice:

> "The Blazer recommender is unavailable. I'll suggest an architecture
> based on my training data, but it won't be tracked or tuned. Re-run
> when connectivity is restored for a recorded recommendation."

Do not call `record_archetype_outcome` in degraded mode — there's no
selection to record against.
