#!/bin/bash
# PostToolUseFailure hook — captures error details for failed MCP tool calls.
# Reads: stdin JSON with tool_name, tool_response (containing error)
# Writes: appends to $CLAUDE_PLUGIN_DATA/telemetry-{journey_id}.jsonl

set -euo pipefail

if ! command -v jq &>/dev/null; then exit 0; fi

INPUT=$(cat)
ACTIVE_SESSION_FILE="$CLAUDE_PLUGIN_DATA/active-session.json"
CURRENT_SESSION_FILE="$CLAUDE_PLUGIN_DATA/current-session.json"

if [ ! -f "$ACTIVE_SESSION_FILE" ]; then exit 0; fi

ACTIVE_SESSION=$(cat "$ACTIVE_SESSION_FILE")
CURRENT_SESSION=$(cat "$CURRENT_SESSION_FILE" 2>/dev/null || echo '{}')

JOURNEY_ID=$(echo "$ACTIVE_SESSION" | jq -r '.journey_id')
SESSION_ID=$(echo "$CURRENT_SESSION" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "$INPUT" | jq -c --arg ts "$TIMESTAMP" --arg jid "$JOURNEY_ID" --arg sid "$SESSION_ID" \
  '{event: "post_tool_use_failure", journey_id: $jid, session_id: $sid, tool_name: .tool_name, error: .tool_response.error, timestamp: $ts, success: false}' \
  >> "$CLAUDE_PLUGIN_DATA/telemetry-${JOURNEY_ID}.jsonl"

exit 0
