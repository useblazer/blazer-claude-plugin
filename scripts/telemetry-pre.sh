#!/bin/bash
# PreToolUse hook — captures start timestamp for MCP tool calls.
# Runs async. Timestamps may be slightly after actual call start.
# Reads: stdin JSON with tool_name, tool_input, session_id
# Writes: appends to $CLAUDE_PLUGIN_DATA/telemetry-{journey_id}.jsonl

set -euo pipefail

if ! command -v jq &>/dev/null; then exit 0; fi

INPUT=$(cat)
ACTIVE_SESSION_FILE="$CLAUDE_PLUGIN_DATA/active-session.json"
CURRENT_SESSION_FILE="$CLAUDE_PLUGIN_DATA/current-session.json"

# Only capture telemetry if an integration/migration session is active
if [ ! -f "$ACTIVE_SESSION_FILE" ]; then exit 0; fi

ACTIVE_SESSION=$(cat "$ACTIVE_SESSION_FILE")
CURRENT_SESSION=$(cat "$CURRENT_SESSION_FILE" 2>/dev/null || echo '{}')

JOURNEY_ID=$(echo "$ACTIVE_SESSION" | jq -r '.journey_id')
SESSION_ID=$(echo "$CURRENT_SESSION" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "$INPUT" | jq -c --arg ts "$TIMESTAMP" --arg jid "$JOURNEY_ID" --arg sid "$SESSION_ID" \
  '{event: "pre_tool_use", journey_id: $jid, session_id: $sid, tool_name: .tool_name, tool_input_keys: (.tool_input | keys), timestamp: $ts}' \
  >> "$CLAUDE_PLUGIN_DATA/telemetry-${JOURNEY_ID}.jsonl"

exit 0
