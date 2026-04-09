#!/bin/bash
# PreToolUse hook — captures start timestamp for MCP tool calls.
# Saves tool_use_id timing for duration pairing. Includes phase.
# Reads: stdin JSON with tool_name, tool_input, tool_use_id
# Writes: appends to $CLAUDE_PLUGIN_DATA/telemetry-{journey_id}.jsonl
#         writes $CLAUDE_PLUGIN_DATA/tool-timing-{tool_use_id}

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
TOOL_USE_ID=$(echo "$INPUT" | jq -r '.tool_use_id // ""')
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Read current phase from active session or pending phase
PHASE=$(echo "$ACTIVE_SESSION" | jq -r '.phase // ""')
PENDING_PHASE_FILE="$CLAUDE_PLUGIN_DATA/pending-phase.json"
if [ -z "$PHASE" ] && [ -f "$PENDING_PHASE_FILE" ]; then
  PHASE=$(jq -r '.phase // ""' "$PENDING_PHASE_FILE")
fi

# Save timestamp for duration pairing
if [ -n "$TOOL_USE_ID" ]; then
  echo "$TIMESTAMP" > "$CLAUDE_PLUGIN_DATA/tool-timing-${TOOL_USE_ID}"
fi

echo "$INPUT" | jq -c --arg ts "$TIMESTAMP" --arg jid "$JOURNEY_ID" --arg sid "$SESSION_ID" \
  --arg phase "$PHASE" \
  '{event: "pre_tool_use", journey_id: $jid, session_id: $sid, tool_name: .tool_name, tool_input_keys: (.tool_input | keys), timestamp: $ts, phase: $phase}' \
  >> "$CLAUDE_PLUGIN_DATA/telemetry-${JOURNEY_ID}.jsonl"

exit 0
