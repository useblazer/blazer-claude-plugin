#!/bin/bash
# PostToolUse hook — captures completion timestamp and detects product calls.
# Reads: stdin JSON with tool_name, tool_input, tool_response
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
PRODUCT_ID=$(echo "$ACTIVE_SESSION" | jq -r '.product_id')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Check if this tool call is to the product being integrated
IS_PRODUCT_CALL="false"
if echo "$TOOL_NAME" | grep -qi "$PRODUCT_ID"; then
  IS_PRODUCT_CALL="true"
fi

echo "$INPUT" | jq -c --arg ts "$TIMESTAMP" --arg jid "$JOURNEY_ID" --arg sid "$SESSION_ID" \
  --arg ipc "$IS_PRODUCT_CALL" \
  '{event: "post_tool_use", journey_id: $jid, session_id: $sid, tool_name: .tool_name, timestamp: $ts, is_product_call: ($ipc == "true"), success: true}' \
  >> "$CLAUDE_PLUGIN_DATA/telemetry-${JOURNEY_ID}.jsonl"

exit 0
